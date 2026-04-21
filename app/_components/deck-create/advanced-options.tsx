import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Visibility } from "@/lib/generated/prisma/enums";
import { FieldLabel } from "./field-label";
import { VISIBILITY_OPTIONS } from "./constants";

export function AdvancedOptions({
  visibility,
  onVisibilityChange,
  description,
  onDescriptionChange,
}: {
  visibility: Visibility;
  onVisibilityChange: (v: Visibility) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((a) => !a)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        Advanced options
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-5 pl-4 border-l border-border">
          <div>
            <FieldLabel>Visibility</FieldLabel>
            <div
              className="grid grid-cols-3 border border-border divide-x divide-border rounded-md overflow-hidden"
              role="radiogroup"
              aria-label="Visibility"
            >
              {VISIBILITY_OPTIONS.map(({ value, label, sub }) => {
                const active = visibility === value;
                return (
                  <button
                    key={value}
                    role="radio"
                    aria-checked={active}
                    type="button"
                    onClick={() => onVisibilityChange(value)}
                    className={cn(
                      "flex flex-col gap-0.5 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      active ? "bg-muted" : "bg-background hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs font-medium",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground/70">
                      {sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="deck-description" optional>
              Description
            </FieldLabel>
            <Textarea
              id="deck-description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Strategy, wincons, matchups…"
              rows={3}
              maxLength={2000}
              className="resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
