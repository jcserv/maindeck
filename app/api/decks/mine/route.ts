import { getSession } from "@/lib/auth/session";
import { getDecksByUserMinimal } from "@/lib/deck/queries";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return Response.json({ decks: [] });
  }

  const decks = await getDecksByUserMinimal(session.userId);
  return Response.json({ decks });
}
