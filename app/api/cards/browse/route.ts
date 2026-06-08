import { type NextRequest } from "next/server";
import { searchCardsBySyntax } from "@/lib/search/card-search";
import { parseSyntax } from "@/lib/search/syntax-parser";
import { rateLimit } from "@/lib/rate-limit/redis";
import { getClientIp } from "@/lib/rate-limit/request";

const MAX_Q_LENGTH = 64;
const RATE_LIMIT = 90;
const RATE_WINDOW_SECONDS = 60;
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 120;

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`cards-browse:${ip}`, RATE_LIMIT, RATE_WINDOW_SECONDS);

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

  const rateHeaders = {
    "X-RateLimit-Limit": String(limit.limit),
    "X-RateLimit-Remaining": String(limit.remaining),
    "X-RateLimit-Reset": String(limit.resetSeconds),
  };

  const q = request.nextUrl.searchParams.get("q");

  // Empty/whitespace query returns nothing — the browse grid must never stream
  // the entire card table when no filter is active.
  if (!q || !q.trim()) {
    return Response.json([], { headers: rateHeaders });
  }

  if (q.trim().length > MAX_Q_LENGTH) {
    return Response.json(
      { error: `Query parameter q must be ${MAX_Q_LENGTH} characters or fewer` },
      { status: 400, headers: rateHeaders },
    );
  }

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const pageLimit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(limitRaw ?? DEFAULT_LIMIT) | 0 || DEFAULT_LIMIT),
  );
  const offsetRaw = request.nextUrl.searchParams.get("offset");
  const offset = Math.max(0, Number(offsetRaw ?? "0") | 0);

  const parsed = parseSyntax(q.trim());
  const results = await searchCardsBySyntax(parsed, [], [], pageLimit, offset);
  return Response.json(results, { headers: rateHeaders });
}
