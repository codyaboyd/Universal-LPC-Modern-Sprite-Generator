# Future roadmap

This roadmap preserves the local-first creator and LPC output contract. Priority within a section is roughly top to bottom; every rendering change should be protected by golden sprite/ZIP fixtures.

## Small improvements

- Add a dedicated 844 × 390 mobile-landscape Playwright journey and short-height CSS regression checks.
- Add automated assertions for uncaught errors, unhandled rejections, failed asset responses, minimum coarse-pointer target size, and horizontal overflow.
- Explain incompatibility reasons inline and provide a one-action route to the required body/animation.
- Improve empty, loading, offline, and partial-asset states with actionable retry messaging.
- Add screen-reader smoke scripts and publish a manual NVDA/VoiceOver/forced-colors checklist.
- Expand history labels so undo/redo announces the affected category and item.
- Add preset schema migration fixtures before introducing schema version 2.
- Measure and publish cold-load, search, rapid-change, memory, and export budgets in CI.

## Asset-system improvements

- Build an asset validator for dimensions, frame grids, required animations, palette masks, licenses, credits, compatibility declarations, and z-position collisions.
- Generate small searchable catalog indexes and thumbnails independently from full-resolution sprite delivery.
- Add bounded concurrency, request prioritization, and explicit cancellation ownership for asset loading.
- Support integrity hashes and catalog-version manifests so stale or partially deployed assets are diagnosed clearly.
- Introduce opt-in on-demand asset packs while retaining a complete offline/static distribution path.
- Expand golden characters to cover body families, asymmetric weapons, armor stacks, custom animations, CPU/WebGL recoloring, and missing-layer recovery.

## Advanced creator features

- Split character, creator UI, preview, export, and persistence state into typed domain stores with transactional history.
- Add named outfit slots, comparison/preview-before-apply, and reusable appearance/loadout templates.
- Add a compatibility inspector and layer-stack inspector for asset authors and power users.
- Provide animation timelines, frame stepping, onion-skin inspection, hitbox/anchor overlays, and engine-specific metadata export without altering sprite pixels.
- Move heavy recolor/encode/ZIP phases to workers after profiling validates the benefit.
- Add batch generation and deterministic seeded variants with clear memory and export limits.
- Improve color tooling with accessible palette naming, contrast previews, linked material colors, and palette import/export.

## Multiplayer or sharing features

These are optional and must remain decoupled from core character creation.

- Share a compact, versioned preset through an explicit file or URL payload with privacy and size warnings.
- Add read-only character showcase links only if a hosting service is later approved.
- Explore collaborative party-roster planning with conflict-free preset copies rather than live mutation of one character.
- Provide moderation, attribution, reporting, and takedown requirements before any public gallery is considered.
- Never require multiplayer or sharing services to load, edit, save locally, or export a character.

## Optional backend features

These are proposals only; none should be implemented without a separate security, privacy, operations, and cost review.

- Opt-in encrypted preset backup and cross-device sync.
- Signed catalog manifests and differential asset delivery through object storage/CDN.
- Anonymous aggregate performance/error telemetry with explicit consent and aggressive data minimization.
- Team-managed private preset libraries with retention and export controls.
- Server-side batch export only when client limits are demonstrated, with quotas, deletion guarantees, and no dependency for ordinary exports.

Authentication, a marketplace, and social identity are intentionally absent from the near-term plan. If ever proposed, they require separate product approval and must not compromise the local-first experience.
