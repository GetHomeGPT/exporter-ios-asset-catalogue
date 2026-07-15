import { RenderedAsset } from "@supernovaio/sdk-exporters"
import { assetName } from "./paths"

const INFO = { author: "xcode", version: 1 }

/**
 * Contents.json for a vector asset: a single, scale-independent SVG that Xcode
 * renders at any size via "Preserve Vector Data". Optionally marked as a template
 * image so the icon adopts the current tint color.
 */
export function vectorContentsJson(asset: RenderedAsset, templateRendering: boolean): string {
  const properties: Record<string, unknown> = { "preserves-vector-representation": true }
  if (templateRendering) {
    properties["template-rendering-intent"] = "template"
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
 * Contents.json for a raster asset: PNG at @1x / @2x / @3x. The filenames match
 * exactly what assetFileName() writes for each scale.
 */
export function rasterContentsJson(asset: RenderedAsset): string {
  const name = assetName(asset)
  const contents = {
    images: [
      { filename: `${name}.png`, idiom: "universal", scale: "1x" },
      { filename: `${name}@2x.png`, idiom: "universal", scale: "2x" },
      { filename: `${name}@3x.png`, idiom: "universal", scale: "3x" },
    ],
    info: INFO,
  }
  return JSON.stringify(contents, null, 2) + "\n"
}
