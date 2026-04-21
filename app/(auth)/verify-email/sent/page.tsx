import { Suspense } from "react";
import { VerifyEmailSent } from "@/app/_components/verify-email-sent";

type SearchParams = Promise<{ email?: string }>;

async function VerifyEmailSentContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { email } = await searchParams;
  return <VerifyEmailSent email={email ?? ""} />;
}

export default function VerifyEmailSentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<div className="h-[320px] w-full max-w-sm" aria-hidden />}>
      <VerifyEmailSentContent searchParams={searchParams} />
    </Suspense>
  );
}
