import {
  ClipboardList,
  Link2,
  Plus,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldLabel } from "./field-label";
import type { Source } from "./constants";

const SOURCES: { v: Source; icon: React.ReactNode; label: string; sub: string }[] = [
  { v: "blank", icon: <Plus className="h-3.5 w-3.5" />, label: "Blank", sub: "Empty decklist" },
  { v: "paste", icon: <ClipboardList className="h-3.5 w-3.5" />, label: "Paste list", sub: "From clipboard" },
  { v: "file", icon: <Upload className="h-3.5 w-3.5" />, label: "From file", sub: ".txt · .mwDeck" },
  { v: "url", icon: <Link2 className="h-3.5 w-3.5" />, label: "From URL", sub: "Coming soon" },
];

export function SourceTabs({
  source,
  onSourceChange,
}: {
  source: Source;
  onSourceChange: (s: Source) => void;
}) {
  return (
    <div>
      <FieldLabel>Starting point</FieldLabel>
      <div
        className="grid grid-cols-4 border border-border divide-x divide-border rounded-md overflow-hidden"
        role="tablist"
        aria-label="Starting point"
      >
        {SOURCES.map(({ v, icon, label, sub }) => {
          const active = source === v;
          const disabled = v === "url";
          return (
            <button
              key={v}
              role="tab"
              aria-selected={active}
              type="button"
              disabled={disabled}
              onClick={() => onSourceChange(v)}
              className={cn(
                "flex flex-col gap-0.5 px-3 py-3 text-left transition-colors border-t-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                active
                  ? "border-t-primary bg-muted"
                  : "border-t-transparent bg-background hover:bg-muted/50",
                disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              <span
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(active ? "text-primary" : "text-muted-foreground")}
                >
                  {icon}
                </span>
                {label}
              </span>
              <span className="text-[10.5px] text-muted-foreground/70">{sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
