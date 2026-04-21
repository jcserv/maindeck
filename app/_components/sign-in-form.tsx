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
import { signIn } from "@/lib/auth/client";

type SignInState = { error?: string; success?: boolean } | null;

async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const result = await signIn.username({ username, password });
  if (result.error) {
    if (result.error.code === "EMAIL_NOT_VERIFIED") {
      return {
        error:
          "Your email isn't verified yet. We just sent a new link — check your inbox.",
      };
    }
    return { error: result.error.message ?? "Sign in failed. Please try again." };
  }
  return { success: true };
}

export function SignInForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<SignInState, FormData>(
    signInAction,
    null,
  );

  useEffect(() => {
    if (state?.success) {
      router.push("/decks");
      router.refresh();
    }
  }, [state, router]);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4 pb-4">
          {state?.error && <FormError>{state.error}</FormError>}
          <Field label="Username" htmlFor="username" required>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              className="min-h-11"
            />
          </Field>
          <Field label="Password" htmlFor="password" required>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="min-h-11"
            />
          </Field>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="h-11 w-full" disabled={isPending}>
            {isPending ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/sign-up" className="underline underline-offset-4">
              Sign up
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            <Link
              href="/forgot-password"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Forgot password?
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
