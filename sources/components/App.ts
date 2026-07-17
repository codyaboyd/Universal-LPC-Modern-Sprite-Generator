// Main app component
import m from "mithril";
import { state } from "../state/state.ts";
import { syncSelectionsToHash } from "../state/hash.ts";
import type { CatalogReader } from "../state/catalog.ts";
import { Download } from "./download/Download.ts";
import { FiltersPanel } from "./FiltersPanel.ts";
import { ShortcutHelpModal } from "./PowerUserTools.ts";
import {
  recordSelectionHistory,
  redoSelections,
  undoSelections,
} from "../state/power-user.ts";
import { RandomizerPanel } from "./RandomizerPanel.ts";
import { CharacterPresentation } from "./CharacterPresentation.ts";
import { PresetManager } from "./PresetManager.ts";
import { openContextHelp } from "./OnboardingHelp.ts";
import { renderCharacter } from "../canvas/renderer.ts";
import { downloadAsPNG } from "../canvas/download.ts";
import {
  dismissAutosaveRecovery,
  resilienceState,
  writeAutosave,
  reportUserError,
} from "../resilience.ts";
import {
  dismissToast,
  interactionFeedback,
} from "../utils/interaction-feedback.ts";

/**
 * App is the composition root for catalog DI. main.ts mounts it with the
 * `defaultCatalog` instance; App threads catalog down to children that have
 * migrated to receive it via attrs. Children that still import from
 * `state/catalog.ts` directly are unaffected — they read the same
 * `defaultCatalog` state under the hood.
 */
type AppAttrs = { catalog: CatalogReader };

type AppState = {
  prevSelections: string;
  prevBodyType: string;
  prevCustomImage: HTMLImageElement | null;
  prevCustomZPos: number;
  prevPresentationFingerprint: string;
  shortcutHandler: (event: KeyboardEvent) => void;
};

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element?.closest(
    "input, textarea, select, [contenteditable='true']",
  );
}

function previewCommand(detail: string): void {
  window.dispatchEvent(new CustomEvent("preview-command", { detail }));
}

function rerollVisibleChoices(catalog: CatalogReader): void {
  for (const selection of Object.values(state.selections)) {
    const meta = catalog.getItemMerged(selection.itemId);
    if (!meta || meta.isErr()) continue;
    const item = meta.value;
    if (item.variants?.length) {
      selection.variant =
        item.variants[Math.floor(Math.random() * item.variants.length)] ?? "";
    }
    if (item.recolors?.length) {
      const recolor =
        item.recolors[Math.floor(Math.random() * item.recolors.length)];
      const paletteKeys = recolor ? Object.keys(recolor.palettes ?? {}) : [];
      selection.recolor =
        paletteKeys[Math.floor(Math.random() * paletteKeys.length)] ??
        selection.recolor ??
        "";
    }
  }
  syncSelectionsToHash(catalog);
  void renderCharacter(state.selections, state.bodyType).then(() => m.redraw());
}

function selectedCount(): number {
  return Object.keys(state.selections).length;
}

