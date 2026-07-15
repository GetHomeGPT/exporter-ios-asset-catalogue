import { RenderedAsset, AssetScale } from "@supernovaio/sdk-exporters"

/** Root of the generated Xcode asset catalogue. */
export const ASSET_CATALOG = "Assets.xcassets"

/**
 * The stable name of an asset — used for its `.imageset` directory AND for every
 * file inside it. Deriving both from a single function guarantees the binaries
 * and the Contents.json that references them always agree. `previouslyDuplicatedNames`
 * disambiguates any names Supernova had to deduplicate.
 */
export function assetName(asset: RenderedAsset): string {
  const duplicates = asset.previouslyDuplicatedNames > 0 ? `-${asset.previouslyDuplicatedNames}` : ""
  return `${asset.originalName}${duplicates}`
}

/** `Assets.xcassets/<group path>/<name>.imageset` — the directory for one asset. */
export function imagesetDirectory(asset: RenderedAsset): string {
  const segments = [ASSET_CATALOG, ...asset.group.path, asset.group.name, `${assetName(asset)}.imageset`]
  return segments.filter((segment) => segment && segment.length > 0).join("/")
}

/** Scale suffix used by Xcode raster assets (@2x / @3x). x1 has no suffix; SVG never scales. */
export function scaleSuffix(scale: AssetScale): string {
  switch (scale) {
    case AssetScale.x2:
      return "@2x"
    case AssetScale.x3:
      return "@3x"
    default:
      return ""
  }
}

/** File name of a single rendered representation, e.g. `Burger.svg` or `Hero@2x.png`. */
export function assetFileName(asset: RenderedAsset, scale: AssetScale): string {
  return `${assetName(asset)}${scaleSuffix(scale)}.${asset.format.toString()}`
}

/** True when the asset should be excluded because its group path matches an ignore fragment. */
export function isPathIgnored(ignored: Array<string>, asset: RenderedAsset): boolean {
  if (ignored.length === 0) {
    return false
  }
  const fragments = [...asset.group.path, asset.group.name]
  for (const filter of ignored) {
    for (const fragment of fragments) {
      if (fragment && filter.includes(fragment)) {
        return true
      }
    }
  }
  return false
}
