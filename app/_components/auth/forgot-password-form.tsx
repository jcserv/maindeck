"use client";

import { useActionState, useEffect } from "react";
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
import Link from "@/app/_components/link";
import { requestPasswordReset } from "@/app/_actions/auth";

type ForgotPasswordState = { ok: true; email: string } | { error: string } | null;

async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  const result = await requestPasswordReset(formData);
  if ("error" in result) {
    return { error: result.error };
  }
  return { ok: true, email };
}

export function ForgotPasswordForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ForgotPasswordState, FormData>(
    forgotPasswordAction,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state && state.ok) {
      router.push(`/forgot-password/sent?email=${encodeURIComponent(state.email)}`);
    }
  }, [state, router]);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Reset your password</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4 pb-4">
          {"error" in (state ?? {}) && (
            <FormError>{(state as { error: string }).error}</FormError>
          )}
          <p className="text-sm text-muted-foreground">
            Enter your email address and we&apos;ll send you a reset link.
          </p>
          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="min-h-11"
            />
          </Field>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="h-11 w-full" disabled={isPending}>
            {isPending ? "Sending…" : "Send reset link"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Remember your password?{" "}
            <Link href="/sign-in" className="underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
