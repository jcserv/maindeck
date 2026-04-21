import { useCallback, useState } from "react";
import { Upload } from "lucide-react";

export function FilePanel({ onText }: { onText: (text: string) => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      if (file.size > 2 * 1024 * 1024) {
        setError("File too large (max 2 MB)");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === "string") {
          setFileName(file.name);
          onText(text);
        }
      };
      reader.onerror = () => setError("Failed to read file");
      reader.readAsText(file);
    },
    [onText],
  );

  return (
    <div
      className="border-2 border-dashed border-border rounded-md p-8 text-center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
    >
      <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm font-medium mb-1">
        {fileName ?? "Drop a file or click to browse"}
      </p>
      <p className="text-xs text-muted-foreground mb-4">.txt · .mwDeck · up to 2 MB</p>
      <label className="cursor-pointer">
        <span className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
          Choose file
        </span>
        <input
          type="file"
          accept=".txt,.mwDeck,.dec,.dek"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </label>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
