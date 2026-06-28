import { type NextRequest } from "next/server";
import { searchCards } from "@/lib/search/card-search";
import { rateLimit } from "@/lib/rate-limit/redis";
import { getClientIp } from "@/lib/rate-limit/request";

const MAX_Q_LENGTH = 64;
const RATE_LIMIT = 90;
const RATE_WINDOW_SECONDS = 60;

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`cards-search:${ip}`, RATE_LIMIT, RATE_WINDOW_SECONDS);

  if (!limit.success) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.resetSeconds),
          "X-RateLimit-Limit": String(limit.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(limit.resetSeconds),
        },
      },
    );
  }

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

  const commanderOnly = request.nextUrl.searchParams.get("commander") === "1";

  const results = await searchCards(q.trim(), 10, offset, { commanderOnly });
  return Response.json(results, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      "X-RateLimit-Limit": String(limit.limit),
      "X-RateLimit-Remaining": String(limit.remaining),
      "X-RateLimit-Reset": String(limit.resetSeconds),
    },
  });
}
