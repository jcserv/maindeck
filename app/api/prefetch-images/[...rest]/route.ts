import { cacheLife, cacheTag } from "next/cache";
import { NextResponse } from "next/server";
import { parseHTML } from "linkedom";

type PrefetchImage = {
  srcset: string;
  sizes: string;
  src: string;
  alt: string;
  loading: string;
};

/**
 * Routes whose image manifests we will prefetch. The server-side fetch that
 * populates the manifest carries no cookie, so it always sees the anonymous
 * (public) response — no auth is needed on this route.
 *
 * Segments use the same shapes as Next.js dynamic routes:
 *   - static paths are matched literally
 *   - "[id]" matches any single non-empty, non-slash segment
 */
const ALLOWED_PATH_RE =
  /^(|decks\/explore|deck\/[^/]+|search|cards\/[^/]+)$/;

async function getImageManifest(host: string, schema: string, path: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`prefetch:${path}`);

  const url = `${schema}://${host}/${path}`;
  const body = await fetch(url).then((r) => r.text());
  const { document } = parseHTML(body);
  const images: PrefetchImage[] = Array.from(
    document.querySelectorAll("main img"),
  ).map((img) => ({
    srcset: img.getAttribute("srcset") ?? "",
    sizes: img.getAttribute("sizes") ?? "",
    src: img.getAttribute("src") ?? "",
    alt: img.getAttribute("alt") ?? "",
    loading: img.getAttribute("loading") ?? "",
  }));
  return images;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ rest: string[] }> },
) {
  const { rest } = await params;
  const path = rest.join("/");

  if (!ALLOWED_PATH_RE.test(path)) {
    return NextResponse.json({ error: "Not found" }, { status: 400 });
  }

  const url = new URL(request.url);
  const host = url.host;
  const schema = url.protocol.replace(":", "");
  const images = await getImageManifest(host, schema, path);
  return NextResponse.json(
    { images },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
