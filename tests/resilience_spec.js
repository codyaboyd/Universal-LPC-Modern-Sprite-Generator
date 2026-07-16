import { expect } from "chai";
import { describe, it, beforeEach } from "mocha-globals";
import m from "mithril";
import { errAsync, ok } from "neverthrow";
import { downloadAsPNG } from "../sources/canvas/download.ts";
import { loadPresets, importPresetJson } from "../sources/state/presets.ts";
import {
  resilienceState,
  recoverAutosaveIfPresent,
  diagnosticText,
} from "../sources/resilience.ts";
import { state } from "../sources/state/state.ts";
import {
  startPreviewAnimation,
  stopPreviewAnimation,
  getPreviewPlaybackState,
  setPreviewAnimation,
} from "../sources/canvas/preview-animation.ts";
import { CategoryTree } from "../sources/components/tree/CategoryTree.ts";
import { RandomizerPanel } from "../sources/components/RandomizerPanel.ts";

describe("resilience hardening", () => {
  beforeEach(() => {
    localStorage.clear();
    resilienceState.errors = [];
  });

  it("recovers from corrupt local storage when loading presets", () => {
    localStorage.setItem("ulpc:presets:v1", "{not json");
    expect(loadPresets()).to.deep.equal([]);
  });

  it("rejects invalid preset JSON with a user-safe error", () => {
    expect(() => importPresetJson('{"schemaVersion":999}')).to.throw(
      "Unsupported or invalid preset schema",
    );
  });

  it("recovers autosaved selections", () => {
    localStorage.setItem(
      "ulpc:autosave:v1",
      JSON.stringify({
        schemaVersion: 1,
        savedAt: "2026-01-01T00:00:00.000Z",
        bodyType: "male",
        selections: { body: { itemId: "body", name: "Body" } },
      }),
    );
    expect(recoverAutosaveIfPresent()).to.equal(true);
    expect(state.bodyType).to.equal("male");
    expect(state.selections.body.itemId).to.equal("body");
  });

  it("reports export failure without exposing a stack as the primary message", async () => {
    try {
      await downloadAsPNG("x.png", () =>
        errAsync({ kind: "canvas-not-initialized" }),
      );
      throw new Error("expected failure");
    } catch (error) {
      expect(error.message).to.equal("Canvas was not ready for export.");
    }
    expect(resilienceState.errors[0].message).to.equal(
      "Export failed because the canvas was not ready.",
    );
    expect(resilienceState.errors[0].message).not.to.include(" at ");
  });

  it("starts and stops animation preview safely", () => {
    setPreviewAnimation("walk");
    startPreviewAnimation();
    expect(getPreviewPlaybackState().frameCount).to.be.greaterThan(0);
    stopPreviewAnimation();
    expect(stopPreviewAnimation()).to.equal(false);
  });

  it("renders copyable diagnostics", () => {
    const text = diagnosticText();
    expect(text).to.include("appVersion");
    expect(text).to.include("failedAssetCount");
  });

  it("survives rapid category switching renders", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const catalog = {
      getCategoryTree: () => ok({ children: {} }),
    };
    for (let i = 0; i < 20; i++)
      m.render(
        host,
        m(CategoryTree, {
          catalog,
          selectedPath: [String(i)],
          onSelect: () => {},
        }),
      );
    expect(host.textContent).to.be.a("string");
    host.remove();
  });

  it("survives repeated randomization renders", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const catalog = {
      getCategoryTree: () => ok({ children: {} }),
      getItemsForCategory: () => ({ unwrapOr: () => [] }),
    };
    for (let i = 0; i < 10; i++)
      m.render(host, m(RandomizerPanel, { catalog }));
    expect(host.textContent).to.include("Random");
    host.remove();
  });
});
