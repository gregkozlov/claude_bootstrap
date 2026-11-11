---
name: verify-live
description: The browser check for a finished change against the right server and Chrome - lifecycle step 6, and on "/verify-live", "check it in the browser", "look at it in the app", "check it live". Never starts a server.
---

> Example from an inventory analytics frontend served by Vite under the base path `/stockroom/`. Not part of the template - copy it by hand if it fits; the template ships the generic ritual. Depends on: the Claude in Chrome extension, `.claude/scripts/dev-servers.mjs`, the `/__tree` marker from `tree-marker-plugin.ts`, and a bundle measurement script of the project's own. Shows the ritual with the real endpoints, the dev-only tooling and the known console noise filled in.

# verify-live

The port and the Chrome are settled by facts, never by convention or by what a page looks like.

## The prohibitions - they hold through every step below

- **Attach, never start or stop a server** - they are the owner's. Probe with `localhost`, never `127.0.0.1`: the dev servers have bound **`::1` only**, so a refused `127.0.0.1` says nothing about whether the app is up.
- **Only `http://localhost:<port>/stockroom/`.** The `[::1]` literal is a **different browser origin**: the token lives in origin-scoped `localStorage`, so it opens a logged-out app and bounces to `/login`, which reads as a session problem and is not one. Only `localhost` carries the user's login.
- **Only the Chrome on this machine, ever.** The owner's other machines signed in to the same Claude account show up as connectable browsers - never select or switch to one, even when it is the only one offered. A page alone never tells which machine it shows: another machine's Chrome answers `localhost` with an error page, or with that machine's own server looking right. The `/__tree` marker settles it - never retry the URL, never pick from `list_connected_browsers`.
- **When the browser cannot reach the app, stop and ask the owner to step in, at once.** No Chrome on this machine connected, an error page or another `host` at `/__tree` that step 3's one `switch_browser` prompt did not clear, a browser tool that fails, the login page: name what you saw and what they should do (open Chrome here, connect the extension, log in). Do not work around it; the check stays pending until they have.
- **Writes need explicit approval, every time.** The dev server talks to the team's shared backend, not a fixture, so a Save or a Delete in the UI is a real mutation that everyone else on that backend sees. Reading a page is free; clicking "New order" is not. Before an approved write to a product or warehouse record, note its values and its `version`; revert by re-reading it and sending the original values on top of the current record - never the old snapshot, whose stale `version` the backend rejects with a 409 - then compare versions: an untouched row's unchanged `version` proves the save left it alone, a re-read restored one that the revert is complete.
- **Backend reads stay few and single.** A request you send yourself, from the page's JavaScript or a script, is one of a handful of single-record reads (`?ids=<one id>`) or small paged reads (a sort flip with a `limit`): never a scan or bisection over an id range, never a loop over records, and at most one unpaged list read per session, kept and reused. The shared backend rate-limits per user and locks the account after a burst, and a scan reads exactly like that burst - a backend bug is reported with the two or three ids that show it, not mapped out.
- **Never open `/stockroom/movements/archive`.** It loads every stock movement of every warehouse on mount - the bulk read the line above forbids.
- **Never attempt credentials.** The browser attaches to the user's own Chrome, so their login carries over; the login page is the owner's to clear, as above.
- **Keep it targeted.** `read_console_messages` with a pattern, `read_network_requests`, or one element beats a full-page snapshot of a `DataTable`, which is large enough to matter.
- **Both readers start recording at their own first call, and answer "none found" for everything before it.** That empty answer is indistinguishable from a clean console and an idle network, which is the one way this check silently passes on nothing. So call each once right after the `/__tree` navigation in step 3 - a fresh `chrome://` tab refuses both - **before** navigating to the surface, and treat any "none found" that follows a navigation as a tooling artefact to be re-taken, never as evidence. **An empty answer counts only beside a positive control** - the same reader on the same page answering a pattern the page is known to produce (`\[vite\] connected` for the console) - so "no errors" is a reading, not a silent reader.
- **`read_network_requests` is no evidence about modules**: on a full page load it listed none of the dev server's module scripts. Whether a module loaded is asked of the page: `performance.getEntriesByType('resource')` filtered by its path, after a full navigation so the list holds that page's load alone.

## 1. Which tree am I

```bash
git rev-parse --show-toplevel && git branch --show-current && hostname
```

