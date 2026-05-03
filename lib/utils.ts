import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toNameSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function toTitleCase(input: string): string {
  return input.replace(
    /\p{L}+/gu,
    (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
  );
}

// Exhaustiveness guard for discriminated-union switches. TypeScript narrows the
// `value` parameter to `never` when all variants are handled; at runtime it
// throws so a forgotten case is caught immediately rather than silently no-oping.
export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}
