---
paths:
  - 'src/widgets/*/index.tsx'
  - 'src/widgets/*/use*.ts'
  - 'src/widgets/**/hooks/use*.ts'
  - 'src/widgets/**/*Table/index.tsx'
  - 'src/widgets/**/*Chart/index.tsx'
  - 'src/pages/*/index.tsx'
  - 'src/pages/*DetailPage/hooks/*.ts'
  - 'src/pages/OrdersPage/Modals/*/index.tsx'
  - 'src/pages/{CatalogPage,AccountPage}/Tabs/*/index.tsx'
  - 'src/pages/SuppliersPage/hooks/use{SupplierOptions,LeadTimeHistory}.ts'
  - 'src/components/FiltersBar/**'
  - 'src/components/DateRangeField/**'
  - 'src/routes/hooks/*.ts'
  - 'src/queryClient.ts'
  - 'src/store/selectionStore.ts'
  - 'src/store/use*Params.ts'
  - 'src/api/*/*.ts'
---

> Example from an inventory analytics frontend (React 19 + MUI + TanStack Query v5 + i18next). Not part of the template - copy it by hand. A path-scoped rule with a measured glob list, each glob narrowed to the files that hold query calls (`hooks/*.ts`, not `hooks/**`), and written by class: one dense paragraph per convention, a fact that another rule owns pointed to rather than restated; note the grep standing in for a count. The `.claude/rules/*.md` files it points to are the example project's own rules, not shipped.

# Query call sites

The TanStack Query read-side conventions; the always-on rules live in `CLAUDE.md`. Mutations and invalidation - `.claude/rules/mutations.md`; the hand-written keys and `queryClient` defaults - `.claude/rules/query-client.md`.

## Query call sites

### Where the call and its params live

Call the generated hook directly in the component, or in a widget-local hook. Params come from `useSelectionStore`:

- **via a `src/store` selector hook** when the same shape feeds two or more endpoints (`useInventoryParams` feeds `GET /inventory/stock-levels` and `GET /inventory/kpis`);
- **hand-mapped inline** when the shape is unique to one endpoint. `LeadTimeChart` sends only the supplier ids and the date range; no hook models that, on purpose.

### Options

Options go inline in the hook's second argument, `{ query: { ... } }` - the first argument for a param-less endpoint. Never restate a default such as `enabled: true`.

### `placeholderData: keepPreviousData`

**`placeholderData: keepPreviousData`** (from `@tanstack/react-query`) goes on every filter- or period-keyed query.

Never on an id-keyed page query: an id-keyed query whose component stays mounted across an id change would render the previous warehouse's data under the new id (`WarehouseDetailPage`).

- A key that never moves with the filters needs none (the argument-less `useGetCatalogUnits()`).
- The one deliberate omission: `FillRateGauge`, which drops to its skeleton on a warehouse change instead - the previous warehouse's rate under the new name reads as a real number.
- It does not work for a `useQueries` fan-out: `QueriesObserver` matches observers by query hash, so a changed window gets fresh observers with no previous data.

### `enabled` gating

- A query whose params come from the filter bar never fires with placeholder-empty params - `enabled: hasDateRange` for date-driven endpoints.
- An id gate is `enabled: supplierId != null`, never `!!supplierId`: an id of `0` is valid.
- A modal's lookup fan-out gates on `enabled: isOpen` only **when the modal stays mounted while closed**; one mounted fresh per open needs no gate, mount is the gate (`NewOrderDialog`).

### The `isPending` trap

**The `isPending` trap:** a disabled query stays `isPending` forever. `isLoading` (`isPending && isFetching`) is safe; a widget that derives cold-load state from `isPending` ANDs the same gate into it (`useStockSeries`'s `isColdLoading`), or a cleared filter reads as an eternal skeleton.

### Lazy reads

`enabled: false` + explicit `refetch()` is the sanctioned on-demand pattern (`useSkuLookup`, which runs when the user submits a SKU in `NewOrderDialog`, not on every keystroke). A surface that renders such a read as soon as it opens takes its cold load from `isPending` ANDed with its open gate, never `isLoading`, under which the empty state flashes before the open-time `refetch()`.

Refetch-on-open is also the freshness mechanism where no mutation of this app invalidates that key: suppliers are edited in another system, so `useSupplierOptions` refetches when the supplier picker opens - do not convert it to a plain `enabled` gate.

### `staleTime`

Global default only - `grep -rn "staleTime" src --include=*.ts --include=*.tsx` lists the one override, `useCurrentAccount`, which `.claude/rules/auth-flow.md` owns. Static-ish lookups (`getCatalogUnits`, the warehouse list) deliberately stay on the global default; per-query staleTimes are a non-goal.

### Retry UX

- Hand the whole query to `DataTable`'s `query` prop, or none - omitting it is the local-snapshot opt-out for rows the page already holds.
- Hand `refetch` to `WidgetFrame`'s `onRetry`. It is optional: a call site with nothing to refetch renders the message alone; everything else passes the refetch.

On error, the two gates are deliberate opposites: `DataTable` empties its rows on `isError`; `FiltersBar`'s option lists gate on `isError` **plus** a has-data test, so a failed refetch keeps the last good lists.
