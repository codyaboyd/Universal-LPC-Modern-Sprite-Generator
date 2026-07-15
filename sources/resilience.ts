export const appVersion = "0.0.0";
import { PRESET_SCHEMA_VERSION } from "./state/presets.ts";
import { state, resetAll, type Selections } from "./state/state.ts";
import { resetImageLoadCache } from "./canvas/load-image.ts";
import {
  clearRecolorCache,
  getPaletteRecolorConfig,
} from "./canvas/palette-recolor.ts";

const AUTOSAVE_KEY = "ulpc:autosave:v1";
const DISMISS_AUTOSAVE_KEY = "ulpc:autosave-dismissed-at:v1";
const CATALOG_VERSION = "metadata-v1";

export type UserFacingError = { message: string; detail?: string; at: string };
export const resilienceState: {
  errors: UserFacingError[];
  recoveredAutosave: boolean;
  lastRecoveryMessage: string;
} = { errors: [], recoveredAutosave: false, lastRecoveryMessage: "" };

function safeStorage<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    reportUserError(
      "Browser storage is unavailable or contains unreadable data.",
      error,
    );
    return fallback;
  }
}

export function reportUserError(message: string, error?: unknown): void {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : undefined;
  resilienceState.errors.unshift({
    message,
    detail,
    at: new Date().toISOString(),
  });
  resilienceState.errors = resilienceState.errors.slice(0, 8);
}

export function getAssetCatalogVersion(): string {
  return CATALOG_VERSION;
}

export function installGlobalErrorHandlers(): void {
  window.addEventListener("error", (event) => {
    reportUserError(
      "Something went wrong while drawing the app. You can keep working or reset safely.",
      event.error,
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportUserError(
      "An operation failed before it could finish. Try again or open diagnostics.",
      event.reason,
    );
  });
}

export type AutosaveSnapshot = {
  schemaVersion: 1;
  savedAt: string;
  bodyType: string;
  selections: Selections;
};

export function writeAutosave(): void {
  safeStorage(
    () =>
      localStorage.setItem(
        AUTOSAVE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          savedAt: new Date().toISOString(),
          bodyType: state.bodyType,
          selections: state.selections,
        } satisfies AutosaveSnapshot),
      ),
    undefined,
  );
}

export function recoverAutosaveIfPresent(): boolean {
  return safeStorage(() => {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw || localStorage.getItem(DISMISS_AUTOSAVE_KEY) === raw)
      return false;
    const parsed = JSON.parse(raw) as Partial<AutosaveSnapshot>;
    if (
      parsed.schemaVersion !== 1 ||
      !parsed.selections ||
      typeof parsed.bodyType !== "string"
    )
      return false;
    state.selections = parsed.selections;
    state.bodyType = parsed.bodyType;
    resilienceState.recoveredAutosave = true;
    resilienceState.lastRecoveryMessage = `Recovered autosaved work from ${parsed.savedAt || "a previous session"}.`;
    return true;
  }, false);
}

export function dismissAutosaveRecovery(): void {
  safeStorage(() => {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) localStorage.setItem(DISMISS_AUTOSAVE_KEY, raw);
  }, undefined);
  resilienceState.recoveredAutosave = false;
}

export function installUnsavedChangeWarning(): void {
  window.addEventListener("beforeunload", (event) => {
    if (Object.keys(state.selections).length === 0) return;
    writeAutosave();
    event.preventDefault();
    event.returnValue = "";
  });
}

export async function safeReset(): Promise<void> {
  try {
    await resetAll();
    writeAutosave();
  } catch (error) {
    reportUserError(
      "Reset could not finish cleanly. Local caches were cleared; please reload if needed.",
      error,
    );
    clearAppCache();
  }
}

export function clearAppCache(): void {
  resetImageLoadCache();
  clearRecolorCache();
  safeStorage(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("ulpc:")) localStorage.removeItem(key);
    }
  }, undefined);
}

export function getBrowserCapabilities(): Record<string, boolean> {
  return {
    webgl: !!document.createElement("canvas").getContext("webgl"),
    localStorage: safeStorage(() => !!window.localStorage, false),
    clipboard: !!navigator.clipboard,
    createImageBitmap: "createImageBitmap" in window,
  };
}

export function getActiveRenderingMode(): string {
  return getPaletteRecolorConfig().activeMode;
}

export function diagnosticText(): string {
  return JSON.stringify(
    {
      appVersion,
      assetCatalogVersion: getAssetCatalogVersion(),
      failedAssetCount: state.assetLoadFailures.length,
      presetSchemaVersion: PRESET_SCHEMA_VERSION,
      browserCapabilities: getBrowserCapabilities(),
      activeRenderingMode: getActiveRenderingMode(),
      recentErrors: resilienceState.errors.map((e) => ({
        message: e.message,
        detail: e.detail,
        at: e.at,
      })),
    },
    null,
    2,
  );
}

export { PRESET_SCHEMA_VERSION };
