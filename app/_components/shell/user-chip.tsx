import Link from "@/app/_components/link";
import { UserMenu } from "@/app/_components/shell/user-menu";
import { getSession } from "@/lib/auth/session";

function initials(source: string): string {
  return (source[0] ?? "?").toUpperCase();
}

export default async function UserChip() {
  const session = await getSession();

  if (!session) {
    return (
      <Link
        href="/sign-in"
        className="inline-flex items-center h-8 px-3 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        Sign in
      </Link>
    );
  }

  const label = session.username ?? session.email.split("@")[0] ?? session.email;

  return <UserMenu label={label} initials={initials(label)} />;
}
