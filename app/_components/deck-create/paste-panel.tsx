import { Eyebrow } from "@/components/ui/eyebrow";
import { TypeaheadTextarea } from "@/app/_components/deck-create/typeahead-textarea";
import type { ParsedDecklist } from "@/lib/deck/io/parse";
import type { CardSearchResult } from "@/lib/search/card-search";
import { ParsePreview } from "./parse-preview";

async function fetchSuggestions(q: string): Promise<string[]> {
  if (!q.trim()) return [];
  const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q.trim())}`);
  if (!res.ok) return [];
  const data = (await res.json()) as CardSearchResult[];
  return Array.isArray(data) ? data.map((c) => c.name) : [];
}

export function PastePanel({
  text,
  onTextChange,
  parseResult,
}: {
  text: string;
  onTextChange: (v: string) => void;
  parseResult: ParsedDecklist | null;
}) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="grid md:grid-cols-[1fr_220px] min-h-[240px]">
        <TypeaheadTextarea
          suggest={fetchSuggestions}
          value={text}
          onChange={onTextChange}
          placeholder={`4 Lightning Bolt\n2 Counterspell (MH2) 50\n\n// Sideboard\n1 Force of Will`}
          rows={10}
          className="font-mono text-sm rounded-none border-0 border-r border-border focus-visible:ring-0 focus-visible:ring-offset-0 resize-y min-h-[240px]"
          aria-label="Paste decklist"
        />
        <div className="p-3 border-t border-border md:border-t-0 bg-muted/30">
          <Eyebrow className="mb-3">Parse preview</Eyebrow>
          <ParsePreview result={parseResult} />
        </div>
      </div>
    </div>
  );
}
