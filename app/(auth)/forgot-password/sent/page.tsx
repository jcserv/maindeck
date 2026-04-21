import { Suspense } from "react";
import { ForgotPasswordSent } from "@/app/_components/forgot-password-sent";

type SearchParams = Promise<{ email?: string }>;

async function ForgotPasswordSentContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { email } = await searchParams;
  return <ForgotPasswordSent email={email ?? ""} />;
}

export default function ForgotPasswordSentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<div className="h-[240px] w-full max-w-sm" aria-hidden />}>
      <ForgotPasswordSentContent searchParams={searchParams} />
    </Suspense>
  );
}