The tree is the one the session's cwd resolves to. A worktree is its own tree with its own server.

## 2. Which port serves it - by fact

```bash
node .claude/scripts/dev-servers.mjs
```

It lists every listener on `5173`-`5179` with the tree and branch it runs from, marks the row that is this tree and prints the URL. **Use only the row marked THIS TREE.** No such row: nothing serves this tree - stop, and the turn goes on as lifecycle step 6 (the `lifecycle` skill) says. A listener the script cannot attribute is somebody else's process, not a candidate.

Then prove the marker from the shell, before touching the browser:

```bash
curl -s -m 5 http://localhost:<port>/stockroom/__tree
```

It answers `{"host","tree","branch","port"}` from the vite process itself. `host` must equal this machine's `hostname` and `tree` this tree's root; anything else, or no answer, means the server is not what step 2 said - stop and report. A server started before the marker plugin landed answers with the SPA's `index.html` instead - ask the user to restart it.

## 3. Which Chrome - proved, not assumed

1. `tabs_context_mcp` first; create a tab rather than reusing one from another session.
2. `navigate` to `http://localhost:<port>/stockroom/__tree`, read the page text, then call `read_console_messages` and `read_network_requests` once each.
   - The same JSON as in step 2: this Chrome is on this machine and sees this server.
   - An error page (`Frame with ID 0 is showing error page`) or JSON with a **different `host`**: the paired Chrome is another machine's. Call `switch_browser` once, telling the owner to click Connect in the Chrome **on this machine**, then repeat from 3.1 in the browser that connected. If it offers no browser or the owner does not connect, stop and ask them to step in, as the prohibitions say.
3. State the triple in the reply before any other browser action: `Verifying on port <N>, host <hostname>, tree <root> (<branch>)`.

Only now `navigate` to `http://localhost:<port>/stockroom/`.

## 4. The read-first pass

On every surface the diff reaches - a shared component means every call site that differs, pick the two or three that differ most and name the ones skipped:

- **A widget reading "No data" or "Failed to load" at the page's default date range is not evidence of anything** - the backend's sample stock movements do not necessarily fall inside it, and hand-picking a range to search for it wastes calls. Click the dev-only **Widen range** button first (`FiltersBar`, `import.meta.env.DEV` only, right end of the filter bar) - it sets the shared filter range to five years back through the end of next year, wide enough to catch whatever the backend holds. Only a widget still empty after that is worth investigating.
- Navigate to the surface; accessibility snapshot of the changed element, not the whole page; screenshot.
- `read_console_messages` with a pattern for the surface - the known noise is the chart library's `container has zero width` warning when `DashboardPage` mounts in a background tab, harmless and pre-existing.
- `read_network_requests`: does the request leave with the right params (`GET /inventory/stock-levels` with the `warehouseIds` and the range the filter bar shows), does the response carry the shape and scale the UI assumes (`fillRate` 0-1 and `stockoutRatePct` 0-100 on `GET /inventory/kpis`).
- Loading / error / empty through the dev state switcher's `loading` / `error` / `empty` toggles on `WidgetFrame` where the change has those branches; both locales where strings or formatting moved; font size L where widths are fixed; open and close every `AppDialog` / `SidePanel` the change touches and check focus lands back on the trigger with a clean console.
- **The driven tab is usually hidden** - `document.visibilityState === 'hidden'` while Chrome sits behind the terminal, even with `document.hasFocus()` true. `requestAnimationFrame` then stops after one tick, the stock-level charts do not paint, and TanStack Query pauses a retry (`fetchStatus: 'paused'` after a 500, so a `DataTable` reads "No rows" instead of its error state - read the query state before calling it a bug). Time a transition with a `MutationObserver` on `document.body` (`childList`, `subtree`, the `style` / `class` / `inert` attributes), which React commits fire regardless; a canvas-only or animation question goes to the user.

**A change only a production build can show** - chunking, what is lazy or static, bundle size - is not verified here: the dev server serves modules unbundled. Its evidence is the project's bundle measurement script (a diff of two production builds), and the browser pass shrinks to what can still differ: each surface whose imports moved still renders with a clean console, and a page that should no longer load a module does not request it (the `performance` reading above). Say in the report which half came from which.

## 5. Report

What was checked on which surfaces, and what was observed; the unverified items per lifecycle step 8. Never claim an observation not made in this session.
