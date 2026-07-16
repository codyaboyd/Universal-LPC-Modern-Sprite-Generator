import { expect } from "chai";
import { afterEach, beforeEach, describe, it } from "mocha-globals";
import {
  defaultCatalog,
  resetCatalogForTests,
} from "../../sources/state/catalog.ts";
import { state } from "../../sources/state/state.ts";
import {
  randomizeCharacter,
  restoreRandomizerSnapshot,
  snapshotRandomizer,
} from "../../sources/state/randomizer.ts";
import {
  createPreset,
  exportPresetJson,
  importPresetJson,
  loadPresets,
  saveCurrentPreset,
} from "../../sources/state/presets.ts";
import {
  recordSelectionHistory,
  redoSelections,
  undoSelections,
} from "../../sources/state/power-user.ts";
import {
  restoreAppCatalogAfterTest,
  seedBrowserCatalog,
} from "../browser-catalog-fixture.js";
import {
  modernAppItems,
  modernAppTree,
} from "../fixtures/modern-app-catalog.js";

const unlocked = { categories: {}, choices: {} };

describe("modern application regression workflows", () => {
  beforeEach(() => {
    resetCatalogForTests();
    seedBrowserCatalog(modernAppItems, { categoryTree: modernAppTree });
    localStorage.clear();
    state.bodyType = "male";
    state.selectedAnimation = "walk";
    state.selections = {
      body: { itemId: "body_male", name: "Body", variant: "light" },
    };
  });

  afterEach(async () => {
    localStorage.clear();
    await restoreAppCatalogAfterTest();
  });

  it("uses representative layers in stable z-order without changing sprite metadata", () => {
    const ids = ["sword", "body_male", "shirt"];
    const ordered = ids.sort(
      (a, b) =>
        defaultCatalog.getItemMerged(a).value.layers.layer_1.zPos -
        defaultCatalog.getItemMerged(b).value.layers.layer_1.zPos,
    );
    expect(ordered).to.deep.equal(["body_male", "shirt", "sword"]);
  });

  it("randomizes compatibly and reproduces a roll from its seed", () => {
    const run = () => {
      state.bodyType = "male";
      state.selections = {};
      randomizeCharacter({
        catalog: defaultCatalog,
        mode: "full",
        seed: "regression-seed",
        locks: unlocked,
      });
      return {
        bodyType: state.bodyType,
        selections: structuredClone(state.selections),
      };
    };
    expect(run()).to.deep.equal(run());
    for (const selection of Object.values(state.selections)) {
      expect(modernAppItems[selection.itemId].required).to.include(
        state.bodyType,
      );
    }
  });

  it("honors category locks and supports randomizer undo", () => {
    const before = snapshotRandomizer("locked-seed");
    randomizeCharacter({
      catalog: defaultCatalog,
      mode: "colors",
      seed: "locked-seed",
      locks: { categories: { body: true }, choices: {} },
    });
    expect(state.selections.body.variant).to.equal("light");
    state.selections = {};
    restoreRandomizerSnapshot(before);
    expect(state.selections.body.itemId).to.equal("body_male");
  });

  it("saves, loads and round-trips a versioned preset", () => {
    state.selections.weapon = {
      itemId: "sword",
      name: "Sword",
      variant: "steel",
    };
    const saved = saveCurrentPreset("character", "Fixture hero");
    expect(loadPresets()).to.have.length(1);
    expect(loadPresets()[0].selections.weapon.itemId).to.equal("sword");
    const imported = importPresetJson(exportPresetJson(saved));
    expect(imported.metadata.name).to.equal("Fixture hero");
    expect(imported.id).not.to.equal(saved.id);
  });

  it("rejects malformed, obsolete and truncated presets without damaging state", () => {
    const before = structuredClone(state.selections);
    for (const invalid of [
      "not json",
      "{}",
      JSON.stringify({ schemaVersion: 0, id: "old", selections: {} }),
    ]) {
      expect(() => importPresetJson(invalid)).to.throw();
    }
    localStorage.setItem("ulpc:presets:v1", "{truncated");
    expect(loadPresets()).to.deep.equal([]);
    expect(state.selections).to.deep.equal(before);
  });

  it("keeps appearance and equipment preset boundaries", () => {
    state.selections.hair = { itemId: "hair_short", name: "Hair" };
    state.selections.torso = { itemId: "shirt", name: "Shirt" };
    expect(Object.keys(createPreset("appearance").selections)).to.have.members([
      "body",
      "hair",
    ]);
    expect(Object.keys(createPreset("loadout").selections)).to.deep.equal([
      "torso",
    ]);
  });

  it("undoes and redoes item equipment and removal", () => {
    recordSelectionHistory("fixture start");
    state.selections.weapon = { itemId: "sword", name: "Sword" };
    recordSelectionHistory("equipped sword");
    delete state.selections.weapon;
    recordSelectionHistory("removed sword");
    expect(undoSelections()).to.equal(true);
    expect(state.selections.weapon.itemId).to.equal("sword");
    expect(redoSelections()).to.equal(true);
    expect(state.selections.weapon).to.equal(undefined);
  });
});
