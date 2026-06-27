import { type NextRequest, NextResponse } from "next/server";
import { getPrintingsForCard } from "@/lib/card/printing-queries";

// Public read endpoint — printings are reference data with no per-user gating.
// The underlying query is `'use cache'` with `cacheTag` + `cacheLife("hours")`,
// so the response is HTTP-cacheable.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cardId = Number.parseInt(id, 10);

  if (!Number.isFinite(cardId) || cardId <= 0) {
    return NextResponse.json({ error: "Invalid card id" }, { status: 400 });
  }

  const printings = await getPrintingsForCard(cardId);
  return NextResponse.json(printings, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
