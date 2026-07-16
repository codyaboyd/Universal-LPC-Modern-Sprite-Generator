# Preset format

A preset is the JSON document downloaded by **Export JSON** and included as
`character.json` in ZIP exports. JSON is UTF-8 and pretty-printed. Consumers
must ignore unknown properties for forward compatibility.

## Version 2 (current)

```json
{
  "version": 2,
  "bodyType": "male",
  "characterMetadata": { "name": "Ari", "tags": "hero" },
  "selections": {
    "body": { "itemId": "body_male", "name": "Body", "variant": "light" }
  },
  "selectedAnimation": "walk",
  "showTransparencyGrid": true,
  "applyTransparencyMask": false,
  "matchBodyColorEnabled": true,
  "compactDisplay": false,
  "enabledLicenses": { "CC0": true },
  "enabledAnimations": { "walk": true },
  "url": "https://example.invalid/generator/#...",
  "layers": [],
  "credits": []
}
```

`version`, `bodyType`, and `selections` are required for import. Each selection
is keyed by `type_name` and includes stable `itemId` and display `name`, plus
optional `subId`, `variant`, and `recolor`. UI preferences are optional and use
current defaults when absent. `characterMetadata` is merged with defaults.
`url`, `layers`, and `credits` are export provenance and are not needed to
restore UI state.

Serialized layers include `itemId`, optional `name`, `variant`, optional
`recolors`, `zPos`, `layerNum`, `yPos`, `needsRecolor`, `supportedAnimations`,
and `source`. Catalog sources contain a `spritePath` relative to
`spritesheets/`; custom uploads use `{ "kind": "custom" }` and do not embed the
uploaded pixels.

## Version 1 (legacy)

Version 1 is import-only and requires an absolute `url`. Import restores its URL
hash. Keep redirects/aliases when moving assets so these saved URLs continue to
resolve.

## Evolution rules

Add optional fields without increasing the version. Increment `version` for a
breaking semantic or required-field change, retain an importer/migration for
older documents, add fixtures/tests, and update this guide plus the changelog.
Do not treat presets as trusted input; validate shape and never interpret their
strings as HTML or executable paths.
