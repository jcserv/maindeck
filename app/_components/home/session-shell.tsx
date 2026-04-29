import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { HomeView } from "./home-view";
import { LandingView } from "./landing-view";

// Visitors without a better-auth cookie skip the DB roundtrip — the session
// call was the LCP blocker on / for anonymous traffic.
export async function SessionShell() {
  const cookieStore = await cookies();
  const hasSessionCookie =
    cookieStore.has("better-auth.session_token") ||
    cookieStore.has("__Secure-better-auth.session_token");

  if (!hasSessionCookie) {
    return <LandingView />;
  }

  const session = await getSession();
  if (session) {
    return <HomeView userId={session.userId} username={session.username} />;
  }
  return <LandingView />;
}
