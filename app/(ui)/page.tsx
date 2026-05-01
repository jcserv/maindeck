import { Suspense } from "react";
import { SessionShell } from "@/app/_components/home/session-shell";
import { LandingView } from "@/app/_components/home/landing-view";

// LandingView is the static shell so the H1 (LCP candidate) paints from the
// prerendered HTML instead of waiting for the session check to stream in.
// Anon users see no change when SessionShell resolves; logged-in users get
// HomeView swapped over the landing shell.
export default function Home() {
  return (
    <Suspense fallback={<LandingView />}>
      <SessionShell />
    </Suspense>
  );
}
