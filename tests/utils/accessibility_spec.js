import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha-globals";
import {
  describeCharacter,
  focusFirst,
  trapTabKey,
} from "../../sources/utils/accessibility.ts";

describe("utils/accessibility.ts", () => {
  let root;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      value: 1,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      value: 1,
    });
  });

  afterEach(() => {
    root.remove();
  });

  it("summarizes the selected character without canvas pixels", () => {
    const summary = describeCharacter(
      {
        body: { name: "Human light" },
        weapon: { itemId: "sword_bronze" },
      },
      "male",
      "walk",
    );

    expect(summary).to.include("Body type male");
    expect(summary).to.include("Animation walk");
    expect(summary).to.include("body: Human light");
    expect(summary).to.include("weapon: sword_bronze");
  });

  it("focuses the first available control in a dialog", () => {
    root.innerHTML = `<div tabindex="-1"><button id="first">First</button><button>Second</button></div>`;
    focusFirst(root.firstElementChild);
    expect(document.activeElement.id).to.equal("first");
  });

  it("traps Tab and Shift+Tab inside modal dialogs", () => {
    root.innerHTML = `<div tabindex="-1"><button id="first">First</button><button id="last">Last</button></div>`;
    const dialog = root.firstElementChild;
    const first = dialog.querySelector("#first");
    const last = dialog.querySelector("#last");

    last.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    trapTabKey(tab, dialog);
    expect(document.activeElement).to.equal(first);

    first.focus();
    const shiftTab = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
    });
    trapTabKey(shiftTab, dialog);
    expect(document.activeElement).to.equal(last);
  });
});
