import { getSession } from "@/lib/auth/session";
import { HomeView } from "./home-view";
import { LandingView } from "./landing-view";

/**
 * SessionShell is an async RSC that reads the session and branches to either
 * the authed Home view or the unauthed Landing view.
 *
 * It must be wrapped in a Suspense boundary with an explicit height fallback
 * to avoid CLS while the session check streams in.
 */
export async function SessionShell() {
  const session = await getSession();

  if (session) {
    return <HomeView userId={session.userId} username={session.username} />;
  }

  return <LandingView />;
}
