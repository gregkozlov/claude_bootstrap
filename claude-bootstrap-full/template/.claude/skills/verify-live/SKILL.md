---
name: verify-live
description: The browser check for a finished change against the right server and browser - lifecycle step 7, and on "/verify-live", "check it live", "look at it in the app", "check it in the browser". Never starts a server.
---

# verify-live

The port and the browser are settled by facts, never by convention or by what a page looks like.

## The prohibitions - they hold through every step below

- **Attach, never start or stop a server** - they are the owner's.
- **Only the browser on this machine, ever.** The owner's other machines signed in to the same Claude account show up as connectable browsers - never select or switch to one, even when it is the only one offered. A page alone never tells which machine it shows: another machine's browser answers `localhost` with an error page, or with that machine's own server looking right. The marker endpoint settles it - never retry the URL, never pick from `list_connected_browsers`.
- **When the browser cannot reach the app, stop and ask the owner to step in, at once.** No browser on this machine connected, an error page or another `host` at the marker endpoint that step 3's one `switch_browser` prompt did not clear, a browser tool that fails, the login page: name what you saw and what they should do (open the browser here, connect the extension, log in). Do not work around it; the check stays pending until they have.
- **Writes need explicit approval, every time.** A dev server that talks to a real backend makes a Save or a Delete a real mutation. Reading a page is free; clicking "Create" is not.
- **Never attempt credentials.** The browser attaches to the user's own session, so their login carries over; a login page is the owner's to clear, as above.
- **Keep it targeted.** `read_console_messages` with a pattern, `read_network_requests`, or one element beats a full-page snapshot.
- **Both readers start recording at their own first call, and answer "none found" for everything before it.** That empty answer is indistinguishable from a clean console and an idle network, which is the one way this check silently passes on nothing. So call each once right after the marker navigation in step 3 - a fresh tab still on the browser's internal new-tab page refuses both - **before** navigating to the surface, and treat any "none found" that follows a navigation as a tooling artefact to be re-taken, never as evidence. **An empty answer counts only beside a positive control** - the same reader on the same page answering a pattern the page is known to produce ([fill] a line the dev server always logs, such as its HMR client's "connected" message) - so "no errors" is a reading, not a silent reader.
- **`read_network_requests` is no evidence about modules**: on a full page load it can list none of the dev server's module scripts. Whether a module loaded is asked of the page: `performance.getEntriesByType('resource')` filtered by its path, after a full navigation so the list holds that page's load alone.
- [fill] Any origin rule the project has - a base path, a host that is refused, an origin whose storage does not carry the login.

## 1. Which tree am I

```bash
git rev-parse --show-toplevel && git branch --show-current && hostname
```

The tree is the one the session's cwd resolves to. A worktree is its own tree with its own server.

## 2. Which port serves it - by fact

```bash
node .claude/scripts/dev-servers.mjs
```

It lists every listener in the project's port range with the tree and branch it runs from, marks the row that is this tree and prints the URL. **Use only the row marked THIS TREE.** No such row: nothing serves this tree - stop, and the turn goes on as lifecycle step 7 (the `lifecycle` skill) says. A listener the script cannot attribute is somebody else's process, not a candidate.

Then prove the marker from the shell, before touching the browser:

```bash
curl -s -m 5 http://localhost:<port><DEV_BASE_PATH>__tree
```

It answers `{"host","tree","branch","port"}` from the dev server process itself (the marker endpoint the README asked the project to add - `examples/tree-marker-plugin.ts` is the Vite version). `host` must equal this machine's `hostname` and `tree` this tree's root; anything else, or no answer, means the server is not what step 2 said - stop and report. A server started before the marker landed answers with the app's `index.html` instead - ask the user to restart it.

## 3. Which browser - proved, not assumed

1. `tabs_context_mcp` first; create a tab rather than reusing one from another session.
2. `navigate` to `http://localhost:<port><DEV_BASE_PATH>__tree`, read the page text, then call `read_console_messages` and `read_network_requests` once each.
   - The same JSON as in step 2: this browser is on this machine and sees this server.
   - An error page (`Frame with ID 0 is showing error page`) or JSON with a **different `host`**: the paired browser is another machine's. Call `switch_browser` once, telling the owner to click Connect in the browser **on this machine**, then repeat from 3.1 in the browser that connected. If it offers no browser or the owner does not connect, stop and ask them to step in, as the prohibitions say.
3. State the triple in the reply before any other browser action: `Verifying on port <N>, host <hostname>, tree <root> (<branch>)`.

Only now `navigate` to `http://localhost:<port><DEV_BASE_PATH>`.

## 4. The read-first pass

On every surface the diff reaches - a shared component means every call site that differs, pick the two or three that differ most and name the ones skipped:

- Navigate to the surface; accessibility snapshot of the changed element, not the whole page; screenshot.
- `read_console_messages` with a pattern for the surface. [fill] Name the known console noise here so it is not reported as new.
- `read_network_requests`: does the request leave with the right params, does the response carry the shape and scale the UI assumes.
- Loading / error / empty branches where the change has them ([fill] the project's forced-state switch, if it has one); every locale where strings or formatting moved; the largest font size where widths are fixed; open and close every overlay the change touches and check focus lands back on the trigger with a clean console.

**A change only a production build can show** - chunking, what is lazy or static, bundle size - is not verified here: a dev server that serves modules unbundled cannot show it. Its evidence is a comparison of two production builds ([fill] the project's measurement script, if it has one - `examples/bundle-report.mjs` is the Vite version), and the browser pass shrinks to what can still differ: each surface whose imports moved still renders with a clean console, and a page that should no longer load a module does not request it (the `performance` reading above). Say in the report which half came from which.

## 5. Report

What was checked on which surfaces, and what was observed; the unverified items per lifecycle step 9. Never claim an observation not made in this session.
