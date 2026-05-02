import { type NextRequest } from "next/server";
import { searchCards } from "@/lib/search/card-search";

const MAX_Q_LENGTH = 64;

// TODO(security): rate-limit /api/cards/search — see audit

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || !q.trim()) {
    return Response.json({ error: "Missing query parameter: q" }, { status: 400 });
  }

  if (q.length > MAX_Q_LENGTH) {
    return Response.json(
      { error: `Query parameter q must be ${MAX_Q_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  const offsetRaw = request.nextUrl.searchParams.get("offset");
  const offset = Math.max(0, Number(offsetRaw ?? "0") | 0);

  const results = await searchCards(q.trim(), 10, offset);
  return Response.json(results);
}
