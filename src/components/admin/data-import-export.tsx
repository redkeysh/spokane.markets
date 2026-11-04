"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminButton } from "@/components/admin/kit/button";
import { Section } from "@/components/admin/kit/field";
import { FormError } from "@/components/admin/rare/controls";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { importReport, skippedDuplicatesSentence, type ImportReportInput } from "./data-import-report";

type Format = "json" | "csv";

const FORMATS: { value: Format; label: string; help: string }[] = [
  { value: "json", label: "JSON", help: "Places, markets and events together." },
  { value: "csv", label: "CSV", help: "Places only: name, address, city, state, zip, lat, lng." },
];

const MAX_ERRORS_SHOWN = 5;
const MAX_SKIPPED_SHOWN = 10;

/** Import from a file, and export a backup of every event, market and place. */
export function DataImportExport() {
  const announce = useAnnounce();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [importFormat, setImportFormat] = React.useState<Format>("json");
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<ImportReportInput | null>(null);
  const [importFailure, setImportFailure] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [exportFailure, setExportFailure] = React.useState<string | null>(null);
  const [exportResult, setExportResult] = React.useState<{
    url: string;
    filename: string;
    counts: { venues: number; markets: number; events: number };
  } | null>(null);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    setImportFailure(null);
    try {
      const formData = new FormData();
      formData.set("file", importFile);
      formData.set("format", importFormat);
      const res = await fetch("/api/admin/data/import", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "The import did not run.");
      setImportResult(data as ImportReportInput);
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = "";
      announce(`Import finished. ${importReport(data as ImportReportInput).made}`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "The import did not run.";
      setImportFailure(message);
      announce(message);
    } finally {
      setImporting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportResult(null);
    setExportFailure(null);
    try {
      const res = await fetch("/api/admin/data/export", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "The backup was not made.");
      setExportResult(data);
      toast.success(`Saved ${data.filename}.`);
      if (data.url) window.open(data.url, "_blank");
    } catch (err) {
      setExportFailure(err instanceof Error ? err.message : "The backup was not made.");
    } finally {
      setExporting(false);
    }
  }

  const report = importResult ? importReport(importResult) : null;
  const skipped = importResult ? skippedDuplicatesSentence(importResult) : null;

  return (
    <div className="space-y-10">
      <Section id="import" title="Import">
        <form onSubmit={handleImport} className="space-y-4">
          <fieldset>
            <legend className="font-text text-sm font-medium text-basalt">File type</legend>
            <div className="mt-2 space-y-2">
              {FORMATS.map((format) => (
                <label key={format.value} className="flex cursor-pointer items-start gap-2 font-text text-sm text-basalt">
                  <input
                    type="radio"
                    name="format"
                    value={format.value}
                    checked={importFormat === format.value}
                    onChange={() => setImportFormat(format.value)}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-basalt"
                  />
                  <span>
                    <span className="block font-medium">{format.label}</span>
                    <span className="block text-xs text-ash">{format.help}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="import-file" className="block font-text text-sm font-medium text-basalt">
              File
            </label>
            <input
              ref={fileRef}
              id="import-file"
              type="file"
              accept={importFormat === "json" ? ".json,application/json" : ".csv,text/csv"}
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full max-w-md font-text text-sm text-basalt file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-seam-strong file:bg-sheet file:px-3 file:font-text file:text-sm file:font-medium file:text-basalt hover:file:bg-hover"
            />
          </div>
          <AdminButton type="submit" variant="ink" disabled={!importFile} busy={importing} busyLabel="Importing">
            Import
          </AdminButton>
        </form>

        <FormError>{importFailure}</FormError>
        {report && importResult && (
          <div className="max-w-[72ch] space-y-2 border-t border-seam pt-4 font-text text-sm text-basalt" role="status">
            <p className="tabular-nums">{report.made}</p>
            {skipped && (
              <div>
                <p className="tabular-nums">{skipped}</p>
                <ul role="list" className="mt-1 space-y-0.5 text-ash">
                  {importResult.skippedDuplicates?.slice(0, MAX_SKIPPED_SHOWN).map((e) => (
                    <li key={`${e.row}-${e.title}`}>
                      {e.title}, row <span className="tabular-nums">{e.row}</span>
                      {e.keptTitle ? `, kept as ${e.keptTitle}` : ""}
                    </li>
                  ))}
                  {(importResult.skippedDuplicates?.length ?? 0) > MAX_SKIPPED_SHOWN && (
                    <li className="tabular-nums">And {importResult.skippedDuplicates!.length - MAX_SKIPPED_SHOWN} more.</li>
                  )}
                </ul>
              </div>
            )}
            {report.removed && <p className="text-ash">{report.removed}</p>}
            {report.needsHours && (
              <div>
                <p>{report.needsHours}</p>
                <ul role="list" className="mt-1 space-y-0.5 text-ash">
                  {importResult.eventsNeedingSchedule?.slice(0, 10).map((e) => (
                    <li key={`${e.row}-${e.slug}`}>
                      {e.title}, row <span className="tabular-nums">{e.row}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.errors && (
              <div>
                <p className="text-ponderosa">{report.errors}</p>
                <ul role="list" className="mt-1 space-y-0.5 text-ash">
                  {importResult.errors.slice(0, MAX_ERRORS_SHOWN).map((message, i) => (
                    <li key={i}>{message}</li>
                  ))}
                  {importResult.errors.length > MAX_ERRORS_SHOWN && (
                    <li>And {importResult.errors.length - MAX_ERRORS_SHOWN} more.</li>
                  )}
                </ul>
              </div>
            )}
            {importResult.eventsCreated > 0 && (
              <Link href="/admin" className="inline-flex min-h-6 items-center rounded-sm text-lilac underline-offset-4 hover:underline">
                Decide on the new events in To do
              </Link>
            )}
          </div>
        )}
      </Section>

      <Section id="export" title="Export">
        <p className="max-w-[72ch] font-text text-sm text-ash">
          Saves every event, market and place to a JSON file on the server and opens it, so you can keep a copy.
        </p>
        <div>
          <AdminButton variant="outline" onClick={handleExport} busy={exporting} busyLabel="Exporting">
            Export a backup
          </AdminButton>
        </div>
        <FormError>{exportFailure}</FormError>
        {exportResult?.url && (
          <p className="max-w-[72ch] font-text text-sm text-basalt tabular-nums" role="status">
            Saved {exportResult.counts.events} events, {exportResult.counts.markets} markets and{" "}
            {exportResult.counts.venues} places.{" "}
            <a
              href={exportResult.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-sm text-lilac underline-offset-4 hover:underline"
            >
              Download {exportResult.filename}
            </a>
          </p>
        )}
      </Section>
    </div>
  );
}
