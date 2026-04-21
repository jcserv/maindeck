import { Suspense } from "react";
import Link from "@/app/_components/link";
import { ResetPasswordForm } from "@/app/_components/reset-password-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SearchParams = Promise<{ token?: string }>;

async function ResetPasswordContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Invalid reset link</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pb-6">
          <p className="text-sm text-muted-foreground">
            This password reset link is missing or invalid. Please request a new one.
          </p>
          <Link
            href="/forgot-password"
            className="text-sm underline underline-offset-4"
          >
            Request a new reset link
          </Link>
        </CardContent>
      </Card>
    );
  }

  return <ResetPasswordForm token={token} />;
}

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <div
          className="w-full max-w-sm h-[360px] rounded-xl bg-muted animate-pulse"
          aria-hidden
        />
      }
    >
      <ResetPasswordContent searchParams={searchParams} />
    </Suspense>
  );
}
