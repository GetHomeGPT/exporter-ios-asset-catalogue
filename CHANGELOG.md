### Release Notes
All the updates to this exporter are documented in this file.

## 2.3.2

### 🛠 Fixed

- Localized imagesets now carry `"localizable": true` in their properties, exactly as Xcode's own Localize button writes it - required for the Xcode editor's Localization panel and the Export Localizations (.xcloc) workflow to recognize the asset (per-image `locale` entries alone satisfy actool but not those flows). Property key order now matches Xcode's alphabetical writer.

## 2.3.1

### 🛠 Fixed

- `assetLocales` now defaults to `["tr"]` so Turkish variants fold into localized imagesets out of the box (the feature previously shipped disabled by default and produced separate imagesets until configured).

## 2.3.0

### 🚀 New

- Localized imagesets: new `assetLocales` option (default off) folds `<base><separator><locale>`-named assets (e.g. `hero-tr`) into their base asset's imageset as per-locale entries, using Xcode's native asset localization. One `Image(.hero)` symbol serves every language. Configurable `localeSuffixSeparator` (default `-`).
- Localization guard rails: orphan variants (no base asset), ambiguous bases, duplicate locales and invalid locale codes fail the export with actionable messages, before any rendering happens. A family is exported as SVG only when every member has a vector representation; otherwise the whole family becomes PNG so an imageset never mixes formats.
- Variant pairing is folder-aware: same-named bases in different folders stay independent, and a variant must live next to its base. Suffix matching is case-insensitive (`hero-TR` folds under `tr`), locale codes are canonicalized to BCP-47 casing and matched longest-first (`pt-BR` wins over an overlapping `BR`), and the suffix separator is used verbatim (spaces allowed; empty falls back to `-`).

## 2.2.1

### 🛠 Fixed

- `TypeError: Cannot read properties of undefined (reading 'ignoredAssetPaths')` at export start. The 2.2.0 refactor read the configuration on the first line of the export callback, but `exportConfiguration` was initialized *after* `Pulsar.export()` at the bottom of the module — an executor that invokes the callback synchronously saw it as `undefined` (2.1.0 masked this by first reading the config after an `await`). The initialization now precedes `Pulsar.export()`, and as defense in depth the configuration falls back to the `config.json` defaults (with any provided overrides merged on top) if the bridge ever returns nothing.

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
