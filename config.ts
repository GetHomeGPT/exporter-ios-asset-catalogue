/**
 * Main configuration of the exporter - type interface. Default values for it can
 * be set through `config.json` and users can override the behavior when creating
 * pipelines.
 */
export type ExporterConfiguration = {
  /**
   * When enabled, every vector (SVG) imageset is marked as a template image
   * (`template-rendering-intent = "template"`), so icons adopt the current tint /
   * foreground color in SwiftUI and UIKit. Turn this off if your icon set is
   * multicolor and must keep its original colors. Raster (PNG) assets are never
   * affected.
   */
  templateRenderingForVectors: boolean
  /**
   * Asset paths to exclude from the export. If you include partial path fragments,
   * all matching paths are ignored (e.g. `deprecated` ignores everything under a
   * `deprecated/` group and its subgroups).
   */
  ignoredAssetPaths: Array<string>
}
