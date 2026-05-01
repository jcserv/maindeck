"use client";

interface TimeAgoProps {
  date: Date | string;
}

export function TimeAgo({ date }: TimeAgoProps) {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  let label: string;
  if (seconds < 60) label = "just now";
  else {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) label = `${minutes}m ago`;
    else {
      const hours = Math.floor(minutes / 60);
      if (hours < 24) label = `${hours}h ago`;
      else {
        const days = Math.floor(hours / 24);
        if (days < 30) label = `${days}d ago`;
        else label = d.toLocaleDateString();
      }
    }
  }
  return <span suppressHydrationWarning>{label}</span>;
}
