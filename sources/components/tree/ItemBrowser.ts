import m from "mithril";
import classNames from "classnames";
import { state, getSelectionGroup, selectItem } from "../../state/state.ts";
import { getLayersToLoad } from "../../state/meta.ts";
import type {
  CatalogReader,
  CategoryTreeNode,
  ItemMerged,
} from "../../state/catalog.ts";
import {
  isItemAnimationCompatible,
  isNodeAnimationCompatible,
  isItemLicenseCompatible,
} from "../../state/filters.ts";
import { COMPACT_FRAME_SIZE, FRAME_SIZE } from "../../state/constants.ts";
import { matchesSearch, normalizeAssetLabel } from "../../utils/helpers.ts";
import { loadImage } from "../../canvas/load-image.ts";
import {
  emitInteractionFeedback,
  interactionFeedback,
  snapshotSelections,
} from "../../utils/interaction-feedback.ts";

const FAV_KEY = "ulpc:item-browser:favorites";
const RECENT_KEY = "ulpc:item-browser:recent";
const PAGE_SIZE = 72;
const THUMBNAIL_CACHE_LIMIT = 192;
const thumbnailCache = new Map<string, HTMLCanvasElement>();
function rememberThumbnail(key: string, canvas: HTMLCanvasElement): void {
  thumbnailCache.set(key, canvas);
  if (thumbnailCache.size > THUMBNAIL_CACHE_LIMIT) {
    const oldest = thumbnailCache.keys().next().value;
    if (oldest) thumbnailCache.delete(oldest);
  }
}

type ViewMode = "grid" | "list";
type SortMode = "az" | "recent" | "group";
type BrowserItem = {
  itemId: string;
  meta: ItemMerged;
  category: string;
  groupPath: string;
  compatible: boolean;
  equipped: boolean;
  favorite: boolean;
  recentIndex: number;
  keywords: string;
};
export type ItemBrowserAttrs = {
  nodes: Array<{ name: string; node: CategoryTreeNode; pathPrefix?: string }>;
  catalog: CatalogReader;
  categoryLabel: string;
};
type ItemBrowserState = {
  viewMode: ViewMode;
  sortMode: SortMode;
  query: string;
  debouncedQuery: string;
  category: string;
  body: string;
  palette: string;
  compatibleOnly: boolean;
  equippedOnly: boolean;
  favoriteOnly: boolean;
  recentOnly: boolean;
  visible: number;
  details?: BrowserItem;
  timer?: number;
  favorites: Set<string>;
  recent: string[];
};

const readJson = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) =>
  localStorage.setItem(key, JSON.stringify(value));

function walkItems(
  node: CategoryTreeNode,
  label: string,
  catalog: CatalogReader,
  out: BrowserItem[],
  favorites: Set<string>,
  recent: string[],
) {
  const nodeCompatible = isNodeAnimationCompatible(
    node as { animations?: string[] },
  );
  for (const itemId of node.items ?? []) {
    const r = catalog.getItemMerged(itemId);
    if (r.isErr()) continue;
    const meta = r.value;
    const group = getSelectionGroup(itemId);
    const selection = state.selections[group];
    const compatible =
      meta.required.includes(state.bodyType) &&
      nodeCompatible &&
      isItemAnimationCompatible(itemId, catalog) &&
      isItemLicenseCompatible(itemId, catalog);
    const variants = [
      meta.name,
      itemId,
      meta.type_name,
      ...meta.path,
      ...meta.variants,
      ...meta.recolors.flatMap((recolor) => [
        recolor.label,
        recolor.material,
        recolor.type_name,
        ...(recolor.variants ?? []),
      ]),
    ]
      .filter(Boolean)
      .join(" ");
    out.push({
      itemId,
      meta,
      category: label,
      groupPath: label,
      compatible,
      equipped: selection?.itemId === itemId,
      favorite: favorites.has(itemId),
      recentIndex: recent.indexOf(itemId),
      keywords: variants.toLowerCase(),
    });
  }
  for (const [childName, childNode] of Object.entries(node.children ?? {}))
    walkItems(
      childNode,
      `${label} / ${normalizeAssetLabel(childName)}`,
      catalog,
      out,
      favorites,
      recent,
    );
}

