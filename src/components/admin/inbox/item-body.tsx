"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { APPLICATION_FORM_WORDS, approvalConsequence, plural, starsText } from "@/lib/admin/inbox/words";
import type { InboxSubmission, InboxTarget, PublicDecisionData } from "@/lib/admin/inbox/types";
import { Fact, Facts, LINK } from "./item-parts";
import { ReportTriage, type NotesDirty } from "./report-triage";

/** The listing an item is about: its admin page, and the public page while it is listed. */
export function TargetLink({ target }: { target: InboxTarget | null }) {
  if (!target) return <span className="text-ash">A listing that is gone</span>;
  return (
    <span>
      {target.adminHref ? (
        <Link href={target.adminHref} className={LINK}>
          {target.title}
        </Link>
      ) : (
        target.title
      )}
      {target.gone ? <span className="text-ash">, archived</span> : null}
      {target.publicHref && (
        <>
          {", "}
          <a href={target.publicHref} target="_blank" rel="noreferrer" className={LINK}>
            see it on the site
          </a>
        </>
      )}
    </span>
  );
}

function LongText({ text, empty }: { text: string | null; empty: string }) {
  if (!text) return <span className="text-ash">{empty}</span>;
  return <p className="whitespace-pre-line break-words">{text}</p>;
}

function MailLink({ name, email }: { name: string; email: string }) {
  return (
    <span>
      {name},{" "}
      <a href={`mailto:${email}`} className={LINK}>
        {email}
      </a>
    </span>
  );
}

/**
 * Everything about one item from the public, as label and value rows; the photo shows large. The
 * same body serves the To do pane and the inbox's single-item view.
 */
