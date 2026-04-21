import { Format, Visibility } from "@/lib/generated/prisma/enums";

export type Source = "blank" | "paste" | "file" | "url";

export const FORMAT_OPTIONS = Object.values(Format).map((f) => ({
  value: f,
  label: f.charAt(0) + f.slice(1).toLowerCase(),
}));

export const VISIBILITY_OPTIONS = [
  { value: Visibility.PRIVATE, label: "Private", sub: "Only you" },
  { value: Visibility.UNLISTED, label: "Unlisted", sub: "Anyone with the link can view it" },
  { value: Visibility.PUBLIC, label: "Public", sub: "Listed and indexed" },
];

export const SELECT_CLASS =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