function selectDefault(item: BrowserItem, local: ItemBrowserState) {
  if (!item.compatible) return;
  const variant =
    item.meta.variants[0] ?? item.meta.recolors[0]?.variants?.[0] ?? "";
  const group = getSelectionGroup(item.itemId);
  const before = snapshotSelections();
  const previous = state.selections[group];
  const isSelected = previous?.itemId === item.itemId;
  if (item.meta.variants.length || item.meta.recolors.length)
    selectItem(item.itemId, variant, isSelected);
  else if (isSelected) delete state.selections[group];
  else
    state.selections[group] = {
      itemId: item.itemId,
      name: normalizeAssetLabel(item.meta.name || item.itemId),
    };

  const action = isSelected ? "remove" : previous ? "replace" : "equip";
  emitInteractionFeedback({
    action,
    itemId: item.itemId,
    itemName: normalizeAssetLabel(item.meta.name || item.itemId),
    selectionGroup: group,
    before,
    undoable: action !== "equip",
  });
  local.recent = [
    item.itemId,
    ...local.recent.filter((id) => id !== item.itemId),
  ].slice(0, 48);
  writeJson(RECENT_KEY, local.recent);
  setTimeout(
    () =>
      document
        .querySelector(`[data-item-id="${CSS.escape(item.itemId)}"]`)
        ?.scrollIntoView({ block: "nearest" }),
    0,
  );
}

const PreviewCanvas: m.Component<{
  item: BrowserItem;
  catalog: CatalogReader;
}> = {
  oncreate(vnode) {
    const canvas = vnode.dom as HTMLCanvasElement;
    const key = `preview:${vnode.attrs.item.itemId}:${state.bodyType}:${vnode.attrs.item.meta.variants[0] ?? ""}`;
    const ctx = canvas.getContext("2d");
    const controller = new AbortController();
    (
      vnode.state as { io?: IntersectionObserver; controller?: AbortController }
    ).controller = controller;

    const paint = () => {
      if (!ctx || controller.signal.aborted) return;
      const cached = thumbnailCache.get(key);
      if (cached) {
        ctx.drawImage(cached, 0, 0);
        return;
      }
      const meta = vnode.attrs.item.meta;
      const size = COMPACT_FRAME_SIZE;
      const row = meta.preview_row ?? 2;
      const col = (meta as { preview_column?: number }).preview_column ?? 0;
      Promise.all(
        getLayersToLoad(
          vnode.attrs.catalog,
          meta,
          state.bodyType,
          state.selections,
          meta.variants[0],
        ).map((layer) =>
          loadImage(layer.path, controller.signal).catch(() => null),
        ),
      ).then((imgs) => {
        if (controller.signal.aborted) return;
        ctx.clearRect(0, 0, size, size);
        imgs.forEach(
          (img) =>
            img &&
            ctx.drawImage(
              img,
              col * FRAME_SIZE,
              row * FRAME_SIZE,
              FRAME_SIZE,
              FRAME_SIZE,
              0,
              0,
              size,
              size,
            ),
        );
        const cachedCanvas = document.createElement("canvas");
        cachedCanvas.width = size;
        cachedCanvas.height = size;
        cachedCanvas.getContext("2d")?.drawImage(canvas, 0, 0);
        rememberThumbnail(key, cachedCanvas);
      });
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        paint();
      }
    });
    io.observe(canvas);
    (vnode.state as { io?: IntersectionObserver }).io = io;
  },
  onremove(vnode) {
    const local = vnode.state as {
      io?: IntersectionObserver;
      controller?: AbortController;
    };
    local.io?.disconnect();
    local.controller?.abort();
  },
  view() {
    return m("canvas.item-browser__thumb", {
      width: COMPACT_FRAME_SIZE,
      height: COMPACT_FRAME_SIZE,
      "aria-hidden": "true",
    });
  },
};

