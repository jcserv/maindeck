import { cacheLife } from "next/cache";
import { NextResponse } from "next/server";
import { parseHTML } from "linkedom";

type PrefetchImage = {
  srcset: string;
  sizes: string;
  src: string;
  alt: string;
  loading: string;
};

async function getImageManifest(host: string, schema: string, path: string) {
  "use cache";
  cacheLife("max");

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
  const url = new URL(request.url);
  const host = url.host;
  const schema = url.protocol.replace(":", "");
  const images = await getImageManifest(host, schema, rest.join("/"));
  return NextResponse.json(
    { images },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
