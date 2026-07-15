import { previewCanvas, previewCtx } from "./preview-canvas.ts";
import { state } from "../state/state.ts";
import {
  FRAME_SIZE,
  ANIMATION_CONFIGS,
  ANIMATIONS,
} from "../state/constants.ts";
import { get2DContext, drawTransparencyBackground } from "./canvas-utils.ts";
import { applyTransparencyMaskToCanvas } from "./mask.ts";
import { canvas, drawCalls } from "./renderer.ts";
import { customAnimations } from "../custom-animations.ts";
import type { CustomAnimationDefinition } from "../custom-animations.ts";

declare global {
  interface Window {
    /** Set by Playwright visual tests (tests/visual/home.spec.js) to suppress rAF cycling. */
    __DISABLE_PREVIEW_ANIMATION__?: boolean;
  }
}

// Animation preview state
let animationFrames: number[] = [1, 2, 3, 4, 5, 6, 7, 8]; // default for walk
let animRowStart = 8; // default for walk (row number)
let animRowNum = 4; // default for walk (number of rows to stack)
let currentFrameIndex = 0;
let selectedDirectionIndex = 2;
let playbackFps = 8;
let shouldLoop = true;
let lastFrameTime = performance.now();
let animationFrameId: number | null = null;
let measuredFps = 0;
let fpsSampleStart = performance.now();
let fpsSampleFrames = 0;
let previewVisible = true;
let reducedMotionQuery: MediaQueryList | null = null;
let maskScratchCanvas: HTMLCanvasElement | null = null;

// Track custom animations present in current render
let currentCustomAnimations: Record<string, CustomAnimationDefinition> = {};
let customAnimYPositions: Record<string, number> = {}; // Y positions of custom animations in canvas
export let activeCustomAnimation: string | null = null; // Currently selected custom animation for preview

/**
 * Set which animation to preview
 */
export function setPreviewAnimation(animationName: string): number[] {
  // Check if this is a custom animation
  if (customAnimations && customAnimations[animationName]) {
    const customAnimDef = customAnimations[animationName];
    activeCustomAnimation = animationName;

    // Extract frame cycle from custom animation definition
    // Custom animations have 4 rows (n, w, s, e), we'll show all columns from first row
    const frameCount = customAnimDef.frames[0].length;

    // Check if we should skip the first frame (frame 0)
    const skipFirstFrame = customAnimDef.skipFirstFrameInPreview || false;
    animationFrames = skipFirstFrame
      ? Array.from({ length: frameCount - 1 }, (_, i) => i + 1) // [1, 2, 3, ..., 8]
      : Array.from({ length: frameCount }, (_, i) => i); // [0, 1, 2, ..., 8]

    animRowStart = 0; // Not used for custom animations
    animRowNum = customAnimDef.frames.length;
    currentFrameIndex = 0;

    return animationFrames;
  }

  // Standard animation
  activeCustomAnimation = null;
  const configs = ANIMATION_CONFIGS as Record<
    string,
    { row: number; num: number; cycle: number[] } | undefined
  >;
  const config = configs[animationName];
  if (!config) {
    console.error("Unknown animation:", animationName);
    return [];
  }

  animationFrames = config.cycle;
  animRowStart = config.row;
  animRowNum = config.num;
  currentFrameIndex = 0;

  return animationFrames; // Return for display
}

/**
 * Draw one preview frame for a given index into `animationFrames` (the cycle).
 * Used by the animation loop and by visual tests (static frame, no rAF).
 */
function paintPreviewFrameForCycleIndex(cycleIndex: number): void {
  if (!previewCtx || !canvas || !previewCanvas) {
    return;
  }

  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

  // Draw transparency grid if enabled
  if (state.showTransparencyGrid) {
    drawTransparencyBackground(
      previewCtx,
      previewCanvas.width,
      previewCanvas.height,
    );
  }

  const currentFrame = animationFrames[cycleIndex];

  // Determine frameSize and Y offset based on animation type
  let frameSize = FRAME_SIZE;
  let yOffset = 0;

  if (activeCustomAnimation && customAnimations) {
    const customAnimDef = customAnimations[activeCustomAnimation];
    if (customAnimDef) {
      frameSize = customAnimDef.frameSize;
      yOffset = customAnimYPositions[activeCustomAnimation] || 0;
    }
  }

  let tmpCanvas: HTMLCanvasElement;
  if (state.applyTransparencyMask) {
    // using a tmpCanvas here to avoid modifying the original offscreen canvas
    // which causes a bug if the user toggles the checkbox multiple times
    maskScratchCanvas ??= document.createElement("canvas");
    tmpCanvas = maskScratchCanvas;
    if (
      tmpCanvas.width !== canvas.width ||
      tmpCanvas.height !== canvas.height
    ) {
      tmpCanvas.width = canvas.width;
      tmpCanvas.height = canvas.height;
    }
    const tmpCtx = get2DContext(tmpCanvas);
    tmpCtx.drawImage(canvas, 0, 0);
    applyTransparencyMaskToCanvas(tmpCanvas, tmpCtx);
  } else {
    tmpCanvas = canvas;
  }

  const direction = Math.min(
    selectedDirectionIndex,
    Math.max(0, animRowNum - 1),
  );
  const srcY = activeCustomAnimation
    ? yOffset + direction * frameSize
    : (animRowStart + direction) * FRAME_SIZE;
  previewCtx.drawImage(
    tmpCanvas,
    currentFrame * frameSize,
    srcY,
    frameSize,
    frameSize,
    0,
    0,
    frameSize,
    frameSize,
  );
}

