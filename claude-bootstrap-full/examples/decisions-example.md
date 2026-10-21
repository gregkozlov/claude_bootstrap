> Example from an inventory analytics frontend (`.claude/docs/decisions.md`). Not copied by apply.mjs - the template ships the empty skeleton. Shows what a filled file looks like: one bullet per entry, a bold lead with the verdict, the reason in a few sentences, identifiers instead of line numbers.

# Decisions - do not re-file

Decisions already taken about this codebase, each with its reason. A fresh review would otherwise rediscover them and raise them again.

- **Who reads it.** `crosscheck` greps it by the diff's files and identifiers and hands the matching entries to every reviewer as settled. `drift`, `hunt` (in its `area` and `refute` modes) and `maintain-ai-layer` read it too.
- **What a match means.** A finding that matches an entry is reported as `settled (decisions.md)`, not as a defect - unless it brings evidence the entry did not have, which reopens it.
- **When an entry stops applying.** An entry describes code. When that code changes, the entry no longer binds and the finding is judged fresh.
- **Not here.** What `CLAUDE.md` or a `.claude/rules/*.md` file already states, and open work: a live defect belongs in the backlog. A count, path or behaviour an entry cites is re-measured before it is relied on.

**Adding an entry.** Only on the owner's request. One bullet in the right section: a bold lead naming the thing and the verdict, then the reason in one to three short sentences. Name files and identifiers, not line numbers. No ticket or review ids, no dates, no history of how it was decided. Entries are the owner's: no agent or skill edits this file unless the owner asks for that entry.

## Won't do

Product decisions - real, and deliberately not done.

- **`StockLevelChart` keeps a linear y-axis; no log-scale toggle.** The chart's job is to show how far a SKU sits above its reorder line, and a log axis compresses exactly that distance. The designer rejected the toggle for that reason.
- **`ReorderTable` is read-only; no inline edit of the reorder point.** Reorder points change through the purchasing workflow on `SupplierDetailPage`, which records who changed what. An inline cell edit would bypass it.
- **`CatalogPage` keeps client-side search.** The catalog loads once per session and stays within a few thousand SKUs per account. Server search would add a round trip per keystroke for no visible gain. Re-measure if the per-account cap goes up.
- **The unit-of-measure codes (`EA`, `CS`, `PL`, `KG`) stay untranslated.** They are the codes printed on labels and purchase orders, and warehouse staff match them by eye. The long names in the tooltip are translated.
- **`SlowMoversTable` keeps a fixed 90-day window.** The window is the purchasing team's definition of a slow mover. Making it a filter would let two users call the same SKU different things in the same meeting.
- **The `WarehouseMap` legend stays fixed in the bottom-left corner.** A designer decision: a draggable legend covers bins on small warehouses and loses its position on every reload.
- **No CSV import for purchase orders.** Considered and rejected:
  - orders are created one supplier at a time, and the `NewOrderDialog` flow already pre-fills the reorder quantities;
  - a CSV carries no unit of measure per line, so `5` of a `CS` item and `5` of an `EA` item would import identically;
  - `POST /orders` takes one order per call, so a partial import failure would leave half an upload behind with no rollback.

## Out of scope

Owned by another team, the backend or the deploy; this repo cannot fix them.

- **`GET /suppliers/{id}/lead-times` counts calendar days, not working days.** Converting would need each supplier's holiday calendar, which no endpoint exposes. `LeadTimeChart` labels its axis "calendar days" so the number is not misread.
- **`GET /orders/summary` silently ignores an unknown `sortDir`.** Rejecting it is backend validation work. The frontend sends only the typed `'asc' | 'desc'` union, so no call site can hit it today.
- **Open-ended validity stays the `9999-12-31` sentinel.** Replacing it with `null` is a contract change on every endpoint that carries `validTo`. The frontend maps it once, in `toValidity`, and renders "open-ended".
- **Cache headers on `index.html` belong to the deploy.** The web server config that sends `no-cache` for `index.html` and long-lived headers for hashed assets is built by the backend team with the image. A stale-shell report goes to them, not into a service worker here.

## Rejected fixes and disproven claims

Fixes someone will propose again, and claims someone will re-derive.

- **Do not normalize `fillRate` and `stockoutRatePct` onto one scale in `src/api`.** The spec says `fillRate` is 0-1 and `stockoutRatePct` is 0-100, and the generated types carry that. A normalizing wrapper would make the types lie about the values. `formatPercent` takes the scale as an argument at each call site instead.
- **A `null` `daysOfCover` is not zero.** `null` means no demand in the window, which is unlimited cover. The proposed `?? 0` would flag every dormant SKU as a stockout. `ReorderTable` renders `-` for it.
- **`NumberInput` does not clamp while typing.** With `min={10}`, clamping on each keystroke makes it impossible to type `1` on the way to `12`. It clamps on blur, and the form schema carries the real bound.
- **`selectionStore` is not persisted.** A remembered warehouse filter would silently narrow the next session's dashboard, and nothing on the page says a filter is active on load. Only `uiStore` persists.
- **No second virtualizer around `DataTable`.** The data grid already virtualizes its rows. The proposed wrapper double-virtualizes, which breaks column resizing and the sticky header.
- **`WarehouseMap` fits its bounds on first load only.** Refitting on every filter change throws away the user's zoom mid-analysis. The "Fit to warehouse" button is the explicit way back.
- **A purchase-order quantity accepts decimals.** Items sold by weight (`KG`) take fractional quantities. The `NumberInput` step comes from the line's unit of measure, so an integer-only field was rejected.
- **No retry on `POST /orders`.** The endpoint is not idempotent, and a retried timeout can create two orders. Mutations keep TanStack Query's default of no retry; the error toast tells the user to check the order list first.
- **A reordered import in a touched file is not noise to revert.** `lint-staged` runs `prettier --write` with the import-sorting plugin on every staged file, so the new order is what the repo's own tooling produces.

## Verified clean

Claims that were measured and found sound. Re-measure before relying on one.

- **Every call site of `usePostOrders` invalidates the order summary.** Each passes `getGetOrdersSummaryQueryKey()` to `invalidateQueries` in its own `onSuccess`; `grep -rn "usePostOrders" src` lists them.
- **Week start follows `uiStore.weekStartsOn` everywhere.** `DateRangeField` and `StockLevelChart`'s weekly buckets both read it, and `grep -rn "weekStartsOn" src` finds no hard-coded value.
- **The `9999-12-31` sentinel never reaches the UI.** `toValidity` is the only reader of `validTo` outside `src/api/*/generated/`.
- **`LeadTimeChart`'s "median" label is correct.** The endpoint returns `medianDays`, and the chart plots it unchanged; it is not an average under the wrong name.
- **`CatalogPage`'s client-side search keeps up.** Filtering the largest account's catalog takes well under one frame on the reference machine, so no debounce is needed.
- **`LoginPage` is the only route outside the auth guard.** Only its entry in `src/routes/routes.ts` carries `public: true`.
