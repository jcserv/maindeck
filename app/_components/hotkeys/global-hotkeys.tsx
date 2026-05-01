"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import { CheatsheetDialog } from "./cheatsheet-dialog";
import { fireDeckAction } from "./deck-actions-bus";

export function GlobalHotkeys() {
  const router = useRouter();
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useHotkeys(
    "shift+/",
    (event) => {
      event.preventDefault();
      setCheatsheetOpen((v) => !v);
    },
    { enableOnFormTags: false },
  );

  useHotkeys(
    "n",
    (event) => {
      event.preventDefault();
      router.push("/deck/new");
    },
    { enableOnFormTags: false },
  );

  useHotkeys(
    "g>d",
    (event) => {
      event.preventDefault();
      router.push("/decks");
    },
    { enableOnFormTags: false },
  );

  useHotkeys(
    "g>h",
    (event) => {
      event.preventDefault();
      router.push("/");
    },
    { enableOnFormTags: false },
  );

  useHotkeys(
    "b",
    (event) => {
      if (fireDeckAction("bulk-edit")) event.preventDefault();
    },
    { enableOnFormTags: false },
  );

  useHotkeys(
    "e",
    (event) => {
      if (fireDeckAction("export")) event.preventDefault();
    },
    { enableOnFormTags: false },
  );

  useHotkeys(
    "v",
    (event) => {
      if (fireDeckAction("toggle-view")) event.preventDefault();
    },
    { enableOnFormTags: false },
  );

  return (
    <CheatsheetDialog open={cheatsheetOpen} onOpenChange={setCheatsheetOpen} />
  );
}
