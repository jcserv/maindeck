---
name: verify
description: Build, launch, and drive maindeck locally to observe a change end-to-end (dev server + Postgres + browser).
---

# Verifying maindeck changes at runtime

## Launch

```bash
docker compose up -d          # postgres :5432 (maindeck/maindeck/maindeck_dev), redis, srh
npm run dev                   # Next.js on http://localhost:3000 (~30s to first 200)
```

`DATABASE_URL` in `.env` points at the docker Postgres. The dev DB usually
already has ~33k cards ingested (Sol Ring=1386, Lightning Bolt=871,
Llanowar Elves=657, Forest=1 — ids stable in the local dataset; re-check with
`SELECT id FROM card WHERE name=...`).

## Auth

Sign-up form needs username, email, DOB, password. Two gotchas:

- The DOB `<input type="date">` rejects accessibility-ref fills; set it via
  `chrome-devtools-axi eval` with the native value setter + `input` event.
- Email verification blocks sign-in; flip it in SQL:
  `UPDATE "user" SET email_verified = true WHERE email = '...';`

## Seeding deck fixtures

Fastest path is SQL against `maindeck_dev` (`PGPASSWORD=maindeck psql -h
localhost -U maindeck -d maindeck_dev`). Minimum viable deck:

```sql
INSERT INTO deck (id, user_id, name, format, visibility, created_at, updated_at) VALUES (...);
INSERT INTO deck_category (id, deck_id, name, sort_order) VALUES (...);   -- names lowercase
INSERT INTO deck_card (id, deck_id, card_id, quantity, zone, created_at, updated_at) VALUES (...);
INSERT INTO deck_card_category (deck_card_id, deck_category_id, position) VALUES (...); -- 0 = primary
```

`user.username`, `name`, `date_of_birth` are all NOT NULL.

## Driving the builder

- Card row menus: `button "Move card"` → tabs Actions / Category / Zone.
  Number keys toggle memberships, Shift+digit promotes primary, menu stays
  open (`closeOnClick=false`).
- Section menus: `button "Actions for <category>"` → Move all cards to /
  Delete.
- Bulk edit: deck page `button "Bulk edit decklist"` → textarea + Save.
  **React textareas ignore plain accessibility fills for state purposes** —
  set values with the native setter + `input` event via `eval`, or type
  through the keyboard. `press Meta+a` inside the dialog does NOT reliably
  select-all; verify the textarea value before submitting (a botched paste
  that prepends to existing text parses as garbage and replace-mode will
  happily wipe the deck).
- History/revert: `/deck/<id>/history` → "Revert all" → confirm dialog
  `button "Revert"`.
- Server actions log one line each to the dev-server stdout
  (`ƒ actionName(args…)`) — grep it to confirm what actually fired.

## Evidence

Assert final state in SQL (memberships, quantities, revisions) — the
`deck_revision.changes` JSON column shows delta payloads directly.
