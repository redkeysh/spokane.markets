"use client";

import type { VerificationStatus } from "@prisma/client";
import { Menu } from "@/components/admin/kit/menu";
import { StatusMark } from "@/components/admin/kit/status-mark";
import { evaluateVendorVerificationReadiness } from "@/lib/vendor-verification";
import { VERIFICATION_OPTIONS, verificationChecklist, type VendorEditorInput } from "@/lib/vendors/admin-input";
import { verificationMarkStatus } from "@/lib/vendors/admin-list";
import { cn } from "@/lib/utils";

/**
 * The verification status with a Change menu (each choice with its consequence), and the
 * verification rules as a checklist that follows the fields as they are edited.
 */
export function VerificationPanel({
  value,
  onChange,
  draft,
  claimed,
  emailVerified,
  disabled,
}: {
  value: VerificationStatus;
  onChange: (value: VerificationStatus) => void;
  draft: VendorEditorInput;
  claimed: boolean;
  emailVerified: boolean;
  disabled?: boolean;
}) {
  const readiness = evaluateVendorVerificationReadiness({
    user: { emailVerified },
    profile: {
      businessName: draft.businessName,
      description: draft.description,
      imageUrl: draft.imageUrl ?? null,
      contactEmail: draft.contactEmail,
      contactPhone: draft.contactPhone,
      websiteUrl: draft.websiteUrl ?? null,
      facebookUrl: draft.facebookUrl,
      instagramUrl: draft.instagramUrl,
      specialties: draft.specialties,
      galleryUrls: draft.galleryUrls,
      primaryCategory: draft.primaryCategory,
      serviceAreaLabel: draft.serviceAreaLabel,
    } as Parameters<typeof evaluateVendorVerificationReadiness>[0]["profile"],
  });
  const checks = verificationChecklist(readiness, { claimed });
  const missing = checks.filter((c) => !c.met).length;
  const current = VERIFICATION_OPTIONS.find((o) => o.value === value);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusMark status={verificationMarkStatus(value)} />
        {!disabled && (
          <Menu
            label="Change verification"
            trigger="Change"
            variant="quiet"
            size="sm"
            placement="bottom-start"
            items={VERIFICATION_OPTIONS.map((option) => ({
              label: option.label,
              description: option.description,
              checked: option.value === value,
              onSelect: () => onChange(option.value),
            }))}
          />
        )}
      </div>
      {current && <p className="text-xs text-ash">{current.description}</p>}

      <div>
        <p className="text-sm font-medium text-basalt">
          Ready to verify{" "}
          <span className={cn("font-normal", missing ? "text-honey-ink" : "text-ash")}>
            {missing === 0 ? "(everything is in place)" : `(${missing} missing)`}
          </span>
        </p>
        <ul className="mt-1.5 divide-y divide-seam border-y border-seam">
          {checks.map((check) => (
            <li key={check.label} className="flex items-start justify-between gap-3 py-1.5 text-xs">
              <span className="min-w-0 text-basalt">
                {check.label}
                {check.detail && <span className="block text-ash">{check.detail}</span>}
              </span>
              <span className={cn("shrink-0 font-medium", check.met ? "text-ash" : "text-honey-ink")}>{check.met ? "Done" : "Missing"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-xs text-ash">A vendor needs every line done to ask for verification. You can verify any vendor yourself.</p>
      </div>
    </div>
  );
}
