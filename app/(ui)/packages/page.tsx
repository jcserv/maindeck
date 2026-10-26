import { Suspense } from "react";
import { connection } from "next/server";
import { Globe, Link2, Lock } from "lucide-react";
import Link from "@/app/_components/link";
import { NewPackageForm } from "@/app/_components/package/new-package-form";
import { requireSession } from "@/lib/auth/session";
import { getPackagesByUser } from "@/lib/deck/package-queries";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { Visibility } from "@/lib/generated/prisma/enums";

const VISIBILITY_ICON = {
  PRIVATE: Lock,
  UNLISTED: Link2,
  PUBLIC: Globe,
} as const satisfies Record<Visibility, typeof Lock>;

async function PackagesContent() {
  // Runtime boundary: keep the `use cache` DB reads out of the build-time
  // prerender so `next build` never opens a Neon connection. See sitemap.ts.
  await connection();
  const { userId } = await requireSession();
  const packages = await getPackagesByUser(userId);

  if (packages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center h-[200px]">
        <p className="text-muted-foreground">No packages yet.</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          A package is a reusable list of cards, like your staples or a ramp
          suite, that you can add to any deck in one go.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {packages.map((pkg) => {
        const Icon = VISIBILITY_ICON[pkg.visibility];
        return (
          <li key={pkg.id}>
            <Link
              href={`/packages/${pkg.id}`}
              className="flex h-[120px] flex-col justify-between rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{pkg.name}</p>
                {pkg.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {pkg.description}
                  </p>
                )}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3" aria-label={pkg.visibility.toLowerCase()} />
                {pkg.cardCount} card{pkg.cardCount !== 1 ? "s" : ""}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function PackagesPage() {
  return (
    <div className="px-4 py-14 max-w-5xl mx-auto">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow className="mb-3">Your library</Eyebrow>
          <h1 className="text-5xl font-medium leading-none tracking-tight">
            Packages
          </h1>
        </div>
        <NewPackageForm />
      </div>

      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[120px] rounded-xl bg-muted animate-pulse"
                aria-hidden
              />
            ))}
          </div>
        }
      >
        <PackagesContent />
      </Suspense>
    </div>
  );
}
