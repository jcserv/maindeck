import { type NextRequest } from "next/server";
import {
  EdhrecUnavailableError,
  getEdhrecSuggestions,
} from "@/lib/edhrec/recommendations";
import { rateLimit } from "@/lib/rate-limit/redis";
import { getClientIp } from "@/lib/rate-limit/request";

// EDHREC slugs are lowercase alphanumerics joined by single hyphens (partner
// pairs are two slugs joined). Reject anything else before it reaches upstream.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 96;
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 60;

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`cards-edhrec:${ip}`, RATE_LIMIT, RATE_WINDOW_SECONDS);

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

  const slug = request.nextUrl.searchParams.get("commander")?.trim() ?? "";
  if (!slug || slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) {
    return Response.json(
      { error: "A valid commander slug is required" },
      { status: 400, headers: rateHeaders },
    );
  }

  try {
    const suggestions = await getEdhrecSuggestions(slug);
    return Response.json(suggestions, {
      headers: {
        ...rateHeaders,
        // Suggestions shift slowly; let the edge serve them while revalidating.
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    if (err instanceof EdhrecUnavailableError) {
      return Response.json(
        { error: "EDHREC is unavailable right now. Try again shortly." },
        { status: 502, headers: rateHeaders },
      );
    }
    throw err;
  }
}
