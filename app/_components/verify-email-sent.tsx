"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";
import Link from "@/app/_components/link";
import { sendVerificationEmail } from "@/lib/auth/client";

type ResendState = "idle" | "sending" | "sent" | "error";

export function VerifyEmailSent({ email }: { email: string }) {
  const [status, setStatus] = useState<ResendState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    if (!email) {
      setError("Missing email address. Try signing up again.");
      setStatus("error");
      return;
    }
    setStatus("sending");
    setError(null);
    const result = await sendVerificationEmail({
      email,
      callbackURL: "/verify-email",
    });
    if (result.error) {
      setError(result.error.message ?? "Could not resend email. Try again.");
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Check your inbox</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-4">
        {error && <FormError>{error}</FormError>}
        <p className="text-sm text-muted-foreground">
          We sent a verification link to{" "}
          <span className="font-medium text-foreground">{email || "your email"}</span>.
          Click the link to finish creating your account. The link expires in 1 hour.
        </p>
        {status === "sent" && (
          <p className="text-sm text-muted-foreground">
            A new verification email is on its way.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          onClick={handleResend}
          disabled={status === "sending"}
        >
          {status === "sending" ? "Resending…" : "Resend email"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Wrong address?{" "}
          <Link href="/sign-up" className="underline underline-offset-4">
            Sign up again
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
