import m from "mithril";
import type { CatalogReader } from "../state/catalog.ts";
import { downloadFile } from "../canvas/download.ts";
import {
  applyPreset,
  deletePreset,
  duplicatePreset,
  exportPresetJson,
  importPresetJson,
  loadPresets,
  renamePreset,
  saveCurrentPreset,
  toggleFavorite,
  upsertPreset,
  type PresetKind,
  type PresetRecord,
} from "../state/presets.ts";

type Attrs = { catalog: CatalogReader };
type Local = { query: string; message: string; importText: string };

function kindLabel(kind: PresetKind): string {
  if (kind === "appearance") return "Appearance";
  if (kind === "loadout") return "Loadout";
  return "Character";
}

function matches(preset: PresetRecord, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    preset.metadata.name,
    preset.metadata.title,
    preset.metadata.tags,
    preset.metadata.notes,
    preset.kind,
    ...Object.values(preset.selections).map((selection) => selection.name),
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function promptName(fallback: string): string | null {
  return window.prompt("Preset name", fallback);
}

async function applyWithMessage(
  preset: PresetRecord,
  catalog: CatalogReader,
  local: Local,
): Promise<void> {
  const result = await applyPreset(preset, catalog);
  const warnings = [
    ...result.missing.map((item) => `Missing: ${item}`),
    ...result.incompatible.map((item) => `Incompatible: ${item}`),
  ];
  local.message = warnings.length
    ? `Applied with warnings. ${warnings.join("; ")}`
    : `Applied ${preset.metadata.name || kindLabel(preset.kind)}.`;
}

export const PresetManager: m.Component<Attrs, Local> = {
  oninit(vnode) {
    vnode.state.query = "";
    vnode.state.message = "";
    vnode.state.importText = "";
  },
  view(vnode) {
    const presets = loadPresets().filter((preset) =>
      matches(preset, vnode.state.query),
    );
    return m(
      "section.app-panel.p-3.mb-3",
      { "aria-label": "Saved presets and loadouts" },
      [
        m(
          "div.d-flex.flex-wrap.justify-content-between.align-items-start.gap-2.mb-3",
          [
            m("div", [
              m("span.creator-kicker", "Local library"),
              m("h3.h5.mb-1", "Presets & loadouts"),
              m(
                "p.small.text-muted.mb-0",
                "Save complete characters, appearance-only presets, or equipment loadouts in versioned local JSON.",
              ),
            ]),
            m("div.d-flex.flex-wrap.gap-2", [
              (["character", "appearance", "loadout"] as PresetKind[]).map(
                (kind) =>
                  m(
                    "button.btn.btn-outline-dark.btn-sm",
                    {
                      type: "button",
                      onclick: () => {
                        const name = promptName(
                          kind === "loadout" ? "New loadout" : "New preset",
                        );
                        if (name === null) return;
                        saveCurrentPreset(kind, name);
                        vnode.state.message = `Saved ${kindLabel(kind).toLowerCase()}.`;
                      },
                    },
                    `Save ${kindLabel(kind)}`,
                  ),
              ),
            ]),
          ],
        ),
        m("div.row.g-2.mb-3", [
          m("div.col-md-7", [
            m("label.form-label", "Search saved characters"),
            m("input.form-control", {
              value: vnode.state.query,
              placeholder: "Name, tag, equipment…",
              oninput: (e: Event) =>
                (vnode.state.query = (e.target as HTMLInputElement).value),
            }),
          ]),
          m("div.col-md-5", [
            m("label.form-label", "Import preset JSON"),
            m("div.input-group", [
              m("input.form-control", {
                value: vnode.state.importText,
                placeholder: "Paste JSON",
                oninput: (e: Event) =>
                  (vnode.state.importText = (
                    e.target as HTMLInputElement
                  ).value),
              }),
              m(
                "button.btn.btn-outline-primary",
                {
                  type: "button",
                  onclick: () => {
                    try {
                      const imported = importPresetJson(vnode.state.importText);
                      upsertPreset(imported);
                      vnode.state.importText = "";
                      vnode.state.message = "Imported preset JSON.";
                    } catch (error) {
                      vnode.state.message =
                        error instanceof Error
                          ? error.message
                          : "Import failed.";
                    }
                  },
                },
                "Import",
              ),
            ]),
          ]),
        ]),
        vnode.state.message
          ? m("p.small.alert.alert-info.py-2", vnode.state.message)
          : null,
        presets.length
          ? m(
              "div.row.g-2",
              presets.map((preset) =>
                m(
                  "div.col-md-6.col-xl-4",
                  { key: preset.id },
                  m("div.card.h-100", [
                    preset.thumbnail
                      ? m("img.card-img-top", {
                          src: preset.thumbnail,
                          alt: "Preset thumbnail",
                        })
                      : m("div.card-img-top bg-light text-center py-4", [
                          m("i.bi.bi-person-square.fs-1"),
                        ]),
                    m("div.card-body", [
                      m("div.d-flex justify-content-between gap-2", [
                        m("div", [
                          m(
                            "h4.h6.mb-1",
                            preset.metadata.name || "Unnamed preset",
                          ),
                          m(
                            "p.small.text-muted.mb-2",
                            `${kindLabel(preset.kind)} · modified ${new Date(preset.modifiedAt).toLocaleString()}`,
                          ),
                        ]),
                        m(
                          "button.btn.btn-link.btn-sm",
                          {
                            type: "button",
                            title: "Favorite",
                            onclick: () => toggleFavorite(preset.id),
                          },
                          preset.favorite ? "★" : "☆",
                        ),
                      ]),
                      m(
                        "p.small.mb-2",
                        `${preset.selectedLayers.length} layers · schema v${preset.schemaVersion}`,
                      ),
                      m("div.d-flex.flex-wrap.gap-1", [
                        m(
                          "button.btn.btn-primary.btn-sm",
                          {
                            type: "button",
                            onclick: () =>
                              void applyWithMessage(
                                preset,
                                vnode.attrs.catalog,
                                vnode.state,
                              ),
                          },
                          preset.kind === "loadout" ? "Apply loadout" : "Apply",
                        ),
                        m(
                          "button.btn.btn-outline-secondary.btn-sm",
                          {
                            type: "button",
                            onclick: () => duplicatePreset(preset.id),
                          },
                          "Duplicate",
                        ),
                        m(
                          "button.btn.btn-outline-secondary.btn-sm",
                          {
                            type: "button",
                            onclick: () => {
                              const name = promptName(preset.metadata.name);
                              if (name !== null) renamePreset(preset.id, name);
                            },
                          },
                          "Rename",
                        ),
                        m(
                          "button.btn.btn-outline-secondary.btn-sm",
                          {
                            type: "button",
                            onclick: () =>
                              downloadFile(
                                exportPresetJson(preset),
                                `${preset.metadata.name || "preset"}.json`,
                                "application/json",
                              ),
                          },
                          "Export JSON",
                        ),
                        m(
                          "button.btn.btn-outline-danger.btn-sm",
                          {
                            type: "button",
                            onclick: () => {
                              if (window.confirm("Delete this preset?"))
                                deletePreset(preset.id);
                            },
                          },
                          "Delete",
                        ),
                      ]),
                    ]),
                  ]),
                ),
              ),
            )
          : m("p.text-muted.mb-0", "No saved presets yet."),
      ],
    );
  },
};
