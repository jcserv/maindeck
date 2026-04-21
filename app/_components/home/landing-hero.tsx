import Image from "next/image";
import { Suspense } from "react";
import Link from "@/app/_components/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Kbd } from "@/components/ui/kbd";
import { getCardImagesByNames } from "@/lib/card/queries";

const HERO_DECK_NAMES = [
  "Sol Ring",
  "Counterspell",
  "Rhystic Study",
  "Swords to Plowshares",
  "Cultivate",
] as const;

const HERO_COLORS = [
  "bg-[#f8f0d1] border-[#d8c98a]", // W
  "bg-[#0e68ab] border-[#0a4f81]", // U
  "bg-[#1a1512] border-[#000]", // B
  "bg-[#d3202a] border-[#9b1820]", // R
  "bg-[#00733e] border-[#005529]", // G
];

const CARD_W = 140;
const CARD_H = 196;

function fanTransform(i: number, n: number) {
  const spread = 22;
  const rot = (i - (n - 1) / 2) * spread;
  const dx = (i - (n - 1) / 2) * 60;
  const dy = Math.abs(i - (n - 1) / 2) * 18;
  const zIndex = n - Math.abs(i - (n - 1) / 2);
  return {
    transform: `translateX(${dx}px) translateY(${dy}px) rotate(${rot}deg)`,
    zIndex,
  };
}

async function HeroCardFan() {
  const imagesByName = await getCardImagesByNames(HERO_DECK_NAMES);
  const n = HERO_DECK_NAMES.length;
  return (
    <>
      {HERO_DECK_NAMES.map((name, i) => {
        const imageUri = imagesByName[name.toLowerCase()];
        const style = fanTransform(i, n);
        return (
          <div
            key={name}
            className="absolute bottom-2 rounded-lg shadow-md overflow-hidden"
            style={{
              ...style,
              width: CARD_W,
              height: CARD_H,
            }}
          >
            {imageUri ? (
              <Image
                src={imageUri}
                alt={name}
                width={CARD_W * 2}
                height={CARD_H * 2}
                quality={75}
                className="w-full h-full object-cover rounded-lg"
                priority={i === Math.floor(n / 2)}
              />
            ) : (
              <div
                className={`w-full h-full rounded-lg border-2 ${HERO_COLORS[i]} flex flex-col items-center justify-end pb-4`}
              >
                <span className="font-mono text-[9px] uppercase tracking-widest opacity-60 px-2 text-center">
                  {name}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function HeroCardFanFallback() {
  const n = HERO_DECK_NAMES.length;
  return (
    <>
      {HERO_DECK_NAMES.map((name, i) => {
        const style = fanTransform(i, n);
        return (
          <div
            key={name}
            className={`absolute bottom-2 rounded-lg border-2 shadow-md ${HERO_COLORS[i]}`}
            style={{
              ...style,
              width: CARD_W,
              height: CARD_H,
            }}
          />
        );
      })}
    </>
  );
}

export function LandingHero() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-16 items-end mb-24">
      {/* Left — copy */}
      <div>
        <Eyebrow className="mb-7">A deckbuilder · est. 2026</Eyebrow>
        <h1 className="font-display text-[clamp(56px,10vw,144px)] font-medium leading-[0.92] tracking-[-0.04em] m-0">
          Build the
          <br />
          <em className="not-italic text-primary">main</em>deck.
        </h1>
        <p className="mt-8 max-w-130 text-[17px] leading-relaxed text-muted-foreground">
          Fast, performant Magic deckbuilding. All of the features you need to
          create your brew. No ads, no feature sprawl, no pay-gates, no
          noise.
        </p>
        <div className="flex flex-wrap gap-2.5 mt-9 items-center">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Get started
            <Kbd className="bg-transparent border-primary-foreground/30 text-primary-foreground">
              ⏎
            </Kbd>
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-md border bg-card px-5 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
          >
            Already have an account?
          </Link>
        </div>
      </div>

      {/* Right — fanned card illustration */}
      <div
        className="relative h-85 hidden lg:flex items-end justify-center"
        aria-hidden="true"
      >
        <Suspense fallback={<HeroCardFanFallback />}>
          <HeroCardFan />
        </Suspense>
      </div>
    </div>
  );
}
