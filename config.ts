/**
 * Main configuration of the exporter - type interface. Default values for it can
 * be set through `config.json` and users can override the behavior when creating
 * pipelines.
 */
export type ExporterConfiguration = {
  /**
   * When enabled, every vector (SVG) imageset is marked as a template image
   * (`template-rendering-intent = "template"`), so icons adopt the current tint /
   * foreground color in SwiftUI and UIKit. When disabled, the intent is written
   * explicitly as `"original"` so the icons keep their own colors (instead of
   * relying on Xcode's legacy "name ends in Template" auto-detection). Raster
   * (PNG) assets are never affected.
   */
  templateRenderingForVectors: boolean
  /**
   * When enabled (default), vector imagesets carry `preserves-vector-representation`,
   * so Xcode embeds the vector data and the image scales smoothly at any runtime
   * size (Dynamic Type, large layouts). Turn this off to let Xcode rasterize the
   * SVG to @1x/@2x/@3x PNGs at build time instead - a smaller app bundle, at the
   * cost of runtime scalability.
   */
  preserveVectorData: boolean
  /**
   * When enabled, every group folder receives `provides-namespace`, so asset names
   * are scoped by their folder. This changes BOTH names of every asset: string
   * lookups become slash-qualified (`"Icons/app-icon"`) and the generated Swift
   * symbols become nested enums (`ImageResource.Icons.appIcon`). Leave disabled to
   * keep flat, catalog-unique names (`"app-icon"`, `.appIcon`).
   */
  providesNamespace: boolean
  /**
   * Asset paths to exclude from the export. If you include partial path fragments,
   * all matching paths are ignored (e.g. `deprecated` ignores everything under a
   * `deprecated/` group and its subgroups).
   */
  ignoredAssetPaths: Array<string>
  /**
   * Asset paths that are always exported as raster PNG (@1x/@2x/@3x), even when
   * Supernova has a vector (SVG) representation for the asset. Use this for photo
   * and artwork groups (e.g. `Images`) whose Figma export settings are 1x/2x/3x —
   * Supernova sometimes produces an SVG wrapper for such assets, which would
   * otherwise be mis-routed to the vector pipeline. Matching works the same way
   * as `ignoredAssetPaths`.
   */
  rasterAssetPaths: Array<string>
}
