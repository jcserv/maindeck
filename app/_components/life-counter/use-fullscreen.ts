"use client";

import { useCallback, useEffect, useState } from "react";

function supportsFullscreenApi(): boolean {
  return typeof document.documentElement.requestFullscreen === "function";
}

export function useFullscreen(): [boolean, () => void, () => void] {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) setIsFullscreen(false);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen || document.fullscreenElement) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) setIsFullscreen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  const enter = useCallback(() => {
    setIsFullscreen(true);
    if (supportsFullscreenApi()) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  const exit = useCallback(() => {
    setIsFullscreen(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  return [isFullscreen, enter, exit];
}
