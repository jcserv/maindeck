import Link from "@/app/_components/link";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  FEED_PAGE_SIZE,
  getFollowingUpdates,
  type FeedItem,
} from "@/lib/user/feed";
import { summarizeDeltas } from "@/lib/deck/revision";
import { type Format } from "@/lib/generated/prisma/enums";
import { TimeAgo } from "./time-ago";

function formatLabel(format: Format): string {
  return format.charAt(0) + format.slice(1).toLowerCase();
}

function Header() {
  return (
    <div className="mb-4">
      <Eyebrow>Updates</Eyebrow>
    </div>
  );
}

function EmptyTile({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-sm text-sm text-muted-foreground p-8 text-center">
      {children}
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const { added, removed, count } = summarizeDeltas(item.changes);
  const editorLabel = item.editor.displayUsername ?? item.editor.username;

  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate min-w-0">
          <Link
            href={`/u/${item.editor.username}`}
            className="font-medium hover:underline"
          >
            {editorLabel}
          </Link>{" "}
          <span className="text-muted-foreground">updated</span>{" "}
          <Link
            href={`/deck/${item.deck.id}`}
            className="font-medium hover:underline"
          >
            {item.deck.name}
          </Link>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          <TimeAgo date={item.updatedAt} />
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        {formatLabel(item.deck.format)} ·{" "}
        {added > 0 && (
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            +{added}
          </span>
        )}
        {added > 0 && removed > 0 && " "}
        {removed > 0 && (
          <span className="text-red-600 dark:text-red-400 font-medium">
            −{removed}
          </span>
        )}{" "}
        · {count} change{count === 1 ? "" : "s"}
      </div>
    </div>
  );
}

export async function UpdatesFeed({ userId }: { userId: string }) {
  const { followingCount, items } = await getFollowingUpdates(userId);

  return (
    <div>
      <Header />
      {followingCount === 0 ? (
        <EmptyTile>
          <Link href="/decks/explore" className="text-primary hover:underline">
            Follow players
          </Link>{" "}
          to see their deck updates here.
        </EmptyTile>
      ) : items.length === 0 ? (
        <EmptyTile>No recent updates from players you follow.</EmptyTile>
      ) : (
        <div className="border border-border rounded-sm divide-y divide-border">
          {items.map((item) => (
            <FeedRow key={item.revisionId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export function UpdatesFeedSkeleton() {
  return (
    <div>
      <Header />
      <div className="border border-border rounded-sm divide-y divide-border overflow-hidden">
        {Array.from({ length: FEED_PAGE_SIZE }).map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse" aria-hidden />
        ))}
      </div>
    </div>
  );
}
