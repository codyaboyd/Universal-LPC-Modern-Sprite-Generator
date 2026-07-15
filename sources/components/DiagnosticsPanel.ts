import m from "mithril";
import { state } from "../state/state.ts";
import {
  appVersion,
  PRESET_SCHEMA_VERSION,
  clearAppCache,
  diagnosticText,
  getActiveRenderingMode,
  getAssetCatalogVersion,
  getBrowserCapabilities,
  resilienceState,
} from "../resilience.ts";

type Local = { copied: boolean };

export const DiagnosticsPanel: m.Component<Record<string, never>, Local> = {
  oninit(vnode) {
    vnode.state.copied = false;
  },
  view(vnode) {
    const caps = getBrowserCapabilities();
    return m("details.app-panel.p-3.mt-3", { "aria-label": "Diagnostics" }, [
      m("summary", "Diagnostics"),
      m(
        "p.small.text-muted.mt-2",
        "Advanced recovery and support details. No stack traces are shown here.",
      ),
      resilienceState.errors[0]
        ? m("p.alert.alert-warning.py-2", resilienceState.errors[0].message)
        : null,
      m("dl.row.small", [
        m("dt.col-6", "Application version"),
        m("dd.col-6", appVersion),
        m("dt.col-6", "Asset catalog version"),
        m("dd.col-6", getAssetCatalogVersion()),
        m("dt.col-6", "Failed asset count"),
        m("dd.col-6", String(state.assetLoadFailures.length)),
        m("dt.col-6", "Preset schema version"),
        m("dd.col-6", String(PRESET_SCHEMA_VERSION)),
        m("dt.col-6", "Browser capabilities"),
        m(
          "dd.col-6",
          Object.entries(caps)
            .filter(([, ok]) => ok)
            .map(([key]) => key)
            .join(", ") || "Limited",
        ),
        m("dt.col-6", "Active rendering mode"),
        m("dd.col-6", getActiveRenderingMode()),
      ]),
      state.assetLoadFailures.length
        ? m(
            "p.small.text-warning",
            `${state.assetLoadFailures.length} image asset(s) could not be loaded; missing layers were skipped safely.`,
          )
        : null,
      m("div.d-flex.flex-wrap.gap-2", [
        m(
          "button.btn.btn-outline-secondary.btn-sm",
          {
            type: "button",
            onclick: async () => {
              await navigator.clipboard?.writeText(diagnosticText());
              vnode.state.copied = true;
            },
          },
          vnode.state.copied ? "Diagnostics copied" : "Copy diagnostics",
        ),
        m(
          "button.btn.btn-outline-danger.btn-sm",
          {
            type: "button",
            onclick: () => {
              if (
                window.confirm(
                  "Clear local presets, autosaves, and generated image caches?",
                )
              )
                clearAppCache();
            },
          },
          "Clear cache",
        ),
      ]),
    ]);
  },
};
