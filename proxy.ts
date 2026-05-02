import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PROTECTED_EXACT = ["/decks"];
const PROTECTED_PREFIXES = ["/deck/new", "/account"];
const IMPORT_PATH_RE = /^\/deck\/[^/]+\/import(\/|$)/;

function isProtected(pathname: string): boolean {
  if (PROTECTED_EXACT.includes(pathname)) return true;
  if (
    PROTECTED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    )
  ) {
    return true;
  }
  // /deck/[id]/import — requires auth for import form
  if (IMPORT_PATH_RE.test(pathname)) {
    return true;
  }
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    // Unauthed users visiting /decks get the public directory, not a login wall.
    if (pathname === "/decks") {
      return NextResponse.redirect(new URL("/decks/explore", request.url));
    }
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
