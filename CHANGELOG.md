### Release Notes
All the updates to this exporter are documented in this file.

## 2.2.0

### 🚀 New

- Updated `@supernovaio/sdk-exporters` to 2.4.8 (with an npm `overrides` entry so `@supernovaio/export-helpers` shares the same SDK copy; `Pulsar` is now imported from the SDK instead of relying on the removed global declaration).
- New `preserveVectorData` option (default on): turn it off to let Xcode rasterize SVGs to @1x/@2x/@3x PNGs at build time for a smaller app bundle.
- New `providesNamespace` option (default off): group folders emit `provides-namespace`, scoping both string lookups (`"Icons/app-icon"`) and generated Swift symbols (`ImageResource.Icons.appIcon`).
- The catalog root and every group folder now receive a `Contents.json`, matching what Xcode itself writes.
- Brand-aware exports: when a pipeline selects a brand, only that brand's assets and groups are exported (the exporter always declared `usesBrands` but previously ignored the selection).
- Test harness (`npm test`): five generation scenarios built from fixtures, structural invariants (every `Contents.json` reference matches an emitted binary), JSON linting, and a full `actool` compile of each generated catalogue.

### 🛠 Fixed

- Raster `Contents.json` now only lists the scales that were actually rendered, instead of unconditionally referencing @1x/@2x/@3x files that may not exist (Xcode reported those as warnings). An asset whose @1x render fails is no longer dropped entirely — its imageset is built from the remaining scales.
- Path filters (`ignoredAssetPaths`, `rasterAssetPaths`) now match the documented direction: the filter is the (partial) fragment searched inside the slash-joined group path, so `deprecated` matches `deprecated/legacy` and `Icons/App` matches exactly that subtree. Previously the comparison ran backwards (group segment searched inside the filter), which over-matched path-style filters.
- `template-rendering-intent` is always written explicitly (`template` or `original`) instead of leaving non-template vectors to Xcode's legacy "name ends in Template" auto-detection.
- Configuration path filters are normalized: fragments are trimmed and empty strings dropped, so a stray `""` no longer matches every asset.
- Orchestration was extracted into pure functions (`src/generator.ts`); `src/index.ts` only talks to the Pulsar bridge and the SDK.

## 2.1.0

### 🚀 New

- New `rasterAssetPaths` option (default `["Images"]`): assets under the listed groups are always exported as PNG @1x/@2x/@3x, even when Supernova holds an SVG representation for them. Previously any asset with an `svgUrl` was routed to the vector pipeline, so images like `app-icon` ended up as a single SVG instead of the 1x/2x/3x PNGs configured in Figma.

## 2.0.0

### 🚀 New

- Vector assets exported as SVG with Preserve Vector Data; raster assets as PNG @1x/@2x/@3x.
- Tintable vector icons via `templateRenderingForVectors`.
- `ignoredAssetPaths` to exclude asset groups from the export.
