export type Session = {
  userId: string;
  email: string;
  username: string;
  dateOfBirth: Date;
};

const DEV_SESSION: Session = {
  userId: "dev-user-001",
  email: "dev@maindeck.local",
  username: "dev",
  dateOfBirth: new Date("1990-01-01"),
};

export async function getSession(): Promise<Session | null> {
  return DEV_SESSION;
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
