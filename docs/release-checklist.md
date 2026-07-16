# Release checklist

## Before the release

- [ ] Define scope, version/tag, migration impact, and rollback owner.
- [ ] Review `CHANGELOG.md`; call out preset, URL, catalog, and export changes.
- [ ] Verify every new asset's license, authors, URLs, body types, animations,
      paths, aliases, z-order, recolors, and compatibility rules.
- [ ] Run `npm ci` from the committed lockfile.
- [ ] Run `npm run validate-site-sources`; review and commit intended CSV changes.
- [ ] Run `npm run format:check`, `npm run lint`, and `npm run type-check`.
- [ ] Run `npm test` and `npm run test:visual` (review Argos diffs where enabled).
- [ ] Run `npm run build`, then smoke-test the built app with `npm run preview`.

## Manual release matrix

- [ ] Chrome/Edge, Firefox, and Safari current release; Android Chrome and iOS
      Safari at desktop, tablet, 360 px portrait, and landscape widths.
- [ ] Keyboard-only creation/export; focus remains visible and dialogs trap and
      restore focus. Run a browser accessibility audit and inspect announcements.
- [ ] 200% zoom, high contrast, reduced motion, low effects, and compact display.
- [ ] No console errors/warnings, network 404s, mixed content, or broken images.
- [ ] Search, filters, randomize/locks, body changes, recolors, compatibility
      prompts, share URL, v1 import, v2 round trip, and custom upload.
- [ ] Every export mode opens successfully and includes accurate JSON/credits.
- [ ] Test CPU recoloring and offline/slow-network behavior after initial load.

## Publish and verify

- [ ] Deploy immutable build output from the reviewed commit; do not hand-edit it.
- [ ] Verify base-path routing, cache headers, spritesheets, metadata, CSP, icons,
      and download behavior on the production origin.
- [ ] Create the signed/tagged release and publish release notes with known limits.
- [ ] Run production smoke tests and monitor errors/performance.
- [ ] Record rollback instructions and archive representative preset/export files.
