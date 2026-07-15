# Current Architecture Audit

## Project structure

- **Application entry:** `index.html` provides three Mithril mount roots: filters/download, animation preview, and full spritesheet preview. `sources/main.ts` imports critical styles, starts metadata loading, exposes legacy globals, mounts the roots, waits for index/lite catalog readiness, initializes the offscreen renderer, hydrates URL hash state, and selects defaults.
- **Frontend source:** `sources/components/**` contains Mithril components, `sources/state/**` contains global state, catalog, hash, palette, zip, and metadata helpers, and `sources/canvas/**` contains sprite composition, preview canvas, recoloring, and downloads.
- **Generated/catalog data:** `sheet_definitions/**`, `palettes/**`, and Vite metadata plugins build split catalog chunks consumed by `sources/install-item-metadata.ts` and `sources/state/catalog.ts`.
- **Styling:** `styles/**` and `sources/styles/**` split critical and deferred SCSS/CSS around Bulma.
- **Tests/tooling:** `tests/node/**`, `tests/fixtures/**`, browser/Testem tests, Playwright visual tests, zip profiling scripts, and computed-style diff scripts support regression coverage.

## Frontend framework

The app uses **Mithril 2**. Components are mostly object-style Mithril components with `view`, `oninit`, `oncreate`, `onupdate`, and `onremove` hooks. There is no React/Vue-style component build pipeline.

## Build system

- **Vite** is the build/dev server.
- Custom Vite plugins generate item metadata chunks, sprite-sheet serving behavior, CSS load ordering, modulepreload metadata, critical CSS purging, and sprite asset wiring.
- TypeScript is compiled by Vite and checked separately with `tsgo --noEmit`.
- Sass is present for Bulma-critical/deferred entries.

## Current styling approach

- Bulma 1.0.4 is the primary CSS framework.
- `styles/main.css` imports Bulma overrides and defines page layout, sticky header, split columns, tree UI, canvas pixel rendering, variant cards, and collapsible sections.
- `sources/styles/critical-entry.scss` and `sources/styles/deferred-entry.scss` are intended to split critical/deferred CSS, but `sources/main.ts` documents that the deferred dynamic import is optimized to an empty module in production, so classes currently survive only because PurgeCSS keeps runtime classes in critical CSS.
- Several inline styles remain in `index.html`, notably the header gap and GitHub icon dimensions.

## Existing sprite layer data structures

- `CatalogReader` exposes lite item metadata, merged item metadata, credits, palette metadata, category tree, aliases, layer data, and readiness state.
- `ItemLite` contains `name`, `type_name`, `required` body types, `animations`, `recolors`, `matchBodyColor`, `variants`, and `path`.
- `ItemMerged` adds `layers` and `credits`.
- `LayerEntry` is an open record with `zPos`, optional `custom_animation`, and dynamic body-type path keys.
- Runtime rendering converts selections into `DrawCall[]` with item id, variant, recolors, z-position, layer number, animation, y-offset, recolor flag, and a catalog/custom image source.

## Character state management

- `sources/state/state.ts` exports a single mutable `state` object.
- State combines persisted character data (`selections`, `bodyType`), UI preferences (`expandedNodes`, `searchQuery`, filters, zooms, compact mode), rendering flags, custom upload state, license/animation filters, and ZIP export progress flags.
- Selection mutations are coupled to catalog lookups, hash syncing, default selection setup, body-color propagation, rendering, and Mithril redraws.
- Some components also keep local copies of global fields, such as animation selection and zoom level in `AnimationPreview`.

## Layer ordering logic

- Metadata-level helpers sort item layers by `zPos` in `sources/state/meta.ts`.
- Renderer-level draw calls are collected per selected item/layer/animation and globally sorted by `zPos` before images are loaded and composited.
- Custom animation areas maintain their own z-ordered `customAreaItems` lists.
- ZIP export uses both the global rendered sheet and metadata layer helpers, so layer-order regressions can affect preview and export differently.

## Canvas and sprite preview rendering

- `sources/canvas/renderer.ts` owns the offscreen full-sheet canvas and composes the full universal spritesheet.
- `renderCharacter` waits for layer metadata and serializes render calls to avoid overlapping expensive renders.
- `runRenderCharacter` builds draw calls, resolves sprite paths, loads all draw-call images in parallel, recolors images through WebGL/CPU/fallback paths, draws the sheet, builds custom animation areas, and updates preview-animation metadata.
- `AnimationPreview` mounts a visible preview canvas, initializes pinch-to-zoom, starts/stops the animation loop, and writes zoom and selected animation back into global state.
- `FullSpritesheetPreview` shows the complete generated sheet from the offscreen canvas.

## Sprite sheet export workflow

- PNG export downloads the current offscreen canvas through `canvas/download.ts`.
- JSON export/import serializes state and current layers through `state/json.ts` and the Clipboard API.
- ZIP exports in `state/zip.ts` support split by animation, item, animation+item, and individual frames. They use JSZip, slice/extract canvases, add JSON/credits/metadata, suspend UI redraw/preview work during export, and report profiling metadata.

## Asset loading

- Metadata is dynamically imported in chunks and registered in the catalog.
- Sprite image URLs are resolved from layer metadata, variants, body type, animation name, and path template replacement.
- `loadImage`/`loadImagesInParallel` decode sprite images. Recoloring caches and accelerates palette swaps when possible.
- Custom uploaded images are held as decoded `HTMLImageElement` instances in global state and bypass URL loading.

## Local storage or saved-character support

- URL hash is the primary persisted character format for selections/body type.
- Clipboard JSON import/export exists for saved-character transfer.
- No localStorage-backed saved-character library was found in the inspected source. Saved-character persistence should be added as a new persistence service rather than mixed into the existing global `state` object.

## Responsive behavior

- The page uses Bulma columns with `is-desktop`, so chooser and preview stack below desktop widths.
- The body uses a fixed dynamic viewport height and hides body overflow; inner columns scroll independently.
- The preview canvases have scrollable containers and pinch-to-zoom support.
- Mobile risks: sticky header consumes vertical space, nested scroll areas can trap touch scrolling, many button rows and filter lists become dense, and tree rows/variant cards may have small touch targets.

## Accessibility

- Positive: semantic buttons and native select/range controls are used in many places, and the GitHub image has alt text.
- Risks: collapsible headers are click targets that need verified keyboard activation and ARIA expanded state; canvas previews need text alternatives/status; progress/loading states need accessible names/live regions; repeated small icon/tree controls may not have adequate focus indicators; alert dialogs are used for export/import feedback.

## Performance bottlenecks

- `App.onupdate` compares `JSON.stringify(state.selections)` every update and can trigger hash sync and full render.
- Full renders build a draw call for every selected item/layer/animation, load many images in parallel, recolor them, and draw a full sheet.
- Canvas rendering and UI state are coupled, causing redraw pressure around expensive operations.
- Variant preview canvases and large expanded trees can increase DOM/canvas work.
- CSS transitions on many variant cards/tree nodes should remain minimal; broad animations or animated layout changes would be risky.
- ZIP export is heavy enough to have dedicated profiling and UI suspension.

## Existing tests and documentation

- Node tests cover catalog, hash, state, metadata/build scripts, zip helpers/export paths, path resolution, and fixtures such as issue 382.
- Browser/Testem tests cover Mithril/browser behavior.
- Playwright/Argos visual tests and computed-style dump/diff scripts are available for visual/CSS regressions.
- README files document usage, credits/tooling, palettes, cutouts, and translated docs, but architecture docs were missing before this audit.
