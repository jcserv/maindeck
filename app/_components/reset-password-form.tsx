"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { resetPassword } from "@/app/_actions/auth";
import type { ActionResult } from "@/app/_actions/auth";

type ResetPasswordState = ActionResult | null;

async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  return resetPassword(formData);
}

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction,
    null,
  );
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [matchError, setMatchError] = useState<string | null>(null);

  useEffect(() => {
    if (state && "ok" in state && state.ok) {
      router.push("/sign-in?reset=1");
    }
  }, [state, router]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (newPassword !== confirmPassword) {
      e.preventDefault();
      setMatchError("Passwords do not match");
    } else {
      setMatchError(null);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Choose a new password</CardTitle>
      </CardHeader>
      <form action={formAction} onSubmit={handleSubmit}>
        <input type="hidden" name="token" value={token} />
        <CardContent className="flex flex-col gap-4 pb-4">
          {state && "error" in state && <FormError>{state.error}</FormError>}
          {matchError && <FormError>{matchError}</FormError>}
          <Field label="New password" htmlFor="password" required>
            <Input
              id="password"
              name="password"
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
        </CardContent>
        <CardFooter>
          <Button type="submit" className="h-11 w-full" disabled={isPending}>
            {isPending ? "Resetting…" : "Reset password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
