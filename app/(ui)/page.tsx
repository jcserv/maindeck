import { Suspense } from "react";
import { SessionShell } from "@/app/_components/home/session-shell";

/**
 * The static shell streams instantly. The session check (and subsequent data
 * fetching) happens inside the Suspense boundary so it never blocks the page
 * skeleton. The fallback reserves a full-page height to prevent CLS.
 */
export default function Home() {
  return (
    <Suspense fallback={<div className="h-[calc(100vh-64px)]" aria-hidden />}>
      <SessionShell />
    </Suspense>
  );
}
