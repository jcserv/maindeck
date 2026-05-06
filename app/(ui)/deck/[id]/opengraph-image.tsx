/**
 * Open Graph image route for `/deck/[id]`.
 *
 * Uses Next.js's `opengraph-image` file convention so `og:image` is auto-wired
 * onto the deck page; renders a 1200×630 PNG via `ImageResponse`. PRIVATE decks
 * 404. The data layer (`getDeckById`) already runs through `'use cache'` +
 * `cacheTag(deckTag(id))`, and Next caches the image response by default — so
 * mutations that bump `deckTag` regenerate the image on the next request.
 */

import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { getDeckById } from "@/lib/deck/queries";
import { buildDeckOgImageData } from "@/lib/deck/og-image-data";

export const alt = "Maindeck deck preview";
export const size = { width: 1200, height: 630 } as const;
export const contentType = "image/png";

function formatLabel(format: string): string {
  return format.charAt(0) + format.slice(1).toLowerCase();
}

export default async function DeckOpenGraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deck = await getDeckById(id);
  if (!deck) notFound();
  if (deck.visibility === "PRIVATE") notFound();

  const { heroImageUrl, title, format, bracket, username } =
    buildDeckOgImageData(deck);

  const truncated = title.length > 60 ? `${title.slice(0, 57)}…` : title;
  const gradient =
    "linear-gradient(135deg, #1f1147 0%, #3b1d6e 45%, #6b2e8a 100%)";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundImage: gradient,
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {heroImageUrl ? (
          <div
            style={{
              width: 460,
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 48,
              flexShrink: 0,
            }}
          >
            { }
            <img
              src={heroImageUrl}
              alt=""
              width={364}
              height={508}
              style={{
                borderRadius: 24,
                boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
                objectFit: "cover",
              }}
            />
          </div>
        ) : (
          <div
            style={{
              width: 460,
              height: "100%",
              display: "flex",
              flexShrink: 0,
              backgroundImage:
                "linear-gradient(160deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 100%)",
            }}
          />
        )}

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "64px 72px 64px 24px",
            gap: 24,
          }}
        >
          <div
            style={{
              fontSize: 28,
              opacity: 0.78,
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            Maindeck
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.05,
              display: "flex",
            }}
          >
            {truncated}
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              fontSize: 32,
              opacity: 0.92,
            }}
          >
            <span>{formatLabel(format)}</span>
            {bracket && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>{bracket}</span>
              </>
            )}
          </div>
          <div
            style={{
              fontSize: 28,
              opacity: 0.78,
              display: "flex",
            }}
          >
            @{username}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
