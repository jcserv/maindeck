import { type NextRequest } from "next/server";
import { cacheLife } from "next/cache";
import { cacheTag } from "next/cache";
import { searchCards } from "@/lib/search/card-search";

async function cachedSearch(q: string) {
  "use cache";
  cacheLife("seconds");
  cacheTag("card-search");
  return searchCards(q);
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || !q.trim()) {
    return Response.json({ error: "Missing query parameter: q" }, { status: 400 });
  }

  const results = await cachedSearch(q.trim());
  return Response.json(results);
}
