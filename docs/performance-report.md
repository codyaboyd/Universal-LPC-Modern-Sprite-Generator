# Performance Report

Date: 2026-07-15

## Methodology

The optimization pass focused on existing hot paths instead of rewrites: image loading, thumbnail rendering, preview animation loops, ambient visual effects, and canvas reuse. Static checks were run locally. A quick ZIP export profile was attempted, but the local Playwright browser binary is not installed in this container.

## Before findings

| Area | Finding | Impact |
| --- | --- | --- |
| Initial load / asset preloading | `loadImage` already deduplicated concurrent requests by URL, but image decode was implicit and there was no cancellation hook for stale loads. | Fast equipment changes could keep obsolete image work alive. |
| Asset catalog processing / search | Catalog reads are lazy and working; no full rewrite was warranted. Search and item browser still rebuild their view-model per render, but only the visible page is mounted. | Acceptable for current page size; deeper indexing should be measured separately before changing the data model. |
| Thumbnail generation | Browser thumbnails used independent `new Image()` calls and stored `canvas.toDataURL()` strings in `sessionStorage`. | Duplicate fetch/decode risk and avoidable base64 heap/storage pressure. |
| Character recomposition | Recomposition serialized renders, but a superseded render could continue loading images until completion. | Wasted network/decode/composite work during rapid changes. |
| Animation preview frame consistency | Preview loop already used elapsed-time correction, but transparency-mask mode allocated a full canvas each frame. | Avoidable GC pressure and possible frame-time spikes. |
| Memory use | Thumbnail data URLs and per-frame mask canvases retained/allocated more than necessary. | Higher heap and GC churn. |
| Mobile performance | Ambient particles scaled by low-power device detection, but there was no explicit user-facing low-effects performance mode. | Users on constrained devices could not force lower effects. |
| Export performance | Existing ZIP profiler separates render/image/composite phases. | Worker offload should be considered for future PNG/ZIP compression, but no practical worker refactor was attempted in this pass. |

## Changes made

| Area | Optimization | Expected result |
| --- | --- | --- |
| Asset preloading / image decoding | `loadImage` now sets `decoding = "async"`, awaits `decode()` when available, and keeps the existing in-flight URL deduplication. | Decodes are explicit and duplicate asset fetches remain prevented. |
| Stale image loads | `loadImage` accepts an optional `AbortSignal`; character recomposition aborts the previous render generation before starting a new one. | Rapid selection changes cancel stale image work and skip stale commits. |
| Thumbnail caching | Item-browser thumbnails now use the shared image loader and a bounded in-memory canvas cache instead of session-storage data URLs. | Less duplicate fetching, less base64 storage churn, and bounded thumbnail memory. |
| Canvas allocations | Preview transparency-mask rendering reuses a scratch canvas sized to the source sheet. | Reduced per-frame allocation and GC during animation preview. |
| Animation loops / hidden tab behavior | Ambient particles now stop their `requestAnimationFrame` loop when effects are disabled, performance mode is on, reduced motion is requested, or the tab is hidden. | Nonessential animation work pauses instead of scheduling empty frames. |
| Mobile / low-effects mode | Added a low-effects performance mode toggle to ambient settings. | Users can explicitly reduce noncritical visual effects. |

## After checks

| Check | Result |
| --- | --- |
| Type check | Passed with `npm run type-check`. |
| Production build | Passed as the first phase of `npm run build && npm run profile:zip:quick`. |
| ZIP quick profile | Blocked by missing Playwright Chromium binary in the container. |

## Remaining measurement work

- Re-run `npm run profile:zip:quick` after installing Playwright browsers (`npx playwright install chromium`) to capture export before/after numbers.
- Use Chrome DevTools Performance on a desktop and a throttled mobile profile to record exact initial load, catalog processing, thumbnail, recomposition, search input, and memory metrics.
- If measured search/catalog time becomes a bottleneck, add a memoized item-browser index keyed by catalog/body/filter inputs rather than replacing the catalog system.
- If export profiling shows main-thread stalls in PNG encoding or ZIP generation, move those phases into a worker while keeping current renderer APIs intact.
