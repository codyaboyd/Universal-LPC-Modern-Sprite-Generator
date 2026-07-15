import m from "mithril";
import classNames from "classnames";
import { Result } from "neverthrow";
import { drawRecolorPreview } from "../../canvas/palette-recolor.ts";
import type {
  CatalogReader,
  ItemMerged,
  PaletteMetadata,
  LoadError,
} from "../../state/catalog.ts";
import { renderResult } from "../../utils/render-result.ts";
import { state, getSelectionGroup } from "../../state/state.ts";
import { ucwords } from "../../utils/helpers.ts";
import { COMPACT_FRAME_SIZE, FRAME_SIZE } from "../../state/constants.ts";
import {
  compilePaletteKey,
  CUSTOM_KEY,
  CUSTOM_VERSION,
  type PaletteOption,
} from "../../state/palettes.ts";

type RootViewState = {
  palettePreviewGateSeq?: number;
  _palettePreviewLastTotal?: number;
  palettePreviewExpected?: number;
  palettePreviewCompleted?: number;
};

/**
 * Minimal slice of the parent vnode the modal reads/mutates. Using `{ state }`
 * rather than `m.Vnode<...>` sidesteps Mithril's invariant Vnode generic when
 * the parent's full state is wider than `RootViewState`.
 */
type RootViewRef = { state: RootViewState };

const RECENT_COLORS_KEY = "ulpc.paletteEditor.recentColors";
const FAVORITE_COLORS_KEY = "ulpc.paletteEditor.favoriteColors";

type StoredColor = { key: string; label: string; colors: string[] };

function storageAvailable(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function readStoredColors(storageKey: string): StoredColor[] {
  if (!storageAvailable()) return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is StoredColor => {
      return (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as StoredColor).key === "string" &&
        typeof (entry as StoredColor).label === "string" &&
        Array.isArray((entry as StoredColor).colors)
      );
    });
  } catch {
    return [];
  }
}

function writeStoredColors(storageKey: string, colors: StoredColor[]): void {
  if (!storageAvailable()) return;
  window.localStorage.setItem(storageKey, JSON.stringify(colors.slice(0, 12)));
}

function rememberRecentColor(color: StoredColor): void {
  const recent = readStoredColors(RECENT_COLORS_KEY).filter(
    (entry) => entry.key !== color.key,
  );
  writeStoredColors(RECENT_COLORS_KEY, [color, ...recent]);
}

function toggleFavoriteColor(color: StoredColor): boolean {
  const favorites = readStoredColors(FAVORITE_COLORS_KEY);
  const next = favorites.some((entry) => entry.key === color.key)
    ? favorites.filter((entry) => entry.key !== color.key)
    : [color, ...favorites];
  writeStoredColors(FAVORITE_COLORS_KEY, next);
  return next.some((entry) => entry.key === color.key);
}

function isFavoriteColor(key: string): boolean {
  return readStoredColors(FAVORITE_COLORS_KEY).some(
    (entry) => entry.key === key,
  );
}

function colorName(label: string): string {
  return ucwords(label.replaceAll("_", " "));
}

function renderPaletteStrip(colors: string[], label: string) {
  return m(
    "div.palette-swatch.rpg-palette-strip",
    { role: "img", "aria-label": `${label} palette colors` },
    colors
      .slice()
      .reverse()
      .map((color, idx) =>
        m("span", {
          title: `${label} shade ${idx + 1}: ${color}`,
          style: { backgroundColor: color },
        }),
      ),
  );
}

export type PaletteSelectModalAttrs = {
  itemId: string;
  opt: PaletteOption;
  selectedColors: Record<string, string>;
  compactDisplay: boolean;
  rootViewNode: RootViewRef;
  onClose: () => void;
  onSelect: (recolor: string) => void;
  catalog: CatalogReader;
};

/**
 * Mirrors which variant canvases the modal will mount: default-expands the first version row,
 * then counts recolor tiles for every expanded `opt.versions` category.
 */
function prepareAndCountPalettePreviewCanvases(
  itemId: string,
  opt: PaletteOption,
  paletteMeta: PaletteMetadata,
): number {
  const firstNodePath = `${itemId}-${opt.idx}-${opt.versions[0]}`;
  if (state.expandedNodes[firstNodePath] === undefined) {
    state.expandedNodes[firstNodePath] = true;
  }
  let n = 0;
  for (const cat of opt.versions) {
    const [material, version] = cat.split(".");
    const nodePath = `${itemId}-${opt.idx}-${cat}`;
    const materialMeta = paletteMeta.materials[material];
    const recolors = materialMeta?.palettes?.[version] ?? {};
    const isExpanded = state.expandedNodes[nodePath] || false;
    if (isExpanded) {
      n += Object.keys(recolors).length;
    }
  }
  if (opt.sourceColors?.length) {
    n += 1;
  }
  return n;
}

