# Proposed RPG Creator Architecture

## Goals

- Preserve current behavior while allowing a Bootstrap 5 UI migration.
- Make sprite generation testable without mounting UI components.
- Keep asset/catalog loading independent from selected character state.
- Support future saved characters, search improvements, and richer mobile layouts.

## Proposed layers and ownership

```text
UI Components
  -> Application actions/controllers
    -> Domain stores and services
      -> Catalog/rules/render/export/persistence adapters
```

UI components should render data and dispatch actions. They should not resolve sprite paths, sort layers, export ZIPs, or mutate renderer globals directly.

## Required separations

### Character data

Owns the canonical character model:

- body type
- selected item ids by selection group
- variants/recolors/sub-selections
- custom uploaded layer metadata
- derived display names

Recommended API:

- `createCharacterStore(initialCharacter)`
- `selectItem(group, selection)`
- `removeSelection(group)`
- `setBodyType(bodyType)`
- `applyBodyColorMatch(sourceSelection)`
- `serializeCharacter()` / `hydrateCharacter()`

### Asset catalogs

Owns metadata readiness and lookups:

- item lite/merged metadata
- category tree
- credits
- palette metadata
- aliases/hash indexes
- layer metadata

Current `CatalogReader` is a good base. Keep result-returning getters and readiness promises, but move legacy free-function usage behind injected catalog services.

### Layer compatibility rules

Owns rules that decide whether an item/layer can render:

- body type compatibility via `required`
- animation support mapping (`combat_idle`, `backslash`, `halfslash`, etc.)
- custom animation fallback rules
- layer path templating and missing-path handling
- z-position sorting and stable tie behavior

This should be a pure service with tests that do not need DOM/canvas.

### Sprite rendering

Owns full-sheet composition:

- build render plan from character + catalog + compatibility rules
- load images
- recolor assets
- composite standard and custom animations
- expose render result metadata (`drawCalls`, custom animation areas, dimensions)

The UI should call `renderService.render(character)` and receive a result, rather than importing renderer globals.

### Animation preview

Owns visible preview playback:

- selected animation
- frame cycle calculation
- requestAnimationFrame lifecycle
- zoom/pinch interaction adapter
- pause/resume on export, visibility, or component unmount

The preview UI should bind controls to preview state and call preview actions.

### Character creator UI

Owns presentation only:

- panels, filters, tree, current selections, Bootstrap layout
- accessible collapsible sections and controls
- mobile-specific navigation pattern
- event dispatch to application actions

It should not know about canvas draw calls or ZIP folder structures.

### Export services

Owns output workflows:

- PNG sheet export
- credits TXT/CSV
- JSON character export/import
- ZIP split modes
- individual frame export
- profiling metadata

Export services should accept explicit inputs: character, render result/canvas, catalog, and options. UI should only display progress and invoke commands.

### Persistence

Owns save/load channels:

- URL hash compatibility
- clipboard JSON
- future localStorage/indexedDB saved characters
- migration/versioning for saved data

Persistence should hydrate character data and UI preferences separately.

### Search and filtering

Owns item query state and derived catalog views:

- search query
- license filters
- animation filters
- body type filters if added
- category expansion results
- highlighted/matched items

This should expose a derived tree/list to the UI, making it easier to swap tree markup for Bootstrap accordions/lists.

## Bootstrap 5 migration architecture

1. Add a `design-system` layer with small wrapper components: `Button`, `Panel`, `FormField`, `Select`, `Range`, `Toolbar`, `Alert`, and `Spinner`.
2. Implement wrappers with Bulma first, then allow Bootstrap implementations behind the same component API.
3. Migrate leaf components to wrappers before changing page layout.
4. Keep canvas and renderer APIs stable while layout changes.
5. Use computed-style and Playwright visual baselines for each migration slice.

## Suggested module map

```text
sources/domain/character/*
sources/domain/catalog/*
sources/domain/layers/*
sources/domain/search/*
sources/services/rendering/*
sources/services/export/*
sources/services/persistence/*
sources/ui/components/*
sources/ui/design-system/*
sources/ui/pages/CreatorPage.ts
```

The existing files can migrate gradually. Do not move everything in one PR.

## Dependency direction rules

- `domain/*` must not import Mithril or DOM/canvas APIs.
- `services/rendering/*` may use canvas APIs but should not import UI components.
- `services/export/*` may use JSZip/canvas helpers but should not mutate UI state directly.
- `ui/*` may import application actions and view models, but not low-level catalog globals.
- Persistence may depend on character serialization, not on UI component state.

## Migration phases

1. **Regression baselines:** add tests/visual baselines for current behavior.
2. **Action boundary:** introduce application actions around selection, reset, preview, and export.
3. **Store split:** carve character/search/preview/export state out of the monolithic state object while preserving old exports.
4. **Rendering service adapter:** return render results instead of relying on renderer globals in UI/export code.
5. **Design-system wrappers:** add Bulma-backed wrappers.
6. **Bootstrap coexistence:** add Bootstrap and migrate one panel at a time.
7. **Mobile layout redesign:** introduce mobile-first creator navigation after behavior is protected.
