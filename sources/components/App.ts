// Main app component
import m from "mithril";
import { state, resetAll, selectDefaults, selectItem } from "../state/state.ts";
import { getHash, syncSelectionsToHash } from "../state/hash.ts";
import type { CatalogReader, CategoryTreeNode } from "../state/catalog.ts";
import { Download } from "./download/Download.ts";
import { FiltersPanel } from "./FiltersPanel.ts";
import { Credits } from "./download/Credits.ts";
import { AdvancedTools } from "./advanced/AdvancedTools.ts";
import { RandomizerPanel } from "./RandomizerPanel.ts";
import { CharacterPresentation } from "./CharacterPresentation.ts";
import { PresetManager } from "./PresetManager.ts";
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
  guidedMode: boolean;
  guidedStep: number;
  characterName: string;
  prevPresentationFingerprint: string;
  saveConfirmationNonce: number;
};

const LAST_CATEGORY_KEY = "ulpc:last-rpg-category";
const GUIDED_SAVE_KEY = "ulpc:guided-last-character";

type GuidedStep = {
  key: string;
  label: string;
  icon: string;
  help: string;
  match: string[];
  action?: "colors" | "animations" | "save" | "export";
};

type SavedGuidedCharacter = {
  name: string;
  hash: string;
  savedAt: string;
};

const GUIDED_STEPS: GuidedStep[] = [
  {
    key: "body",
    label: "Choose a base body",
    icon: "bi-person",
    help: "Pick the body type and starting silhouette for your adventurer.",
    match: ["body"],
  },
  {
    key: "appearance",
    label: "Choose physical appearance",
    icon: "bi-palette",
    help: "Set skin, head, ears, eyes, and expression options supported by the catalog.",
    match: ["heads", "body", "ears", "eyes", "face", "lizard"],
  },
  {
    key: "hair",
    label: "Choose hair and facial features",
    icon: "bi-brush",
    help: "Style hair, beards, mustaches, brows, and other face details.",
    match: ["hair", "beard", "mustache", "eyebrow", "nose"],
  },
  {
    key: "clothing",
    label: "Choose clothing",
    icon: "bi-person-vcard",
    help: "Dress the hero with shirts, pants, skirts, shoes, cloaks, and hats.",
    match: [
      "shirt",
      "dress",
      "vest",
      "jacket",
      "pants",
      "shorts",
      "skirt",
      "shoe",
      "boot",
      "cloak",
      "cape",
      "hat",
      "headwear",
    ],
  },
  {
    key: "armor",
    label: "Choose armor",
    icon: "bi-shield-shaded",
    help: "Layer on armor, helmets, shields, and other defensive pieces.",
    match: ["armor", "armour", "helmet", "shield"],
  },
  {
    key: "weapons",
    label: "Choose weapons",
    icon: "bi-magic",
    help: "Equip melee, ranged, polearm, blunt, and magic weapon options.",
    match: ["sword", "weapon", "ranged", "bow", "polearm", "blunt", "magic"],
  },
  {
    key: "accessories",
    label: "Choose accessories",
    icon: "bi-gem",
    help: "Add bags, jewelry, wings, tails, prostheses, masks, or special flair.",
    match: [
      "accessory",
      "accessories",
      "backpack",
      "neck",
      "wings",
      "tails",
      "prostheses",
      "mask",
      "glasses",
      "earring",
      "crown",
    ],
  },
  {
    key: "colors",
    label: "Choose colors",
    icon: "bi-eyedropper",
    help: "Fine tune palettes, recolors, and matching body-color behavior.",
    match: ["body", "hair", "cloth", "metal"],
    action: "colors",
  },
  {
    key: "animations",
    label: "Preview animations",
    icon: "bi-play-circle",
    help: "Try the animation preview before exporting your sheet.",
    match: [],
    action: "animations",
  },
  {
    key: "save",
    label: "Name and save",
    icon: "bi-bookmark-heart",
    help: "Record a character name and save the current setup locally.",
    match: [],
    action: "save",
  },
  {
    key: "export",
    label: "Export",
    icon: "bi-box-arrow-up",
    help: "Open the export panel for spritesheets, ZIPs, and project files.",
    match: [],
    action: "export",
  },
];

function nodeMatchesStep(node: CategoryTreeNode, step: GuidedStep): boolean {
  const text = JSON.stringify(node).toLowerCase();
  return step.match.some((needle) => text.includes(needle));
}

function isStepSupported(step: GuidedStep, catalog: CatalogReader): boolean {
  if (step.action) return true;
  const tree = catalog.getCategoryTree().unwrapOr(null);
  if (!tree) return false;
  const visit = (node: CategoryTreeNode): boolean =>
    nodeMatchesStep(node, step) ||
    Object.values(node.children ?? {}).some((child) => visit(child));
  return visit(tree);
}

