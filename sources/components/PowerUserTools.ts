import m from "mithril";
import { state } from "../state/state.ts";
import {
  canRedo,
  canUndo,
  clearAppearanceSafely,
  clearEquipment,
  copyCharacterConfiguration,
  currentHistoryIndex,
  duplicateCurrentCharacter,
  pasteCharacterConfiguration,
  redoSelections,
  restoreHistoryEntry,
  selectionHistory,
  undoSelections,
} from "../state/power-user.ts";
import { CollapsibleSection } from "./CollapsibleSection.ts";

const shortcutRows = [
  ["Ctrl/⌘ Z", "Undo"],
  ["Ctrl/⌘ Shift Z or Ctrl Y", "Redo"],
  ["Ctrl/⌘ S", "Save PNG"],
  ["R", "Randomize"],
  ["Space", "Play / pause animation"],
  [", / .", "Previous / next frame"],
  ["+ / −", "Zoom in / out"],
  ["0", "Fit preview"],
  ["/", "Open search"],
  ["E", "Open export"],
  ["?", "Shortcut help"],
  ["Escape", "Close overlays"],
];

export const ShortcutHelpModal: m.Component = {
  view() {
    if (!state.showShortcutHelp) return null;
    return m(
      "div.modal.show.d-block",
      {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "shortcut-help-title",
        onclick: (e: MouseEvent) => {
          if (e.target === e.currentTarget) state.showShortcutHelp = false;
        },
      },
      m(
        "div.modal-dialog.modal-dialog-centered",
        m("div.modal-content", [
          m("div.modal-header", [
            m(
              "h2.h5.modal-title",
              { id: "shortcut-help-title" },
              "Keyboard shortcuts",
            ),
            m("button.btn-close", {
              type: "button",
              "aria-label": "Close",
              onclick: () => (state.showShortcutHelp = false),
            }),
          ]),
          m("div.modal-body", [
            m(
              "p.small.text-muted",
              "Shortcuts are disabled while you type in a field.",
            ),
            m(
              "dl.shortcut-list",
              shortcutRows.flatMap(([key, action]) => [
                m("dt", m("kbd", key)),
                m("dd", action),
              ]),
            ),
          ]),
        ]),
      ),
    );
  },
};

export const PowerUserTools: m.Component = {
  view() {
    const notifyError = (error: unknown) =>
      window.alert(error instanceof Error ? error.message : String(error));
    return m(
      CollapsibleSection,
      { title: "Power-user tools", defaultOpen: false },
      [
        m(
          "p.help",
          "Optional workflow tools. Your normal character-building controls work exactly as before.",
        ),
        m("div.buttons.are-small", [
          m(
            "button.button",
            { disabled: !canUndo(), onclick: undoSelections },
            "Undo",
          ),
          m(
            "button.button",
            { disabled: !canRedo(), onclick: redoSelections },
            "Redo",
          ),
          m(
            "button.button",
            {
              onclick: () =>
                void copyCharacterConfiguration().catch(notifyError),
            },
            "Copy configuration",
          ),
          m(
            "button.button",
            {
              onclick: () =>
                void pasteCharacterConfiguration().catch(notifyError),
            },
            "Paste configuration",
          ),
          m(
            "button.button",
            { onclick: duplicateCurrentCharacter },
            "Duplicate character",
          ),
          m(
            "button.button",
            {
              onclick: () => {
                for (const key of Object.keys(state.selections))
                  state.randomizerLocks.choices[key] = true;
              },
            },
            "Lock equipped",
          ),
          m(
            "button.button",
            {
              onclick: () => {
                state.randomizerLocks.categories = {};
                state.randomizerLocks.choices = {};
              },
            },
            "Unlock all",
          ),
          m("button.button", { onclick: clearEquipment }, "Clear equipment"),
          m(
            "button.button",
            {
              onclick: clearAppearanceSafely,
              title: "Keeps the required body base for sprite compatibility",
            },
            "Clear appearance safely",
          ),
          m(
            "button.button",
            { onclick: () => (state.showShortcutHelp = true) },
            "Keyboard shortcuts",
          ),
        ]),
        selectionHistory.length > 1
          ? m("details.mt-2", [
              m("summary", `Selection history (${selectionHistory.length})`),
              m(
                "ol.power-history",
                selectionHistory.map((entry, index) =>
                  m("li", [
                    m(
                      "button.button.is-ghost.is-small",
                      {
                        disabled: index === currentHistoryIndex(),
                        onclick: () => restoreHistoryEntry(index),
                      },
                      `${entry.label} · ${new Date(entry.createdAt).toLocaleTimeString()}`,
                    ),
                  ]),
                ),
              ),
            ])
          : null,
      ],
    );
  },
};