export const App: m.Component<AppAttrs, AppState> = {
  oninit(vnode) {
    // Track previous state to detect changes
    vnode.state.prevSelections = JSON.stringify(state.selections);
    vnode.state.prevBodyType = state.bodyType;
    vnode.state.prevCustomImage = state.customUploadedImage;
    vnode.state.prevCustomZPos = state.customImageZPos;
    vnode.state.prevPresentationFingerprint = `${vnode.state.prevSelections}:${vnode.state.prevBodyType}`;
    recordSelectionHistory("Starting character");
    vnode.state.shortcutHandler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      let handled = true;
      if (modifier && key === "z" && event.shiftKey) redoSelections();
      else if (modifier && key === "z") undoSelections();
      else if (modifier && key === "y") redoSelections();
      else if (modifier && key === "s")
        void downloadAsPNG("character-spritesheet.png");
      else if (!modifier && key === "r")
        rerollVisibleChoices(vnode.attrs.catalog);
      else if (!modifier && event.key === " ") previewCommand("toggle");
      else if (!modifier && event.key === ",") previewCommand("previous");
      else if (!modifier && event.key === ".") previewCommand("next");
      else if (!modifier && (event.key === "+" || event.key === "="))
        previewCommand("zoom-in");
      else if (!modifier && event.key === "-") previewCommand("zoom-out");
      else if (!modifier && event.key === "0") previewCommand("fit");
      else if (!modifier && event.key === "/")
        (
          document.querySelector(
            "input[type='search']",
          ) as HTMLInputElement | null
        )?.focus();
      else if (!modifier && key === "e")
        (
          document.querySelector(
            "[data-bs-target='#exportSheet']",
          ) as HTMLButtonElement | null
        )?.click();
      else if (!modifier && event.key === "?") state.showShortcutHelp = true;
      else if (event.key === "Escape" && state.showShortcutHelp)
        state.showShortcutHelp = false;
      else handled = false;
      if (handled) {
        event.preventDefault();
        m.redraw();
      }
    };
    window.addEventListener("keydown", vnode.state.shortcutHandler);
  },
  onremove(vnode) {
    window.removeEventListener("keydown", vnode.state.shortcutHandler);
  },
  onupdate(vnode) {
    // Only sync hash and render canvas if selections, bodyType, or custom image changed
    const currentSelections = JSON.stringify(state.selections);
    const currentBodyType = state.bodyType;
    const currentCustomImage = state.customUploadedImage;
    const currentCustomZPos = state.customImageZPos;

    if (
      currentSelections !== vnode.state.prevSelections ||
      currentBodyType !== vnode.state.prevBodyType ||
      currentCustomImage !== vnode.state.prevCustomImage ||
      currentCustomZPos !== vnode.state.prevCustomZPos
    ) {
      syncSelectionsToHash(vnode.attrs.catalog);
      if (window.canvasRenderer) {
        // Render to offscreen canvas (async)
        renderCharacter(state.selections, state.bodyType)
          .then(() => {
            // Trigger redraw to update preview canvas after offscreen render completes
            m.redraw();
          })
          .catch((error) => {
            reportUserError(
              "Rendering failed. Missing layers were skipped and your selections were kept.",
              error,
            );
            m.redraw();
          });
      }

      const presentationFingerprint = `${currentSelections}:${currentBodyType}`;
      if (presentationFingerprint !== vnode.state.prevPresentationFingerprint) {
        state.characterMetadata.modifiedAt = new Date().toISOString();
        vnode.state.prevPresentationFingerprint = presentationFingerprint;
      }

      // Update tracked state
      vnode.state.prevSelections = currentSelections;
      vnode.state.prevBodyType = currentBodyType;
      vnode.state.prevCustomImage = currentCustomImage;
      vnode.state.prevCustomZPos = currentCustomZPos;
      recordSelectionHistory("Selection changed");
      writeAutosave();
    }
  },
  view(vnode) {
    return m("div.rpg-creator", [
      m("div.creator-hero.mb-3", [
        m("div", [
          m("span.creator-kicker", "Arcane atelier"),
          m("h2.h4.mb-1", "Forge your hero"),
          m(
            "p.mb-0",
            "Choose technical asset-compatible bases, gear, colors, and animation sheets without leaving the preview.",
          ),
        ]),
        m(
          "button.btn.btn-warning.creator-hero__export",
          {
            id: "export-actions",
            type: "button",
            "data-bs-toggle": "offcanvas",
            "data-bs-target": "#exportSheet",
          },
          [
            m("i.bi.bi-box-arrow-up.me-2", { "aria-hidden": "true" }),
            "Export hero",
          ],
        ),
      ]),
      m(
        "nav.creator-journey.mb-3",
        { "aria-label": "Character creation progress" },
        [
          ["1", "Start", "#character-library", "bi-folder2-open"],
          ["2", "Base", "#customize-character", "bi-person"],
          ["3", "Customize", "#customize-character", "bi-palette"],
          ["4", "Equip", "#category-tree-panel", "bi-shield"],
          ["5", "Preview", "#preview-stage-title", "bi-play-circle"],
          ["6", "Save", "#character-details", "bi-save"],
          ["7", "Export", "#export-actions", "bi-box-arrow-up"],
        ].map(([number, label, href, icon]) =>
          m("a.creator-journey__step", { href }, [
            m("span.creator-journey__number", number),
            m(`i.bi.${icon}`, { "aria-hidden": "true" }),
            m("span", label),
          ]),
        ),
      ),
      m(RandomizerPanel, { catalog: vnode.attrs.catalog }),
      m("div", { id: "character-library" }, [
        m(PresetManager, { catalog: vnode.attrs.catalog }),
      ]),
      m("div.creator-workbench", [
        m("section.creator-tools", { "aria-label": "Customizer tools" }, [
          m("div.creator-tools__header", [
            m("div", [
              m("h3.h5.mb-1", "Customize"),
              m("p.small.mb-0", `${selectedCount()} layers selected`),
            ]),
            m(
              "button.btn.btn-outline-warning.btn-sm",
              {
                type: "button",
                onclick: () => rerollVisibleChoices(vnode.attrs.catalog),
              },
              [
                m("i.bi.bi-shuffle.me-1", { "aria-hidden": "true" }),
                "Randomize colors",
              ],
            ),
            m(
              "button.btn.btn-link.btn-sm",
              {
                type: "button",
                "aria-label": "Help with compatibility and equipping items",
                onclick: () => openContextHelp("compatibility equip remove"),
              },
              [
                m("i.bi.bi-question-circle.me-1", { "aria-hidden": "true" }),
                "How items work",
              ],
            ),
          ]),
          m(FiltersPanel, { catalog: vnode.attrs.catalog }),
          m(CharacterPresentation),
        ]),
      ]),
      resilienceState.recoveredAutosave
        ? m("div.alert.alert-info", [
            resilienceState.lastRecoveryMessage,
            m(
              "button.btn.btn-sm.btn-link",
              {
                type: "button",
                onclick: () => {
                  dismissAutosaveRecovery();
                  m.redraw();
                },
              },
              "Dismiss",
            ),
          ])
        : null,
      m(ShortcutHelpModal),
      interactionFeedback.toasts.length
        ? m(
            "div.rpg-feedback-toasts",
            {
              "aria-live": "polite",
              "aria-atomic": "true",
              "aria-relevant": "additions",
            },
            interactionFeedback.toasts.map((toast) =>
              m("div.rpg-feedback-toast", { key: toast.id, role: "status" }, [
                m(
                  "span.rpg-feedback-toast__icon",
                  { "aria-hidden": "true" },
                  "✦",
                ),
                m("span.rpg-feedback-toast__message", toast.message),
                toast.undo
                  ? m(
                      "button.btn btn-sm btn-link rpg-feedback-toast__undo",
                      { type: "button", onclick: toast.undo },
                      "Undo",
                    )
                  : null,
                m("button.btn-close btn-close-white", {
                  type: "button",
                  "aria-label": `Dismiss notification: ${toast.message}`,
                  onclick: () => dismissToast(toast.id),
                }),
              ]),
            ),
          )
        : null,
      m(
        "div.offcanvas.offcanvas-bottom.export-sheet",
        {
          id: "exportSheet",
          tabindex: "-1",
          "aria-labelledby": "exportSheetLabel",
          "aria-describedby": "exportSheetDescription",
        },
        [
          m("div.offcanvas-header", [
            m(
              "h2.h5.offcanvas-title",
              { id: "exportSheetLabel" },
              "Export your hero",
            ),
            m(
              "p.sr-only",
              { id: "exportSheetDescription" },
              "Export options open in a bottom sheet. Focus remains inside until the sheet is closed.",
            ),
            m("button.btn-close", {
              type: "button",
              "data-bs-dismiss": "offcanvas",
              "aria-label": "Close",
            }),
          ]),
          m("div.offcanvas-body", [
            m(Download, { catalog: vnode.attrs.catalog }),
          ]),
        ],
      ),
    ]);
  },
};
