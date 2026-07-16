import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "vite-plugin-run";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const devStaticRoots = ["public", "spritesheets"];

/** @returns {string[]} Command and args for vite-plugin-run (first element is the executable). */
function copySpritesheetsRsyncRun() {
  return [
    "rsync",
    "-ahu",
    "--delete",
    "--info=progress2",
    "--no-inc-recursive",
    "spritesheets",
    "dist",
  ];
}

function contentTypeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".gif":
      return "image/gif";
    case ".html":
      return "text/html; charset=utf-8";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function resolveDevStaticFile(urlPath) {
  const normalizedPath = decodeURIComponent(urlPath).replace(/^\/+/, "");
  for (const rootName of devStaticRoots) {
    if (
      rootName === "spritesheets" &&
      !normalizedPath.startsWith("spritesheets/")
    ) {
      continue;
    }
    const relPath =
      rootName === "spritesheets"
        ? normalizedPath.slice("spritesheets/".length)
        : normalizedPath;
    const rootPath = path.resolve(projectRoot, rootName);
    const filePath = path.resolve(rootPath, relPath);
    if (filePath === rootPath || !filePath.startsWith(rootPath + path.sep)) {
      continue;
    }
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        return { filePath, stat };
      }
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
        throw error;
      }
    }
  }
  return null;
}

/**
 * Serves `public/` and the large `spritesheets/` tree in dev without registering either tree with
 * Vite/chokidar. This keeps URLs identical to the old dynamic-assets setup while avoiding ENOSPC
 * watcher exhaustion on systems with low inotify limits.
 *
 * @returns {import("vite").Plugin}
 */
function vitePluginServeStaticWithoutWatching() {
  return {
    name: "serve-static-without-watching",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || req.method === "POST") {
          next();
          return;
        }

        let pathname;
        try {
          pathname = new URL(req.url, "http://localhost").pathname;
        } catch {
          next();
          return;
        }

        const resolved = resolveDevStaticFile(pathname);
        if (!resolved) {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Length", resolved.stat.size);
        res.setHeader("Content-Type", contentTypeFor(resolved.filePath));
        fs.createReadStream(resolved.filePath).pipe(res);
      });
    },
  };
}

/**
 * Windows: mirror `spritesheets/` into `dist/spritesheets` with robocopy (same flags as before).
 * Robocopy uses exit codes 0–7 for success; ≥8 is failure — we fail the build only on real errors.
 */
function vitePluginCopySpritesheetsRobocopy() {
  return {
    name: "copy-spritesheets-robocopy",
    apply: "build",
    closeBundle() {
      const dest = path.join("dist", "spritesheets");
      const result = spawnSync(
        "robocopy",
        [
          "spritesheets",
          dest,
          "/MIR",
          "/Z",
          "/XO",
          "/MT:8",
          "/NFL",
          "/NDL",
          "/NJH",
          "/NJS",
          "/NP",
        ],
        { stdio: "inherit", shell: false, windowsHide: true },
      );
      if (result.error) {
        throw result.error;
      }
      const code = result.status;
      if (code === null) {
        throw new Error("robocopy was terminated by a signal");
      }
      if (code >= 8) {
        throw new Error(`robocopy failed with exit code ${code}`);
      }
    },
  };
}

/**
 * Plugin that keeps spritesheets available to Vite: in dev, serve the tree from disk; on build,
 * copy (mirror) `spritesheets/` into `dist/spritesheets` so the production output matches the repo.
 *
 * - **Dev (`vite`, `command === "serve"`):** serve `public/` and `spritesheets/` (no `dist/` copy).
 * - **Build on Windows:** robocopy into `dist/` with exit codes mapped so real failures fail the build.
 * - **Build on macOS / Linux:** `rsync` via `vite-plugin-run`.
 *
 * @param {"serve" | "build"} command Vite CLI command from `defineConfig`.
 * @returns {import("vite").Plugin}
 */
export function getSpritesheetsPlugin(command) {
  if (command === "serve") {
    return vitePluginServeStaticWithoutWatching();
  }

  if (process.platform === "win32") {
    return vitePluginCopySpritesheetsRobocopy();
  }

  return run({
    input: [
      {
        name: "copy spritesheets",
        run: copySpritesheetsRsyncRun,
        condition: () => true,
        onFileChanged: () => {},
      },
    ],
    silent: false,
  });
}