function supportedGuidedSteps(catalog: CatalogReader): GuidedStep[] {
  return GUIDED_STEPS.filter((step) => isStepSupported(step, catalog));
}

function loadSavedGuidedCharacter(): SavedGuidedCharacter | null {
  try {
    const raw = localStorage.getItem(GUIDED_SAVE_KEY);
    return raw ? (JSON.parse(raw) as SavedGuidedCharacter) : null;
  } catch {
    return null;
  }
}

function saveGuidedCharacter(name: string, local?: AppState): void {
  localStorage.setItem(
    GUIDED_SAVE_KEY,
    JSON.stringify({
      name: name || "Nameless Hero",
      hash: getHash(),
      savedAt: new Date().toISOString(),
    }),
  );
  if (local) local.saveConfirmationNonce += 1;
}

async function startBlank(): Promise<void> {
  state.selections = {};
  await selectDefaults();
}

function stepToCategoryKey(step: GuidedStep): string | null {
  if (step.key === "appearance") return "skin";
  if (step.key === "clothing") return "torso";
  if (step.key === "weapons") return "main-hand";
  return step.key;
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

function randomHero(catalog: CatalogReader): void {
  const tree = catalog.getCategoryTree().unwrapOr(null);
  if (!tree) return;
  const items: string[] = [];
  const walk = (node: CategoryTreeNode) => {
    items.push(...(node.items ?? []));
    Object.values(node.children ?? {}).forEach(walk);
  };
  walk(tree);
  const byGroup = new Map<string, string[]>();
  for (const itemId of items) {
    const lite = catalog.getItemLite(itemId).unwrapOr(null);
    if (!lite?.required.includes(state.bodyType)) continue;
    const group = lite.type_name || itemId;
    const bucket = byGroup.get(group) ?? [];
    bucket.push(itemId);
    byGroup.set(group, bucket);
  }
  for (const groupItems of byGroup.values()) {
    if (Math.random() > 0.3) continue;
    const itemId = groupItems[Math.floor(Math.random() * groupItems.length)];
    const meta = itemId ? catalog.getItemMerged(itemId).unwrapOr(null) : null;
    if (!itemId || !meta) continue;
    const choices = meta.variants?.length
      ? meta.variants
      : (meta.recolors?.[0]?.variants ?? [""]);
    selectItem(
      itemId,
      choices[Math.floor(Math.random() * choices.length)] ?? "",
    );
  }
  syncSelectionsToHash(catalog);
  void renderCharacter(state.selections, state.bodyType).then(() => m.redraw());
}

function renderGuidedWorkflow(catalog: CatalogReader, local: AppState) {
  const steps = supportedGuidedSteps(catalog);
  local.guidedStep = Math.min(
    local.guidedStep ?? 0,
    Math.max(steps.length - 1, 0),
  );
  const active = steps[local.guidedStep];
  const progress = steps.length
    ? Math.round(((local.guidedStep + 1) / steps.length) * 100)
    : 0;
  const saved = loadSavedGuidedCharacter();
  const gotoStep = (index: number) => {
    local.guidedStep = Math.max(0, Math.min(index, steps.length - 1));
    const key = active ? stepToCategoryKey(steps[local.guidedStep]!) : null;
    if (key) {
      sessionStorage.setItem(LAST_CATEGORY_KEY, key);
      window.dispatchEvent(
        new CustomEvent("ulpc:guided-category", { detail: key }),
      );
    }
  };

  return m(
    "section.guided-workflow.app-panel.p-3.mb-3",
    { "aria-label": "Guided character creation" },
    [
      m(
        "div.d-flex.flex-wrap.justify-content-between.align-items-start.gap-2.mb-3",
        [
          m("div", [
            m("span.creator-kicker", "New adventurer path"),
            m("h3.h5.mb-1", "Guided hero creation"),
            m(
              "p.small.mb-0.text-muted",
              "An optional RPG setup sequence layered over the full creator.",
            ),
          ]),
          m("div.d-flex.flex-wrap.gap-2", [
            m(
              "button.btn.btn-warning.btn-sm",
              {
                type: "button",
                onclick: () => {
                  local.guidedMode = true;
                  void startBlank();
                },
              },
              [m("i.bi.bi-lightning-charge.me-1"), "Quick Create"],
            ),
            m(
              "button.btn.btn-outline-dark.btn-sm",
              { type: "button", onclick: () => randomHero(catalog) },
              [m("i.bi.bi-dice-5.me-1"), "Start from Random Hero"],
            ),
            m(
              "button.btn.btn-outline-dark.btn-sm",
              { type: "button", onclick: startBlank },
              "Start Blank",
            ),
            saved
              ? m(
                  "button.btn.btn-outline-success.btn-sm",
                  {
                    type: "button",
                    onclick: () => {
                      window.location.hash = saved.hash;
                      window.location.reload();
                    },
                  },
                  `Resume ${saved.name}`,
                )
              : null,
            m(
              "button.btn.btn-link.btn-sm",
              { type: "button", onclick: () => (local.guidedMode = false) },
              "Advanced mode",
            ),
          ]),
        ],
      ),
      local.guidedMode && active
        ? [
            m(
              "div.progress.mb-2",
              {
                role: "progressbar",
                "aria-label": "Guided creation progress",
                "aria-valuenow": progress,
                "aria-valuemin": 0,
                "aria-valuemax": 100,
              },
              m(
                "div.progress-bar.progress-bar-striped.bg-warning.text-dark",
                { style: { width: `${progress}%` } },
                `${progress}%`,
              ),
            ),
            m(
              "ul.nav.nav-pills.guided-steps.flex-nowrap.overflow-auto.mb-3",
              steps.map((step, index) =>
                m(
                  "li.nav-item",
                  { key: step.key },
                  m(
                    "button.nav-link.text-nowrap",
                    {
                      class: index === local.guidedStep ? "active" : "",
                      type: "button",
                      onclick: () => gotoStep(index),
                    },
                    [
                      m(`i.bi.${step.icon}.me-1`),
                      `${index + 1}. ${step.label}`,
                    ],
                  ),
                ),
              ),
            ),
            m("div.guided-card.card", [
              m("div.card-body", [
                m("h4.h6", [m(`i.bi.${active.icon}.me-2`), active.label]),
                m("p.mb-3", active.help),
                active.action === "save"
                  ? m("div.input-group.mb-3", [
                      m("span.input-group-text", "Hero name"),
                      m("input.form-control", {
                        value: local.characterName,
                        placeholder: "Ser Rowan",
                        oninput: (e: Event) =>
                          (local.characterName = (
                            e.target as HTMLInputElement
                          ).value),
                      }),
                      m(
                        "button.btn.btn-success",
                        {
                          type: "button",
                          onclick: () =>
                            saveGuidedCharacter(local.characterName, local),
                        },
                        "Save",
                      ),
                    ])
                  : null,
                active.action === "save" && local.saveConfirmationNonce > 0
                  ? m(
                      "div.alert.alert-success.py-2.rpg-anim-scale-in",
                      {
                        key: `save-${local.saveConfirmationNonce}`,
                        role: "status",
                      },
                      "Saved to this browser.",
                    )
                  : null,
                active.action === "animations"
                  ? m(
                      "a.btn.btn-outline-primary",
                      { href: "#preview-column" },
                      "View animation preview",
                    )
                  : null,
                active.action === "export"
                  ? m(
                      "button.btn.btn-warning",
                      {
                        type: "button",
                        "data-bs-toggle": "offcanvas",
                        "data-bs-target": "#exportSheet",
                      },
                      "Open export panel",
                    )
                  : null,
              ]),
            ]),
            m("div.guided-nav.d-grid.d-sm-flex.gap-2 mt-3", [
              m(
                "button.btn.btn-outline-dark",
                {
                  type: "button",
                  disabled: local.guidedStep === 0,
                  onclick: () => gotoStep(local.guidedStep - 1),
                },
                "Back",
              ),
              m(
                "button.btn.btn-outline-secondary",
                {
                  type: "button",
                  onclick: () => gotoStep(local.guidedStep + 1),
                },
                "Skip",
              ),
              m(
                "button.btn.btn-dark",
                {
                  type: "button",
                  disabled: local.guidedStep >= steps.length - 1,
                  onclick: () => gotoStep(local.guidedStep + 1),
                },
                "Next",
              ),
              m(
                "button.btn.btn-link.ms-sm-auto",
                { type: "button", onclick: () => (local.guidedMode = false) },
                "Exit to advanced mode",
              ),
            ]),
          ]
        : null,
    ],
  );
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
    vnode.state.guidedMode = true;
    vnode.state.guidedStep = 0;
    vnode.state.characterName = loadSavedGuidedCharacter()?.name ?? "";
    vnode.state.prevPresentationFingerprint = `${vnode.state.prevSelections}:${vnode.state.prevBodyType}`;
    vnode.state.saveConfirmationNonce = 0;
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
    }
  },
  view(vnode) {
    return m("div.rpg-creator", [
      m("div.creator-hero.mb-3", [
        m("span.creator-kicker", "Arcane atelier"),
        m("h2.h4.mb-1", "Forge your hero"),
        m(
          "p.mb-0",
          "Choose technical asset-compatible bases, gear, colors, and animation sheets without leaving the preview.",
        ),
      ]),
      renderGuidedWorkflow(vnode.attrs.catalog, vnode.state),
      m(RandomizerPanel, { catalog: vnode.attrs.catalog }),
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
          m(CharacterPresentation),
          m(PresetManager, { catalog: vnode.attrs.catalog }),
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
