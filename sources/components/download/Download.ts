// Download component
import m from "mithril";
import { state } from "../../state/state.ts";
import {
  drawCalls,
  extractAnimationFromCanvas,
  getCanvas,
  SHEET_HEIGHT,
  SHEET_WIDTH,
} from "../../canvas/renderer.ts";
import {
  getAllCredits,
  creditsToCsv,
  creditsToTxt,
} from "../../utils/credits.ts";
import { CollapsibleSection } from "../CollapsibleSection.ts";
import { downloadBlob, downloadFile } from "../../canvas/download.ts";
import {
  importStateFromJSON,
  exportStateAsJSON,
  serializeLayersForJson,
} from "../../state/json.ts";
import {
  exportSplitAnimations,
  exportSplitItemSheets,
  exportSplitItemAnimations,
  exportIndividualFrames,
} from "../../state/zip.ts";
import { debugLog } from "../../utils/debug.ts";
import {
  ANIMATIONS,
  ANIMATION_CONFIGS,
  DIRECTIONS,
  FRAME_SIZE,
} from "../../state/constants.ts";
import { canvasToBlob, get2DContext } from "../../canvas/canvas-utils.ts";
import type { CatalogReader } from "../../state/catalog.ts";
import { validateSelections } from "../../state/compatibility.ts";

const zipExportTitle = "Wait for layer data to finish loading";

type ExportFormat =
  | "full-png"
  | "selected-animation-png"
  | "individual-frame-png"
  | "zip-animation-groups"
  | "preset-json"
  | "png-metadata-package";

const exportWorkflow = {
  format: "full-png" as ExportFormat,
  spriteSheetType: "standard",
  animationGroups: ["walk"],
  directions: [...DIRECTIONS],
  scale: 1,
  transparentBackground: true,
  fileName: "character-spritesheet",
  includeMetadataJson: true,
  isExporting: false,
  progress: "",
  error: "",
  validationNonce: 0,
  completionNonce: 0,
};

const formatLabels: Record<ExportFormat, string> = {
  "full-png": "Full sprite sheet PNG",
  "selected-animation-png": "Selected animation PNG",
  "individual-frame-png": "Individual frame PNG",
  "zip-animation-groups": "ZIP of animation groups",
  "preset-json": "Character preset JSON",
  "png-metadata-package": "Combined PNG plus metadata package",
};

function safeFileName(
  name: string,
  fallback = "character-spritesheet",
): string {
  const cleaned = name
    .trim()
    // eslint-disable-next-line no-control-regex -- sanitize Windows-forbidden control characters from filenames.
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[. -]+|[. -]+$/g, "");
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (!cleaned || reserved.test(cleaned)) return fallback;
  return cleaned.slice(0, 120);
}

function selectedAnimations(): string[] {
  return exportWorkflow.animationGroups.filter((animation) =>
    Boolean((ANIMATION_CONFIGS as Record<string, unknown>)[animation]),
  );
}

function estimateFrames(): number {
  const configs = ANIMATION_CONFIGS as Record<
    string,
    { num: number; cycle: number[] } | undefined
  >;
  const directions = Math.max(1, exportWorkflow.directions.length);
  if (exportWorkflow.format === "full-png")
    return (SHEET_WIDTH / FRAME_SIZE) * (SHEET_HEIGHT / FRAME_SIZE);
  if (exportWorkflow.format === "preset-json") return 0;
  return selectedAnimations().reduce((total, animation) => {
    const config = configs[animation];
    return (
      total +
      (config ? config.cycle.length * Math.min(config.num, directions) : 0)
    );
  }, 0);
}

