"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_GAME,
  lifeCounterReducer,
  parseGame,
  type GameState,
  type LifeCounterAction,
} from "@/lib/life-counter/state";

const STORAGE_KEY = "maindeck:life-counter";

const listeners = new Set<() => void>();
let current: GameState | null = null;

function readStored(): GameState {
  try {
    return parseGame(window.localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_GAME;
  } catch {
    return DEFAULT_GAME;
  }
}

function getSnapshot(): GameState {
  current ??= readStored();
  return current;
}

function getServerSnapshot(): GameState {
  return DEFAULT_GAME;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  function onStorage(e: StorageEvent) {
    if (e.key !== STORAGE_KEY) return;
    current = readStored();
    callback();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function dispatch(action: LifeCounterAction): void {
  current = lifeCounterReducer(getSnapshot(), action);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore quota / private-mode errors; the in-memory game still works
  }
  listeners.forEach((cb) => cb());
}

export function useLifeCounter() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [state, dispatch] as const;
}
