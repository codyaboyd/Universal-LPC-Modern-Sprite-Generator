import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha-globals";
import {
  evaluateItemCompatibility,
  getMatchingVariant,
  validateSelections,
} from "../../sources/state/compatibility.ts";
import {
  defaultCatalog,
  resetCatalogForTests,
} from "../../sources/state/catalog.ts";
import {
  restoreAppCatalogAfterTest,
  seedBrowserCatalog,
} from "../browser-catalog-fixture.js";

function item(overrides = {}) {
  return {
    name: "Item",
    type_name: "item",
    required: ["male", "female"],
    animations: ["walk", "slash"],
    variants: [],
    recolors: [],
    matchBodyColor: false,
    layers: {
      layer_1: { male: "items/item/", female: "items/item/", zPos: 100 },
    },
    credits: [],
    ...overrides,
  };
}

describe("state/compatibility.ts", () => {
  beforeEach(() => resetCatalogForTests());

  afterEach(async () => {
    await restoreAppCatalogAfterTest();
  });

  it("rejects items without frames for the current body", () => {
    seedBrowserCatalog({
      hat: item({ required: ["male"], layers: { layer_1: { male: "hat/" } } }),
    });

    const report = evaluateItemCompatibility({
      catalog: defaultCatalog,
      itemId: "hat",
      bodyType: "child",
      animation: "walk",
      selections: {},
    });

    expect(report.compatible).to.equal(false);
    expect(report.issues.map((issue) => issue.kind)).to.include("body");
  });

  it("rejects items that do not support the selected animation", () => {
    seedBrowserCatalog({ bow: item({ animations: ["shoot"] }) });

    const report = evaluateItemCompatibility({
      catalog: defaultCatalog,
      itemId: "bow",
      bodyType: "male",
      animation: "slash",
      selections: {},
    });

    expect(report.compatible).to.equal(false);
    expect(report.issues[0].kind).to.equal("animation");
  });

  it("reports conflicts, hidden layers, required layers, substitutes, variants, and incomplete directions", () => {
    seedBrowserCatalog({
      helm: item({
        name: "Helmet",
        type_name: "hat",
        variants: ["steel"],
        compatibility: {
          conflicts: ["hair"],
          hides: ["ears"],
          requires: ["head"],
          substitutes: { child: "child_helm" },
          incompleteDirections: ["up"],
        },
      }),
      child_helm: item({ name: "Child Helmet", type_name: "hat" }),
      hair: item({ type_name: "hair" }),
      ears: item({ type_name: "ears" }),
    });

    const report = evaluateItemCompatibility({
      catalog: defaultCatalog,
      itemId: "helm",
      bodyType: "male",
      animation: "walk",
      variant: "gold",
      selections: {
        hair: { itemId: "hair", name: "Hair" },
        ears: { itemId: "ears", name: "Ears" },
      },
    });

    expect(report.compatible).to.equal(false);
    expect(report.issues.map((issue) => issue.kind)).to.include.members([
      "conflict",
      "requires",
      "variant",
      "directional-frames",
    ]);
    expect(report.hiddenSelectionKeys).to.deep.equal(["ears"]);
    expect(report.substitutions).to.deep.equal(["child_helm"]);
    expect(getMatchingVariant(defaultCatalog, "helm", "child")).to.equal(
      "child_helm",
    );
  });

  it("validates every current selection", () => {
    seedBrowserCatalog({
      boots: item(),
      shield: item({ animations: ["thrust"] }),
    });

    const reports = validateSelections({
      catalog: defaultCatalog,
      bodyType: "male",
      animation: "walk",
      selections: {
        feet: { itemId: "boots", name: "Boots" },
        shield: { itemId: "shield", name: "Shield" },
      },
    });

    expect(reports).to.have.length(2);
    expect(reports.filter((report) => !report.compatible)).to.have.length(1);
  });
});