function previewDimensions(): string {
  const scale = exportWorkflow.scale;
  const configs = ANIMATION_CONFIGS as Record<
    string,
    { num: number } | undefined
  >;
  if (exportWorkflow.format === "preset-json") return "Metadata only";
  if (
    exportWorkflow.format === "full-png" ||
    exportWorkflow.format === "png-metadata-package"
  ) {
    return `${SHEET_WIDTH * scale} × ${SHEET_HEIGHT * scale}px`;
  }
  const rows = selectedAnimations().reduce(
    (total, animation) => total + (configs[animation]?.num ?? 0),
    0,
  );
  return `${SHEET_WIDTH * scale} × ${Math.max(FRAME_SIZE, rows * FRAME_SIZE) * scale}px`;
}

function validateExport(catalog: CatalogReader): string[] {
  const warnings: string[] = [];
  if (Object.keys(state.selections).length === 0)
    warnings.push(
      "Empty character state: choose at least one asset before exporting.",
    );
  if (
    exportWorkflow.format !== "preset-json" &&
    (!window.canvasRenderer || getCanvas().isErr())
  )
    warnings.push(
      "Missing rendered sprite sheet: wait for the character preview to finish rendering.",
    );
  if (!catalog.isLayersReady())
    warnings.push("Missing assets: layer metadata is still loading.");
  if (state.assetLoadFailures.length > 0)
    warnings.push(
      `Failed image loads: ${state.assetLoadFailures.slice(0, 3).join(", ")}${state.assetLoadFailures.length > 3 ? "…" : ""}`,
    );
  if (![1, 2, 3, 4].includes(exportWorkflow.scale))
    warnings.push("Unsupported scale: choose 1×, 2×, 3×, or 4×.");
  if (
    selectedAnimations().length === 0 &&
    !["full-png", "preset-json", "png-metadata-package"].includes(
      exportWorkflow.format,
    )
  )
    warnings.push(
      "Incomplete animation frames: select at least one animation group.",
    );
  if (
    exportWorkflow.directions.length === 0 &&
    exportWorkflow.format !== "preset-json"
  )
    warnings.push(
      "Incomplete animation frames: select at least one direction.",
    );
  warnings.push(
    ...validateSelections({
      catalog,
      bodyType: state.bodyType,
      animation: state.selectedAnimation,
      selections: state.selections,
    }).flatMap((report) =>
      report.issues.map((issue) => `Incompatible layers: ${issue.message}`),
    ),
  );
  return warnings;
}

