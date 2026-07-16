# LPC asset authoring guide

## Catalog structure

The tracked authoring sources are separate from generated runtime metadata:

```text
spritesheets/<category>/<asset>/<animation>[/<variant>].png  # raster sources
sheet_definitions/<category>/*.json                          # catalog metadata
palette_definitions/                                        # named recolor palettes
scripts/zPositioning/z_positions.csv                        # generated layer overview
CREDITS.csv                                                  # generated attribution index
dist/*-metadata.js                                           # Vite output; never commit
```

A definition becomes a catalog item. `type_name` is its selection slot;
`layer_1`, `layer_2`, … provide body-specific paths and numeric `zPos` values.
Paths are relative to `spritesheets/` and must retain exact case. A path ending
in `/` is resolved using animation and variant conventions. Definitions may
also provide `variants`, `animations`, `required`, `aliases`, recolors, custom
animations, and compatibility rules.

## Add an asset

1. Confirm every source and derivative can be distributed under a supported
   license. Preserve author names, source URLs, licenses, and edit notes.
2. Normalize transparent PNGs to the expected LPC grid. Do not rescale pixel
   art or add partially transparent padding accidentally.
3. Put files in the existing category hierarchy. Compare a neighboring asset
   with the same body types and animation layout.
4. Add the variant to an existing definition or create a definition. Use one
   layer per compositing plane and select an unused, semantically appropriate
   `zPos`; JSON remains the source of truth for ordering.
5. List only animations and body types actually supplied. Omit `animations`
   only when the documented legacy default truly applies.
6. Add `credits` entries. `file` is the asset path without animation suffix or
   `.png`; `authors`, `licenses`, and `urls` are arrays.
7. Add compatibility metadata where equipment conflicts, hides another slot,
   requires another slot, substitutes a variant, or lacks directions.
8. Run generation, checks, and a visual smoke test; commit tracked generated
   CSV changes but not `dist/`.

Minimal definition:

```json
{
  "name": "Traveler cloak",
  "type_name": "clothes",
  "layer_1": { "zPos": 55, "male": "torso/clothes/cloak/" },
  "variants": ["brown"],
  "animations": ["walk", "hurt"],
  "required": ["male"],
  "credits": [
    {
      "file": "torso/clothes/cloak/brown",
      "notes": "Original work",
      "authors": ["Artist name"],
      "licenses": ["CC-BY-SA 4.0"],
      "urls": ["https://example.invalid/source"]
    }
  ]
}
```

## Animation mapping

Standard LPC sheets use four direction rows (north, west, south, east) and the
canonical source-row/frame mapping in `sources/custom-animations.ts`.
`animations` values must match the catalog constants/folder names. For a custom
layout, set `custom_animation` on its layer and add a definition containing a
`frameSize` and four `frames` arrays. Each token is
`<source-animation>-<direction>,<zero-based-frame>`. Repeating a token holds a
frame. See [animation preview system](animation-preview-system.md).

## Compatibility rules

Put rules under `compatibility` rather than inventing path conventions. Values
for `conflicts`, `hides`, and `requires` are selection-slot (`type_name`) names;
`substitutes` maps requested variant keys to catalog item IDs. Direction names
in `completeDirections`/`incompleteDirections` must match application direction
constants. See [the rule reference](asset-compatibility-rules.md).

## Validation

```bash
npm run validate-site-sources
npm run test:node
npm run lint
npm run type-check
npm run build
npm run dev
```

In the browser, inspect every body type, direction, animation, recolor, and
layer overlap. Check the network panel for 404s, the console for warnings, the
exported credits, and both desktop and 360 px-wide layouts.
