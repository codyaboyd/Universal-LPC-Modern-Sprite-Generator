# Accessibility checklist and manual test cases

This character creator aims to meet WCAG 2.2 AA expectations for common creator workflows. This pass focused on keyboard access, visible focus, usable labels, non-visual preview alternatives, and announcement behavior that does not flood assistive technology.

## Implemented improvements

- Keyboard navigation: expandable tree rows, palette choices, the sprite viewport, animation controls, and modal close actions are reachable without a mouse.
- Visible focus: global `:focus-visible` styles and component-specific focus outlines identify the active element.
- Logical tab order: controls remain in DOM order; dialogs trap focus and return interactions through close buttons or Escape.
- Screen-reader labels and form labels: preview controls, timeline, background selectors, guided save field, zoom controls, and canvas previews have labels or descriptions.
- Button names: icon-only close and favorite buttons include explicit accessible names.
- Modal focus trapping: custom palette dialogs focus the first control on open, cycle Tab/Shift+Tab, and close on Escape.
- Offcanvas focus behavior: the export sheet uses Bootstrap offcanvas semantics, `aria-labelledby`, and `aria-describedby` for the focus-managed bottom sheet.
- Tooltip accessibility: title-only tooltip content is duplicated into labels or visible state where critical, and incompatible items use warning text plus disabled/line-through state.
- Color contrast and non-color state: selected items include outlines/check icons or pressed state, incompatible items are dimmed and line-through, and focused elements have high-contrast outlines.
- Reduced motion: animation/transition durations are minimized under `prefers-reduced-motion`; animation preview starts paused for users requesting reduced motion.
- Zoom up to 200%: core creator bars wrap and panels use responsive scrolling to preserve access at browser zoom.
- Error messaging: failed preview assets render a `role="alert"` list.
- Toast announcements: toasts use polite live announcements with atomic additions and named dismiss buttons.
- Loading announcements: preview and palette loading states expose busy/status text.
- Empty states: recent/favorite palettes and missing selections expose text descriptions.
- Canvas alternatives: the sprite preview has a text summary of current body type, animation, and equipment; small canvas previews are labelled as images.

## Sprite preview behavior

- The preview canvas is described by an accessible text summary rather than by pixels alone.
- Equipment changes update one polite live summary when the selection fingerprint changes; animation frames are not written to live regions.
- Keyboard controls in the preview viewport:
  - `Space`: play/pause.
  - `,`: previous frame.
  - `.`: next frame.
  - Arrow keys: pan when zoomed.
- Zoom and pan controls include clear labels and the current zoom is exposed through an labelled output.

## Manual test cases

1. **Keyboard-only creator path**
   - Start at the browser address bar, press Tab into the page, and verify visible focus appears on every interactive control.
   - Navigate guided workflow Back/Skip/Next and confirm focus order follows the visual order.
   - Expand a category with Enter and Space, select a variant, and verify selected state is not color-only.

2. **Palette dialog focus trap**
   - Open a palette editor from a recolorable item.
   - Confirm focus lands inside the dialog.
   - Press Tab repeatedly; focus must cycle inside the dialog.
   - Press Shift+Tab from the first control; focus must move to the last dialog control.
   - Press Escape; the dialog must close.

3. **Export offcanvas**
   - Open Export from the bottom bar.
   - Confirm the sheet has a readable title and description.
   - Tab through export controls and close the sheet with its close button.

4. **Sprite preview controls**
   - Tab to the sprite viewport.
   - Press Space and confirm playback toggles.
   - Press comma/period to step frames without starting continuous animation.
   - Increase zoom above 100% and use arrow keys to pan.

5. **Screen reader smoke test**
   - With VoiceOver, NVDA, or JAWS, navigate to the preview section.
   - Confirm the body type, current animation, and equipped layers are announced once when equipment changes.
   - Confirm animation frame changes do not generate repeated live announcements.

6. **Reduced motion**
   - Enable OS/browser reduced motion.
   - Reload the app and confirm animation preview starts paused and decorative animations are minimized.

7. **Zoom and reflow**
   - Set browser zoom to 200% at 1280px wide.
   - Confirm toolbar buttons wrap, no controls are clipped, and horizontal scrolling is not required for primary tasks.

## Automated checks used

- Unit coverage verifies character summary generation, initial dialog focus, and modal Tab/Shift+Tab wrapping.
- Component tests cover palette dialog rendering and can be extended with axe-core if that dependency is added later.
