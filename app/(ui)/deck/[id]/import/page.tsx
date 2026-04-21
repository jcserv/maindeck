import { Suspense } from "react";
import { redirect } from "next/navigation";

interface DeckImportPageProps {
  params: Promise<{ id: string }>;
}

async function DeckImportRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<never> {
  const { id } = await params;
  redirect(`/deck/new?source=paste&target=${id}`);
}

export default function DeckImportPage({ params }: DeckImportPageProps) {
  return (
    <Suspense fallback={null}>
      <DeckImportRedirect params={params} />
    </Suspense>
  );
}
