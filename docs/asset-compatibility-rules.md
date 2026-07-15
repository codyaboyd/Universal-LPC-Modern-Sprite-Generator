# Asset compatibility rules

The character creator now centralizes asset compatibility decisions in `sources/state/compatibility.ts`. UI components should ask this engine for compatibility reports instead of adding ad-hoc filename or folder checks.

## Metadata inputs

The engine is data-driven and reads these fields from generated/loaded item metadata:

- `required`: body types supported by the item.
- `animations`: animation rows or custom animation names supported by the item.
- `layers.layer_N.<bodyType>`: concrete per-body spritesheet paths.
- `variants` and `recolors[].variants`: available variants/recolors.
- `compatibility` (preferred) or legacy top-level aliases for compatibility rules:
  - `conflicts`: selection groups that cannot be equipped at the same time.
  - `hides`: selection groups intentionally hidden/replaced when this item is equipped.
  - `requires`: selection groups that must already be selected.
  - `substitutes`: map of requested variant/body/asset keys to compatible item ids.
  - `incompleteDirections`: directions known to have missing or incomplete frames.
  - `completeDirections`: directions known to be complete; missing directions become warnings.

Example:

```json
{
  "name": "Closed Helmet",
  "type_name": "hat",
  "required": ["male", "female"],
  "animations": ["walk", "slash"],
  "compatibility": {
    "conflicts": ["hair"],
    "hides": ["ears"],
    "requires": ["head"],
    "substitutes": { "child": "closed_helmet_child" },
    "incompleteDirections": ["up"]
  }
}
```

## Engine answers

`evaluateItemCompatibility` returns a report that answers whether an item:

- supports the current body type;
- supports the selected animation;
- conflicts with another selected layer;
- hides or replaces another selected layer;
- requires a supporting layer;
- has a matching variant/substitute available;
- has incomplete directional frames.

`validateSelections` aggregates the same checks for the current character and is used by the export panel validation summary.

## UX contract

- Incompatible assets are hidden by default, but advanced users can enable **Show incompatible assets** in the asset tree.
- Incompatible visible assets are marked with a warning and a human-readable reason.
- Equipping an invalid item is blocked with an explanation.
- Equipping an item that hides/replaces existing layers prompts before removal; equipment is not silently removed.
- Export surfaces a validation summary so users can fix broken combinations before downloading.

## Authoring guidance

Prefer adding explicit metadata rules over relying on path or filename patterns. If a compatibility decision cannot be expressed with the fields above, extend `CompatibilityRules` in `sources/state/compatibility.ts` first and then update this document and representative tests.
