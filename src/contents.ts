import { RenderedAsset, AssetScale } from "@supernovaio/sdk-exporters"
import { assetName, scaleSuffix, scaleLabel } from "./paths"

const INFO = { author: "xcode", version: 1 }

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
 * Contents.json for a vector asset: a single, scale-independent SVG. The template
 * rendering intent is always written explicitly ("template" or "original") instead
 * of relying on Xcode's legacy "name ends in Template" auto-detection. With
 * `preserveVectorData`, Xcode embeds the vector data ("Preserve Vector Data") so the
 * image renders crisply at any runtime size; without it, Xcode rasterizes at build time.
 */
export function vectorContentsJson(asset: RenderedAsset, templateRendering: boolean, preserveVectorData: boolean): string {
  const properties: Record<string, unknown> = {
    "template-rendering-intent": templateRendering ? "template" : "original",
  }
  if (preserveVectorData) {
    properties["preserves-vector-representation"] = true
  }
  const contents = {
    images: [
      {
        filename: `${assetName(asset)}.svg`,
        idiom: "universal",
      },
    ],
    info: INFO,
    properties,
  }
  return JSON.stringify(contents, null, 2) + "\n"
}

/**
 * Contents.json for a raster asset: PNG at the scales that were actually rendered
 * (normally @1x / @2x / @3x). Listing only rendered scales keeps the catalog free
 * of references to files that do not exist, which Xcode reports as warnings.
 */
export function rasterContentsJson(asset: RenderedAsset, scales: Array<AssetScale>): string {
  const name = assetName(asset)
  const contents = {
    images: scales.map((scale) => ({
      filename: `${name}${scaleSuffix(scale)}.png`,
      idiom: "universal",
      scale: scaleLabel(scale),
    })),
    info: INFO,
  }
  return JSON.stringify(contents, null, 2) + "\n"
}
