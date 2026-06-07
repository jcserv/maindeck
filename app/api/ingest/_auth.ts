import { timingSafeEqual } from "node:crypto";

const BEARER_PREFIX = "Bearer ";

export function bearerMatches(
  header: string | null,
  expected: string,
): boolean {
  if (header === null || !header.startsWith(BEARER_PREFIX)) return false;
  const a = Buffer.from(header.slice(BEARER_PREFIX.length));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
