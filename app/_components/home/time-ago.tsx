"use client";

import { useSyncExternalStore } from "react";

interface TimeAgoProps {
  date: Date | string;
}

function formatLabel(d: Date, now: number): string {
  const seconds = Math.floor((now - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

const noopSubscribe = () => () => {};

export function TimeAgo({ date }: TimeAgoProps) {
  const d = typeof date === "string" ? new Date(date) : date;
  const label = useSyncExternalStore(
    noopSubscribe,
    () => formatLabel(d, Date.now()),
    () => formatLabel(d, d.getTime()),
  );
  return <span suppressHydrationWarning>{label}</span>;
}
