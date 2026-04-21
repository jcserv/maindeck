"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { FormSuccess } from "@/components/ui/form-success";
import { changePassword } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/auth/actions";

type ChangePasswordState = ActionResult | null;

async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  return changePassword(formData);
}

export function ChangePasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [matchError, setMatchError] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    null,
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (newPassword !== confirmPassword) {
      e.preventDefault();
      setMatchError("New passwords do not match");
    } else {
      setMatchError(null);
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-3">
      {state && "error" in state && <FormError>{state.error}</FormError>}
      {matchError && <FormError>{matchError}</FormError>}
      {state && "ok" in state && state.ok && (
        <FormSuccess>Password changed successfully.</FormSuccess>
      )}
      <Field label="Current password" htmlFor="currentPassword" required>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-11"
        />
      </Field>
      <Field label="New password" htmlFor="newPassword" required>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="min-h-11"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" required>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="min-h-11"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" variant="outline" className="h-11 w-full" disabled={isPending}>
        {isPending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