/**
 * When the number of preview canvases changes (modal open, expand/collapse), reset the gate so
 * stale `drawRecolorPreview` completions are ignored and `data-previews-ready` stays accurate.
 */
function syncPalettePreviewGate(
  rootViewNode: RootViewRef,
  total: number,
): void {
  if (rootViewNode.state._palettePreviewLastTotal === total) {
    return;
  }
  rootViewNode.state.palettePreviewGateSeq =
    (rootViewNode.state.palettePreviewGateSeq || 0) + 1;
  rootViewNode.state._palettePreviewLastTotal = total;
  rootViewNode.state.palettePreviewExpected = total;
  rootViewNode.state.palettePreviewCompleted = 0;
}

function renderLoadingOverlay(onClose: () => void, message: string) {
  return [
    m("div.palette-modal-overlay", { onclick: onClose }),
    m(
      "div.palette-modal",
      {
        onclick: (e: MouseEvent) => e.stopPropagation(),
        "data-previews-ready": "false",
      },
      m("p.has-text-grey", message),
    ),
  ];
}

function renderModal(
  attrs: PaletteSelectModalAttrs,
  paletteMeta: PaletteMetadata,
  meta: ItemMerged,
) {
  const {
    itemId,
    opt,
    selectedColors,
    compactDisplay,
    rootViewNode,
    onClose,
    onSelect,
    catalog,
  } = attrs;

  const selectionGroup = opt.type_name ?? getSelectionGroup(itemId);
  const selection = state.selections[selectionGroup];
  const activeRecolor = selection?.recolor ?? selectedColors[selectionGroup];
  const previewCanvasTotal = prepareAndCountPalettePreviewCanvases(
    itemId,
    opt,
    paletteMeta,
  );
  syncPalettePreviewGate(rootViewNode, previewCanvasTotal);

  const previewsReady =
    rootViewNode.state.palettePreviewExpected === 0 ||
    (rootViewNode.state.palettePreviewCompleted ?? 0) >=
      (rootViewNode.state.palettePreviewExpected ?? 0);

  const overlay = m("div.palette-modal-overlay", { onclick: onClose });

  return [
    overlay,
    m(
      "div.palette-modal",
      {
        onclick: (e: MouseEvent) => e.stopPropagation(),
        "data-previews-ready": previewsReady ? "true" : "false",
      },
      [
        m("header.is-flex.rpg-palette-editor__header", [
          m("div", [
            m("h4", opt.label ?? "RPG palette editor"),
            m("p.rpg-palette-editor__subtitle", [
              "Safe palette swaps only. Source PNG assets are never modified.",
            ]),
          ]),
          m(
            "button.btn.btn-outline-secondary.btn-sm",
            {
              type: "button",
              onclick: onClose,
              "aria-label": "Close palette editor",
            },
            [m("i.bi.bi-x-lg", { "aria-hidden": "true" })],
          ),
        ]),
        m("section.rpg-palette-editor", [
          m("div.alert.alert-info.py-2", { role: "status" }, [
            m("i.bi.bi-info-circle.me-2", { "aria-hidden": "true" }),
            "This asset supports curated palette swaps. Hex input and the browser color picker are disabled unless an asset provides a safe custom source palette.",
          ]),
          m("div", { class: "row g-2 mb-3" }, [
            m("div.col-sm-6", [
              m(
                "label.form-label",
                { for: `hex-${itemId}-${opt.idx}` },
                "Hex color",
              ),
              m("input.form-control", {
                id: `hex-${itemId}-${opt.idx}`,
                type: "text",
                placeholder: "Not supported for this asset",
                disabled: true,
                "aria-describedby": `hex-help-${itemId}-${opt.idx}`,
              }),
              m(
                "div.form-text",
                { id: `hex-help-${itemId}-${opt.idx}` },
                "Arbitrary hex recoloring would be destructive or inaccurate for this palette asset.",
              ),
            ]),
            m("div.col-sm-6", [
              m(
                "label.form-label",
                { for: `picker-${itemId}-${opt.idx}` },
                "Color picker",
              ),
              m("input.form-control form-control-color", {
                id: `picker-${itemId}-${opt.idx}`,
                type: "color",
                value: "#808080",
                disabled: true,
                title: "Color picker is not supported by this asset",
              }),
              m("div.form-text", "Use curated compatible swatches below."),
            ]),
          ]),
          m("div.d-flex.flex-wrap.gap-2.mb-3", [
            m(
              "button.btn.btn-outline-secondary.btn-sm",
              { type: "button", onclick: () => onSelect("") },
              [m("i.bi.bi-arrow-counterclockwise.me-1"), "Reset color"],
            ),
            m(
              "button.btn.btn-outline-primary.btn-sm",
              {
                type: "button",
                onclick: () => {
                  const choices = opt.versions.flatMap((cat) => {
                    const [material, version] = cat.split(".");
                    const recolors =
                      paletteMeta.materials[material]?.palettes?.[version] ??
                      {};
                    return Object.keys(recolors).map((palette) =>
                      compilePaletteKey(material, version, palette, opt),
                    );
                  });
                  const key =
                    choices[Math.floor(Math.random() * choices.length)];
                  if (key) onSelect(key);
                },
              },
              [m("i.bi.bi-shuffle.me-1"), "Random compatible color"],
            ),
            opt.matchBodyColor
              ? m("span.badge.text-bg-success.align-self-center", [
                  m("i.bi.bi-link-45deg.me-1"),
                  "Linked to body color",
                ])
              : m("span.badge.text-bg-secondary.align-self-center", [
                  m("i.bi.bi-unlink.me-1"),
                  "Independent color group",
                ]),
          ]),
          m("div.rpg-palette-editor__memory.mb-3", [
            m("h5", "Recent and favorite colors"),
            m("div.d-flex.flex-wrap.gap-2", [
              ...readStoredColors(FAVORITE_COLORS_KEY).map((entry) =>
                m(
                  "button.btn.btn-sm.rpg-memory-swatch",
                  {
                    type: "button",
                    onclick: () => onSelect(entry.key),
                    title: `Favorite: ${entry.label}`,
                    "aria-label": `Select favorite color ${entry.label}`,
                  },
                  [
                    renderPaletteStrip(entry.colors, entry.label),
                    m("span", [m("i.bi.bi-star-fill.me-1"), entry.label]),
                  ],
                ),
              ),
              ...readStoredColors(RECENT_COLORS_KEY).map((entry) =>
                m(
                  "button.btn.btn-sm.rpg-memory-swatch",
                  {
                    type: "button",
                    onclick: () => onSelect(entry.key),
                    title: `Recent: ${entry.label}`,
                    "aria-label": `Select recent color ${entry.label}`,
                  },
                  [
                    renderPaletteStrip(entry.colors, entry.label),
                    m("span", [m("i.bi.bi-clock-history.me-1"), entry.label]),
                  ],
                ),
              ),
              readStoredColors(FAVORITE_COLORS_KEY).length +
                readStoredColors(RECENT_COLORS_KEY).length ===
              0
                ? m("span.text-muted", "No recent or favorite colors yet.")
                : null,
            ]),
          ]),
          ...opt.versions.map((cat) => {
            const [material, version] = cat.split(".");
            const nodePath = `${itemId}-${opt.idx}-${cat}`;
            const paletteVersionMeta = paletteMeta.versions?.[version];
            const materialMeta = paletteMeta.materials[material];
            const isExpanded = state.expandedNodes[nodePath] || false;
            let recolors = materialMeta?.palettes?.[version] ?? {};
            if (version === CUSTOM_VERSION && opt.sourceColors?.length) {
              recolors = { [CUSTOM_KEY]: opt.sourceColors };
            }
            return m(
              version === CUSTOM_VERSION
                ? "div.palette-modal-source-block"
                : "div.palette-modal-version-block",
              {
                key: `${rootViewNode.state.palettePreviewGateSeq}-${nodePath}`,
              },
              [
                m(
                  "div.tree-label",
                  {
                    onclick: () => {
                      state.expandedNodes[nodePath] = !isExpanded;
                    },
                  },
                  [
                    m("span.tree-arrow", {
                      class: isExpanded ? "expanded" : "collapsed",
                    }),
                    m(
                      "span.palette-version",
                      paletteVersionMeta?.label +
                        (material !== opt.material
                          ? ` - ${materialMeta?.label}`
                          : ""),
                    ),
                  ],
                ),
                isExpanded
                  ? m("div.variants-container.is-flex.is-flex-wrap-wrap", [
                      ...Object.entries(recolors).map(([palette, colors]) => {
                        const key = compilePaletteKey(
                          material,
                          version,
                          palette,
                          opt,
                        );
                        const isSelected =
                          (selection?.itemId === itemId ||
                            selectionGroup === opt.type_name) &&
                          activeRecolor === key;
                        const itemColors = {
                          ...selectedColors,
                          [selectionGroup]: key,
                        };
                        return m("div.cell", [
                          m(
                            "div.variant-item.is-flex.is-flex-direction-column.is-align-items-center.is-clickable",
                            {
                              class: classNames({
                                "has-background-link-light has-text-weight-bold has-text-link":
                                  isSelected,
                                [`key-${key}`]: true,
                              }),
                              onmouseover: (e: MouseEvent) => {
                                const div = e.currentTarget as HTMLElement;
                                if (!isSelected)
                                  div.classList.add("has-background-white-ter");
                              },
                              onmouseout: (e: MouseEvent) => {
                                const div = e.currentTarget as HTMLElement;
                                if (!isSelected)
                                  div.classList.remove(
                                    "has-background-white-ter",
                                  );
                              },
                              onclick: (e: MouseEvent) => {
                                e.stopPropagation();
                                rememberRecentColor({
                                  key,
                                  label: colorName(palette),
                                  colors,
                                });
                                onSelect(key);
                              },
                              role: "button",
                              tabindex: 0,
                              "aria-label": `Select ${colorName(palette)} ${opt.label ?? "palette"}`,
                              "aria-pressed": isSelected ? "true" : "false",
                            },
                            [
                              m(
                                "span.variant-display-name.has-text-centered.is-size-7",
                                [
                                  isSelected
                                    ? m("i.bi.bi-check-circle-fill.me-1", {
                                        "aria-hidden": "true",
                                      })
                                    : null,
                                  colorName(palette),
                                ],
                              ),
                              m("canvas.variant-canvas.box.p-0", {
                                width: compactDisplay
                                  ? COMPACT_FRAME_SIZE
                                  : FRAME_SIZE,
                                height: compactDisplay
                                  ? COMPACT_FRAME_SIZE
                                  : FRAME_SIZE,
                                class: compactDisplay ? " compact-display" : "",
                                onremove: (canvasVnode: m.VnodeDOM) => {
                                  const cs = canvasVnode.state as {
                                    renderId?: number;
                                  };
                                  cs.renderId = (cs.renderId ?? 0) + 1;
                                },
                                oncreate: (canvasVnode: m.VnodeDOM) => {
                                  const canvas =
                                    canvasVnode.dom as HTMLCanvasElement;
                                  const cs = canvasVnode.state as {
                                    renderId?: number;
                                  };
                                  const renderId = (cs.renderId ?? 0) + 1;
                                  cs.renderId = renderId;
                                  const settledGate =
                                    rootViewNode.state.palettePreviewGateSeq;
                                  void drawRecolorPreview(
                                    catalog,
                                    itemId,
                                    meta,
                                    canvas,
                                    itemColors,
                                    () => cs.renderId !== renderId,
                                  ).then(() => {
                                    if (
                                      settledGate !==
                                      rootViewNode.state.palettePreviewGateSeq
                                    ) {
                                      return;
                                    }
                                    if (cs.renderId !== renderId) {
                                      return;
                                    }
                                    rootViewNode.state.palettePreviewCompleted =
                                      (rootViewNode.state
                                        .palettePreviewCompleted ?? 0) + 1;
                                    m.redraw();
                                  });
                                },
                              }),
                              m("div.rpg-palette-actions", [
                                renderPaletteStrip(colors, colorName(palette)),
                                m(
                                  "button",
                                  {
                                    class: classNames(
                                      "btn btn-sm",
                                      isFavoriteColor(key)
                                        ? "btn-warning"
                                        : "btn-outline-secondary",
                                    ),
                                    type: "button",
                                    onclick: (e: MouseEvent) => {
                                      e.stopPropagation();
                                      toggleFavoriteColor({
                                        key,
                                        label: colorName(palette),
                                        colors,
                                      });
                                    },
                                    "aria-label": `${isFavoriteColor(key) ? "Remove" : "Add"} ${colorName(palette)} favorite`,
                                  },
                                  [
                                    m("i.bi", {
                                      class: isFavoriteColor(key)
                                        ? "bi-star-fill"
                                        : "bi-star",
                                      "aria-hidden": "true",
                                    }),
                                  ],
                                ),
                              ]),
                            ],
                          ),
                        ]);
                      }),
                    ])
                  : null,
              ],
            );
          }),
        ]),
        m("footer", " "),
      ],
    ),
  ];
}

export const PaletteSelectModal: m.Component<PaletteSelectModalAttrs> = {
  view(vnode) {
    const { itemId, onClose, catalog } = vnode.attrs;
    // Order matters: Result.combine short-circuits to the first Err. We
    // surface a different loading message depending on which chunk is
    // missing (matches the legacy two-stage UX: palette first, then layer).
    return renderResult(
      Result.combine([
        catalog.chunkReady("palette"),
        catalog.chunkReady("lite"),
        catalog.chunkReady("layers"),
        catalog.getPaletteMetadata(),
        catalog.getItemMerged(itemId),
      ]),
      ([, , , paletteMeta, meta]) =>
        renderModal(vnode.attrs, paletteMeta, meta),
      (error: LoadError) => {
        const message =
          error.kind === "loading" && error.chunk === "palette"
            ? "Loading palette data…"
            : "Loading layer data…";
        return renderLoadingOverlay(onClose, message);
      },
    );
  },
};
