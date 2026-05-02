import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type Session = {
  userId: string;
  email: string;
  username: string;
  dateOfBirth: Date | null;
};

export async function getSession(): Promise<Session | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) return null;

  const user = session.user as typeof session.user & {
    username?: string | null;
    dateOfBirth?: Date | null;
  };

  return {
    userId: user.id,
    email: user.email,
    username: user.username ?? "",
    dateOfBirth: user.dateOfBirth ?? null,
  };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  return session;
}
