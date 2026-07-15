import { evaluateItemCompatibility } from "./compatibility.ts";
import type { CatalogReader, CategoryTreeNode, ItemLite } from "./catalog.ts";
import { state, type Selection, type Selections } from "./state.ts";
import { getHashParamsforSelections, setHashParams } from "./hash.ts";

export type RandomizerMode =
  | "full"
  | "appearance"
  | "equipment"
  | "colors"
  | "weapons"
  | "hero"
  | "civilian"
  | "armored"
  | "lightweight";

export type RandomizerLockState = {
  categories: Record<string, boolean>;
  choices: Record<string, boolean>;
};
export type RandomizerSnapshot = {
  selections: Selections;
  bodyType: string;
  seed: string;
};

export const RANDOMIZER_MODES: {
  value: RandomizerMode;
  label: string;
  description: string;
}[] = [
  {
    value: "full",
    label: "Fully random",
    description:
      "Randomize base appearance, clothing, equipment, weapons, and palettes.",
  },
  {
    value: "appearance",
    label: "Appearance only",
    description: "Randomize body, head, face, hair, and biological features.",
  },
  {
    value: "equipment",
    label: "Equipment only",
    description: "Randomize wearable gear while leaving appearance intact.",
  },
  {
    value: "colors",
    label: "Colors only",
    description: "Reroll palettes for the current compatible selections.",
  },
  {
    value: "weapons",
    label: "Weapons only",
    description: "Reroll weapon and shield selections.",
  },
  {
    value: "hero",
    label: "Random fantasy hero",
    description:
      "Build a dependable adventurer from appearance, clothing, gear, and weapons.",
  },
  {
    value: "civilian",
    label: "Random civilian",
    description:
      "Build everyday clothing and accessories without weapons or heavy armor.",
  },
  {
    value: "armored",
    label: "Random armored character",
    description: "Prefer armor, helmets, shields, and battle-ready weapons.",
  },
  {
    value: "lightweight",
    label: "Random lightweight adventurer",
    description: "Prefer clothes, boots, packs, capes, and light weapons.",
  },
];

const APPEARANCE =
  /(body|heads?|face|ears?|eyes?|hair|beard|mustache|eyebrow|nose|horn|tail|wing|appendage|wrinkle)/i;
const WEAPONS =
  /(weapon|sword|dagger|axe|bow|arrow|staff|wand|spear|polearm|mace|shield|quiver|slash|thrust|shoot|cast|hand_(left|right))/i;
const ARMOR =
  /(armor|armour|helmet|helm|pauldron|greave|bracer|gauntlet|shield|mail|plate|cuirass)/i;
const CLOTHING =
  /(shirt|pants|skirt|dress|robe|vest|jacket|cloak|cape|boot|shoe|sandal|hat|hood|belt|glove|sleeve|sash|apron|tie|scarf|neck|bag|backpack)/i;

function cloneSelections(selections: Selections): Selections {
  return Object.fromEntries(
    Object.entries(selections).map(([k, v]) => [k, { ...v }]),
  );
}

export function snapshotRandomizer(seed: string): RandomizerSnapshot {
  return {
    selections: cloneSelections(state.selections),
    bodyType: state.bodyType,
    seed,
  };
}

export function restoreRandomizerSnapshot(snapshot: RandomizerSnapshot): void {
  state.selections = cloneSelections(snapshot.selections);
  state.bodyType = snapshot.bodyType;
}

