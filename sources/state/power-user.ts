import m from "mithril";
import { state, type CharacterMetadata, type Selections } from "./state.ts";

export type CharacterSnapshot = {
  selections: Selections;
  bodyType: string;
  metadata: CharacterMetadata;
  label: string;
  createdAt: string;
};

const HISTORY_LIMIT = 40;
export const selectionHistory: CharacterSnapshot[] = [];
let historyIndex = -1;
let restoring = false;

function cloneSelections(selections: Selections): Selections {
  return structuredClone(selections);
}

function snapshot(label: string): CharacterSnapshot {
  return {
    selections: cloneSelections(state.selections),
    bodyType: state.bodyType,
    metadata: structuredClone(state.characterMetadata),
    label,
    createdAt: new Date().toISOString(),
  };
}

function fingerprint(value: CharacterSnapshot): string {
  return JSON.stringify([value.selections, value.bodyType]);
}

export function recordSelectionHistory(label = "Selection changed"): void {
  if (restoring) return;
  const next = snapshot(label);
  if (
    historyIndex >= 0 &&
    fingerprint(selectionHistory[historyIndex]!) === fingerprint(next)
  )
    return;
  selectionHistory.splice(historyIndex + 1);
  selectionHistory.push(next);
  if (selectionHistory.length > HISTORY_LIMIT) selectionHistory.shift();
  historyIndex = selectionHistory.length - 1;
}

function restore(entry: CharacterSnapshot): void {
  restoring = true;
  state.selections = cloneSelections(entry.selections);
  state.bodyType = entry.bodyType;
  state.characterMetadata = structuredClone(entry.metadata);
  queueMicrotask(() => (restoring = false));
  m.redraw();
}

export function canUndo(): boolean {
  return historyIndex > 0;
}
export function canRedo(): boolean {
  return historyIndex >= 0 && historyIndex < selectionHistory.length - 1;
}
export function undoSelections(): boolean {
  if (!canUndo()) return false;
  restore(selectionHistory[--historyIndex]!);
  return true;
}
export function redoSelections(): boolean {
  if (!canRedo()) return false;
  restore(selectionHistory[++historyIndex]!);
  return true;
}
export function restoreHistoryEntry(index: number): void {
  if (!selectionHistory[index]) return;
  historyIndex = index;
  restore(selectionHistory[index]);
}
export function currentHistoryIndex(): number {
  return historyIndex;
}

export async function copyCharacterConfiguration(): Promise<void> {
  const value = snapshot("Copied configuration");
  await navigator.clipboard.writeText(
    JSON.stringify({ version: 1, ...value }, null, 2),
  );
}

export async function pasteCharacterConfiguration(): Promise<void> {
  const raw = await navigator.clipboard.readText();
  const value = JSON.parse(raw) as Partial<CharacterSnapshot>;
  if (
    !value.selections ||
    typeof value.selections !== "object" ||
    typeof value.bodyType !== "string"
  ) {
    throw new Error("Clipboard does not contain a character configuration.");
  }
  recordSelectionHistory("Before paste");
  state.selections = cloneSelections(value.selections);
  state.bodyType = value.bodyType;
  if (value.metadata) state.characterMetadata = structuredClone(value.metadata);
  recordSelectionHistory("Pasted configuration");
  m.redraw();
}

export function duplicateCurrentCharacter(): void {
  recordSelectionHistory("Original character");
  state.characterMetadata = {
    ...structuredClone(state.characterMetadata),
    name: state.characterMetadata.name
      ? `${state.characterMetadata.name} (copy)`
      : "Character copy",
    savedAt: "",
    modifiedAt: new Date().toISOString(),
  };
  recordSelectionHistory("Duplicated character");
  m.redraw();
}

const APPEARANCE_GROUP =
  /^(body|head|heads|face|hair|eyes?|ears?|nose|mouth|beard|facial|skin)/i;
export function clearEquipment(): void {
  recordSelectionHistory("Before clearing equipment");
  state.selections = Object.fromEntries(
    Object.entries(state.selections).filter(([group]) =>
      APPEARANCE_GROUP.test(group),
    ),
  );
  recordSelectionHistory("Equipment cleared");
  m.redraw();
}
export function clearAppearanceSafely(): void {
  recordSelectionHistory("Before clearing appearance");
  // The body is retained because equipped LPC layers require its dimensions and animation layout.
  state.selections = Object.fromEntries(
    Object.entries(state.selections).filter(
      ([group]) => group === "body" || !APPEARANCE_GROUP.test(group),
    ),
  );
  recordSelectionHistory("Appearance cleared (required body retained)");
  m.redraw();
}
