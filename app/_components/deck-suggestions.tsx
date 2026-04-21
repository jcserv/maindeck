import { Sparkles } from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Chip } from "@/components/ui/chip";

// Feature-flagged stub. Real AI suggestions wire-up pending — see plan F6.
export function DeckSuggestions() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-3.5 text-muted-foreground" aria-hidden />
        <Eyebrow>AI suggestions</Eyebrow>
        <Chip tone="neutral" className="ml-auto">
          Soon
        </Chip>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        We&rsquo;ll surface card swaps and gap warnings here once the assistant
        is wired up.
      </p>
    </div>
  );
}
