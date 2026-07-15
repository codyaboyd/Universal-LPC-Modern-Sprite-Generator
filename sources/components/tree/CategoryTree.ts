// RPG category asset-selection component
import m from "mithril";
import {
  state,
  resetAll,
  getSelectionGroup,
  applyMatchBodyColor,
} from "../../state/state.ts";
import type {
  CatalogReader,
  CategoryTree as CategoryTreeShape,
  CategoryTreeNode,
} from "../../state/catalog.ts";
import { renderResult } from "../../utils/render-result.ts";
import { BodyTypeSelector } from "./BodyTypeSelector.ts";
import { ItemBrowser } from "./ItemBrowser.ts";
import { normalizeAssetLabel } from "../../utils/helpers.ts";

const LAST_CATEGORY_KEY = "ulpc:last-rpg-category";

type CategoryTreeAttrs = { catalog: CatalogReader };
type SortMode = "az" | "za" | "count";
type FilterMode = "all" | "selected" | "available";

type RpgCategory = {
  key: string;
  label: string;
  icon: string;
  nodes: Array<{ name: string; node: CategoryTreeNode; pathPrefix?: string }>;
};

type CategoryTreeState = {
  activeCategory?: string;
  sortMode: SortMode;
  filterMode: FilterMode;
  guidedCategoryListener?: (event: Event) => void;
};

const CATEGORY_DEFS = [
  { key: "body", label: "Body", icon: "bi-person", match: ["body"] },
  {
    key: "skin",
    label: "Skin",
    icon: "bi-palette",
    match: ["heads", "lizard"],
  },
  {
    key: "face",
    label: "Face",
    icon: "bi-emoji-smile",
    match: ["face", "faces", "nose", "eyebrow"],
  },
  { key: "eyes", label: "Eyes", icon: "bi-eye", match: ["eyes"] },
  { key: "hair", label: "Hair", icon: "bi-brush", match: ["hair"] },
  {
    key: "facial-hair",
    label: "Facial Hair",
    icon: "bi-person-lines-fill",
    match: ["beard", "mustache"],
  },
  { key: "ears", label: "Ears", icon: "bi-ear", match: ["ears"] },
  {
    key: "headgear",
    label: "Headgear",
    icon: "bi-hat",
    match: ["headwear", "hats", "helmet", "covering"],
  },
  {
    key: "torso",
    label: "Torso",
    icon: "bi-person-vcard",
    match: ["torso", "shirt", "dress", "vest", "jacket", "apron", "waist"],
  },
  {
    key: "arms",
    label: "Arms",
    icon: "bi-hand-index",
    match: ["arms", "shoulder", "wrist"],
  },
  {
    key: "legs",
    label: "Legs",
    icon: "bi-person-standing",
    match: ["legs", "pants", "shorts", "legging", "skirt"],
  },
  {
    key: "feet",
    label: "Feet",
    icon: "bi-bootstrap-reboot",
    match: ["feet", "shoe", "sock", "boot"],
  },
  {
    key: "armor",
    label: "Armor",
    icon: "bi-shield-shaded",
    match: ["armour", "armor"],
  },
  {
    key: "cloaks",
    label: "Cloaks",
    icon: "bi-bookmark",
    match: ["cape", "cloak"],
  },
  {
    key: "accessories",
    label: "Accessories",
    icon: "bi-gem",
    match: [
      "accessory",
      "accessories",
      "neck",
      "wings",
      "tails",
      "prostheses",
      "wounds",
    ],
  },
  {
    key: "main-hand",
    label: "Main Hand",
    icon: "bi-magic",
    match: ["sword", "blunt", "polearm", "magic"],
  },
  { key: "off-hand", label: "Off Hand", icon: "bi-shield", match: ["shield"] },
  {
    key: "ranged-weapons",
    label: "Ranged Weapons",
    icon: "bi-bullseye",
    match: ["ranged"],
  },
  {
    key: "back-items",
    label: "Back Items",
    icon: "bi-backpack",
    match: ["backpack"],
  },
  {
    key: "special-effects",
    label: "Special Effects",
    icon: "bi-stars",
    match: ["special"],
  },
] as const;

