"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { adminCreateUserSchema, type AdminCreateUserInput } from "@/lib/validations";
import { AdminButton, AdminLinkButton } from "@/components/admin/kit/button";
import { Field, FieldRow } from "@/components/admin/kit/field";
import { LeavePrompt } from "@/components/admin/kit/save-bar";
import { useLeavePrompt } from "@/components/admin/shell/leave-guard";
import { FormError, SelectInput, TextInput } from "@/components/admin/rare/controls";
import { ROLE_ORDER, ROLE_WORDS } from "@/components/admin/user-words";

export function UserForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = useForm<AdminCreateUserInput>({
    resolver: zodResolver(adminCreateUserSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      role: "USER",
    },
  });

  const role = useWatch({ control, name: "role" });
  const [made, setMade] = useState(false);
  const { leaving, stay, go } = useLeavePrompt(isDirty && !made, "/admin/users");

  const onSubmit = async (data: AdminCreateUserInput) => {
    const then = leaving;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const body = await res.json();

      if (!res.ok) {
        if (body.error?.email) {
          throw new Error(body.error.email[0]);
        }
        throw new Error(body.error?.message || "Could not make the account.");
      }

      toast.success(`Made an account for ${data.email}.`);
      setMade(true);
      if (then) go(then);
      else router.replace("/admin/users");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make the account.");
      stay();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field id="name" label="Name" required error={errors.name?.message}>
        <TextInput autoComplete="off" {...register("name")} />
      </Field>
      <Field id="email" label="Email" required error={errors.email?.message}>
        <TextInput type="email" autoComplete="off" {...register("email")} />
      </Field>
      <FieldRow>
        <Field id="password" label="Password" required error={errors.password?.message}>
          <TextInput type="password" autoComplete="new-password" {...register("password")} />
        </Field>
        <Field id="confirmPassword" label="Password again" required error={errors.confirmPassword?.message}>
          <TextInput type="password" autoComplete="new-password" {...register("confirmPassword")} />
        </Field>
      </FieldRow>
      <Field id="role" label="Role" help={role ? ROLE_WORDS[role].help : undefined}>
        <SelectInput className="w-48" {...register("role")}>
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>
              {ROLE_WORDS[r].one}
            </option>
          ))}
        </SelectInput>
      </Field>

      <FormError>{error}</FormError>

      {leaving ? (
        <LeavePrompt
          onStay={stay}
          onDiscard={() => go(leaving)}
          onSave={handleSubmit(onSubmit, stay)}
          saving={submitting}
          saveLabel="Make the account"
          busyLabel="Making the account"
          className="border-t border-seam pt-4"
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-seam pt-4">
          <AdminButton type="submit" variant="ink" busy={submitting} busyLabel="Making the account">
            Make the account
          </AdminButton>
          <AdminLinkButton href="/admin/users" variant="quiet">
            Cancel
          </AdminLinkButton>
        </div>
      )}
    </form>
  );
}
