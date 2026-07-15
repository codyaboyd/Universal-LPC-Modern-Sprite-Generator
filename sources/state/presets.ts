import m from "mithril";
import { canvas as renderedCanvas } from "../canvas/renderer.ts";
import type { CatalogReader } from "./catalog.ts";
import { evaluateItemCompatibility } from "./compatibility.ts";
import { state, type CharacterMetadata, type Selections } from "./state.ts";
import { syncSelectionsToHash } from "./hash.ts";
import { renderCharacter } from "../canvas/renderer.ts";

export const PRESET_SCHEMA_VERSION = 1;
const STORAGE_KEY = "ulpc:presets:v1";

export type PresetKind = "character" | "appearance" | "loadout";

export type PresetRecord = {
  schemaVersion: number;
  id: string;
  kind: PresetKind;
  favorite: boolean;
  metadata: CharacterMetadata & { description?: string };
  bodyType: string;
  selectedLayers: string[];
  assetIdentifiers: Record<string, string>;
  paletteSelections: Record<
    string,
    { variant?: string | null; recolor?: string | null }
  >;
  lockedSelections: string[];
  animationPreferences: {
    selectedAnimation: string;
    enabledAnimations: Record<string, boolean>;
  };
  selections: Selections;
  thumbnail?: string;
  createdAt: string;
  modifiedAt: string;
};

export type ApplyPresetResult = {
  applied: number;
  missing: string[];
  incompatible: string[];
};

const APPEARANCE_GROUPS = [
  "body",
  "head",
  "heads",
  "face",
  "ears",
  "eyes",
  "hair",
  "beard",
  "mustache",
  "eyebrow",
  "nose",
  "tail",
  "tails",
  "horn",
  "lizard",
];

function safeRead(): PresetRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isPresetRecord) : [];
  } catch {
    return [];
  }
}

function isPresetRecord(value: unknown): value is PresetRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PresetRecord>;
  return (
    candidate.schemaVersion === PRESET_SCHEMA_VERSION &&
    typeof candidate.id === "string" &&
    !!candidate.selections
  );
}

