"use client";

import * as React from "react";
import { useMediaQuery } from "@/components/admin/shell/use-media";
import { useEditorForm } from "../form-context";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 py-1.5">
      <dt className="text-xs text-ash">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-basalt">{children}</dd>
    </div>
  );
}

/**
 * The submission as it was sent, before any edits: read only, with who sent it, when, and their
 * notes. Open by default on wide screens, closed on phones.
 */
export function WhatTheySent() {
  const { context } = useEditorForm();
  const wide = useMediaQuery("(min-width: 768px)", true);
  const submission = context.submission;
  if (!submission) return null;
  const sent = submission.original;
  return (
    <details open={wide} className="group">
      <summary className="flex min-h-6 cursor-pointer list-none items-baseline justify-between gap-3 rounded-sm">
        <h2 className="font-text text-[15px]/[20px] font-semibold text-basalt">What they sent</h2>
        <span className="text-xs text-lilac group-open:hidden">Show</span>
      </summary>
      <p className="mt-2 text-sm text-basalt">
        Sent by {submission.submitterName},{" "}
        <a href={`mailto:${submission.submitterEmail}`} className="rounded-sm text-lilac underline-offset-4 hover:underline">
          {submission.submitterEmail}
        </a>
        , <span className="tabular-nums">{submission.sentAt}</span>.
      </p>
      <p className="mt-0.5 text-xs text-ash">
        {submission.hasAccount ? "They have an account, so they are told when you decide." : "They have no account, so nobody is told automatically."}
      </p>
      <dl className="mt-2 divide-y divide-seam">
        <Row label="Title">{sent.title}</Row>
        <Row label="When">
          {sent.when.length ? (
            <ul className="tabular-nums">
              {sent.when.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            "Not given"
          )}
        </Row>
        <Row label="Place">{sent.place || "Not given"}</Row>
        {sent.market && <Row label="Market">{sent.market}</Row>}
        <Row label="About">
          {sent.description ? <span className="line-clamp-6 whitespace-pre-line">{sent.description}</span> : "Not given"}
        </Row>
        <Row label="Tags">{sent.tags.length ? sent.tags.join(", ") : "None"}</Row>
        <Row label="Has">{sent.features.length ? sent.features.join(", ") : "None"}</Row>
        <Row label="Picture">
          {sent.picture ? (
            <a href={sent.picture} target="_blank" rel="noreferrer" className="rounded-sm break-all text-lilac underline-offset-4 hover:underline">
              {sent.picture}
            </a>
          ) : (
            "None"
          )}
        </Row>
        <Row label="Links">
          {sent.links.length ? (
            <ul>
              {sent.links.map((link) => (
                <li key={link}>
                  <a href={link} target="_blank" rel="noreferrer" className="rounded-sm break-all text-lilac underline-offset-4 hover:underline">
                    {link.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            "None"
          )}
        </Row>
        <Row label="Their notes">{submission.notes ? <span className="whitespace-pre-line">{submission.notes}</span> : "None"}</Row>
      </dl>
    </details>
  );
}
