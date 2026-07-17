import { debugWarn } from "../utils/debug.ts";
import { reportUserError } from "../resilience.ts";

let loadedImages: Record<string, HTMLImageElement> = {};
/** In-flight loads: same `src` shares one `Image` and one profiler span. */
const inFlight = new Map<string, Promise<HTMLImageElement>>();

/** Profiler is attached to `window.profiler` by `main.js`; absent in tests / Node. */
type WindowWithProfiler = Window & {
  profiler?: {
    mark: (name: string) => void;
    measure: (name: string, start: string, end: string) => void;
  };
};

/**
 * Clears the in-memory image cache. Browser tests call this so a stubbed
 * `Image` constructor cannot poison later specs that share the same module.
 */
export function resetImageLoadCache(): void {
  loadedImages = {};
  inFlight.clear();
}

const MAX_IMAGE_LOAD_ATTEMPTS = 3;
const IMAGE_LOAD_RETRY_DELAY_MS = 75;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Load an image. Rejects with `Error("Failed to load <src>")` on error after retrying transient failures. */
export function loadImage(
  src: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  if (loadedImages[src]) {
    return Promise.resolve(loadedImages[src]);
  }
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Image load aborted", "AbortError"));
  }

  const existing = inFlight.get(src);
  if (existing) {
    return existing;
  }

  // Register in-flight *before* creating the Image. The Promise constructor runs
  // the executor synchronously; if we only `set` after `new Promise(...)`, a
  // second concurrent `loadImage(src)` can miss `inFlight` and create a second
  // `Image` for the same `src` (fails "share one in-flight request" in tests).
  let resolve!: (img: HTMLImageElement) => void;
  let reject!: (err: Error) => void;
  const p = new Promise<HTMLImageElement>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  inFlight.set(src, p);

  // Mark start of image load (span is actual fetch/decode)
  const profiler = (window as WindowWithProfiler).profiler;
  if (profiler) {
    profiler.mark(`image-load:${src}:start`);
  }

  let attempt = 1;
  const img = new Image();
  const cleanup = () => {
    img.onload = null;
    img.onerror = null;
    signal?.removeEventListener("abort", onAbort);
  };
  const onAbort = () => {
    cleanup();
    inFlight.delete(src);
    img.src = "";
    reject(new DOMException("Image load aborted", "AbortError"));
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  img.decoding = "async";
  const handleLoad = () => {
    const finish = () => {
      loadedImages[src] = img;
      inFlight.delete(src);

      if (profiler) {
        profiler.mark(`image-load:${src}:end`);
        profiler.measure(
          `image-load:${src}`,
          `image-load:${src}:start`,
          `image-load:${src}:end`,
        );
      }

      cleanup();
      resolve(img);
    };
    if (typeof img.decode === "function") {
      void img.decode().then(finish, finish);
    } else {
      finish();
    }
  };
  const attachHandlers = () => {
    signal?.addEventListener("abort", onAbort, { once: true });
    img.onload = handleLoad;
    img.onerror = handleError;
  };
  const setSrcForAttempt = () => {
    img.src =
      attempt === 1
        ? src
        : `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}`;
  };
  function handleError() {
    cleanup();
    if (attempt < MAX_IMAGE_LOAD_ATTEMPTS && !signal?.aborted) {
      attempt += 1;
      void delay(IMAGE_LOAD_RETRY_DELAY_MS * attempt).then(() => {
        attachHandlers();
        setSrcForAttempt();
      });
      return;
    }
    inFlight.delete(src);
    reportUserError(
      "An image asset could not be loaded and was skipped.",
      new Error(`Failed to load ${src}`),
    );
    reject(new Error(`Failed to load ${src}`));
  }
  attachHandlers();
  setSrcForAttempt();

  return p;
}

export type LoadedImage<T> = {
  item: T;
  img: HTMLImageElement | null;
  success: boolean;
};

/** Load multiple images in parallel, swallowing per-image errors. */
export async function loadImagesInParallel<T>(
  items: T[],
  getPath: (item: T) => string = (item) =>
    (item as { spritePath: string }).spritePath,
  signal?: AbortSignal,
): Promise<LoadedImage<T>[]> {
  const promises = items.map(
    (item): Promise<LoadedImage<T>> =>
      loadImage(getPath(item), signal)
        .then((img): LoadedImage<T> => ({ item, img, success: true }))
        .catch((error: unknown) => {
          // Superseded character renders deliberately abort their outstanding
          // image work. Treating that cancellation as an asset failure floods
          // diagnostics and makes a healthy catalog look broken while a user
          // quickly changes equipment.
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            debugWarn(`Failed to load sprite: ${getPath(item)}`);
          }
          return { item, img: null, success: false };
        }),
  );

  return Promise.all(promises);
}
