import m from "mithril";
import { renderCharacter } from "../canvas/renderer.ts";
import type { CatalogReader } from "../state/catalog.ts";
import { getHashParams } from "../state/hash.ts";
import { state } from "../state/state.ts";
import { syncSelectionsToHash } from "../state/hash.ts";
import {
  createSeed,
  randomizeCharacter,
  RANDOMIZER_MODES,
  restoreRandomizerSnapshot,
  snapshotRandomizer,
  type RandomizerLockState,
  type RandomizerMode,
  type RandomizerSnapshot,
} from "../state/randomizer.ts";

type Attrs = { catalog: CatalogReader };
type Local = {
  mode: RandomizerMode;
  seed: string;
  locks: RandomizerLockState;
  undo: RandomizerSnapshot | null;
  summoning: boolean;
};

function currentSeed(): string {
  return getHashParams().randomSeed || createSeed();
}

function renderAfter(catalog: CatalogReader): void {
  syncSelectionsToHash(catalog);
  void renderCharacter(state.selections, state.bodyType).then(() => m.redraw());
}

function selectedGroups(): string[] {
  return Object.keys(state.selections).sort((a, b) => a.localeCompare(b));
}

export const RandomizerPanel: m.Component<Attrs, Local> = {
  oninit(vnode) {
    vnode.state.mode = "hero";
    vnode.state.seed = currentSeed();
    vnode.state.locks = { categories: {}, choices: {} };
    vnode.state.undo = null;
    vnode.state.summoning = false;
  },
  view(vnode) {
    const local = vnode.state;
    const generate = () => {
      local.undo = snapshotRandomizer(local.seed);
      local.summoning = true;
      window.setTimeout(() => {
        local.summoning = false;
        m.redraw();
      }, 650);
      randomizeCharacter({
        catalog: vnode.attrs.catalog,
        mode: local.mode,
        seed: local.seed || createSeed(),
        locks: local.locks,
      });
      renderAfter(vnode.attrs.catalog);
    };

    return m(
      "section.randomizer-panel.app-panel.p-3.mb-3",
      { "aria-label": "RPG randomizer" },
      [
        local.summoning
          ? m("div.randomizer-summon", { "aria-hidden": "true" }, [
              m("span"),
              m("span"),
              m("span"),
            ])
          : null,
        m(
          "div.d-flex.flex-wrap.justify-content-between.align-items-start.gap-3",
          [
            m("div", [
              m("span.creator-kicker", "Hero summoning circle"),
              m("h3.h5.mb-1", "Robust RPG randomizer"),
              m(
                "p.small.text-muted.mb-0",
                "Catalog-aware rolls avoid incompatible bodies, hidden layers, and conflicting item groups.",
              ),
            ]),
            m("div.d-flex.flex-wrap.gap-2", [
              m(
                "button.btn.btn-warning",
                { type: "button", onclick: generate },
                [m("i.bi.bi-stars.me-1"), "Summon random hero"],
              ),
              m(
                "button.btn.btn-outline-dark",
                {
                  type: "button",
                  disabled: !local.undo,
                  onclick: () => {
                    if (!local.undo) return;
                    restoreRandomizerSnapshot(local.undo);
                    local.seed = local.undo.seed;
                    local.undo = null;
                    renderAfter(vnode.attrs.catalog);
                  },
                },
                [m("i.bi.bi-arrow-counterclockwise.me-1"), "Undo"],
              ),
            ]),
          ],
        ),
        m("div.row.g-2.mt-3", [
          m("div.col-12.col-lg-4", [
            m("label.form-label", "Randomization mode"),
            m(
              "select.form-select",
              {
                value: local.mode,
                onchange: (e: Event) =>
                  (local.mode = (e.target as HTMLSelectElement)
                    .value as RandomizerMode),
              },
              RANDOMIZER_MODES.map((mode) =>
                m("option", { value: mode.value }, mode.label),
              ),
            ),
            m(
              "p.form-text",
              RANDOMIZER_MODES.find((mode) => mode.value === local.mode)
                ?.description,
            ),
          ]),
          m("div.col-12.col-lg-5", [
            m("label.form-label", "Seed"),
            m("div.input-group", [
              m("input.form-control", {
                value: local.seed,
                oninput: (e: Event) =>
                  (local.seed = (e.target as HTMLInputElement).value),
                "aria-label": "Randomizer seed",
              }),
              m(
                "button.btn.btn-outline-secondary",
                { type: "button", onclick: () => (local.seed = createSeed()) },
                "New",
              ),
              m(
                "button.btn.btn-outline-secondary",
                {
                  type: "button",
                  onclick: () =>
                    navigator.clipboard?.writeText(window.location.href),
                },
                "Copy link",
              ),
            ]),
            m(
              "p.form-text",
              "Use the same seed and mode to reproduce or share a roll.",
            ),
          ]),
          m("div.col-12.col-lg-3", [
            m("label.form-label", "Category locks"),
            m(
              "div.randomizer-lock-grid",
              [
                "body",
                "heads",
                "face",
                "hair",
                "torso",
                "legs",
                "feet",
                "weapon",
                "shield",
              ].map((group) =>
                m("label.form-check small", [
                  m("input.form-check-input", {
                    type: "checkbox",
                    checked: !!local.locks.categories[group],
                    onchange: (e: Event) =>
                      (local.locks.categories[group] = (
                        e.target as HTMLInputElement
                      ).checked),
                  }),
                  m("span.form-check-label", group),
                ]),
              ),
            ),
          ]),
        ]),
        selectedGroups().length
          ? m("details.mt-3", [
              m("summary.small", "Lock individual current choices"),
              m(
                "div.randomizer-choice-locks.mt-2",
                selectedGroups().map((group) =>
                  m("label.form-check form-check-inline small", [
                    m("input.form-check-input", {
                      type: "checkbox",
                      checked: !!local.locks.choices[group],
                      onchange: (e: Event) =>
                        (local.locks.choices[group] = (
                          e.target as HTMLInputElement
                        ).checked),
                    }),
                    m(
                      "span.form-check-label",
                      `${group}: ${state.selections[group]?.name ?? state.selections[group]?.itemId}`,
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
