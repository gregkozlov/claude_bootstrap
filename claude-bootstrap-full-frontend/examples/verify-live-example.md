---
name: verify-live
description: Load it before any look at the running app in the browser - the lifecycle step 6 check, a bug reproduction, a live probe - and on "/verify-live", "check it in the browser", "look at it in the app", "check it live".
---

> Example from an inventory analytics frontend served by Vite under the base path `/stockroom/`. Not part of the template - copy it by hand if it fits; the template ships the generic ritual. Depends on: the Claude in Chrome extension, `.claude/scripts/dev-servers.mjs`, the `/__tree` marker from `tree-marker-plugin.ts`, and a bundle measurement script of the project's own. Shows the ritual with the real endpoints, the dev-only tooling and the known console noise filled in.

# verify-live

The port and the Chrome are settled by facts, never by convention or by what a page looks like.

**With `Browser check: off` in `CLAUDE.md`, open no browser.** Report "unverified - browser check off" with the surfaces a look would have covered, and hand back to the caller (lifecycle step 6, `debug` phase 1).

## The prohibitions - they hold through every step below

- **The dev server is the owner's.** Connect to the one running; do not launch or kill one. Use `localhost` in every probe: Vite here listens on IPv6 only, so a failed `127.0.0.1` request proves nothing about the app.
- **One origin: `http://localhost:<port>/stockroom/`.** `[::1]` is another origin with its own `localStorage`, so the app opens without the stored token and lands on `/login` - not a session bug.
- **This machine's Chrome and no other.** The dev server may run on another host, and `list_connected_browsers` may offer a browser that is not on this machine; never pick it, even as the only entry. A page alone never tells which host it shows, so the `/__tree` marker decides, not the page.
- **Blocked means ask.** No local Chrome, an error page, a foreign `host` at `/__tree` after the single `switch_browser` of step 3, a failing browser tool or the login screen: tell the owner what you saw and what to do (open Chrome here, connect the extension, sign in), then wait. The check stays pending.
- **Every write is asked for first.** Stockroom's dev server talks to a shared backend, so a saved order or a deleted SKU is real for everyone who uses it. Before an approved write, record the row's fields and `version`. To undo it, re-read the row and send the old field values with the current `version` - the old snapshot fails with 409 - then re-read and compare `version` to confirm.
- **Reads you send yourself stay small.** A few single-row reads (`?ids=<one id>`) or short paged reads (a `limit`), at most one unpaged list per session: no id-range scans, no loops. A shared backend reads a scan as abuse; report a backend bug with two or three ids.
- **Stay off `/stockroom/movements/archive`.** It fetches every movement of every warehouse when it mounts.
- **No logins.** Chrome already carries the user's session; a login screen goes back to the owner.
- **Targeted reads.** A console pattern, the network list or one element - not a full snapshot of a `DataTable`.
- **Arm the network reader first.** `read_network_requests` records only from its first call and reports "none found" for anything earlier, which looks exactly like an idle page. Call it once on the `/__tree` page in step 3 (a fresh `chrome://` tab rejects it), before opening the surface; a "none found" right after a navigation is re-taken. `read_console_messages` needs no arming - its first call returns everything since the page loaded - but an empty console counts only next to a positive control on the same page (`\[vite\] connected`).
- **Module loading is read from the page**, not from `read_network_requests`, which listed no module scripts on a full load: use `performance.getEntriesByType('resource')` filtered by the path, after a full navigation.

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
2. `navigate` to `http://localhost:<port>/stockroom/__tree`, read the page text, then call `read_network_requests` once to start its recording.
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
