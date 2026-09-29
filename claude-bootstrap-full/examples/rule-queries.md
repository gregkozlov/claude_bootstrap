---
paths:
  - 'src/widgets/*/index.tsx'
  - 'src/widgets/**/use*.ts'
  - 'src/widgets/**/*Table/index.tsx'
  - 'src/widgets/**/*Chart/index.tsx'
  - 'src/pages/*/index.tsx'
  - 'src/pages/*DetailPage/hooks/**'
  - 'src/pages/OrdersPage/Modals/*/index.tsx'
  - 'src/pages/{CatalogPage,AccountPage}/Tabs/*/index.tsx'
  - 'src/pages/SuppliersPage/hooks/use{SupplierOptions,LeadTimeHistory}.ts'
  - 'src/components/FiltersBar/**'
  - 'src/components/DateRangeField/**'
  - 'src/routes/hooks/**'
  - 'src/queryClient.ts'
  - 'src/store/selectionStore.ts'
  - 'src/store/use*Params.ts'
  - 'src/api/*/*.ts'
---

> Example from an inventory analytics frontend (React 19 + MUI + TanStack Query v5 + i18next). Not copied by apply.mjs. A path-scoped rule with a measured glob list; note the greps standing in for counts.

# Query call sites

The TanStack Query read-side conventions in full; the always-on rules live in `CLAUDE.md`. Elsewhere:

- mutations and invalidation - `.claude/rules/mutations.md`;
- the hand-written keys and `queryClient` defaults - `.claude/rules/query-client.md`.

## Query call sites

### Where the call and its params live

Call the generated hook directly in the component, or in a widget-local hook.

Params come from `useSelectionStore`:

- **via a `src/store` selector hook** when the same shape feeds two or more endpoints (`useInventoryParams` feeds `GET /inventory/stock-levels` and `GET /inventory/kpis`);
- **hand-mapped inline** when the shape is unique to one endpoint. `LeadTimeChart` sends only the supplier ids and the date range; no hook models that, on purpose.

### Options

Options go inline in the hook's second argument, `{ query: { ... } }` - the first argument for a param-less endpoint. Never restate a default: `enabled: true` is banned.

### `placeholderData: keepPreviousData`

**`placeholderData: keepPreviousData`** (imported from `@tanstack/react-query`) goes on every filter- or period-keyed query.

Never put it:

- on an id-keyed page query;
- in `queryClient` defaultOptions. A global default would make an id-keyed page (`WarehouseDetailPage`) render the _previous warehouse's_ data under the new id.

Where it is not needed or not wanted:

- A key that never moves with the filters needs none (the argument-less `useGetCatalogUnits()`).
- The one deliberate omission: `FillRateGauge`. A gauge showing the previous warehouse's rate under the new warehouse's name reads as a real number, so it drops to its skeleton on a warehouse change instead.
- It does not work for a `useQueries` fan-out. `QueriesObserver` matches observers by query hash, not position, so a changed window hands each query a fresh observer with no previous data.

### `enabled` gating

- A query whose params come from the filter bar never fires with placeholder-empty params - `enabled: hasDateRange` for date-driven endpoints.
- An id gate is `enabled: supplierId != null`, never `!!supplierId`: an id of `0` is valid.
- A modal's lookup fan-out gates on `enabled: isOpen` only **when the modal stays mounted while closed**.
- A modal mounted fresh per open needs no gate - mount is the gate (`NewOrderDialog`).

### The `isPending` trap

**The `isPending` trap:** a disabled query stays `isPending` forever.

- `isLoading` (`isPending && isFetching`) resolves to `false` for a disabled query and is safe.
- A widget that derives cold-load state from `isPending` must AND the same gate into that derivation (`useStockSeries`'s `isColdLoading`). Otherwise a cleared filter reads as an eternal skeleton.

### Lazy reads

`enabled: false` + explicit `refetch()` is the sanctioned on-demand pattern (`useSkuLookup`, which runs when the user submits a SKU in `NewOrderDialog`, not on every keystroke).

Refetch-on-open is also the _freshness_ mechanism where no mutation of this app invalidates that key. `useSupplierOptions` refetches when the supplier picker opens because suppliers are edited in another system - do not convert it to a plain `enabled` gate.

### `staleTime`

Global default only. The sole override, per `grep -rn "staleTime" src --include=*.ts --include=*.tsx`, is `useCurrentAccount`: `Infinity`, session-fixed, cleared by logout's `queryClient.clear()`.

Static-ish lookups (`getCatalogUnits`, the warehouse list) deliberately stay on the global default. Adding per-query staleTimes is a non-goal.

### Retry UX

- Hand the whole query to `DataTable`'s `query` prop.
- Hand `refetch` to `WidgetFrame`'s `onRetry`.

`onRetry` is optional on `WidgetFrame`. A call site with nothing to refetch renders the message alone; everything else passes the refetch.

`DataTable` gets the whole query or none. Omitting it is the local-snapshot opt-out for rows the page already holds.

On error, the two gates are deliberate opposites:

- `DataTable` empties its rows on `isError`.
- `FiltersBar`'s option lists gate on `isError` **plus** a has-data test. A failed refetch keeps the last good lists, and those stay correct.
