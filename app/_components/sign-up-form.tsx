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
import { signUp } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/auth/actions";

const todayISO = new Date().toISOString().split("T")[0]!;

type SignUpState = (ActionResult & { email?: string }) | null;

async function signUpAction(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim();
  const result = await signUp(formData);
  if ("error" in result) {
    return { error: result.error };
  }
  return { ok: true, email };
}

export function SignUpForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<SignUpState, FormData>(
    signUpAction,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state && state.ok && state.email) {
      router.push(`/verify-email/sent?email=${encodeURIComponent(state.email)}`);
    }
  }, [state, router]);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Create account</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4 pb-4">
          {state && "error" in state && <FormError>{state.error}</FormError>}
          <Field label="Username" htmlFor="username" required>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              minLength={3}
              pattern="[a-zA-Z0-9_]+"
              className="min-h-11"
            />
          </Field>
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
          <Field label="Date of birth" htmlFor="dateOfBirth" required>
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              required
              max={todayISO}
              className="min-h-11"
            />
          </Field>
          <Field label="Password" htmlFor="password" required>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="min-h-11"
            />
          </Field>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="h-11 w-full" disabled={isPending}>
            {isPending ? "Creating account…" : "Create account"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/sign-in" className="underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
