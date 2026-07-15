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

- `src/index.ts` — splits assets into vector/raster and drives the export
- `src/paths.ts` — imageset directories and file names
- `src/contents.ts` — the generated `Contents.json`
- `config.ts` / `config.json` — user-facing configuration

Fork it, edit the source, then rebuild (see below) and upload your version. If you have never done this before, [follow our guide to modifying existing exporters](https://developers.supernova.io/building-exporters/cloning-exporters).

### Building

The compiled bundle at `dist/build.js` is the exporter's executable (referenced by `exporter.json`). After changing anything under `src/`, rebuild it:

```bash
npm install
npm run build     # bundles src/index.ts -> dist/build.js
```

Commit the regenerated `dist/build.js` alongside your source changes.

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






