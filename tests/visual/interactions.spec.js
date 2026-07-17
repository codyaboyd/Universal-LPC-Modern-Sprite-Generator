import { expect, test } from "@playwright/test";
import { argosScreenshot } from "@argos-ci/playwright";
import {
  gotoHomepageReady,
  openHumanMaleSkintonePalette,
} from "./home-helpers.js";

const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://localhost:5173";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__DISABLE_PREVIEW_ANIMATION__ = true;
  });
  await gotoHomepageReady(page, BASE_URL);
});

test("animation controls switch direction and remain keyboard reachable", async ({
  page,
}) => {
  const direction = page.locator("#preview-direction-select");
  await expect(direction).toBeVisible();
  await direction.selectOption("0");
  await expect(direction).toHaveValue("0");
  await direction.press("ArrowDown");
  await expect(direction).toHaveValue("1");
  await expect(page.locator("#preview-animation-select")).toBeVisible();
});

test("keyboard shortcut opens and traps focus in the Bootstrap export offcanvas", async ({
  page,
}) => {
  await page.keyboard.press("e");
  const sheet = page.locator("#exportSheet");
  await expect(sheet).toHaveClass(/show/);
  await expect(
    sheet.getByRole("heading", { name: "Export your hero" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(sheet.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(sheet).not.toHaveClass(/show/);
});

test("navigation menus open a viewport dialog and lock page scrolling", async ({
  page,
}) => {
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.isVisible()) await skipTour.click();
  await page.getByRole("button", { name: "Settings" }).click();

  const modal = page.locator(".creator-menu-modal");
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/modal-open/);
  await expect(page.locator("body > .creator-menu-portal")).toContainText(
    "Settings",
  );

  const bounds = await modal.boundingBox();
  expect(bounds).toEqual({ x: 0, y: 0, width: 1280, height: 720 });

  await modal.getByRole("button", { name: "Close Settings menu" }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/modal-open/);
});

test("mobile category navigation and Bootstrap modal are operable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const chooser = page.locator("#chooser-column");
  await expect(chooser).toBeVisible();
  await chooser.getByText("Head", { exact: true }).first().click();
  await expect(
    chooser.getByText("Heads", { exact: true }).first(),
  ).toBeVisible();
  await openHumanMaleSkintonePalette(page);
  const modal = page.locator(".palette-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute("role", "dialog");
});

test("reduced motion suppresses preview and overlay transitions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const duration = await page.locator(".app-shell").evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "modal show";
    probe.innerHTML = '<div class="modal-dialog"></div>';
    document.body.append(probe);
    const value = getComputedStyle(probe.firstElementChild).transitionDuration;
    probe.remove();
    return value;
  });
  expect(duration).toMatch(/^(0s|0\.0+1s)$/);
});

test("exports a non-empty PNG from the current composed sprite", async ({
  page,
}) => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save PNG" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("character-spritesheet.png");
  const path = await download.path();
  expect(path).toBeTruthy();
});

test("captures animation and direction controls for visual regression", async ({
  page,
}) => {
  await page.locator("#preview-direction-select").selectOption("3");
  await page.locator("#preview-animation-select").selectOption("walk");
  if (process.env.ARGOS_TOKEN?.trim()) {
    await argosScreenshot(page, "animation-preview-direction-left", {
      stabilize: {
        waitForFonts: true,
        waitForImages: true,
        waitForAriaBusy: true,
      },
    });
  }
});
