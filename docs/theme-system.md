# Theme system

## Layers of theming

The application combines Bootstrap/Bulma component foundations with project
styles in `sources/styles/`. `rpg-foundation.scss` owns RPG surfaces, focus and
motion treatments, responsive layout, and ambient scenes. Keep visual tokens in
CSS custom properties and component structure in Mithril; do not encode theme
choices in renderer or catalog state.

Ambient atmosphere is controlled by `data-ambient-theme` on `<html>`. The
shipped values are `arcane-workshop`, `forest-camp`, and `royal-armory`.
`sources/ambient-atmosphere.ts` applies the attribute and persists the choice at
`ulpc:ambient-theme` in local storage. Add a theme by:

1. extending the typed theme list and human label map;
2. adding a `:root[data-ambient-theme="…"]` token block;
3. checking text, focus, disabled, error, and selection contrast;
4. testing narrow/wide viewports and reduced motion;
5. documenting any new storage behavior here.

## Performance modes

Normal mode enables ambient layers and transitions. **Low effects** suspends
expensive atmosphere work and is recommended for low-power/mobile devices.
Page visibility and `prefers-reduced-motion: reduce` also suspend animation.
**Compact display** reduces catalog thumbnails independently. Palette recolor
uses WebGL when available and transparently falls back to CPU Canvas; developers
can inspect or force it with `getPaletteRecolorConfig()` and
`setPaletteRecolorMode("cpu" | "webgl")`.

A theme must remain useful without WebGL, local storage, background effects, or
animation. Decorative layers need `pointer-events: none`, must not enter the
accessibility tree, and must never alter exported canvases.

## Accessibility requirements

Maintain WCAG AA contrast (4.5:1 normal text, 3:1 large text and meaningful UI
boundaries), a visible `:focus-visible` treatment, logical DOM/tab order,
semantic labels, 44×44 px touch targets where practical, and no information
conveyed only by color or motion. All new animation needs a reduced-motion rule.
