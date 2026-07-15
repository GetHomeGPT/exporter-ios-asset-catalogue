<img src="https://github.com/Supernova-Studio/exporter-ios-asset-catalogue/blob/main/readme-icon.png?raw=true" alt="Supernova Logo" style="max-width:100%;">


[Supernova](https://supernova.io) is a design system platform that manages your assets, tokens, components and allows you to write spectacular documentations for your entire teams. And because you found your way here, you are probably interested in its most advanced functionality - automatic hand-off of design and development assets, tokens and data in general. To learn everything Supernova, please check out our [developer documentation](https://developers.supernova.io/).


# iOS Catalogue Asset Exporter

The iOS Catalogue Asset exporter allows you to **export an Xcode asset catalogue** in such a way that it can be immediately used in your production codebase. It is the single source of delivery for both your vector and raster assets: it inspects each asset and picks the right format automatically.

- **Vector assets → SVG** with *Preserve Vector Data*, so a single file renders crisply at every scale.
- **Raster assets → PNG** at `@1x`, `@2x` and `@3x`.

The output targets **Xcode 16+ / iOS 16+**. Because it is a modern asset catalogue, Xcode automatically generates type-safe symbols for every asset (`ImageResource`, `Image(.burger)`, `UIImage(resource: .burger)`), so no separate accessor file is needed.

### Exporter Output

Each asset is exported into its own `.imageset`, grouped by the folders defined in Supernova (and Figma). Vector and raster assets live side by side:

```
Assets.xcassets
  /Icons
     /Top Menu
        Burger.imageset      -> Burger.svg            (vector, preserve vector data)
        User.imageset        -> User.svg              (vector, preserve vector data)
  /Illustrations
     Hero.imageset           -> Hero.png / Hero@2x.png / Hero@3x.png   (raster)
```

### How the format is chosen

The exporter reads each asset's vector representation (`svgUrl`). If a vector representation exists, the asset is written as an SVG; otherwise it is written as PNG at three scales.

Because Supernova can produce an SVG wrapper even for true images (photos, app artwork), the *"Raster asset paths"* configuration (`rasterAssetPaths`, default `["Images"]`) forces every asset under the listed groups to the raster PNG pipeline, regardless of whether a vector representation exists. This keeps assets whose Figma export settings are `1x / 2x / 3x` exporting exactly that way — three PNGs — instead of a single SVG.

> **Note:** vector detection relies on `svgUrl` being populated, which Supernova does for assets imported (or re-imported) after 2023-11-07. A vector imported before that date and never re-imported has no `svgUrl` and will export as PNG until it is re-imported.

### Configuration

| Option | Default | Effect |
|---|---|---|
| `templateRenderingForVectors` | `true` | Vector imagesets are template-rendered (adopt tint color). When off, the intent is written explicitly as `original`. |
| `multicolorAssetPaths` | `[]` | Folders whose vectors keep their original colors (`original` intent) while everything else stays template-rendered. |
| `preserveVectorData` | `true` | Vector data is embedded so images scale at runtime. When off, Xcode rasterizes SVGs to @1x/@2x/@3x PNGs at build time (smaller bundle). |
| `providesNamespace` | `false` | Group folders provide a namespace: lookups become `"Icons/app-icon"`, symbols become `ImageResource.Icons.appIcon`. |
| `assetLocales` | `[]` | Locale codes (BCP-47) that produce localized imagesets from `<base><sep><locale>`-named assets. Empty = off. |
| `localeSuffixSeparator` | `-` | Separator between base name and locale suffix (`hero-tr`). |
| `ignoredAssetPaths` | `[]` | Excludes matching groups (and their subgroups) from the export. |
| `rasterAssetPaths` | `["Images"]` | Forces matching groups to PNG @1x/@2x/@3x even when an SVG representation exists. |

The catalog root and every group folder receive a `Contents.json`, exactly as Xcode writes them.

### Tintable icons vs. multicolor illustrations

When some vectors must adopt the tint color (icons) and others must keep their own colors (multicolor illustrations), split them by folder and list the multicolor folders in `multicolorAssetPaths` — one pipeline handles both:

```
📁 Icons/                     → template (tintable)
📁 Illustrations/
   📁 Tintable/               → template (tintable)
   📁 Multicolor/             → original (keeps its colors)   ← multicolorAssetPaths: ["Illustrations/Multicolor"]
```

Do **not** solve this with two pipelines writing into the same catalog: deliveries never delete files, so the two exports would leave stale, conflicting output behind and double every configuration change.

### Localized assets

For artwork with baked-in text, set `assetLocales` (e.g. `["tr", "de"]`) and maintain per-language sibling components **in the same Figma frame / Supernova folder**, named with the locale suffix:

```
Illustrations/
  onboarding-hero        <- base (fallback for every other language)
  onboarding-hero-tr
  onboarding-hero-de
```

The exporter folds the variants into **one imageset** using Xcode's native asset localization (per-image `locale` entries in Contents.json). Code keeps using the single `Image(.onboardingHero)` symbol — iOS picks the right file from the app's language at runtime.

Rules and gotchas:

- Every variant **requires a base asset**; orphan variants fail the export with a list of offending names.
- A family is exported as SVG only when the base **and** all variants have vector representations; otherwise the whole family falls back to PNG @1x/@2x/@3x so one imageset never mixes formats.
- Each variant component in Figma must have export settings, and the library must be **republished** after changes — otherwise Supernova silently omits the asset.
- The Xcode **project must declare the languages** (Project > Info > Localizations): a `tr` variant can never be selected while the app only declares English. Variant selection follows the app's language, not the device region.
- Test with the scheme's *App Language* setting — SwiftUI's `.environment(\.locale)` does **not** switch asset variants.
- Prefer keeping text out of images entirely (overlay a localized `Text`) when the artwork allows it; localize only what genuinely bakes text in.
- **Configured suffixes are reserved.** With `assetLocales: ["id"]`, an unrelated asset named `user-id` would be folded into `user.imageset` as an Indonesian variant. Pick locale codes you actually ship and avoid asset names ending in `<separator><locale>` that are not variants.
- Suffix matching is case-insensitive (`hero-TR` folds under `tr`) and locale codes are canonicalized to BCP-47 casing (`TR` → `tr`, `pt-br` → `pt-BR`). The separator is used verbatim (a space works for `hero tr` naming); an empty value falls back to `-`.

### Asset naming

Keep your designer-friendly names (`app-icon`, `user profile`) — **no renaming is needed**. Xcode 15+ generates the type-safe symbols itself and converts names cleanly: `app-icon` → `.appIcon`, `user profile` → `.userProfile`, while string-based lookups keep the original name. Two hazards worth avoiding when naming assets in Figma/Supernova:

- Names ending in `Image` or `Color` — Xcode strips these suffixes when generating symbols (`starImage` → `.star`), which can collide with another asset's symbol.
- Two names that collapse to the same symbol (`app-icon` + `app icon`, or `star` + `starImage`) — Xcode emits a build warning and omits one of the symbols; string-based lookup of both assets keeps working.

### Naming

The names of assets and their imageset directories are constructed from the original Supernova/Figma asset name, and directories mirror the group hierarchy. This exporter also generates the required `Contents.json` file for each imageset. For example:

```
Assets.xcassets/Icons/Top Menu/Burger.imageset/Burger.svg
Assets.xcassets/Icons/Top Menu/Burger.imageset/Contents.json
Assets.xcassets/Icons/Top Menu/User.imageset/User.svg
Assets.xcassets/Icons/Top Menu/User.imageset/Contents.json
Assets.xcassets/Illustrations/Hero.imageset/Hero.png
Assets.xcassets/Illustrations/Hero.imageset/Hero@2x.png
Assets.xcassets/Illustrations/Hero.imageset/Hero@3x.png
Assets.xcassets/Illustrations/Hero.imageset/Contents.json
```

### Tintable icons (template rendering)

By default, vector imagesets are marked as **template images** (`template-rendering-intent = "template"`), so your icons automatically adopt the current tint / foreground color:

```swift
Image(.burger).foregroundStyle(.tint)   // SwiftUI
UIImage(resource: .burger)              // already template-rendered
```

If your icon set is **multicolor** and must keep its original colors, turn off *"Tintable vector icons"* in the exporter configuration — the SVGs are then rendered with their original colors. Raster (PNG) assets are never template-rendered.

### Type-safe access in Xcode

Because the output is a modern asset catalogue, **Xcode 15+ automatically generates type-safe symbols** for every asset — no separate accessor file is needed:

```swift
Image(.burger)                 // SwiftUI
UIImage(resource: .burger)     // UIKit
```

### Customizing

This is a TypeScript exporter built on the [`@supernovaio/sdk-exporters`](https://www.npmjs.com/package/@supernovaio/sdk-exporters) model. The logic lives in:

- `src/index.ts` — the Pulsar entrypoint: fetches assets/groups (brand-aware) and renders them via the SDK
- `src/generator.ts` — pure functions: vector/raster routing and catalogue generation (what the tests exercise)
- `src/paths.ts` — imageset directories and file names
- `src/contents.ts` — the generated `Contents.json`
- `config.ts` / `config.json` — user-facing configuration

Fork it, edit the source, then rebuild (see below) and upload your version. If you have never done this before, [follow our guide to modifying existing exporters](https://developers.supernova.io/building-exporters/cloning-exporters).

### Building & testing

The compiled bundle at `dist/build.js` is the exporter's executable (referenced by `exporter.json`). After changing anything under `src/`, rebuild it:

```bash
npm install
npm run build     # bundles src/index.ts -> dist/build.js
npm test          # generates 5 fixture scenarios into tests/output/ and compiles each with actool
```

`npm test` builds full catalogues from fixtures, checks structural invariants (every `Contents.json` reference must match an emitted binary), lints all JSON, and compiles every scenario with `actool` — the same tool Xcode uses — so format regressions fail loudly. Commit the regenerated `dist/build.js` alongside your source changes.

### A note on stale files in the destination

Supernova deliveries **never delete files**: local exports (CLI, VS Code extension, downloaded builds) only add or overwrite files at matching paths, by design. If an asset changes format (e.g. `app-icon.svg` → `app-icon.png`), the old file remains in the destination. The "Clear target folder" pipeline option only applies to cloud PR delivery. For local workflows, delete the exporter-owned `Assets.xcassets` before re-exporting, and give every exporter its own destination folder.

## Installing

In order to make the Supernova iOS Asset Catalogue exporter available for your organization so you can start generating code from your design system, please follow the installation guide in our [developer documentation](https://developers.supernova.io/using-exporters/installing-exporters).


## Reporting Bugs or Requesting Features

In order to faciliate easy communication and speed up delivery of fixes and features for this exporter, we require everyone to log all issues and feature requests through the issue tracking of this repository. 

Please read through the [existing issues](../../issues) before you open a new issue! It might be that we have already discussed it before. If you are sure your request wasn't mentioned just yet, proceed to [open a new issue](../../issues) and fill in the required information. Thank you!


## Contributing

If you have an idea for improving this exporter package or want a specific issue fixed quickly, we would love to see you contribute to its development!  

There are multiple ways you can contribute, so we have written a [contribution guide](https://developers.supernova.io/building-exporters/contribution-and-requests) that will walk your through the process. Any pull requests to this repository are very welcome. 

Would love to help us build more but maybe need a little bit of support? Join our community and drop us a message, we will support any of your wild ideas!

## License

This exporter is distributed under the [MIT license](./LICENSE.md). [We absolutely encourage you](https://developers.supernova.io/building-exporters/cloning-exporters) to clone it and modify it for your purposes, so it fits the requirements of your stack. If you see that you have created something amazing in the process that others would benefit from, we strongly recommend you consider [publishing it back to the community](https://developers.supernova.io/building-exporters/sharing-exporters-with-others) as well.

## Useful Links

- To learn more about Supernova, [go visit our website](https://supernova.io)
- To join our community of fellow developers where we try to push what is possible with design systems and code automation, join our [community discord](https://community.supernova.io)
- To understand everything you can do with Supernova and how much time and resources it can save you, go read our [product documentation](https://learn.supernova.io/)
- Finally, to learn everything about what exporters are and how you can integrate with your codebase, go read our [developer documentation](https://developers.supernova.io/)

## Supernova Maintained Exporters

We are developing and maintaining exporters for many major technologies. Here are all the official exporters maintained by Supernova:

- [iOS Token & Style Exporter](https://github.com/Supernova-Studio/exporter-ios)
- [iOS Localization Exporter](https://github.com/Supernova-Studio/exporter-ios-localization)
- [Android Token & Style Exporter](https://github.com/Supernova-Studio/exporter-android)
- [React Token & Style Exporter](https://github.com/Supernova-Studio/exporter-react)
- [Flutter Token & Style Exporter](https://github.com/Supernova-Studio/exporter-flutter)
- [Angular Token & Style Exporter](https://github.com/Supernova-Studio/exporter-angular)
- [Typescript Token & Style Exporter](https://github.com/Supernova-Studio/exporter-typescript)
- [CSS Token & Style Exporter](https://github.com/Supernova-Studio/exporter-css)
- [LESS Token & Style Exporter](https://github.com/Supernova-Studio/exporter-less)
- [SCSS Token & Style Exporter](https://github.com/Supernova-Studio/exporter-scss)
- [Style Dictionary Exporter](https://github.com/Supernova-Studio/exporter-style-dictionary)

Additionally, you can also use asset exporters for all major targets, enjoy!:

- [SVG Asset Exporter](https://github.com/Supernova-Studio/exporter-svg-assets)
- [PDF Asset Exporter](https://github.com/Supernova-Studio/exporter-pdf-assets)
- [PNG Asset Exporter](https://github.com/Supernova-Studio/exporter-png-assets)
- [iOS Asset Catalogue Exporter](https://github.com/Supernova-Studio/exporter-ios-asset-catalogue)
- [React Native Asset Exporter](https://github.com/Supernova-Studio/exporter-react-native-assets)
- [Android Asset Exporter](https://github.com/Supernova-Studio/exporter-android-assets)
- [Flutter PNG Asset Exporter](https://github.com/Supernova-Studio/exporter-flutter-png-assets)
- [Flutter SVG Asset Exporter](https://github.com/Supernova-Studio/exporter-flutter-svg-assets)

To browse all exporters created by our amazing community, please visit the [Supernova](https://supernova.io) Exporter Store. 






