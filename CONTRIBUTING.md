# Contributing

Thank you for improving the Universal LPC Modern Sprite Generator. By
participating, follow the [Code of Conduct](CODE_OF_CONDUCT.md). Search existing
issues and pull requests first; open an issue before broad architecture, schema,
or catalog reorganizations.

## Ways to contribute

- Fix application, accessibility, performance, responsive, or browser bugs.
- Add tests, translations, documentation, themes, or game-engine integration.
- Add or improve LPC art **only when its provenance and license are known**.
- Triage reproducible reports. Include browser/OS, steps, share URL or preset,
  screenshots where useful, console output, and expected versus actual result.

## Development workflow

Prerequisites: supported Node.js LTS, npm, Git, and Chromium for Playwright.

```bash
git clone https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator.git
cd Universal-LPC-Spritesheet-Character-Generator
npm ci
npm run dev
```

Create a focused branch, make small reviewable commits, and avoid unrelated
formatting or generated output. TypeScript is strict; keep domain logic out of
components when it belongs in state, compatibility, canvas, or export modules.
Never edit `dist/` because Vite regenerates it.

## Required checks

Run the checks relevant to every change, and the complete set before requesting
release:

```bash
npm run format:check
npm run lint
npm run type-check
npm test
npm run test:visual
npm run build
```

`npm test` runs Node and Testem browser integration suites. `npm run test:e2e`
runs the core Playwright interactions; `npm run test:visual` covers all files in
`tests/visual/`. CI can upload screenshots to Argos when credentials exist.
Only update a visual baseline after confirming the difference is intentional.
Install a missing local browser with `npx playwright install chromium`.

For catalog changes also run:

```bash
npm run validate-site-sources
```

This regenerates `CREDITS.csv` and `scripts/zPositioning/z_positions.csv`.
Review and commit intended tracked changes. Vite generates the ignored metadata
modules in `dist/` during development/build.

## Code and UX expectations

- Follow `.editorconfig`, Prettier, ESLint, and nearby TypeScript patterns.
- Add regression tests for behavior changes and update public-format docs.
- Preserve old URL/preset behavior or add aliases/migrations.
- Use semantic HTML, accessible names, keyboard operation, visible focus,
  announcements for dynamic state, sufficient contrast, and reduced motion.
- Check 360 px, tablet, and desktop layouts; controls must not overflow or hide.
- Avoid unnecessary catalog scans, canvas reads, redraws, and simultaneous image
  loads. Test low-effects and CPU recolor fallbacks.
- Do not leave console warnings, failed requests, debug logs, or broken paths.

## Art and catalog submissions

All art must be available under a license listed in the README. Contributors
must have permission to distribute originals and derivatives, and must include
complete `credits` metadata: every author, source URL, license, and meaningful
edit note. Missing credit information fails source generation and blocks review.

Follow [the asset authoring guide](docs/asset-authoring-guide.md) for directory,
definition, animation, layer, recolor, compatibility, and validation details.
JSON definitions are the source of truth. Put images under `spritesheets/`, add
or update the corresponding file below `sheet_definitions/`, and preserve path
case. For new categories provide `type_name`; for multiple planes use sequential
`layer_N` entries with a justified `zPos`.

### Renames and backward compatibility

Saved links refer to catalog identities and selection keys. When moving or
renaming an asset, add an `aliases` key/value mapping from the old URL-hash
identifier to the replacement and test an old share URL. Never silently reuse an
old identifier for unrelated art. Keep preset v1 and v2 imports functional.

### Animation and compatibility metadata

List `animations` when support differs from the legacy defaults; never claim
frames that are blank or misaligned. Custom mappings follow
[the animation mapping documentation](docs/animation-preview-system.md).
Author conflicts/hides/requires/substitutions and direction completeness under
the preferred `compatibility` object, following
[the rule guide](docs/asset-compatibility-rules.md).

## Pull requests

A pull request should contain:

- a concise problem statement and approach;
- linked issue(s), compatibility/migration impact, and known limitations;
- screenshots or recordings for perceptible UI changes;
- asset provenance/license details for art changes;
- exact tests and manual browser/accessibility checks performed;
- documentation and changelog updates when public behavior/formats change.

Keep generated binaries and dependency changes out unless required. Maintainers
may request commits be reorganized, credits corrected, or an asset removed when
its rights cannot be established. By submitting code you agree it is distributed
under this repository's software license; artwork retains the license(s) declared
in its metadata.