function matchesDef(path: string[], def: (typeof CATEGORY_DEFS)[number]) {
  const text = path.join("/").toLowerCase();
  return def.match.some((needle) => text.includes(needle));
}

function collectNodes(tree: CategoryTreeShape): RpgCategory[] {
  const buckets = new Map<string, RpgCategory>();
  for (const def of CATEGORY_DEFS) {
    buckets.set(def.key, {
      key: def.key,
      label: def.label,
      icon: def.icon,
      nodes: [],
    });
  }

  function walk(
    name: string,
    node: CategoryTreeNode,
    path: string[],
    pathPrefix?: string,
  ) {
    const nextPath = [...path, name];
    const def = CATEGORY_DEFS.find((candidate) =>
      matchesDef(nextPath, candidate),
    );
    if (
      def &&
      ((node.items?.length ?? 0) > 0 ||
        Object.keys(node.children ?? {}).length > 0)
    ) {
      buckets.get(def.key)?.nodes.push({ name, node, pathPrefix });
      return;
    }
    for (const [childName, childNode] of Object.entries(node.children ?? {})) {
      walk(
        childName,
        childNode,
        nextPath,
        pathPrefix ? `${pathPrefix}-${name}` : name,
      );
    }
  }

  for (const [name, node] of Object.entries(tree.children ?? {}))
    walk(name, node, []);
  return Array.from(buckets.values()).filter(
    (category) => category.nodes.length > 0,
  );
}

function countItems(
  node: CategoryTreeNode,
  catalog: CatalogReader,
  onlyAvailable: boolean,
): number {
  const own = (node.items ?? []).filter((itemId) => {
    if (!onlyAvailable || !catalog.isLiteReady()) return true;
    return catalog.getItemLite(itemId).match(
      (lite) => lite.required.includes(state.bodyType),
      () => false,
    );
  }).length;
  return (
    own +
    Object.values(node.children ?? {}).reduce(
      (sum, child) => sum + countItems(child, catalog, onlyAvailable),
      0,
    )
  );
}

function nodeHasSelected(
  node: CategoryTreeNode,
  catalog: CatalogReader,
): boolean {
  for (const itemId of node.items ?? []) {
    if (state.selections[getSelectionGroup(itemId)]?.itemId === itemId)
      return true;
  }
  return Object.values(node.children ?? {}).some((child) =>
    nodeHasSelected(child, catalog),
  );
}

function categoryOptionCount(
  category: RpgCategory,
  catalog: CatalogReader,
  onlyAvailable: boolean,
): number {
  return category.nodes.reduce(
    (sum, { node }) => sum + countItems(node, catalog, onlyAvailable),
    0,
  );
}

function categoryGroups(
  category: RpgCategory,
  catalog: CatalogReader,
): Set<string> {
  const groups = new Set<string>();
  function add(node: CategoryTreeNode) {
    for (const itemId of node.items ?? []) {
      if (catalog.getItemLite(itemId).isOk())
        groups.add(getSelectionGroup(itemId));
    }
    Object.values(node.children ?? {}).forEach(add);
  }
  category.nodes.forEach(({ node }) => add(node));
  return groups;
}

function selectedSummary(
  category: RpgCategory,
  catalog: CatalogReader,
): string {
  const groups = categoryGroups(category, catalog);
  const labels = Object.entries(state.selections)
    .filter(([group]) => groups.has(group))
    .map(([, selection]) =>
      normalizeAssetLabel(selection.name || selection.itemId),
    );
  return labels.length
    ? labels.slice(0, 2).join(", ") +
        (labels.length > 2 ? ` +${labels.length - 2}` : "")
    : "Nothing equipped";
}

