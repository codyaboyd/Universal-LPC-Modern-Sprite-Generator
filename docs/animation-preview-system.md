# Animation preview system

The live RPG animation preview renders from the same composed LPC sprite sheet used for export. It never edits files in `spritesheets/`; selected layers are preloaded, recolored when needed, drawn in z-position order, and then copied into the preview canvas one animation frame at a time.

## Supported animation discovery

The selector is data-driven. During character rendering, each selected item's metadata is inspected and converted into draw calls only for animations that the item actually supports. The preview reads those rendered draw calls and exposes the intersection currently present in the composed sheet, plus any custom animation areas added by selected layers.

Folder-name aliases are normalized for display:

| Sprite folder | Preview option     |
| ------------- | ------------------ |
| `spellcast`   | Cast / Spellcast   |
| `thrust`      | Thrust             |
| `walk`        | Walk               |
| `slash`       | Slash              |
| `shoot`       | Shoot              |
| `hurt`        | Hurt               |
| `idle`        | Idle               |
| `run`         | Run                |
| `combat_idle` | Combat Idle        |
| `backslash`   | 1-Handed Backslash |
| `halfslash`   | 1-Handed Halfslash |

If a selected character has no rendered layers for an animation, that animation is omitted from the selector rather than hardcoded into the UI.

## Standard LPC frame mapping

Standard LPC frames are 64×64 pixels. The universal sheet is 13 frames wide, and animation row offsets are defined in `ANIMATION_CONFIGS` and `ANIMATION_OFFSETS`.

| Preview group      | Sheet rows | Directions            | Frame cycle                  |
| ------------------ | ---------: | --------------------- | ---------------------------- |
| Cast / Spellcast   |        0–3 | up, left, down, right | 0,1,2,3,4,5,6                |
| Thrust             |        4–7 | up, left, down, right | 0,1,2,3,4,5,6,7              |
| Walk               |       8–11 | up, left, down, right | 1,2,3,4,5,6,7,8              |
| Slash              |      12–15 | up, left, down, right | 0,1,2,3,4,5                  |
| Shoot              |      16–19 | up, left, down, right | 0,1,2,3,4,5,6,7,8,9,10,11,12 |
| Hurt               |         20 | single row            | 0,1,2,3,4,5                  |
| Climb              |         21 | single row            | 0,1,2,3,4,5                  |
| Idle               |      22–25 | up, left, down, right | 0,0,1                        |
| Jump               |      26–29 | up, left, down, right | 0,1,2,3,4,1                  |
| Sit                |      30–33 | up, left, down, right | 0×5,1×5,2×5                  |
| Emote              |      34–37 | up, left, down, right | 0×5,1×5,2×5                  |
| Run                |      38–41 | up, left, down, right | 0,1,2,3,4,5,6,7              |
| Combat Idle        |      42–45 | up, left, down, right | 0,0,1                        |
| 1-Handed Backslash |      46–49 | up, left, down, right | 0,1,2,3,4,5,7,8,9,10,11,12   |
| 1-Handed Halfslash |      50–53 | up, left, down, right | 0,1,2,3,4,5                  |

Custom animation definitions provide their own frame size and row/column map. When selected, the preview uses the custom animation's appended area in the composed sheet and derives the frame count from that definition.

## Playback behavior

The preview has play/pause, previous/next frame stepping, a direction selector, speed selector, loop toggle, frame indicator, measured FPS display, and a timeline scrubber. Playback uses one guarded `requestAnimationFrame` loop and advances frames using elapsed high-resolution time so timing remains stable even if the browser misses a paint.

The loop stops when the component unmounts, when the preview is marked hidden, or when the document becomes hidden. Users with `prefers-reduced-motion: reduce` start paused and get a static frame until they explicitly interact.

## Flicker and stale-work prevention

Rendering composes into a temporary canvas first. The main offscreen sprite sheet is updated only after all required layer images load and all layers are drawn in z-position order. Rapid selection changes increment a render generation token; obsolete renders can finish their background work, but they are not committed over newer results.