export const ItemBrowser: m.Component<ItemBrowserAttrs, ItemBrowserState> = {
  oninit(vnode) {
    Object.assign(vnode.state, {
      viewMode: "grid",
      sortMode: "az",
      query: "",
      debouncedQuery: "",
      category: "all",
      body: "current",
      palette: "all",
      compatibleOnly: true,
      equippedOnly: false,
      favoriteOnly: false,
      recentOnly: false,
      visible: PAGE_SIZE,
      favorites: new Set(readJson<string[]>(FAV_KEY, [])),
      recent: readJson<string[]>(RECENT_KEY, []),
    });
  },
  view(vnode) {
    const local = vnode.state;
    const all: BrowserItem[] = [];
    vnode.attrs.nodes.forEach(({ name, node, pathPrefix }) =>
      walkItems(
        node,
        normalizeAssetLabel(pathPrefix ? `${pathPrefix} ${name}` : name),
        vnode.attrs.catalog,
        all,
        local.favorites,
        local.recent,
      ),
    );
    const categories = Array.from(new Set(all.map((i) => i.category))).sort();
    const palettes = Array.from(
      new Set(
        all.flatMap(
          (i) =>
            i.meta.recolors
              .flatMap((r) => [r.material, r.label, ...(r.variants ?? [])])
              .filter(Boolean) as string[],
        ),
      ),
    ).sort();
    const q = local.debouncedQuery.trim().toLowerCase();
    let items = all.filter(
      (i) =>
        (!q || matchesSearch(i.meta.name, q) || i.keywords.includes(q)) &&
        (local.category === "all" || i.category === local.category) &&
        (local.body === "current"
          ? i.meta.required.includes(state.bodyType)
          : i.meta.required.includes(local.body)) &&
        (local.palette === "all" ||
          i.keywords.includes(local.palette.toLowerCase())) &&
        (!local.compatibleOnly || i.compatible) &&
        (!local.equippedOnly || i.equipped) &&
        (!local.favoriteOnly || i.favorite) &&
        (!local.recentOnly || i.recentIndex >= 0),
    );
    items = items.sort((a, b) =>
      local.sortMode === "recent"
        ? (a.recentIndex < 0 ? 9999 : a.recentIndex) -
          (b.recentIndex < 0 ? 9999 : b.recentIndex)
        : local.sortMode === "group"
          ? a.groupPath.localeCompare(b.groupPath) ||
            a.meta.name.localeCompare(b.meta.name)
          : a.meta.name.localeCompare(b.meta.name),
    );
    const shown = items.slice(0, local.visible);
    return m("section.item-browser", [
      m("div.d-flex.flex-wrap.gap-2 align-items-center mb-3", [
        m("input.form-control", {
          style: "max-width:18rem",
          type: "search",
          placeholder: "Search names or keywords",
          value: local.query,
          oninput: (e: Event) => {
            local.query = (e.target as HTMLInputElement).value;
            clearTimeout(local.timer);
            local.timer = window.setTimeout(() => {
              local.debouncedQuery = local.query;
              local.visible = PAGE_SIZE;
              m.redraw();
            }, 180);
          },
        }),
        m(
          "select.form-select",
          {
            style: "max-width:14rem",
            value: local.category,
            onchange: (e: Event) => {
              local.category = (e.target as HTMLSelectElement).value;
              local.visible = PAGE_SIZE;
            },
          },
          [
            m("option", { value: "all" }, "All categories"),
            categories.map((c) => m("option", { value: c }, c)),
          ],
        ),
        m(
          "select.form-select",
          {
            style: "max-width:12rem",
            value: local.body,
            onchange: (e: Event) => {
              local.body = (e.target as HTMLSelectElement).value;
            },
          },
          [
            m("option", { value: "current" }, `Body: ${state.bodyType}`),
            ...Array.from(new Set(all.flatMap((i) => i.meta.required)))
              .sort()
              .map((b) => m("option", { value: b }, b)),
          ],
        ),
        m(
          "select.form-select",
          {
            style: "max-width:12rem",
            value: local.palette,
            onchange: (e: Event) => {
              local.palette = (e.target as HTMLSelectElement).value;
            },
          },
          [
            m("option", { value: "all" }, "All palettes"),
            palettes.map((p) =>
              m("option", { value: p }, normalizeAssetLabel(p)),
            ),
          ],
        ),
        m(
          "select.form-select",
          {
            style: "max-width:12rem",
            value: local.sortMode,
            onchange: (e: Event) =>
              (local.sortMode = (e.target as HTMLSelectElement)
                .value as SortMode),
          },
          [
            m("option", { value: "az" }, "Sort A–Z"),
            m("option", { value: "recent" }, "Recently used"),
            m("option", { value: "group" }, "Asset grouping"),
          ],
        ),
        [
          ["compatibleOnly", "Compatible"],
          ["equippedOnly", "Equipped"],
          ["favoriteOnly", "Favorites"],
          ["recentOnly", "Recent"],
        ].map(([key, label]) =>
          m("label.form-check.form-check-inline", [
            m("input.form-check-input", {
              type: "checkbox",
              checked: local[key as keyof ItemBrowserState] as boolean,
              onchange: (e: Event) => {
                (local as unknown as Record<string, boolean>)[key] = (
                  e.target as HTMLInputElement
                ).checked;
                local.visible = PAGE_SIZE;
              },
            }),
            m("span.form-check-label", label),
          ]),
        ),
        m(
          "div.btn-group",
          ["grid", "list"].map((mode) =>
            m(
              "button.btn.btn-sm",
              {
                class:
                  local.viewMode === mode
                    ? "btn-primary"
                    : "btn-outline-primary",
                onclick: () => (local.viewMode = mode as ViewMode),
              },
              mode === "grid" ? "Grid" : "List",
            ),
          ),
        ),
      ]),
      m(
        "div.small.text-muted.mb-2",
        `${items.length} items in ${vnode.attrs.categoryLabel}`,
      ),
      m(
        "div.row.g-2 item-browser__results",
        {
          key: `${local.category}:${local.palette}:${local.sortMode}:${local.viewMode}`,
        },
        shown.map((item) =>
          m(
            "div",
            {
              key: item.itemId,
              "data-item-id": item.itemId,
              class:
                local.viewMode === "grid"
                  ? "col-6 col-sm-4 col-md-3 col-lg-2"
                  : "col-12",
            },
            m(
              "article.card",
              {
                class: classNames("item-browser__card h-100", {
                  "border-primary shadow-sm": item.equipped,
                  "opacity-75": !item.compatible,
                  "item-browser__card--feedback":
                    interactionFeedback.activeItemId === item.itemId,
                }),
              },
              [
                m(
                  "button.item-browser__equip",
                  {
                    type: "button",
                    onclick: () => selectDefault(item, local),
                    disabled: !item.compatible,
                  },
                  [
                    m(PreviewCanvas, { item, catalog: vnode.attrs.catalog }),
                    m(
                      "strong.item-browser__name",
                      normalizeAssetLabel(item.meta.name || item.itemId),
                    ),
                    m(
                      "span.badge text-bg-secondary",
                      item.category.split(" / ").pop(),
                    ),
                    item.meta.variants[0]
                      ? m(
                          "span.badge text-bg-info",
                          normalizeAssetLabel(item.meta.variants[0]),
                        )
                      : null,
                    item.meta.recolors[0]
                      ? m(
                          "span.badge text-bg-warning",
                          normalizeAssetLabel(
                            item.meta.recolors[0].label ||
                              item.meta.recolors[0].material,
                          ),
                        )
                      : null,
                    m(
                      "span.badge",
                      {
                        class: item.compatible
                          ? "text-bg-success"
                          : "text-bg-danger",
                      },
                      item.compatible ? "Compatible" : "Incompatible",
                    ),
                    item.equipped
                      ? m("span.badge text-bg-primary", "Equipped")
                      : null,
                  ],
                ),
                m("div.card-footer d-flex justify-content-between", [
                  m(
                    "button.btn btn-link btn-sm",
                    {
                      "aria-label": "Toggle favorite",
                      onclick: () => {
                        if (item.favorite) local.favorites.delete(item.itemId);
                        else local.favorites.add(item.itemId);
                        writeJson(FAV_KEY, Array.from(local.favorites));
                      },
                    },
                    item.favorite ? "★" : "☆",
                  ),
                  m(
                    "button.btn btn-outline-secondary btn-sm",
                    { onclick: () => (local.details = item) },
                    "Details",
                  ),
                ]),
              ],
            ),
          ),
        ),
      ),
      items.length > shown.length
        ? m(
            "div.text-center my-3",
            m(
              "button.btn btn-outline-primary",
              { onclick: () => (local.visible += PAGE_SIZE) },
              "Load more",
            ),
          )
        : null,
      local.details
        ? m(
            "div.modal fade show d-block",
            { tabindex: -1, role: "dialog" },
            m(
              "div.modal-dialog modal-dialog-scrollable",
              m("div.modal-content", [
                m("div.modal-header", [
                  m(
                    "h5.modal-title",
                    normalizeAssetLabel(
                      local.details.meta.name || local.details.itemId,
                    ),
                  ),
                  m("button.btn-close", {
                    onclick: () => (local.details = undefined),
                    "aria-label": "Close",
                  }),
                ]),
                m("div.modal-body", [
                  m("p", local.details.category),
                  m("p", `Internal id: ${local.details.itemId}`),
                  m(
                    "p",
                    `Body/LPC variants: ${local.details.meta.required.join(", ") || "Any"}`,
                  ),
                  m(
                    "p",
                    `Variants: ${local.details.meta.variants.join(", ") || "None"}`,
                  ),
                  m(
                    "p",
                    `Palettes: ${local.details.meta.recolors.flatMap((r) => r.variants ?? []).join(", ") || "None"}`,
                  ),
                ]),
                m("div.modal-footer", [
                  m(
                    "button.btn btn-primary",
                    {
                      disabled: !local.details.compatible,
                      onclick: () => selectDefault(local.details!, local),
                    },
                    local.details.equipped ? "Unequip" : "Equip",
                  ),
                  m(
                    "button.btn btn-secondary",
                    { onclick: () => (local.details = undefined) },
                    "Close",
                  ),
                ]),
              ]),
            ),
          )
        : null,
      local.details ? m("div.modal-backdrop fade show") : null,
    ]);
  },
};