export function ItemBody({
  item,
  onNotesDirty,
  onSaved,
  notesField,
  className,
}: {
  item: PublicDecisionData | InboxSubmission;
  /** For a report inside a frame that asks before moving away (To do). */
  onNotesDirty?: (dirty: NotesDirty) => void;
  /** Called after a report's triage details are saved. */
  onSaved?: () => void;
  /** An application's editable notes, shown in place of the saved ones. */
  notesField?: React.ReactNode;
  className?: string;
}) {
  switch (item.kind) {
    case "review":
      return (
        <Facts className={className}>
          <Fact label="About">
            <TargetLink target={item.target} />
          </Fact>
          <Fact label="Rating">
            <span className="tabular-nums">{starsText(item.rating)}</span>
            {item.details.length > 0 && <span className="block text-xs text-ash tabular-nums">{item.details.join(", ")}</span>}
          </Fact>
          <Fact label="They wrote">
            <LongText text={item.text} empty="No text, only a rating." />
          </Fact>
          <Fact label="By">
            {item.author.id ? (
              <Link href={`/admin/users/${item.author.id}`} className={LINK}>
                {item.author.name}
              </Link>
            ) : (
              item.author.name
            )}
            <span className="text-ash">, </span>
            <span className="text-ash tabular-nums">{item.sentLabel}</span>
          </Fact>
          {item.photoCount > 0 && <Fact label="Photos">{plural(item.photoCount, "photo", "photos")} with it, listed under Photos.</Fact>}
        </Facts>
      );
    case "photo":
      return (
        <div className={cn("space-y-4", className)}>
          <Image
            src={item.url}
            alt={item.alt ?? `Photo for ${item.target?.title ?? "a listing"}`}
            width={640}
            height={480}
            unoptimized
            className="h-auto max-h-[420px] w-auto max-w-full rounded-sm border border-seam bg-fog object-contain"
          />
          <Facts>
            <Fact label="For">
              <TargetLink target={item.target} />
              {item.isEventPicture && <span className="block text-xs text-ash">It is the event picture.</span>}
            </Fact>
            {item.alt && <Fact label="Caption">{item.alt}</Fact>}
            <Fact label="Sent by">
              <Link href={`/admin/users/${item.uploader.id}`} className={LINK}>
                {item.uploader.name}
              </Link>
              <span className="text-ash">, </span>
              <span className="text-ash tabular-nums">{item.sentLabel}</span>
              {item.fromReview && <span className="block text-xs text-ash">Sent with a review.</span>}
            </Fact>
          </Facts>
        </div>
      );
    case "report":
      return (
        <div className={cn("space-y-5", className)}>
          <Facts>
            <Fact label="About">
              <span className="text-ash">The {item.target.kind} </span>
              <TargetLink target={item.target} />
            </Fact>
            <Fact label="Reason">{item.reason}</Fact>
            <Fact label="They wrote">
              <LongText text={item.notes} empty="Nothing more." />
            </Fact>
            <Fact label="Sent by">
              {item.reporter ?? "Someone without an account"}
              <span className="text-ash">, </span>
              <span className="text-ash tabular-nums">{item.sentLabel}</span>
            </Fact>
          </Facts>
          <ReportTriage report={item} onDirty={onNotesDirty} onSaved={onSaved} />
        </div>
      );
    case "application": {
      const consequence = item.status === "PENDING" ? approvalConsequence(item.formType, !!item.account) : null;
      return (
        <Facts className={className}>
          <Fact label="Form">{APPLICATION_FORM_WORDS[item.formType] ?? item.formTitle}</Fact>
          <Fact label="From">
            <MailLink name={item.name} email={item.email} />
            <span className="block text-xs text-ash tabular-nums">Sent {item.sentLabel}</span>
          </Fact>
          <Fact label="Account">
            {item.account ? (
              <>
                <Link href={`/admin/users/${item.account.id}`} className={LINK}>
                  {item.account.name}
                </Link>
                <span className="text-ash">, {item.account.role} account</span>
              </>
            ) : (
              <span className="text-ash">No account. Approving changes no account.</span>
            )}
            {consequence && <span className="block text-xs text-ash">{consequence}</span>}
          </Fact>
          {item.answers.length === 0 ? (
            <Fact label="Answers">
              <span className="text-ash">No answers.</span>
            </Fact>
          ) : (
            item.answers.map((a, i) => (
              <Fact key={`${a.label}-${i}`} label={a.label}>
                <span className="whitespace-pre-line break-words">{a.value}</span>
              </Fact>
            ))
          )}
          {item.others > 0 && (
            <Fact label="Also sent">
              {plural(item.others, "other application", "other applications")} from this email.
            </Fact>
          )}
          {notesField ? <Fact label="Your notes">{notesField}</Fact> : item.notes && <Fact label="Your notes">{item.notes}</Fact>}
          {item.reviewedLabel && item.status !== "PENDING" && (
            <Fact label="Decided">
              <span className="tabular-nums">{item.reviewedLabel}</span>
            </Fact>
          )}
        </Facts>
      );
    }
    case "message":
      return (
        <Facts className={className}>
          <Fact label="From">
            <MailLink name={item.name} email={item.email} />
            <span className="block text-xs text-ash tabular-nums">Sent {item.sentLabel}</span>
          </Fact>
          {item.subject && <Fact label="Subject">{item.subject}</Fact>}
          <Fact label="Message">
            <LongText text={item.message} empty="No message." />
          </Fact>
          {item.readLabel && item.status !== "PENDING" && (
            <Fact label="Read">
              <span className="tabular-nums">{item.readLabel}</span>
            </Fact>
          )}
        </Facts>
      );
    case "market":
      return (
        <Facts className={className}>
          <Fact label="Market">
            <Link href={item.adminHref} className={LINK}>
              {item.name}
            </Link>
            {", "}
            <a href={item.publicHref} target="_blank" rel="noreferrer" className={LINK}>
              see it on the site
            </a>
          </Fact>
          <Fact label="Place">{item.place || <span className="text-ash">No place</span>}</Fact>
          <Fact label="Owner">
            {item.owner ? (
              <>
                <Link href={`/admin/users/${item.owner.id}`} className={LINK}>
                  {item.owner.name}
                </Link>
                <span className="text-ash">, {item.owner.email}</span>
              </>
            ) : (
              <span className="text-ash">No owner account. Nobody is told.</span>
            )}
          </Fact>
          <Fact label="Dates">{plural(item.eventCount, "date listed", "dates listed")}</Fact>
          <Fact label="Last changed">
            <span className="tabular-nums">{item.requestedLabel}</span>
          </Fact>
        </Facts>
      );
    case "submission":
      return (
        <Facts className={className}>
          <Fact label="When">{item.when}</Fact>
          <Fact label="Place">{item.place}</Fact>
          <Fact label="Sent by">
            <MailLink name={item.submitter.name} email={item.submitter.email} />
            <span className="block text-xs text-ash tabular-nums">{item.sentLabel}</span>
          </Fact>
          {item.reviewNotes && <Fact label="Your note">{item.reviewNotes}</Fact>}
        </Facts>
      );
  }
}
