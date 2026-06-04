"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { PlaytestClient as PlaytestClientType } from "./playtest-client";

const PlaytestClient = dynamic(
  () => import("./playtest-client").then((m) => ({ default: m.PlaytestClient })),
);

export function PlaytestLoader(props: ComponentProps<typeof PlaytestClientType>) {
  return <PlaytestClient {...props} />;
}
