import { RenderedAsset, AssetScale } from "@supernovaio/sdk-exporters"
import { assetName, scaleSuffix, scaleLabel } from "./paths"

const INFO = { author: "xcode", version: 1 }

/** A vector variant folded into its base imageset: a device idiom, a locale, or both. */
export type VectorVariant = { idiom?: string; locale?: string; asset: RenderedAsset }
/** A raster variant folded into its base imageset, with its emittable scales. */
export type RasterVariant = { idiom?: string; locale?: string; asset: RenderedAsset; scales: Array<AssetScale> }

/** Contents.json for the Assets.xcassets root and for plain (non-namespacing) group folders. */
export function infoContentsJson(): string {
  return JSON.stringify({ info: INFO }, null, 2) + "\n"
}

/** Contents.json for a group folder that provides a namespace for the assets inside it. */
export function namespaceGroupContentsJson(): string {
  const contents = {
    info: INFO,
    properties: { "provides-namespace": true },
  }
  return JSON.stringify(contents, null, 2) + "\n"
}

/**
 * Contents.json for a vector asset: a single, scale-independent SVG, optionally with
 * per-locale and/or per-idiom variants. The runtime picks the entry whose `idiom`
 * matches the device family (`universal` matches everything) and whose `locale`
 * matches the app language, falling back to the base entry.
 * The template rendering intent is always written explicitly ("template" or
 * "original") instead of relying on Xcode's legacy "name ends in Template"
 * auto-detection. With `preserveVectorData`, Xcode embeds the vector data
 * ("Preserve Vector Data") so the image renders crisply at any runtime size.
 */
export function vectorContentsJson(
  asset: RenderedAsset,
  templateRendering: boolean,
  preserveVectorData: boolean,
  variants: Array<VectorVariant> = []
): string {
  // Key order mirrors Xcode's own (alphabetical) writer. "localizable" is what
  // marks the asset as localized for the Xcode editor UI and the Export
  // Localizations (.xcloc) workflow — the per-image locale entries alone are
  // enough for actool, but not for those flows. Idiom-only imagesets must NOT
  // carry it: they are device-varied, not localized.
  const properties: Record<string, unknown> = {}
  if (variants.some((variant) => variant.locale !== undefined)) {
    properties["localizable"] = true
  }
  if (preserveVectorData) {
    properties["preserves-vector-representation"] = true
  }
  properties["template-rendering-intent"] = templateRendering ? "template" : "original"
  const contents = {
    images: [
      {
        filename: `${assetName(asset)}.svg`,
        idiom: "universal",
      },
      ...variants.map((variant) => ({
        filename: `${assetName(variant.asset)}.svg`,
        idiom: variant.idiom ?? "universal",
        ...(variant.locale !== undefined ? { locale: variant.locale } : {}),
      })),
    ],
    info: INFO,
    properties,
  }
  return JSON.stringify(contents, null, 2) + "\n"
}

/**
 * Contents.json for a raster asset: PNG at the scales that were actually rendered
 * (normally @1x / @2x / @3x), optionally with per-locale and/or per-idiom variants
 * at their own emittable scales (idiom variants arrive pre-capped to the scales
 * their device family supports). Listing only those scales keeps the catalog free
 * of references to files that do not exist, which Xcode reports as warnings.
 */
export function rasterContentsJson(asset: RenderedAsset, scales: Array<AssetScale>, variants: Array<RasterVariant> = []): string {
  const name = assetName(asset)
  const contents: Record<string, unknown> = {
    images: [
      ...scales.map((scale) => ({
        filename: `${name}${scaleSuffix(scale)}.png`,
        idiom: "universal",
        scale: scaleLabel(scale),
      })),
      ...variants.flatMap((variant) =>
        variant.scales.map((scale) => ({
          filename: `${assetName(variant.asset)}${scaleSuffix(scale)}.png`,
          idiom: variant.idiom ?? "universal",
          ...(variant.locale !== undefined ? { locale: variant.locale } : {}),
          scale: scaleLabel(scale),
        }))
      ),
    ],
    info: INFO,
  }
  if (variants.some((variant) => variant.locale !== undefined)) {
    contents.properties = { localizable: true }
  }
  return JSON.stringify(contents, null, 2) + "\n"
}
