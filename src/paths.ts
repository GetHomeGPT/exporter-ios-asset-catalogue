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

/** Non-empty group path segments of an asset, e.g. ["Icons", "App"]. */
export function groupSegments(asset: RenderedAsset): Array<string> {
  return [...asset.group.path, asset.group.name].filter((segment) => segment && segment.length > 0)
}

/** `Assets.xcassets/<group path>/<name>.imageset` — the directory for one asset. */
export function imagesetDirectory(asset: RenderedAsset): string {
  return [ASSET_CATALOG, ...groupSegments(asset), `${assetName(asset)}.imageset`].join("/")
}

/**
 * Every group directory on the way to an asset, outermost first, e.g.
 * ["Assets.xcassets/Icons", "Assets.xcassets/Icons/App"]. Used to emit a
 * Contents.json per group folder (the catalog root is handled separately).
 */
export function groupDirectories(asset: RenderedAsset): Array<string> {
  const directories: Array<string> = []
  let current = ASSET_CATALOG
  for (const segment of groupSegments(asset)) {
    current = `${current}/${segment}`
    directories.push(current)
  }
  return directories
}

/** Scale suffix used by Xcode raster assets (@2x / @3x). x1 has no suffix; SVG never scales. */
export function scaleSuffix(scale: AssetScale): string {
  switch (scale) {
    case AssetScale.x2:
      return "@2x"
    case AssetScale.x3:
      return "@3x"
    case AssetScale.x4:
      return "@4x"
    default:
      return ""
  }
}

/** Scale label used inside Contents.json ("1x" / "2x" / "3x"). */
export function scaleLabel(scale: AssetScale): string {
  switch (scale) {
    case AssetScale.x2:
      return "2x"
    case AssetScale.x3:
      return "3x"
    case AssetScale.x4:
      return "4x"
    default:
      return "1x"
  }
}

/** File name of a single rendered representation, e.g. `Burger.svg` or `Hero@2x.png`. */
export function assetFileName(asset: RenderedAsset, scale: AssetScale): string {
  return `${assetName(asset)}${scaleSuffix(scale)}.${asset.format.toString()}`
}

/**
 * True when the asset's group path contains one of the filter fragments. The
 * filter is the (partial) fragment and the slash-joined group path is the
 * haystack, so `deprecated` matches `deprecated/legacy-icons` and `Icons/App`
 * matches exactly that subtree.
 */
function groupPathMatches(filters: Array<string>, asset: RenderedAsset): boolean {
  if (filters.length === 0) {
    return false
  }
  const groupPath = groupSegments(asset).join("/")
  return filters.some((filter) => groupPath.includes(filter))
}

/** True when the asset should be excluded because its group path matches an ignore fragment. */
export function isPathIgnored(ignored: Array<string>, asset: RenderedAsset): boolean {
  return groupPathMatches(ignored, asset)
}

/**
 * True when the asset must be exported as raster PNG regardless of whether a vector
 * representation exists, because it lives under one of the configured raster paths
 * (e.g. the `Images` group holding photos / app artwork exported from Figma at 1x/2x/3x).
 */
export function isForcedRasterPath(rasterPaths: Array<string>, asset: RenderedAsset): boolean {
  return groupPathMatches(rasterPaths, asset)
}

/**
 * True when the vector must keep its original colors (no template rendering)
 * because it lives under one of the configured multicolor paths.
 */
export function isMulticolorPath(multicolorPaths: Array<string>, asset: RenderedAsset): boolean {
  return groupPathMatches(multicolorPaths, asset)
}
