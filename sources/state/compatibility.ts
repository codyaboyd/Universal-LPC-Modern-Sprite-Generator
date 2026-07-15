import { ANIMATIONS, DIRECTIONS } from "./constants.ts";
import type { CatalogReader, ItemMerged, LayerEntry } from "./catalog.ts";
import type { Selections, Selection } from "./state.ts";

export type CompatibilitySeverity = "error" | "warning";
export type CompatibilityIssueKind =
  | "body"
  | "animation"
  | "conflict"
  | "hidden-by"
  | "requires"
  | "variant"
  | "directional-frames";

export type CompatibilityIssue = {
  kind: CompatibilityIssueKind;
  severity: CompatibilitySeverity;
  message: string;
  itemId?: string;
  relatedItemId?: string;
};

export type CompatibilityRules = {
  conflicts?: string[];
  hides?: string[];
  requires?: string[];
  substitutes?: Record<string, string>;
  incompleteDirections?: string[];
  completeDirections?: string[];
};

type CompatMeta = ItemMerged & {
  compatibility?: CompatibilityRules;
  conflicts?: string[];
  hides?: string[];
  requires?: string[];
  substitutes?: Record<string, string>;
  incompleteDirections?: string[];
  completeDirections?: string[];
};

export type CompatibilityReport = {
  itemId: string;
  compatible: boolean;
  issues: CompatibilityIssue[];
  hiddenSelectionKeys: string[];
  substitutions: string[];
};

const animationFolders = new Map(
  ANIMATIONS.map((anim) => [anim.value, anim.folderName ?? anim.value]),
);

function rulesFor(meta: ItemMerged): CompatibilityRules {
  const m = meta as CompatMeta;
  return {
    ...(m.compatibility ?? {}),
    conflicts: m.conflicts ?? m.compatibility?.conflicts,
    hides: m.hides ?? m.compatibility?.hides,
    requires: m.requires ?? m.compatibility?.requires,
    substitutes: m.substitutes ?? m.compatibility?.substitutes,
    incompleteDirections:
      m.incompleteDirections ?? m.compatibility?.incompleteDirections,
    completeDirections:
      m.completeDirections ?? m.compatibility?.completeDirections,
  };
}

function selectionKeysForTypes(selections: Selections, typeNames: string[]) {
  const wanted = new Set(typeNames);
  return Object.entries(selections)
    .filter(([key]) => wanted.has(key))
    .map(([key]) => key);
}

function hasAnySelection(selections: Selections, typeNames: string[]) {
  return selectionKeysForTypes(selections, typeNames).length > 0;
}

function itemSupportsBody(meta: ItemMerged, bodyType: string): boolean {
  if (meta.required?.length && !meta.required.includes(bodyType)) return false;
  return Object.values(meta.layers ?? {}).some(
    (layer) => typeof layer[bodyType] === "string",
  );
}

function itemSupportsAnimation(meta: ItemMerged, animation: string): boolean {
  if (!animation) return true;
  const folder = animationFolders.get(animation) ?? animation;
  return (meta.animations ?? []).some(
    (anim) =>
      anim === animation ||
      anim === folder ||
      animationFolders.get(anim) === folder,
  );
}

function usesDirectionalSheet(layer: LayerEntry): boolean {
  return !layer.custom_animation;
}

export function findIncompleteDirectionalFrames(meta: ItemMerged): string[] {
  const rules = rulesFor(meta);
  if (rules.incompleteDirections?.length) return rules.incompleteDirections;
  if (rules.completeDirections?.length) {
    const complete = new Set(rules.completeDirections);
    return DIRECTIONS.filter((direction) => !complete.has(direction));
  }

  const directionalLayers = Object.values(meta.layers ?? {}).filter(
    usesDirectionalSheet,
  );
  if (directionalLayers.length === 0) return [];

  // Data-driven signal: generated metadata may publish explicit direction lists.
  const directions = (meta as CompatMeta & { directions?: string[] })
    .directions;
  if (directions?.length) {
    const complete = new Set(directions);
    return DIRECTIONS.filter((direction) => !complete.has(direction));
  }

  return [];
}

export function getMatchingVariant(
  catalog: CatalogReader,
  itemId: string,
  desiredVariant: string | null | undefined,
): string | null {
  if (!desiredVariant) return null;
  const meta = catalog.getItemMerged(itemId).unwrapOr(null);
  if (!meta) return null;
  if (meta.variants?.includes(desiredVariant)) return desiredVariant;
  for (const recolor of meta.recolors ?? []) {
    if (recolor.variants?.includes(desiredVariant)) return desiredVariant;
  }
  const substituteId = rulesFor(meta).substitutes?.[desiredVariant];
  return substituteId && catalog.getItemLite(substituteId).isOk()
    ? substituteId
    : null;
}

export function evaluateItemCompatibility(args: {
  catalog: CatalogReader;
  itemId: string;
  bodyType: string;
  animation: string;
  selections: Selections;
  variant?: string | null;
}): CompatibilityReport {
  const { catalog, itemId, bodyType, animation, selections, variant } = args;
  const meta = catalog.getItemMerged(itemId).unwrapOr(null);
  const issues: CompatibilityIssue[] = [];
  if (!meta)
    return {
      itemId,
      compatible: true,
      issues,
      hiddenSelectionKeys: [],
      substitutions: [],
    };

  const rules = rulesFor(meta);
  if (!itemSupportsBody(meta, bodyType)) {
    issues.push({
      kind: "body",
      severity: "error",
      itemId,
      message: `${meta.name} does not include ${bodyType} body frames.`,
    });
  }
  if (!itemSupportsAnimation(meta, animation)) {
    issues.push({
      kind: "animation",
      severity: "error",
      itemId,
      message: `${meta.name} does not support the ${animation} animation.`,
    });
  }
  if (variant && meta.variants?.length && !meta.variants.includes(variant)) {
    issues.push({
      kind: "variant",
      severity: "error",
      itemId,
      message: `${meta.name} has no ${variant.replaceAll("_", " ")} variant.`,
    });
  }

  const conflictKeys = selectionKeysForTypes(selections, rules.conflicts ?? []);
  for (const key of conflictKeys) {
    issues.push({
      kind: "conflict",
      severity: "error",
      itemId,
      relatedItemId: selections[key]?.itemId,
      message: `${meta.name} conflicts with selected ${key}.`,
    });
  }

  for (const required of rules.requires ?? []) {
    if (!hasAnySelection(selections, [required])) {
      issues.push({
        kind: "requires",
        severity: "error",
        itemId,
        message: `${meta.name} requires a selected ${required} layer.`,
      });
    }
  }

  for (const direction of findIncompleteDirectionalFrames(meta)) {
    issues.push({
      kind: "directional-frames",
      severity: "warning",
      itemId,
      message: `${meta.name} may be missing ${direction} directional frames.`,
    });
  }

  const hiddenSelectionKeys = selectionKeysForTypes(
    selections,
    rules.hides ?? [],
  );
  const substitutions = Object.values(rules.substitutes ?? {}).filter((id) =>
    catalog.getItemLite(id).isOk(),
  );
  const compatible = !issues.some((issue) => issue.severity === "error");
  return { itemId, compatible, issues, hiddenSelectionKeys, substitutions };
}

export function validateSelections(args: {
  catalog: CatalogReader;
  bodyType: string;
  animation: string;
  selections: Selections;
}): CompatibilityReport[] {
  return Object.values(args.selections).map((selection: Selection) =>
    evaluateItemCompatibility({
      ...args,
      itemId: selection.itemId,
      variant: selection.variant,
    }),
  );
}