/**
 * When Playwright sets `__DISABLE_PREVIEW_ANIMATION__`, we paint once instead of using rAF.
 * The first paint can run before `renderCharacter` finishes; call this after any redraw that
 * may follow a completed render so the preview copies fresh offscreen pixels (Argos / visual tests).
 */
export function repaintStaticPreviewFrameForTests(): void {
  if (
    typeof window !== "undefined" &&
    window.__DISABLE_PREVIEW_ANIMATION__ === true
  ) {
    paintPreviewFrameForCycleIndex(currentFrameIndex);
  }
}

export function startPreviewAnimation(): void {
  if (animationFrameId !== null) {
    return; // Already running
  }

  // Set by Playwright visual tests (see tests/visual/home.spec.js) so Argos
  // screenshots are not flaky due to cycling frames during load.
  if (
    typeof window !== "undefined" &&
    window.__DISABLE_PREVIEW_ANIMATION__ === true
  ) {
    currentFrameIndex = 0;
    paintPreviewFrameForCycleIndex(0);
    return;
  }

  if (document.hidden || !previewVisible || prefersReducedMotion()) {
    paintPreviewFrameForCycleIndex(currentFrameIndex);
    return;
  }

  function nextFrame(now: number): void {
    const fpsInterval = 1000 / playbackFps;
    const elapsed = now - lastFrameTime;

    if (elapsed >= fpsInterval) {
      lastFrameTime = now - (elapsed % fpsInterval);

      if (previewCtx && canvas) {
        const nextIndex = currentFrameIndex + 1;
        if (nextIndex >= animationFrames.length && !shouldLoop) {
          currentFrameIndex = animationFrames.length - 1;
          paintPreviewFrameForCycleIndex(currentFrameIndex);
          stopPreviewAnimation();
          return;
        }
        currentFrameIndex = nextIndex % animationFrames.length;
        paintPreviewFrameForCycleIndex(currentFrameIndex);
        fpsSampleFrames += 1;
        if (now - fpsSampleStart >= 1000) {
          measuredFps = Math.round(
            (fpsSampleFrames * 1000) / (now - fpsSampleStart),
          );
          fpsSampleFrames = 0;
          fpsSampleStart = now;
        }
      }
    }

    animationFrameId = requestAnimationFrame(nextFrame);
  }

  lastFrameTime = performance.now();
  animationFrameId = requestAnimationFrame(nextFrame);
}

/**
 * Stop the preview animation loop.
 * @returns true if a running loop was stopped
 */
export function stopPreviewAnimation(): boolean {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    return true;
  }
  return false;
}

/** Get list of custom animations present in current render. */
export function getCustomAnimations(): Record<
  string,
  CustomAnimationDefinition
> {
  return currentCustomAnimations;
}

export function setCurrentCustomAnimations(
  customAnimations: Record<string, CustomAnimationDefinition>,
): void {
  currentCustomAnimations = customAnimations;
}

export function setCustomAnimYPositions(
  yPositions: Record<string, number>,
): void {
  customAnimYPositions = yPositions;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  reducedMotionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return reducedMotionQuery.matches;
}

export function setPreviewDirection(directionIndex: number): void {
  selectedDirectionIndex = Math.max(
    0,
    Math.min(directionIndex, Math.max(0, animRowNum - 1)),
  );
  paintPreviewFrameForCycleIndex(currentFrameIndex);
}

export function setPreviewPlaybackFps(fps: number): void {
  playbackFps = Math.max(1, Math.min(24, fps));
}

export function setPreviewLoop(loop: boolean): void {
  shouldLoop = loop;
}

export function stepPreviewFrame(delta: number): number {
  stopPreviewAnimation();
  currentFrameIndex =
    (currentFrameIndex + delta + animationFrames.length) %
    animationFrames.length;
  paintPreviewFrameForCycleIndex(currentFrameIndex);
  return currentFrameIndex;
}

export function scrubPreviewFrame(index: number): number {
  currentFrameIndex = Math.max(0, Math.min(index, animationFrames.length - 1));
  paintPreviewFrameForCycleIndex(currentFrameIndex);
  return currentFrameIndex;
}

export function getPreviewPlaybackState(): {
  currentFrameIndex: number;
  frameCount: number;
  fps: number;
} {
  return {
    currentFrameIndex,
    frameCount: animationFrames.length,
    fps: measuredFps,
  };
}

export function setPreviewVisible(isVisible: boolean): void {
  previewVisible = isVisible;
  if (!isVisible) stopPreviewAnimation();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPreviewAnimation();
  });
}

export function getSupportedPreviewAnimations(): {
  value: string;
  label: string;
}[] {
  const supported = new Set(drawCalls.map((call) => call.animation));
  const folderToValue: Record<string, string> = {
    combat_idle: "combat",
    backslash: "1h_backslash",
    halfslash: "1h_halfslash",
  };
  const values = new Set(
    Array.from(supported).map((name) => folderToValue[name] ?? name),
  );
  const options = ANIMATIONS.filter((anim) => values.has(anim.value));
  for (const anim of Object.keys(currentCustomAnimations)) {
    options.push({
      value: anim,
      label: anim.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    });
  }
  return options;
}