function renderLoadingHost() {
  return m(
    "div.box.has-background-light.category-tree-panel",
    { id: "category-tree-panel" },
    [
      m("div.category-tree-loading-host", [
        m(
          "div.category-tree-loading-overlay",
          { "aria-busy": "true", "aria-live": "polite" },
          m("span.loading", { "aria-label": "Loading category index" }),
        ),
        m("h3.title.is-5.mb-3", "RPG Customization"),
        m("p.has-text-grey.is-size-7", "Loading customization categories…"),
      ]),
    ],
  );
}

function renderTree(
  categoryTree: CategoryTreeShape,
  catalog: CatalogReader,
  local: CategoryTreeState,
) {
  const categories = collectNodes(categoryTree);
  local.activeCategory ??=
    sessionStorage.getItem(LAST_CATEGORY_KEY) ?? categories[0]?.key;
  local.sortMode ??= "az";
  local.filterMode ??= "all";
  const active =
    categories.find((c) => c.key === local.activeCategory) ?? categories[0];
  const sorted = [...categories].sort((a, b) =>
    local.sortMode === "count"
      ? categoryOptionCount(b, catalog, false) -
        categoryOptionCount(a, catalog, false)
      : local.sortMode === "za"
        ? b.label.localeCompare(a.label)
        : a.label.localeCompare(b.label),
  );
  const displayedNodes =
    active?.nodes.filter(({ node }) =>
      local.filterMode === "available"
        ? countItems(node, catalog, true) > 0
        : local.filterMode === "selected"
          ? nodeHasSelected(node, catalog)
          : true,
    ) ?? [];
  const selectedGroups = active
    ? categoryGroups(active, catalog)
    : new Set<string>();
  const hasSelected = Object.keys(state.selections).some((group) =>
    selectedGroups.has(group),
  );

  return m(
    "div.box.has-background-light.category-tree-panel",
    { id: "category-tree-panel" },
    [
      m("div.d-flex.justify-content-between.align-items-center.mb-3", [
        m("div", [
          m("h3.title.is-5.mb-0", "RPG Customization"),
          active
            ? m("nav.small.text-muted", `Customize / ${active.label}`)
            : null,
        ]),
        m(
          "button.button.is-danger.is-small",
          { onclick: resetAll },
          "Reset all",
        ),
      ]),
      m("div.mb-3", [m(BodyTypeSelector)]),
      m("div.mb-3", [
        m("label.checkbox", [
          m("input[type=checkbox]", {
            checked: state.matchBodyColorEnabled,
            onchange: (e: Event) => {
              state.matchBodyColorEnabled = (
                e.target as HTMLInputElement
              ).checked;
              if (state.matchBodyColorEnabled) {
                const bodySelection =
                  state.selections[getSelectionGroup("body-body")];
                if (bodySelection?.variant)
                  applyMatchBodyColor(
                    bodySelection.variant,
                    bodySelection.recolor ?? bodySelection.variant,
                  );
              }
            },
          }),
          " Match body color",
        ]),
      ]),
      m(
        "ul.nav.nav-pills.flex-nowrap.overflow-auto.mb-3",
        sorted.map((category) => {
          const available = categoryOptionCount(category, catalog, true);
          const selected = selectedSummary(category, catalog);
          return m(
            "li.nav-item",
            { key: category.key },
            m(
              "button.nav-link.text-nowrap",
              {
                class:
                  category.key === active?.key
                    ? "active"
                    : available === 0
                      ? "disabled"
                      : "",
                disabled: available === 0,
                title:
                  available === 0
                    ? "Unavailable for the current body type or filters"
                    : selected,
                onclick: () => {
                  local.activeCategory = category.key;
                  sessionStorage.setItem(LAST_CATEGORY_KEY, category.key);
                },
              },
              [
                m(`i.bi.${category.icon}.me-1`),
                category.label,
                m("span.badge.text-bg-light.ms-2", String(available)),
              ],
            ),
          );
        }),
      ),
      active
        ? m("div.card.mb-3", [
            m(
              "div.card-header.d-flex.justify-content-between.align-items-center",
              [
                m("strong", [m(`i.bi.${active.icon}.me-2`), active.label]),
                m(
                  "span.small.text-muted",
                  `${categoryOptionCount(active, catalog, true)} options`,
                ),
              ],
            ),
            m("div.card-body", [
              m("p.mb-2", [
                m("strong", "Selected: "),
                selectedSummary(active, catalog),
              ]),
              m("div.d-flex.flex-wrap.gap-2", [
                m("input.form-control.form-control-sm", {
                  style: "max-width: 16rem",
                  type: "search",
                  placeholder: `Search ${active.label}`,
                  value: state.searchQuery,
                  disabled: !catalog.isLiteReady(),
                  oninput: (e: Event) => {
                    state.searchQuery = (e.target as HTMLInputElement).value;
                  },
                }),
                m(
                  "select.form-select.form-select-sm",
                  {
                    style: "max-width: 12rem",
                    value: local.filterMode,
                    onchange: (e: Event) => {
                      local.filterMode = (e.target as HTMLSelectElement)
                        .value as FilterMode;
                    },
                  },
                  [
                    m("option", { value: "all" }, "All options"),
                    m("option", { value: "available" }, "Available now"),
                    m("option", { value: "selected" }, "Selected categories"),
                  ],
                ),
                m(
                  "select.form-select.form-select-sm",
                  {
                    style: "max-width: 12rem",
                    value: local.sortMode,
                    onchange: (e: Event) => {
                      local.sortMode = (e.target as HTMLSelectElement)
                        .value as SortMode;
                    },
                  },
                  [
                    m("option", { value: "az" }, "Sort A–Z"),
                    m("option", { value: "za" }, "Sort Z–A"),
                    m("option", { value: "count" }, "Most options"),
                  ],
                ),
                m(
                  "button.btn.btn-outline-danger.btn-sm",
                  {
                    disabled: !hasSelected,
                    onclick: () => {
                      for (const group of selectedGroups)
                        delete state.selections[group];
                    },
                  },
                  "Unequip category",
                ),
              ]),
            ]),
          ])
        : m(
            "div.alert.alert-info",
            "No RPG customization categories were found in the loaded metadata.",
          ),
      active && categoryOptionCount(active, catalog, true) === 0
        ? m(
            "div.alert.alert-warning",
            `${active.label} is unavailable for the current body type or filters.`,
          )
        : null,
      active && displayedNodes.length === 0
        ? m(
            "div.alert.alert-secondary",
            `No ${active.label.toLowerCase()} options match the current search or filters.`,
          )
        : m(ItemBrowser, {
            nodes: displayedNodes,
            catalog,
            categoryLabel: active?.label ?? "Items",
          }),
    ],
  );
}

export const CategoryTree: m.Component<CategoryTreeAttrs, CategoryTreeState> = {
  oninit(vnode) {
    vnode.state.sortMode = "az";
    vnode.state.filterMode = "all";
    vnode.state.guidedCategoryListener = (event: Event) => {
      vnode.state.activeCategory = (event as CustomEvent<string>).detail;
      m.redraw();
    };
    window.addEventListener(
      "ulpc:guided-category",
      vnode.state.guidedCategoryListener,
    );
  },
  onremove(vnode) {
    if (vnode.state.guidedCategoryListener) {
      window.removeEventListener(
        "ulpc:guided-category",
        vnode.state.guidedCategoryListener,
      );
    }
  },
  view(vnode) {
    const { catalog } = vnode.attrs;
    return renderResult(
      catalog.getCategoryTree(),
      (categoryTree) => renderTree(categoryTree, catalog, vnode.state),
      () => renderLoadingHost(),
    );
  },
};
