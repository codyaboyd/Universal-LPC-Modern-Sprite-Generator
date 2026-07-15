// Main app component
import m from "mithril";
import { state, resetAll } from "../state/state.ts";
import { syncSelectionsToHash } from "../state/hash.ts";
import type { CatalogReader } from "../state/catalog.ts";
import { Download } from "./download/Download.ts";
import { FiltersPanel } from "./FiltersPanel.ts";
import { Credits } from "./download/Credits.ts";
import { AdvancedTools } from "./advanced/AdvancedTools.ts";
import { renderCharacter } from "../canvas/renderer.ts";
import { downloadAsPNG } from "../canvas/download.ts";
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
};

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
        renderCharacter(state.selections, state.bodyType).then(() => {
          // Trigger redraw to update preview canvas after offscreen render completes
          m.redraw();
        });
      }

      // Update tracked state
      vnode.state.prevSelections = currentSelections;
      vnode.state.prevBodyType = currentBodyType;
      vnode.state.prevCustomImage = currentCustomImage;
      vnode.state.prevCustomZPos = currentCustomZPos;
    }
  },
  view(vnode) {
    return m("div.rpg-creator", [
      m("div.creator-hero.mb-3", [
        m("span.creator-kicker", "Arcane atelier"),
        m("h2.h4.mb-1", "Forge your hero"),
        m(
          "p.mb-0",
          "Choose ancestry, gear, colors, and animation sheets without leaving the preview.",
        ),
      ]),
      m("div.creator-workbench", [
        m(
          "aside.creator-categories",
          { "aria-label": "Character customization categories" },
          [
            m(
              "div.creator-categories__scroller",
              [
                "Body",
                "Hair",
                "Face",
                "Torso",
                "Legs",
                "Feet",
                "Gear",
                "Weapons",
              ].map((label) =>
                m(
                  "a.creator-category-pill",
                  { href: "#category-tree-panel" },
                  label,
                ),
              ),
            ),
          ],
        ),
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
          ]),
          m(FiltersPanel, { catalog: vnode.attrs.catalog }),
          m("div.creator-advanced", [m(AdvancedTools)]),
        ]),
      ]),
      m(
        "section.creator-summary.app-panel.p-3.mt-3",
        { "aria-label": "Character credits and summary" },
        [m(Credits, { catalog: vnode.attrs.catalog })],
      ),
      interactionFeedback.toasts.length
        ? m(
            "div.rpg-feedback-toasts",
            { "aria-live": "polite", "aria-atomic": "false" },
            interactionFeedback.toasts.map((toast) =>
              m("div.rpg-feedback-toast", { key: toast.id, role: "status" }, [
                m("span.rpg-feedback-toast__icon", "✦"),
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
                  "aria-label": "Dismiss",
                  onclick: () => dismissToast(toast.id),
                }),
              ]),
            ),
          )
        : null,
      m(
        "div.creator-bottom-bar",
        { role: "toolbar", "aria-label": "Primary character actions" },
        [
          m(
            "button.btn.btn-outline-light",
            {
              type: "button",
              onclick: () => rerollVisibleChoices(vnode.attrs.catalog),
            },
            [m("i.bi.bi-dice-5.me-1"), "Randomize"],
          ),
          m(
            "button.btn.btn-outline-warning",
            { type: "button", onclick: resetAll },
            [m("i.bi.bi-arrow-counterclockwise.me-1"), "Reset"],
          ),
          m(
            "button.btn.btn-warning",
            {
              type: "button",
              onclick: () => downloadAsPNG("character-spritesheet.png"),
            },
            [m("i.bi.bi-download.me-1"), "Save PNG"],
          ),
          m(
            "button.btn.btn-dark",
            {
              type: "button",
              "data-bs-toggle": "offcanvas",
              "data-bs-target": "#exportSheet",
            },
            [m("i.bi.bi-box-arrow-up.me-1"), "Export"],
          ),
        ],
      ),
      m(
        "div.offcanvas.offcanvas-bottom.export-sheet",
        {
          id: "exportSheet",
          tabindex: "-1",
          "aria-labelledby": "exportSheetLabel",
        },
        [
          m("div.offcanvas-header", [
            m(
              "h2.h5.offcanvas-title",
              { id: "exportSheetLabel" },
              "Export your hero",
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
