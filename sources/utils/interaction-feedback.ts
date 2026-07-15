import m from "mithril";
import { state, type Selection } from "../state/state.ts";

type FeedbackAction = "equip" | "remove" | "replace";

type Toast = {
  id: string;
  message: string;
  action: FeedbackAction;
  undo?: () => void;
};

type SelectionSnapshot = Record<string, Selection>;

const timers = new Map<string, number>();

const cloneSelections = (): SelectionSnapshot =>
  Object.fromEntries(
    Object.entries(state.selections).map(([key, value]) => [key, { ...value }]),
  );

const regionFromGroup = (group: string): string => {
  const key = group.toLowerCase();
  if (/(head|hair|face|ear|eye|hat|helmet|beard)/.test(key)) return "head";
  if (/(leg|pants|skirt|tail)/.test(key)) return "legs";
  if (/(feet|shoe|boot)/.test(key)) return "feet";
  if (/(weapon|shield|hand|glove|wrist)/.test(key)) return "hands";
  return "torso";
};

export const interactionFeedback = {
  activeItemId: "",
  activeItemNonce: 0,
  flashRegion: "torso",
  flashNonce: 0,
  toasts: [] as Toast[],
};

function schedule(key: string, callback: () => void, delay: number): void {
  const existing = timers.get(key);
  if (existing) window.clearTimeout(existing);
  timers.set(
    key,
    window.setTimeout(() => {
      timers.delete(key);
      callback();
      m.redraw();
    }, delay),
  );
}

export function snapshotSelections(): SelectionSnapshot {
  return cloneSelections();
}

export function restoreSelections(snapshot: SelectionSnapshot): void {
  state.selections = cloneSelectionsFrom(snapshot);
  m.redraw();
}

function cloneSelectionsFrom(snapshot: SelectionSnapshot): SelectionSnapshot {
  return Object.fromEntries(
    Object.entries(snapshot).map(([key, value]) => [key, { ...value }]),
  );
}

export function emitInteractionFeedback(args: {
  action: FeedbackAction;
  itemId: string;
  itemName: string;
  selectionGroup: string;
  before?: SelectionSnapshot;
  undoable?: boolean;
}): void {
  const { action, itemId, itemName, selectionGroup, before, undoable } = args;
  interactionFeedback.activeItemId = itemId;
  interactionFeedback.activeItemNonce += 1;
  interactionFeedback.flashRegion = regionFromGroup(selectionGroup);
  interactionFeedback.flashNonce += 1;

  window.dispatchEvent(
    new CustomEvent("ulpc:item-interaction", {
      detail: { action, itemId, itemName, selectionGroup },
    }),
  );

  const verb =
    action === "equip"
      ? "Equipped"
      : action === "replace"
        ? "Replaced"
        : "Removed";
  const id = `selection:${selectionGroup}`;
  interactionFeedback.toasts = interactionFeedback.toasts.filter(
    (toast) => toast.id !== id,
  );
  interactionFeedback.toasts.push({
    id,
    action,
    message: `${verb} ${itemName}`,
    undo:
      undoable && before
        ? () => {
            restoreSelections(before);
            dismissToast(id);
          }
        : undefined,
  });
  interactionFeedback.toasts = interactionFeedback.toasts.slice(-3);

  schedule("active-item", () => (interactionFeedback.activeItemId = ""), 480);
  schedule(`toast:${id}`, () => dismissToast(id), 4200);
  m.redraw();
}

export function dismissToast(id: string): void {
  interactionFeedback.toasts = interactionFeedback.toasts.filter(
    (toast) => toast.id !== id,
  );
}
