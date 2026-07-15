import { RenderedAsset, AssetScale } from "@supernovaio/sdk-exporters"
import { assetName, scaleSuffix, scaleLabel } from "./paths"

const INFO = { author: "xcode", version: 1 }

/** A localized vector variant folded into its base imageset. */
export type LocalizedVector = { locale: string; asset: RenderedAsset }
/** A localized raster variant folded into its base imageset, with its rendered scales. */
export type LocalizedRaster = { locale: string; asset: RenderedAsset; scales: Array<AssetScale> }

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
 * per-locale variants (Xcode's native asset localization — the runtime picks the
 * entry whose `locale` matches the app language and falls back to the base entry).
 * The template rendering intent is always written explicitly ("template" or
 * "original") instead of relying on Xcode's legacy "name ends in Template"
 * auto-detection. With `preserveVectorData`, Xcode embeds the vector data
 * ("Preserve Vector Data") so the image renders crisply at any runtime size.
 */
export function vectorContentsJson(
  asset: RenderedAsset,
  templateRendering: boolean,
  preserveVectorData: boolean,
  localized: Array<LocalizedVector> = []
): string {
  // Key order mirrors Xcode's own (alphabetical) writer. "localizable" is what
  // marks the asset as localized for the Xcode editor UI and the Export
  // Localizations (.xcloc) workflow — the per-image locale entries alone are
  // enough for actool, but not for those flows.
  const properties: Record<string, unknown> = {}
  if (localized.length > 0) {
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
      ...localized.map((variant) => ({
        filename: `${assetName(variant.asset)}.svg`,
        idiom: "universal",
        locale: variant.locale,
      })),
    ],
    info: INFO,
    properties,
  }
  return JSON.stringify(contents, null, 2) + "\n"
}

/**
 * Contents.json for a raster asset: PNG at the scales that were actually rendered
 * (normally @1x / @2x / @3x), optionally with per-locale variants at their own
 * rendered scales. Listing only rendered scales keeps the catalog free of
 * references to files that do not exist, which Xcode reports as warnings.
 */
export function rasterContentsJson(asset: RenderedAsset, scales: Array<AssetScale>, localized: Array<LocalizedRaster> = []): string {
  const name = assetName(asset)
  const contents: Record<string, unknown> = {
    images: [
      ...scales.map((scale) => ({
        filename: `${name}${scaleSuffix(scale)}.png`,
        idiom: "universal",
        scale: scaleLabel(scale),
      })),
      ...localized.flatMap((variant) =>
        variant.scales.map((scale) => ({
          filename: `${assetName(variant.asset)}${scaleSuffix(scale)}.png`,
          idiom: "universal",
          locale: variant.locale,
          scale: scaleLabel(scale),
        }))
      ),
    ],
    info: INFO,
  }
  if (localized.length > 0) {
    contents.properties = { localizable: true }
  }
  return JSON.stringify(contents, null, 2) + "\n"
}
