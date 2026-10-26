import type { Metadata } from "next";
import { LifeCounter } from "@/app/_components/life-counter/life-counter";

export const metadata: Metadata = {
  title: "Life counter · Maindeck",
  description:
    "A free in-browser Magic: The Gathering life counter with commander damage, poison and other counters. No app download.",
};

export default function LifeCounterPage() {
  return <LifeCounter />;
}