export function createSeed(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rng(seed: string): () => number {
  return mulberry32(xmur3(seed)());
}

function pick<T>(items: T[], random: () => number): T | undefined {
  return items[Math.floor(random() * items.length)];
}

function collectItemIds(tree: CategoryTreeNode): string[] {
  const ids: string[] = [];
  const walk = (node: CategoryTreeNode) => {
    ids.push(...(node.items ?? []));
    Object.values(node.children ?? {}).forEach(walk);
  };
  walk(tree);
  return Array.from(new Set(ids));
}

function textFor(itemId: string, item: ItemLite): string {
  return `${itemId} ${item.name} ${item.type_name} ${item.path?.join(" ")}`;
}

function groupAllowed(mode: RandomizerMode, text: string): boolean {
  if (mode === "colors") return false;
  if (mode === "appearance") return APPEARANCE.test(text);
  if (mode === "weapons") return WEAPONS.test(text);
  if (mode === "equipment")
    return (
      !APPEARANCE.test(text) &&
      (CLOTHING.test(text) || ARMOR.test(text) || WEAPONS.test(text))
    );
  if (mode === "civilian")
    return (
      APPEARANCE.test(text) ||
      (CLOTHING.test(text) && !WEAPONS.test(text) && !ARMOR.test(text))
    );
  if (mode === "armored")
    return (
      APPEARANCE.test(text) ||
      ARMOR.test(text) ||
      WEAPONS.test(text) ||
      /boot|belt|glove/i.test(text)
    );
  if (mode === "lightweight")
    return (
      APPEARANCE.test(text) ||
      (CLOTHING.test(text) && !ARMOR.test(text)) ||
      /(dagger|bow|staff|wand|sling|quiver)/i.test(text)
    );
  return true;
}

function equipChance(
  mode: RandomizerMode,
  group: string,
  text: string,
): number {
  if (/^(body|heads?|face)$/i.test(group)) return 1;
  if (mode === "civilian" && WEAPONS.test(text)) return 0;
  if (mode === "armored" && ARMOR.test(text)) return 0.78;
  if (mode === "weapons") return 0.42;
  if (mode === "appearance") return 0.55;
  if (mode === "equipment") return 0.38;
  return 0.32;
}

function chooseVariant(item: ItemLite, random: () => number): string {
  return (
    pick(item.variants, random) ??
    pick(item.recolors?.[0]?.variants ?? [], random) ??
    ""
  );
}

function recolorSelection(
  selection: Selection,
  item: ItemLite,
  random: () => number,
): void {
  if (item.variants.length)
    selection.variant = pick(item.variants, random) ?? selection.variant ?? "";
  const primary = item.recolors[0];
  const recolor = primary
    ? pick(primary.variants ?? Object.keys(primary.palettes ?? {}), random)
    : undefined;
  if (recolor !== undefined) selection.recolor = recolor;
  selection.name = `${item.name}${selection.variant || selection.recolor ? ` (${selection.variant || selection.recolor})` : ""}`;
}

export function randomizeCharacter(args: {
  catalog: CatalogReader;
  mode: RandomizerMode;
  seed: string;
  locks: RandomizerLockState;
}): void {
  const random = rng(args.seed);
  if (
    args.mode === "full" ||
    args.mode === "hero" ||
    args.mode === "civilian" ||
    args.mode === "armored" ||
    args.mode === "lightweight"
  ) {
    const bodies = ["male", "female", "child", "teen", "muscular"].filter(
      () => !args.locks.categories.body && !args.locks.choices.body,
    );
    if (bodies.length) state.bodyType = pick(bodies, random) ?? state.bodyType;
  }

  const tree = args.catalog.getCategoryTree().unwrapOr(null);
  if (!tree) return;
  const grouped = new Map<
    string,
    { itemId: string; item: ItemLite; text: string }[]
  >();
  for (const itemId of collectItemIds(tree)) {
    const item = args.catalog.getItemLite(itemId).unwrapOr(null);
    if (
      !item ||
      (item.required.length && !item.required.includes(state.bodyType))
    )
      continue;
    const group = item.type_name || itemId;
    if (args.locks.categories[group] || args.locks.choices[group]) continue;
    const text = textFor(itemId, item);
    if (!groupAllowed(args.mode, text)) continue;
    const bucket = grouped.get(group) ?? [];
    bucket.push({ itemId, item, text });
    grouped.set(group, bucket);
  }

  if (args.mode !== "colors") {
    for (const [group, current] of Object.entries(state.selections)) {
      const item = args.catalog.getItemLite(current.itemId).unwrapOr(null);
      if (!item) continue;
      const text = textFor(current.itemId, item);
      if (
        !groupAllowed(args.mode, text) &&
        !args.locks.categories[group] &&
        !args.locks.choices[group]
      )
        delete state.selections[group];
    }
  }

  for (const [group, options] of grouped) {
    if (
      args.mode !== "colors" &&
      random() >
        equipChance(args.mode, group, options.map((o) => o.text).join(" "))
    )
      continue;
    const shuffled = [...options].sort(() => random() - 0.5);
    for (const option of shuffled) {
      const variant = chooseVariant(option.item, random);
      const trial = cloneSelections(state.selections);
      const report = evaluateItemCompatibility({
        catalog: args.catalog,
        itemId: option.itemId,
        bodyType: state.bodyType,
        animation: state.selectedAnimation,
        selections: trial,
        variant,
      });
      if (!report.compatible) continue;
      for (const key of report.hiddenSelectionKeys)
        if (!args.locks.categories[key] && !args.locks.choices[key])
          delete trial[key];
      trial[group] = {
        itemId: option.itemId,
        name: option.item.name,
        variant,
        recolor: option.item.variants.length ? "" : variant,
      };
      state.selections = trial;
      break;
    }
  }

  for (const [group, selection] of Object.entries(state.selections)) {
    if (args.locks.categories[group] || args.locks.choices[group]) continue;
    const item = args.catalog.getItemLite(selection.itemId).unwrapOr(null);
    if (item && (args.mode === "colors" || random() < 0.6))
      recolorSelection(selection, item, random);
  }

  setHashParams({
    ...getHashParamsforSelections(args.catalog, state.selections),
    randomSeed: args.seed,
    randomMode: args.mode,
  });
}
