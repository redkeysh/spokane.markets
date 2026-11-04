import { Table, TBody, TD, TH, THead, TR } from "@/components/admin/kit/table";
import type { InboxSurvey } from "@/lib/admin/inbox/types";
import { LINK } from "./item-parts";

function Contact({ survey }: { survey: InboxSurvey }) {
  if (!survey.contactName && !survey.contactEmail) return <span className="text-ash">None given</span>;
  return (
    <span>
      {survey.contactName}
      {survey.contactName && survey.contactEmail ? ", " : ""}
      {survey.contactEmail && (
        <a href={`mailto:${survey.contactEmail}`} className={LINK}>
          {survey.contactEmail}
        </a>
      )}
    </span>
  );
}

const none = <span className="text-ash">Nothing</span>;

/** Vendor survey answers, read only: a table from 768 px, one block per answer below. */
export function SurveyTable({ surveys }: { surveys: InboxSurvey[] }) {
  return (
    <>
      <Table label="Vendor survey answers" className="hidden md:block">
        <THead>
          <TH>Sent</TH>
          <TH>Sells</TH>
          <TH>Lead time</TH>
          <TH>Hardest part</TH>
          <TH>Missing information</TH>
          <TH>Would pay</TH>
          <TH>Contact</TH>
        </THead>
        <TBody>
          {surveys.map((s) => (
            <TR key={s.id} className="align-top">
              <TD className="whitespace-nowrap">{s.sentLabel.replace(/ at .*$/, "")}</TD>
              <TD>{s.vendorType}</TD>
              <TD className="whitespace-nowrap">{s.leadTime}</TD>
              <TD className="max-w-[28ch] whitespace-pre-line">{s.painPoints ?? none}</TD>
              <TD className="max-w-[28ch] whitespace-pre-line">{s.missingInfo ?? none}</TD>
              <TD>{s.willingness}</TD>
              <TD>
                <Contact survey={s} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <ul role="list" aria-label="Vendor survey answers" className="border-t border-seam md:hidden">
        {surveys.map((s) => (
          <li key={s.id} className="border-b border-seam px-4 py-3">
            <p className="text-sm font-medium text-basalt">{s.vendorType}</p>
            <p className="text-xs text-ash tabular-nums">{s.sentLabel}</p>
            <dl className="mt-2 space-y-1 text-sm">
              <div>
                <dt className="inline text-ash">Lead time </dt>
                <dd className="inline text-basalt">{s.leadTime}</dd>
              </div>
              <div>
                <dt className="text-ash">Hardest part</dt>
                <dd className="whitespace-pre-line text-basalt">{s.painPoints ?? none}</dd>
              </div>
              <div>
                <dt className="text-ash">Missing information</dt>
                <dd className="whitespace-pre-line text-basalt">{s.missingInfo ?? none}</dd>
              </div>
              <div>
                <dt className="inline text-ash">Would pay </dt>
                <dd className="inline text-basalt">{s.willingness}</dd>
              </div>
              <div>
                <dt className="inline text-ash">Contact </dt>
                <dd className="inline text-basalt">
                  <Contact survey={s} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
