import { Input } from "@/components/ui/input";
import { Format } from "@/lib/generated/prisma/enums";
import { FieldLabel } from "./field-label";
import { FORMAT_OPTIONS, SELECT_CLASS } from "./constants";

export function MetadataFields({
  name,
  onNameChange,
  format,
  onFormatChange,
}: {
  name: string;
  onNameChange: (v: string) => void;
  format: Format;
  onFormatChange: (v: Format) => void;
}) {
  return (
    <div className="grid sm:grid-cols-[1.3fr_1fr] gap-4">
      <div>
        <FieldLabel htmlFor="deck-name">Deck name</FieldLabel>
        <Input
          id="deck-name"
          name="name"
          placeholder="Name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          required
          maxLength={255}
          className="h-11"
          autoFocus
        />
      </div>
      <div>
        <FieldLabel htmlFor="deck-format">Format</FieldLabel>
        <select
          id="deck-format"
          value={format}
          onChange={(e) => onFormatChange(e.target.value as Format)}
          className={SELECT_CLASS}
        >
          {FORMAT_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
