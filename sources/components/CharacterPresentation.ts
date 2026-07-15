import m from "mithril";
import { state, type Selection } from "../state/state.ts";

const ARCHETYPES = ["warrior", "ranger", "rogue", "mage", "cleric", "custom"];

function formatDate(value: string): string {
  if (!value) return "Not saved yet";
  return new Date(value).toLocaleString();
}

function archetypeLabel(): string {
  return state.characterMetadata.archetype === "custom"
    ? state.characterMetadata.customArchetype || "Custom"
    : state.characterMetadata.archetype;
}

function equippedItems(): Selection[] {
  return Object.values(state.selections).filter((selection) => selection.name);
}

function dominantPalette(): string {
  const counts = new Map<string, number>();
  for (const selection of Object.values(state.selections)) {
    const key = selection.recolor || selection.variant || "default";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "default";
}

function touchMetadata(): void {
  state.characterMetadata.modifiedAt = new Date().toISOString();
}

function setMetadata(
  key: keyof typeof state.characterMetadata,
  value: string,
): void {
  state.characterMetadata[key] = value;
  touchMetadata();
}

function saveMetadata(): void {
  const now = new Date().toISOString();
  state.characterMetadata.savedAt = state.characterMetadata.savedAt || now;
  state.characterMetadata.modifiedAt = now;
}

function previewCanvas() {
  return m("div.character-summary-card__portrait", [
    m("span.bi.bi-person-bounding-box", { "aria-hidden": "true" }),
    m(
      "span.visually-hidden",
      "Sprite preview is shown in the main preview stage",
    ),
  ]);
}

function metadataForm() {
  return m("div.character-meta.app-panel.p-3.mb-3", [
    m("div.d-flex.justify-content-between.align-items-start.gap-2.mb-3", [
      m("div", [
        m("span.creator-kicker", "Character metadata"),
        m("h3.h5.mb-1", "Presentation details"),
        m(
          "p.small.text-muted.mb-0",
          "These optional fields describe the character only; they do not alter LPC sprite export layout or equipment rules.",
        ),
      ]),
      m(
        "button.btn.btn-outline-dark.btn-sm",
        { type: "button", onclick: saveMetadata },
        "Mark saved",
      ),
    ]),
    m("div.row.g-2", [
      m("div.col-md-6", [
        m("label.form-label", "Character name"),
        m("input.form-control", {
          value: state.characterMetadata.name,
          oninput: (e: Event) =>
            setMetadata("name", (e.target as HTMLInputElement).value),
        }),
      ]),
      m("div.col-md-6", [
        m("label.form-label", "Character title"),
        m("input.form-control", {
          value: state.characterMetadata.title,
          placeholder: "The Bright Wanderer",
          oninput: (e: Event) =>
            setMetadata("title", (e.target as HTMLInputElement).value),
        }),
      ]),
      m("div.col-md-6", [
        m("label.form-label", "Archetype or class label"),
        m(
          "select.form-select",
          {
            value: state.characterMetadata.archetype,
            onchange: (e: Event) =>
              setMetadata("archetype", (e.target as HTMLSelectElement).value),
          },
          ARCHETYPES.map((value) =>
            m("option", { value }, value[0]!.toUpperCase() + value.slice(1)),
          ),
        ),
      ]),
      state.characterMetadata.archetype === "custom"
        ? m("div.col-md-6", [
            m("label.form-label", "Custom archetype"),
            m("input.form-control", {
              value: state.characterMetadata.customArchetype,
              placeholder: "Cartographer, baker, sky sailor…",
              oninput: (e: Event) =>
                setMetadata(
                  "customArchetype",
                  (e.target as HTMLInputElement).value,
                ),
            }),
          ])
        : null,
      m("div.col-12", [
        m("label.form-label", "Tags"),
        m("input.form-control", {
          value: state.characterMetadata.tags,
          placeholder: "npc, desert, healer",
          oninput: (e: Event) =>
            setMetadata("tags", (e.target as HTMLInputElement).value),
        }),
      ]),
      m("div.col-md-6", [
        m("label.form-label", "Short backstory"),
        m("textarea.form-control", {
          rows: 3,
          value: state.characterMetadata.backstory,
          oninput: (e: Event) =>
            setMetadata("backstory", (e.target as HTMLTextAreaElement).value),
        }),
      ]),
      m("div.col-md-6", [
        m("label.form-label", "Notes"),
        m("textarea.form-control", {
          rows: 3,
          value: state.characterMetadata.notes,
          oninput: (e: Event) =>
            setMetadata("notes", (e.target as HTMLTextAreaElement).value),
        }),
      ]),
    ]),
    m(
      "p.small.text-muted mt-2 mb-0",
      "Archetypes are suggestions only. Equipment remains unrestricted unless future class rules are explicitly enabled.",
    ),
  ]);
}

function sheetModal() {
  const items = equippedItems();
  return m(
    "div.modal.fade",
    {
      id: "characterSheetModal",
      tabindex: "-1",
      "aria-labelledby": "characterSheetLabel",
    },
    [
      m(
        "div.modal-dialog.modal-lg.modal-dialog-scrollable",
        m("div.modal-content", [
          m("div.modal-header", [
            m(
              "h2.h5.modal-title",
              { id: "characterSheetLabel" },
              "Character Sheet",
            ),
            m("button.btn-close", {
              type: "button",
              "data-bs-dismiss": "modal",
              "aria-label": "Close",
            }),
          ]),
          m("div.modal-body", [
            m("h3.h4", state.characterMetadata.name || "Unnamed character"),
            state.characterMetadata.title
              ? m("p.lead", state.characterMetadata.title)
              : null,
            m("dl.row", [
              m("dt.col-sm-4", "Archetype"),
              m("dd.col-sm-8", archetypeLabel()),
              m("dt.col-sm-4", "Dominant palette"),
              m("dd.col-sm-8", dominantPalette()),
              m("dt.col-sm-4", "Saved"),
              m("dd.col-sm-8", formatDate(state.characterMetadata.savedAt)),
              m("dt.col-sm-4", "Last modified"),
              m("dd.col-sm-8", formatDate(state.characterMetadata.modifiedAt)),
            ]),
            m("h4.h6", "Equipped items"),
            items.length
              ? m(
                  "ul",
                  items.map((item) => m("li", item.name)),
                )
              : m("p.text-muted", "No items selected."),
            state.characterMetadata.tags
              ? m("p", [m("strong", "Tags: "), state.characterMetadata.tags])
              : null,
            state.characterMetadata.backstory
              ? m("p", [
                  m("strong", "Backstory: "),
                  state.characterMetadata.backstory,
                ])
              : null,
            state.characterMetadata.notes
              ? m("p", [m("strong", "Notes: "), state.characterMetadata.notes])
              : null,
          ]),
        ]),
      ),
    ],
  );
}

export const CharacterPresentation: m.Component = {
  view() {
    const items = equippedItems();
    return m("section.character-presentation", [
      metadataForm(),
      m("div.character-summary-card.app-panel.p-3", [
        m("div.d-flex.gap-3", [
          previewCanvas(),
          m("div.flex-grow-1", [
            m("span.creator-kicker", "Summary card"),
            m(
              "h3.h5.mb-1",
              state.characterMetadata.name || "Unnamed character",
            ),
            state.characterMetadata.title
              ? m("p.mb-1", state.characterMetadata.title)
              : null,
            m("p.small.text-muted.mb-2", `Archetype: ${archetypeLabel()}`),
            m("p.small.mb-1", [
              m("strong", "Dominant palette: "),
              dominantPalette(),
            ]),
            m("p.small.mb-1", [
              m("strong", "Saved: "),
              formatDate(state.characterMetadata.savedAt),
            ]),
            m("p.small.mb-2", [
              m("strong", "Last modified: "),
              formatDate(state.characterMetadata.modifiedAt),
            ]),
            m(
              "div.tags",
              items.slice(0, 8).map((item) => m("span.tag.is-info", item.name)),
            ),
            m(
              "button.btn.btn-dark.btn-sm.mt-2",
              {
                type: "button",
                "data-bs-toggle": "modal",
                "data-bs-target": "#characterSheetModal",
              },
              "Open Character Sheet",
            ),
          ]),
        ]),
      ]),
      sheetModal(),
    ]);
  },
};
