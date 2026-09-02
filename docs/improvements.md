# Aisles improvements

This change keeps the Firebase project selection and existing list links. It does not migrate, commit, push, or deploy shared data.

## User-facing changes

- Select an item name to edit its name, quantity, note, or aisle. Use the circle to check it off.
- Start shopping hides sharing controls, the importer, and checked rows, and enlarges check controls. The preference is saved on the device.
- Remove, clear checked, and clear all offer Undo. The device keeps its most recent 20 removal actions across reloads. Undo does not apply to permanently deleting an entire shared list.
- Shared lists use the phone's native share sheet where supported, with clipboard and selectable-link fallbacks. Cancelling the share sheet does nothing further.
- Settings are edited as a draft and saved together with Save changes. Remote changes do not replace a focused field. Detected conflicts require reloading the current settings.
- Writes show pending/saved/failed status. Failed actions can be retried against their original list. Failed additions also recover the entered name; retry/resubmit reuse the attempted item's ID.

## Offline behavior

Firestore uses its persistent multi-tab cache and write queue. Previously loaded data can be read and edited offline. The service worker caches the app and pinned Firebase SDK modules, so the app can reopen without its hosting server after a successful first online load and cache installation. First-ever offline visits cannot work. Fonts can fall back to system fonts offline. Browser storage restrictions or eviction can prevent persistence.

An app update waits until the user requests it and the current tab has no pending or failed writes. Other tabs do not automatically reload while they have unresolved writes. `sw.js`'s cache version must change whenever app-shell files change. Firestore traffic and recipe pages are never cached by the service worker.

## Code layout

- `src/app.js`: navigation, screen state, settings, item actions, undo, and startup.
- `src/ui.js`: safe DOM creation, keyed list rows, modal focus handling, and sticky layout.
- `src/domain.js` / `src/catalog.js`: pure categorization, validation, grouping, and defaults.
- `src/store.js`: explicit-list Firestore operations and subscription lifecycle.
- `src/writes.js`: pending writes and recoverable retries.
- `src/recipes.js` / `src/recipe-parser.js`: bounded/cancellable imports and ingredient review.
- `src/sharing.js`: native share and fallback decision flow.
- `src/storage.js`: guarded browser preference/draft storage.
- `styles.css`: original visual design plus responsive feature styles.

Shared values are assigned with `textContent`, `.value`, or `setAttribute`, never interpolated into HTML. Settings have no delayed save timers. New lists create one set of listeners. Item grouping takes one pass; existing row nodes are reused and row actions use one delegated event handler.

## Data compatibility and deployment checks

Existing six-character list IDs, item documents, and category memory are still read. New lists use random UUID-based IDs. New category-memory records use hashed IDs and a normalized `name` field; named records take precedence over legacy IDs.

Optional item fields are `quantity` and `notes`. Undo adds a `removals` map whose keys are unique removal-operation tokens. Removing an item marks that token; undo deletes only that token, leaving any other shopper's removal and newer item fields intact. Items with an active marker are hidden. These archived documents are retained, so reads/storage grow with shopping history; a future server-side retention policy should purge older archives according to the desired recovery window. Permanent list deletion also attempts to clean up archived items.

**Older clients do not understand removal markers. All shoppers should reload after this release.** No database-wide migration is run. The local 20-action undo history is device-specific; clearing browser storage removes those undo controls.

Deployed Firestore rules and indexes are not in this repository. Before publishing, verify in UAT that the rules permit the new optional item fields, per-token removal updates, hashed category memory, and persistent-client operations, while still enforcing intended list access and validation. Also verify that tombstoned lists reject new writes and that cleanup is allowed. Do not use broad allow-all rules as a shortcut. Authentication/ownership changes require a separate access-model decision; this change does not invent an account model or modify live security rules.

## Verification

Run `npm test` for focused domain, write recovery, sharing, data-adapter, and service-worker tests. Run `npm run check` for syntax checks.

Run `npm run dev` to open the **isolated fixture** at `http://127.0.0.1:5081`. It serves the real UI with a local store double and synthetic lists; it never connects to Firebase. Its test controls can simulate a failed save, offline queueing, reconnection, and a remote note. This command is deliberately safe for UI testing and is not the production Firebase backend. Test files and this document are excluded from Firebase Hosting.

Browser checks cover editing and literal HTML-like text, remove/undo, shopping visibility, failed-write retry after switching lists, category editing, recipe import with duplicate exclusion, offline/pending status, and mobile sticky layout. Store unit tests exercise batching and stale listener guards with mocked SDK primitives. These do not replace a final test against deployed UAT rules or an actual iPhone share sheet.