function writePresets(presets: PresetRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function loadPresets(): PresetRecord[] {
  return safeRead().sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function id(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function thumbnail(): string | undefined {
  try {
    return renderedCanvas?.toDataURL("image/png");
  } catch {
    return undefined;
  }
}

function isAppearanceGroup(group: string): boolean {
  const lower = group.toLowerCase();
  return APPEARANCE_GROUPS.some((needle) => lower.includes(needle));
}

function selectByKind(kind: PresetKind): Selections {
  if (kind === "character") return structuredClone(state.selections);
  return Object.fromEntries(
    Object.entries(state.selections).filter(([group]) =>
      kind === "appearance"
        ? isAppearanceGroup(group)
        : !isAppearanceGroup(group),
    ),
  );
}

export function createPreset(kind: PresetKind, name?: string): PresetRecord {
  const now = new Date().toISOString();
  const selections = selectByKind(kind);
  const selectedLayers = Object.keys(selections);
  const metadata = {
    ...state.characterMetadata,
    name:
      name ||
      state.characterMetadata.name ||
      (kind === "loadout" ? "New loadout" : "New preset"),
    savedAt: now,
    modifiedAt: now,
  };
  return {
    schemaVersion: PRESET_SCHEMA_VERSION,
    id: id(),
    kind,
    favorite: false,
    metadata,
    bodyType: state.bodyType,
    selectedLayers,
    assetIdentifiers: Object.fromEntries(
      Object.entries(selections).map(([group, selection]) => [
        group,
        selection.itemId,
      ]),
    ),
    paletteSelections: Object.fromEntries(
      Object.entries(selections).map(([group, selection]) => [
        group,
        { variant: selection.variant, recolor: selection.recolor },
      ]),
    ),
    lockedSelections: [],
    animationPreferences: {
      selectedAnimation: state.selectedAnimation,
      enabledAnimations: { ...state.enabledAnimations },
    },
    selections,
    thumbnail: thumbnail(),
    createdAt: now,
    modifiedAt: now,
  };
}

export function saveCurrentPreset(
  kind: PresetKind,
  name?: string,
): PresetRecord {
  const preset = createPreset(kind, name);
  writePresets([preset, ...safeRead()]);
  return preset;
}

export function upsertPreset(preset: PresetRecord): void {
  const presets = safeRead();
  const idx = presets.findIndex((item) => item.id === preset.id);
  if (idx >= 0) presets[idx] = preset;
  else presets.unshift(preset);
  writePresets(presets);
}

export function deletePreset(idToDelete: string): void {
  writePresets(safeRead().filter((preset) => preset.id !== idToDelete));
}

export function renamePreset(idToRename: string, name: string): void {
  const presets = safeRead();
  const preset = presets.find((item) => item.id === idToRename);
  if (!preset) return;
  preset.metadata.name = name;
  preset.modifiedAt = new Date().toISOString();
  preset.metadata.modifiedAt = preset.modifiedAt;
  writePresets(presets);
}

export function toggleFavorite(idToToggle: string): void {
  const presets = safeRead();
  const preset = presets.find((item) => item.id === idToToggle);
  if (!preset) return;
  preset.favorite = !preset.favorite;
  preset.modifiedAt = new Date().toISOString();
  writePresets(presets);
}

export function duplicatePreset(idToDuplicate: string): PresetRecord | null {
  const presets = safeRead();
  const preset = presets.find((item) => item.id === idToDuplicate);
  if (!preset) return null;
  const now = new Date().toISOString();
  const copy = {
    ...structuredClone(preset),
    id: id(),
    metadata: {
      ...preset.metadata,
      name: `${preset.metadata.name || "Preset"} copy`,
      savedAt: now,
      modifiedAt: now,
    },
    createdAt: now,
    modifiedAt: now,
  };
  writePresets([copy, ...presets]);
  return copy;
}

export function exportPresetJson(preset: PresetRecord): string {
  return JSON.stringify(preset, null, 2);
}

export function importPresetJson(text: string): PresetRecord {
  const parsed = JSON.parse(text) as unknown;
  if (!isPresetRecord(parsed))
    throw new Error("Unsupported or invalid preset schema.");
  const now = new Date().toISOString();
  return {
    ...structuredClone(parsed),
    id: id(),
    modifiedAt: now,
    metadata: { ...parsed.metadata, modifiedAt: now },
  };
}

export async function applyPreset(
  preset: PresetRecord,
  catalog: CatalogReader,
): Promise<ApplyPresetResult> {
  const missing: string[] = [];
  const incompatible: string[] = [];
  const next: Selections =
    preset.kind === "character" || preset.kind === "appearance"
      ? {}
      : { ...state.selections };
  const bodyType =
    preset.kind === "character" || preset.kind === "appearance"
      ? preset.bodyType
      : state.bodyType;

  for (const [group, selection] of Object.entries(preset.selections)) {
    const item = catalog.getItemMerged(selection.itemId).unwrapOr(null);
    if (!item) {
      missing.push(`${selection.name || group} (${selection.itemId})`);
      continue;
    }
    const report = evaluateItemCompatibility({
      catalog,
      itemId: selection.itemId,
      bodyType,
      animation: state.selectedAnimation,
      selections: next,
      variant: selection.variant ?? selection.recolor ?? "",
    });
    if (!report.compatible) {
      incompatible.push(selection.name || selection.itemId);
      continue;
    }
    for (const key of report.hiddenSelectionKeys) delete next[key];
    next[group] = { ...selection, name: item.name || selection.name };
  }

  state.selections = next;
  if (preset.kind !== "loadout") {
    state.bodyType = preset.bodyType;
    state.characterMetadata = {
      ...preset.metadata,
      modifiedAt: new Date().toISOString(),
    };
  }
  state.selectedAnimation =
    preset.animationPreferences.selectedAnimation || state.selectedAnimation;
  state.enabledAnimations = {
    ...state.enabledAnimations,
    ...preset.animationPreferences.enabledAnimations,
  };
  syncSelectionsToHash(catalog);
  await renderCharacter(state.selections, state.bodyType);
  m.redraw();
  return { applied: Object.keys(next).length, missing, incompatible };
}
