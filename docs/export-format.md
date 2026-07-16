# Export formats and pipeline

## User-visible outputs

- **PNG spritesheet:** the fully composited LPC sheet with transparency.
- **JSON preset:** versioned selections, preferences, resolved layer manifest,
  share URL, and credits.
- **Credits CSV/TXT:** attribution for selected assets.
- **ZIP by animation:** animation slices grouped by animation.
- **ZIP by item / animation and item:** source layers organized for engines or
  editing workflows.
- **Individual frames ZIP:** direction/frame PNGs extracted from standard and
  custom animations.

ZIP archives include `character.json` and credits alongside PNG content. Names
are sanitized for downloads; downstream tools should use manifest metadata
rather than infer identity solely from display filenames.

## Pipeline

1. Validate selections against body, animation, conflict, requirement, variant,
   and directional rules.
2. Resolve the generated catalog to ordered draw calls.
3. Load each catalog/custom source, apply masks and palette recolors, and
   composite by `zPos` on transparent canvases.
4. Slice standard/custom animation regions where requested; empty regions are
   skipped rather than exported as misleading blank files.
5. Encode canvases as PNG blobs, build `character.json` and credits, then stream
   entries into JSZip.
6. Generate the ZIP blob and trigger the browser download. During large exports
   redraw/preview work is suspended and timing metadata is recorded.

Catalog `spritePath` values in the manifest are relative to the asset root. PNG
frame dimensions follow the associated animation's `frameSize`; directions use
LPC order north, west, south, east. Custom uploaded images are rendered into
pixels but cannot be reconstructed from `character.json` alone.

## Integration and validation

Engines should retain the JSON and credits with the PNGs, read direction/frame
mapping rather than assume every animation has equal length, and preserve alpha
without filtering pixel art. Validate an export by opening the ZIP, decoding all
PNGs, comparing expected/non-empty frame counts, importing `character.json`,
and checking attribution. Export profiling commands are documented in
`PERFORMANCE_PROFILING.md`.
