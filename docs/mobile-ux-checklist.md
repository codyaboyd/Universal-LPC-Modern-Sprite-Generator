# Mobile UX Checklist

Dedicated checklist for the character generator at 320px, 360px, 390px, 430px, 768px, and 1024px in portrait and landscape.

## Viewports to verify

- [ ] 320 × 568 portrait
- [ ] 568 × 320 landscape
- [ ] 360 × 640 portrait
- [ ] 640 × 360 landscape
- [ ] 390 × 844 portrait
- [ ] 844 × 390 landscape
- [ ] 430 × 932 portrait
- [ ] 932 × 430 landscape
- [ ] 768 × 1024 portrait
- [ ] 1024 × 768 landscape
- [ ] 1024 × 1366 portrait/tablet
- [ ] 1366 × 1024 landscape/tablet

## Required checks

- [ ] No horizontal page overflow; content width stays within the viewport.
- [ ] Primary touch targets are at least 44px tall/wide.
- [ ] Preview, filters, category pills, and export controls do not overlap.
- [ ] Character preview remains visible while customizing when vertical space permits.
- [ ] Sticky bottom action bar remains usable with safe-area insets and does not cover focused controls.
- [ ] Export is possible entirely from a mobile device through the sticky action bar and export bottom sheet.
- [ ] Offcanvas/export panels use bottom-sheet behavior and account for mobile browser chrome with dynamic viewport units.
- [ ] Modals fit within the visible viewport, scroll internally, and keep their footer actions reachable.
- [ ] Background page scrolling is blocked while a Bootstrap modal/offcanvas is active.
- [ ] Item grids scroll with momentum and are not trapped behind sticky controls.
- [ ] Category navigation remains reachable as a horizontal, touch-friendly rail on narrow screens.
- [ ] Swipe/drag gestures are enhancements only; every action also has visible buttons or form controls.
- [ ] Canvas panning does not trigger accidental page gestures; pinch/zoom controls are touch-friendly.
- [ ] Search fields scroll into view when focused so virtual keyboards do not cover them.
- [ ] Landscape layouts reduce decorative art and prioritize controls plus preview.
- [ ] Decorative ambient art is disabled or reduced on small and landscape screens.
- [ ] Drag-and-drop features have tap/click alternatives.

## Regression notes

- Prefer physical-device verification for iOS Safari and Chrome Android because browser controls affect the visual viewport.
- When a new modal/offcanvas is added, verify `body.modal-open`/`.offcanvas-open` keeps the background fixed and the panel scrolls internally.
- When adding a new control to the bottom action bar, retest 320px portrait and 568px landscape for wrapping and collisions.
