import { Suspense } from "react";
import { requireSession } from "@/lib/auth/session";
import { DeckCreateForm } from "@/app/_components/deck-create-form";

interface NewDeckPageProps {
  searchParams: Promise<{ source?: string }>;
}

async function NewDeckShell({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  await requireSession();
  const { source } = await searchParams;
  const defaultSource =
    source === "paste" || source === "file" || source === "url" ? source : "blank";
  return <DeckCreateForm defaultSource={defaultSource} />;
}

export default function NewDeckPage({ searchParams }: NewDeckPageProps) {
  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold mb-8">
        Start a new <em className="text-primary not-italic">deck</em>.
      </h1>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <div className="h-[72px] rounded-xl bg-muted animate-pulse" />
            <div className="h-[60px] rounded-xl bg-muted animate-pulse" />
            <div className="h-[280px] rounded-xl bg-muted/40 animate-pulse" />
          </div>
        }
      >
        <NewDeckShell searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
