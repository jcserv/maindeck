import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { userFollowingTag } from "@/lib/deck/cache-tags";
import { parseRevisionDeltas, type RevisionDelta } from "@/lib/deck/revision";
import type { Format } from "@/lib/generated/prisma/enums";

export const FEED_PAGE_SIZE = 10;

export interface FeedItem {
  revisionId: string;
  updatedAt: Date;
  deck: { id: string; name: string; format: Format };
  editor: {
    username: string;
    displayUsername: string | null;
    name: string;
    image: string | null;
  };
  changes: RevisionDelta[];
}

export interface FollowingUpdates {
  followingCount: number;
  items: FeedItem[];
}

/**
 * Recent revisions authored by users the viewer follows, on PUBLIC decks of
 * `kind=DECK`. Attribution is by editor (`DeckRevision.userId`), so a
 * followed user's collaborator edits on someone else's public deck surface
 * too. Cached under the viewer's following tag — follow/unfollow refreshes
 * immediately; deck edits ride the minutes-level staleness.
 */
export async function getFollowingUpdates(
  viewerId: string,
): Promise<FollowingUpdates> {
  "use cache";
  cacheLife("minutes");
  cacheTag(userFollowingTag(viewerId));

  const follows = await prisma.follow.findMany({
    where: { followerId: viewerId },
    select: { followingId: true },
  });
  if (follows.length === 0) return { followingCount: 0, items: [] };

  const followedIds = follows.map((f) => f.followingId);
  const revisions = await prisma.deckRevision.findMany({
    where: {
      userId: { in: followedIds },
      deck: { visibility: "PUBLIC", kind: "DECK" },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: FEED_PAGE_SIZE,
    select: {
      id: true,
      userId: true,
      updatedAt: true,
      changes: true,
      deck: { select: { id: true, name: true, format: true } },
    },
  });

  const editorIds = [...new Set(revisions.map((r) => r.userId))];
  const editors =
    editorIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: editorIds } },
          select: {
            id: true,
            username: true,
            displayUsername: true,
            name: true,
            image: true,
          },
        });
  const editorById = new Map(editors.map((e) => [e.id, e]));

  const items: FeedItem[] = [];
  for (const r of revisions) {
    const editor = editorById.get(r.userId);
    if (!editor) continue;
    const changes = parseRevisionDeltas(r.changes);
    if (changes.length === 0) continue;
    items.push({
      revisionId: r.id,
      updatedAt: r.updatedAt,
      deck: r.deck,
      editor: {
        username: editor.username,
        displayUsername: editor.displayUsername,
        name: editor.name,
        image: editor.image,
      },
      changes,
    });
  }

  return { followingCount: follows.length, items };
}
