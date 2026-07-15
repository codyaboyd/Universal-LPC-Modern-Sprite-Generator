# Modernization Audit

## Executive summary

The safest modernization path is incremental. Keep Mithril, the catalog pipeline, and the existing renderer/export services stable while introducing Bootstrap 5 in an isolated compatibility layer. The current app is already modular enough to document service boundaries, but global mutable state and direct UI-to-render/export calls make a large UI rewrite risky.

## Safest path for adding Bootstrap 5

1. **Do not remove Bulma initially.** Add Bootstrap 5 as an opt-in layer and migrate one area at a time.
2. **Import Bootstrap with a namespace/prefix strategy where possible.** Prefer Sass variable configuration and wrapper classes over global overrides. Avoid using Bootstrap reboot globally until typography/layout diffs are understood.
3. **Create a style-compatibility checklist.** Use existing computed-style dump/diff scripts before and after adding Bootstrap to detect reset and spacing changes.
4. **Start with non-critical components.** Migrate buttons/forms inside a small section after baseline visual tests pass, not the preview canvas or tree first.
5. **Protect Bulma class assumptions.** Current components emit Bulma classes like `button`, `columns`, `field`, `select`, and `box`; Bootstrap classes with similar semantics should be introduced explicitly rather than via search-and-replace.
6. **Keep rendering and export untouched.** Bootstrap should first affect markup and CSS only.
7. **Add regression tests before visual migration.** Cover default load, hash hydration, selection behavior, preview render, export enable/disable state, and mobile layout snapshots.

## Retain, refactor, or replace

### Retain

- Mithril as the initial UI framework.
- Vite and existing metadata generation plugins.
- `CatalogReader` readiness/result API.
- Offscreen full-sheet renderer and current PNG/ZIP export algorithms.
- WebGL/CPU/fallback palette recoloring pipeline.
- Existing URL hash compatibility.
- Existing issue fixtures and zip profile scripts.

### Refactor

- Global `state` into domain-specific stores/services.
- UI components that directly call rendering/export services.
- Selection/group logic into a character-domain module.
- Layer/path compatibility into a catalog/rules service.
- Search/filter state and derivation into a query service.
- Animation preview lifecycle into a rendering adapter that can be controlled independently of UI components.
- Collapsible/tree controls for keyboard and ARIA behavior.

### Replace eventually

- Bulma-specific layout classes after Bootstrap migration is proven.
- Inline header styles with design-system utilities/classes.
- Browser `alert` feedback with accessible toast/status components.
- Clipboard-only saved-character UX with a persistence service that can support local saved characters.

## Global state that should be centralized or split by domain

Current global state is centralized physically but not conceptually. It should be split into:

- **Character store:** body type, selected items, variants, recolors, custom uploaded layer reference.
- **Creator UI store:** expanded nodes, search query, compact mode, filter selections, panel open/closed state.
- **Preview store:** selected animation, zoom levels, transparency/mask display options, rendering status.
- **Export store:** running export mode, export errors/progress, last export metadata.
- **Persistence store/service:** URL hash, JSON import/export, future local saved characters.

## UI logic currently coupled to sprite-generation logic

- `App.onupdate` observes global selections and immediately syncs hash and calls `renderCharacter`.
- `state.ts` default/reset operations call hash sync, render, and redraw.
- `Download` owns button UI but directly invokes PNG, JSON, credit, and ZIP services.
- `AnimationPreview` directly starts/stops animation canvas loops and mutates global preview state.
- Tree/selection components mutate global selections and trigger body-color propagation rather than dispatching domain actions.
- ZIP export imports app state dynamically and mutates UI flags while doing export work.

## Mobile usability problems

- Body-level `overflow-y: hidden` plus independent column scrolling can make mobile navigation feel trapped.
- Sticky header height reduces the already limited viewport and may obscure scroll targets.
- Download buttons, filters, and current selections wrap densely with small targets.
- Tree indentation reduces horizontal room and nested rows may be hard to tap.
- Canvas previews require panning/zooming, but nested scroll plus pinch gestures can conflict.
- Long credits and variant grids have their own scroll areas, creating multiple nested scroll regions.
- Range controls and frame-cycle labels in horizontal field layouts need better stacking and touch sizing.

## Animation/performance risk areas

- Avoid animating layout-affecting properties for tree expansion, filter panels, variant grids, or sticky header changes.
- Avoid CSS transitions on hundreds of tree/variant rows beyond simple color/opacity.
- Do not animate canvas dimensions or force repeated canvas reinitialization during selection changes.
- Keep preview animation loop paused/suspended during ZIP export and hidden-tab scenarios.
- Bootstrap collapse animations should be disabled or limited for large tree/filter sections unless measured.

## Functionality that must be protected with regression tests

- Initial metadata loading and default body/head/expression selection.
- URL hash parse, alias resolution, sync, and backwards-compatible hashes.
- Selection grouping by `type_name`, sub-selection grouping for recolors, and body-color matching.
- License and animation filtering.
- Search query filtering and expanded tree interactions.
- Layer `zPos` sorting and custom-animation layer ordering.
- Sprite path resolution, including variants, recolors, body types, and template replacements.
- Full-sheet canvas render after selection/body/custom image changes.
- Animation preview frame cycle, zoom, pinch lifecycle, and custom animations.
- PNG export of the composed sheet.
- JSON clipboard import/export shape.
- ZIP export modes and issue 382 fixture outputs.
- Credits TXT/CSV and metadata output.
- Bootstrap/Bulma coexistence visual baselines for desktop and mobile.
