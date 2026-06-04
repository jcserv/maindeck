"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { PlaytestCard } from "../playtest-reducer";

interface CardTileProps {
  card: PlaytestCard;
  onTap?: () => void;
  onLongPress?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  className?: string;
}

export function CardTile({ card, onTap, onLongPress, draggable, onDragStart, className }: CardTileProps) {
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = () => {
    pressTimerRef.current = setTimeout(() => {
      onLongPress?.();
      pressTimerRef.current = null;
    }, 500);
  };

  const handlePointerUp = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      onTap?.();
    }
  };

  const handlePointerLeave = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className={cn(
        "relative w-full aspect-[63/88] rounded-md overflow-hidden cursor-pointer select-none transition-transform",
        card.tapped && "rotate-90 origin-center scale-90",
        className,
      )}
      draggable={draggable}
      onDragStart={onDragStart}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
    >
      {card.imageUri ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.imageUri}
          alt={card.name}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full bg-muted flex flex-col items-center justify-center gap-1 p-1">
          <span className="text-[10px] font-semibold text-center leading-tight line-clamp-3">
            {card.name}
          </span>
          {card.manaCost && (
            <span className="text-[9px] text-muted-foreground">{card.manaCost}</span>
          )}
          {card.typeLine && (
            <span className="text-[8px] text-muted-foreground text-center line-clamp-1">
              {card.typeLine}
            </span>
          )}
        </div>
      )}
      {card.gameChanger && (
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400" title="Game changer" />
      )}
    </div>
  );
}
