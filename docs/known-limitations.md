# Known limitations

## Release-validation limitations

- **The complete browser journey is not yet certified in this environment.** Static, Node, and build checks pass, but the visual browser run encountered repeated asset-load warnings and did not complete the application readiness gate during the review run.
- **Mobile landscape lacks a dedicated committed full-journey test.** Existing mobile portrait and general responsive cases are useful but do not prove behavior at a short viewport such as 844 × 390.
- **Real assistive-technology coverage is manual.** Focus, ARIA, keyboard, and reduced-motion behaviors have automated coverage, but NVDA, VoiceOver, forced-colors, switch access, and high zoom still require human testing.
- **Touch usability is emulator-tested, not hardware-certified.** Pinch, nested scrolling, browser chrome, safe areas, and coarse-pointer ergonomics can differ on real iOS and Android devices.

## Architecture and UX

- Mithril UI components still share a large mutable state object and some components call rendering/export services directly. This makes isolated testing and cancellation semantics harder than domain stores and commands would.
- Bulma and Bootstrap coexist during the incremental migration. Similar class names and reset behavior remain a regression risk; new UI should use explicit Bootstrap classes and avoid broad global overrides.
- Large category trees are paged/lazy in places but are not comprehensively virtualized. Extremely large catalogs can still create expensive derivation and DOM work.
- Compatibility filtering communicates availability but does not always explain the exact rule that excluded an asset.
- Undo/redo is selection-focused and is not a general transaction log for every preview, metadata, filter, and preset-management action.

## Persistence

- Presets and autosaves are browser-local. Clearing site data, private browsing, storage quotas, or disabled storage can remove or prevent persistence.
- Preset schema version 1 rejects unknown schemas rather than migrating them. This is safe, but future schema changes require explicit migration logic and fixtures.
- Thumbnails use data URLs and can increase local-storage usage for many saved presets.
- There is no account sync, backend backup, authentication, marketplace, or social/share service by design.

## Assets and rendering

- Output quality is constrained by source assets. Missing, malformed, incorrectly dimensioned, or incorrectly positioned layers are skipped/reported but cannot be repaired at runtime.
- Asset retry handles transient failures, but offline use is not guaranteed and the full catalog is too large to assume browser caching.
- Compatibility and z-order correctness depend on generated metadata. New assets need authoring validation and representative golden exports.
- WebGL recoloring can fall back to CPU rendering. Results should match, but performance varies by browser, GPU/driver, memory pressure, and canvas limits.
- Custom or third-party animations may have frame layouts that need metadata-specific validation beyond the standard LPC set.

## Performance and export

- The checked-out catalog contains about 141,000 sprite files and the production asset copy is approximately 206 MB. Cold deployment, filesystem, and cache behavior can dominate build or first-use time.
- PNG/ZIP encoding remains main-thread work in important paths. Large exports can temporarily reduce UI responsiveness despite export-time suspension of decorative effects.
- Browser canvas and memory limits differ, especially on older mobile Safari versions. Very large compositions or repeated exports may require a reload.
- Decorative atmosphere is excluded from canvas exports, but future export features must continue to compose from renderer canvases rather than DOM screenshots.

## Explicit non-goals for this review

No backend, authentication, marketplace, social system, multiplayer service, or public sharing infrastructure is included. Those remain optional future work and must not become dependencies of the offline/local creator.