function makeScaledCanvas(
  source: HTMLCanvasElement,
  scale: number,
): HTMLCanvasElement {
  if (scale === 1) return source;
  const out = document.createElement("canvas");
  out.width = source.width * scale;
  out.height = source.height * scale;
  const outCtx = get2DContext(out);
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

async function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<void> {
  const blob = await canvasToBlob(canvas);
  downloadBlob(blob, filename, "image/png");
}

export const Download: m.Component<{ catalog: CatalogReader }> = {
  view(vnode) {
    const zipDisabled = !vnode.attrs.catalog.isLayersReady();

    const importFromClipboard = async (): Promise<void> => {
      if (!window.canvasRenderer) return;
      try {
        const json = await navigator.clipboard.readText();
        debugLog(json);
        const imported = importStateFromJSON(json);
        Object.assign(state, imported);

        m.redraw();
        alert("Imported successfully!");
      } catch (err) {
        console.error("Failed to import from clipboard:", err);
        alert(
          "Failed to import. Please check clipboard content and browser permissions.",
        );
      }
    };

    const jsonForExport = () =>
      exportStateAsJSON(
        vnode.attrs.catalog,
        state,
        serializeLayersForJson(drawCalls),
      );

    const exportToClipboard = async (): Promise<void> => {
      if (!window.canvasRenderer) return;
      try {
        const json = jsonForExport();
        debugLog(json);
        await navigator.clipboard.writeText(json);
        alert("Exported to clipboard!");
      } catch (err) {
        console.error("Failed to copy to clipboard:", err);
        alert("Failed to copy to clipboard. Please check browser permissions.");
      }
    };

    const runExport = async (): Promise<void> => {
      if (exportWorkflow.isExporting) return;
      const warnings = validateExport(vnode.attrs.catalog);
      if (
        warnings.some(
          (warning) =>
            warning.startsWith("Unsupported") ||
            warning.startsWith("Empty") ||
            warning.startsWith("Missing rendered"),
        )
      ) {
        exportWorkflow.error = "Resolve validation warnings before exporting.";
        exportWorkflow.validationNonce += 1;
        return;
      }
      exportWorkflow.isExporting = true;
      exportWorkflow.error = "";
      exportWorkflow.progress = "Preparing export…";
      m.redraw();
      try {
        const base = safeFileName(exportWorkflow.fileName);
        const scale = exportWorkflow.scale;
        if (exportWorkflow.format === "full-png") {
          exportWorkflow.progress = "Writing full transparent PNG…";
          const result = getCanvas();
          if (result.isErr()) throw new Error("Canvas is not ready.");
          await downloadCanvas(
            makeScaledCanvas(result.value, scale),
            `${base}.png`,
          );
        } else if (
          exportWorkflow.format === "selected-animation-png" ||
          exportWorkflow.format === "individual-frame-png"
        ) {
          const animation = selectedAnimations()[0] ?? state.selectedAnimation;
          exportWorkflow.progress = `Extracting ${animation} frames…`;
          const source = extractAnimationFromCanvas(animation);
          if (!source)
            throw new Error(`Animation ${animation} is not available.`);
          if (exportWorkflow.format === "selected-animation-png") {
            await downloadCanvas(
              makeScaledCanvas(source, scale),
              `${base}-${safeFileName(animation)}.png`,
            );
          } else {
            const frame = document.createElement("canvas");
            frame.width = FRAME_SIZE;
            frame.height = FRAME_SIZE;
            get2DContext(frame).drawImage(
              source,
              0,
              0,
              FRAME_SIZE,
              FRAME_SIZE,
              0,
              0,
              FRAME_SIZE,
              FRAME_SIZE,
            );
            await downloadCanvas(
              makeScaledCanvas(frame, scale),
              `${base}-${safeFileName(animation)}-frame-000.png`,
            );
          }
        } else if (exportWorkflow.format === "zip-animation-groups") {
          exportWorkflow.progress = "Building ZIP of animation groups…";
          await exportSplitAnimations();
        } else if (exportWorkflow.format === "preset-json") {
          exportWorkflow.progress = "Writing character metadata JSON…";
          downloadFile(jsonForExport(), `${base}.json`, "application/json");
        } else {
          exportWorkflow.progress = "Packaging PNG and metadata…";
          if (!window.JSZip)
            throw new Error("ZIP support is unavailable in this browser.");
          const result = getCanvas();
          if (result.isErr()) throw new Error("Canvas is not ready.");
          const zip = new window.JSZip();
          const png = await canvasToBlob(makeScaledCanvas(result.value, scale));
          zip.file(`${base}.png`, png);
          zip.file(`${base}.json`, jsonForExport());
          const blob = await zip.generateAsync({ type: "blob" });
          downloadBlob(blob, `${base}-package.zip`, "application/zip");
        }
        exportWorkflow.progress = "Export complete.";
        exportWorkflow.completionNonce += 1;
      } catch (err) {
        console.error("Export failed:", err);
        exportWorkflow.error = `Export failed: ${(err as Error).message}`;
      } finally {
        exportWorkflow.isExporting = false;
        m.redraw();
      }
    };

    const warnings = validateExport(vnode.attrs.catalog);
    const downloadDisabled =
      exportWorkflow.isExporting ||
      (zipDisabled && exportWorkflow.format === "zip-animation-groups");
    const formats: ExportFormat[] = [
      "full-png",
      "selected-animation-png",
      "individual-frame-png",
      "zip-animation-groups",
      "preset-json",
      "png-metadata-package",
    ];

    return m(CollapsibleSection, { title: "Export", defaultOpen: true }, [
      m("div.box", [
        m("h3.title.is-6", "RPG asset export"),
        m("div.columns.is-multiline", [
          m("div.column.is-half", [
            m("label.label", "Export format"),
            m(
              "div.select.is-fullwidth",
              m(
                "select",
                {
                  value: exportWorkflow.format,
                  onchange: (e: Event) =>
                    (exportWorkflow.format = (e.target as HTMLSelectElement)
                      .value as ExportFormat),
                },
                formats.map((format) =>
                  m("option", { value: format }, formatLabels[format]),
                ),
              ),
            ),
          ]),
          m("div.column.is-half", [
            m("label.label", "Sprite sheet type"),
            m(
              "div.select.is-fullwidth",
              m(
                "select",
                {
                  value: exportWorkflow.spriteSheetType,
                  onchange: (e: Event) =>
                    (exportWorkflow.spriteSheetType = (
                      e.target as HTMLSelectElement
                    ).value),
                },
                [
                  m("option", { value: "standard" }, "Universal LPC standard"),
                  m("option", { value: "selected" }, "Selected animation only"),
                ],
              ),
            ),
          ]),
          m("div.column.is-half", [
            m("label.label", "Included animation groups"),
            m(
              "div.field.is-grouped.is-grouped-multiline",
              ANIMATIONS.filter((a) => !a.noExport).map((animation) =>
                m("label.checkbox.mr-2", [
                  m("input[type=checkbox]", {
                    checked: exportWorkflow.animationGroups.includes(
                      animation.value,
                    ),
                    onchange: (e: Event) => {
                      const checked = (e.target as HTMLInputElement).checked;
                      exportWorkflow.animationGroups = checked
                        ? [...exportWorkflow.animationGroups, animation.value]
                        : exportWorkflow.animationGroups.filter(
                            (value) => value !== animation.value,
                          );
                    },
                  }),
                  ` ${animation.label}`,
                ]),
              ),
            ),
          ]),
          m("div.column.is-half", [
            m("label.label", "Included directions"),
            DIRECTIONS.map((direction) =>
              m("label.checkbox.mr-3", [
                m("input[type=checkbox]", {
                  checked: exportWorkflow.directions.includes(direction),
                  onchange: (e: Event) => {
                    const checked = (e.target as HTMLInputElement).checked;
                    exportWorkflow.directions = checked
                      ? [...exportWorkflow.directions, direction]
                      : exportWorkflow.directions.filter(
                          (value) => value !== direction,
                        );
                  },
                }),
                ` ${direction}`,
              ]),
            ),
          ]),
          m("div.column.is-one-quarter", [
            m("label.label", "Scale"),
            m(
              "div.select.is-fullwidth",
              m(
                "select",
                {
                  value: String(exportWorkflow.scale),
                  onchange: (e: Event) =>
                    (exportWorkflow.scale = Number(
                      (e.target as HTMLSelectElement).value,
                    )),
                },
                [1, 2, 3, 4].map((scale) =>
                  m("option", { value: String(scale) }, `${scale}×`),
                ),
              ),
            ),
          ]),
          m("div.column.is-one-quarter", [
            m("label.label", "Background"),
            m("label.checkbox", [
              m("input[type=checkbox]", {
                checked: exportWorkflow.transparentBackground,
                onchange: (e: Event) =>
                  (exportWorkflow.transparentBackground = (
                    e.target as HTMLInputElement
                  ).checked),
              }),
              " Transparent background",
            ]),
          ]),
          m("div.column.is-half", [
            m("label.label", "File naming"),
            m("input.input", {
              value: exportWorkflow.fileName,
              oninput: (e: Event) =>
                (exportWorkflow.fileName = (
                  e.target as HTMLInputElement
                ).value),
              placeholder: "character-spritesheet",
            }),
            m("p.help", `Safe name: ${safeFileName(exportWorkflow.fileName)}`),
          ]),
          m("div.column.is-full", [
            m("label.checkbox", [
              m("input[type=checkbox]", {
                checked: exportWorkflow.includeMetadataJson,
                onchange: (e: Event) =>
                  (exportWorkflow.includeMetadataJson = (
                    e.target as HTMLInputElement
                  ).checked),
              }),
              " Character metadata JSON",
            ]),
          ]),
        ]),
        m("div.tags", [
          m(
            "span.tag.is-info.is-light",
            `Preview dimensions: ${previewDimensions()}`,
          ),
          m(
            "span.tag.is-link.is-light",
            `Estimated frames: ${estimateFrames()}`,
          ),
        ]),
        warnings.length
          ? m(
              "div.notification.is-warning.is-light.rpg-anim-shake-error",
              {
                key: `warnings-${exportWorkflow.validationNonce}-${warnings.join("|")}`,
              },
              [
                m("strong", "Validation warnings"),
                m(
                  "ul",
                  warnings.map((warning) => m("li", warning)),
                ),
              ],
            )
          : m(
              "div.notification.is-success.is-light.rpg-anim-fade-in",
              "Pre-export validation passed.",
            ),
        exportWorkflow.error
          ? m(
              "div.notification.is-danger.is-light.rpg-anim-shake-error",
              {
                key: `error-${exportWorkflow.validationNonce}-${exportWorkflow.error}`,
              },
              exportWorkflow.error,
            )
          : null,
        exportWorkflow.progress
          ? m(
              "progress.progress.is-small.is-primary.rpg-anim-gold-shimmer",
              {
                key: `progress-${exportWorkflow.progress}-${exportWorkflow.completionNonce}`,
                max: 100,
                value: exportWorkflow.isExporting ? undefined : 100,
              },
              exportWorkflow.progress,
            )
          : null,
        m("div.buttons", [
          m(
            "button.button.is-primary",
            {
              disabled: downloadDisabled,
              title:
                zipDisabled && exportWorkflow.format === "zip-animation-groups"
                  ? zipExportTitle
                  : undefined,
              onclick: runExport,
            },
            exportWorkflow.isExporting ? "Exporting…" : "Download export",
          ),
          m(
            "button.button.is-small",
            {
              onclick: () =>
                downloadFile(
                  creditsToTxt(
                    getAllCredits(
                      vnode.attrs.catalog,
                      state.selections,
                      state.bodyType,
                    ),
                  ),
                  "credits.txt",
                  "text/plain",
                ),
            },
            "Credits (TXT)",
          ),
          m(
            "button.button.is-small",
            {
              onclick: () =>
                downloadFile(
                  creditsToCsv(
                    getAllCredits(
                      vnode.attrs.catalog,
                      state.selections,
                      state.bodyType,
                    ),
                  ),
                  "credits.csv",
                  "text/csv",
                ),
            },
            "Credits (CSV)",
          ),
          m(
            "button.button.is-small.is-info",
            {
              disabled: exportWorkflow.isExporting || zipDisabled,
              title: zipDisabled ? zipExportTitle : undefined,
              onclick: exportSplitItemSheets,
            },
            "ZIP: Split by item",
          ),
          m(
            "button.button.is-small.is-info",
            {
              disabled: exportWorkflow.isExporting || zipDisabled,
              title: zipDisabled ? zipExportTitle : undefined,
              onclick: exportSplitItemAnimations,
            },
            "ZIP: Split by animation and item",
          ),
          m(
            "button.button.is-small.is-info",
            {
              disabled: exportWorkflow.isExporting || zipDisabled,
              title: zipDisabled ? zipExportTitle : undefined,
              onclick: exportIndividualFrames,
            },
            "ZIP: Split by animation and frame",
          ),
          m(
            "button.button.is-small.is-link",
            {
              disabled: exportWorkflow.isExporting,
              onclick: exportToClipboard,
            },
            "Export to Clipboard (JSON)",
          ),
          m(
            "button.button.is-small.is-link",
            {
              disabled: exportWorkflow.isExporting,
              onclick: importFromClipboard,
            },
            "Import from Clipboard (JSON)",
          ),
        ]),
      ]),
    ]);
  },
};
