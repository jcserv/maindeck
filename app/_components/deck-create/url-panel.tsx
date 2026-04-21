import { Input } from "@/components/ui/input";

export function UrlPanel() {
  return (
    <div className="border border-border rounded-md p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Input
          placeholder="https://www.moxfield.com/decks/…"
          disabled
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">
          URL import is coming soon. Use Paste or File in the meantime.
        </p>
      </div>
    </div>
  );
}
