import { AnyOutputFile, Asset, AssetScale, RenderedAsset } from "@supernovaio/sdk-exporters"
import { FileHelper } from "@supernovaio/export-helpers"
import { ExporterConfiguration } from "../config"
import {
  ASSET_CATALOG,
  assetFileName,
  groupDirectories,
  imagesetDirectory,
  isForcedRasterPath,
  isPathIgnored,
} from "./paths"
import { infoContentsJson, namespaceGroupContentsJson, rasterContentsJson, vectorContentsJson } from "./contents"

/** Raster assets are exported at these scales. Vectors are a single, scale-independent SVG. */
export const RASTER_SCALES: Array<AssetScale> = [AssetScale.x1, AssetScale.x2, AssetScale.x3]

/** Everything the pure catalogue generation needs; produced by the SDK calls in index.ts. */
export type RenderedCatalogue = {
  /** SVG @1x renders of the assets that stay on the vector pipeline. */
  vectorRenders: Array<RenderedAsset>
  /** PNG renders of the raster assets, one array per entry of RASTER_SCALES. */
  rasterRendersByScale: Array<Array<RenderedAsset>>
}

/**
 * Resolves configuration values that arrive from user overrides into a safe,
 * canonical form: path filters are trimmed and empty fragments dropped, so a
 * stray "" never matches every asset.
 */
export function normalizeConfiguration(config: ExporterConfiguration): ExporterConfiguration {
  const cleanPaths = (paths: Array<string>): Array<string> =>
    (paths ?? []).map((path) => path.trim()).filter((path) => path.length > 0)
  return {
    ...config,
    ignoredAssetPaths: cleanPaths(config.ignoredAssetPaths),
    rasterAssetPaths: cleanPaths(config.rasterAssetPaths),
  }
}

/**
 * An asset is treated as a vector when Supernova has an SVG representation for it
 * (`svgUrl`). Supernova's recognition engine extracts vector data first and only
 * falls back to a bitmap when an asset genuinely cannot be represented as a vector.
 * This is not sufficient on its own: Supernova can produce an SVG wrapper even for
 * true images (photos / app artwork), so groups listed in `rasterAssetPaths` are
 * additionally forced to the raster pipeline by partitionVectorRenders().
 *
 * Note: svgUrl is populated for assets imported (or re-imported) after 2023-11-07.
 * A vector imported before that date and never re-imported has no svgUrl and would
 * be exported as PNG until it is re-imported.
 */
export function hasVectorRepresentation(asset: Asset): boolean {
  return typeof asset.svgUrl === "string" && asset.svgUrl.length > 0
}

/**
 * Splits the SVG renders into true vectors and assets that must move to the raster
 * pipeline because their group matches `rasterAssetPaths`. The group of an asset is
 * only resolved on RenderedAsset, which is why this runs after the SVG render.
 * The returned id set contains both RenderedAsset.assetId and Asset.id so callers
 * can filter either collection.
 */
export function partitionVectorRenders(
  rendered: Array<RenderedAsset>,
  config: ExporterConfiguration
): { vectorRenders: Array<RenderedAsset>; forcedRasterIds: Set<string> } {
  const forcedRasterIds = new Set<string>()
  for (const asset of rendered) {
    if (isForcedRasterPath(config.rasterAssetPaths, asset)) {
      forcedRasterIds.add(asset.assetId)
      if (asset.asset) {
        forcedRasterIds.add(asset.asset.id)
      }
    }
  }
  return {
    vectorRenders: rendered.filter((asset) => !forcedRasterIds.has(asset.assetId)),
    forcedRasterIds,
  }
}

/**
 * Pure catalogue generation: turns rendered assets into the full Assets.xcassets
 * file list — root Contents.json, one Contents.json per group folder, and one
 * imageset (binaries + Contents.json) per asset.
 */
export function generateAssetCatalogue(catalogue: RenderedCatalogue, config: ExporterConfiguration): Array<AnyOutputFile> {
  const files: Array<AnyOutputFile> = []
  const groupFolders = new Set<string>()

  // --- Vectors -> a single SVG per imageset (optionally Preserve Vector Data) ----
  for (const asset of catalogue.vectorRenders) {
    if (isPathIgnored(config.ignoredAssetPaths, asset)) {
      continue
    }
    const directory = imagesetDirectory(asset)
    groupDirectories(asset).forEach((folder) => groupFolders.add(folder))
    files.push(
      FileHelper.createCopyRemoteFile({
        url: asset.sourceUrl,
        relativePath: directory,
        fileName: assetFileName(asset, AssetScale.x1),
      })
    )
    files.push(
      FileHelper.createTextFile({
        relativePath: directory,
        fileName: "Contents.json",
        content: vectorContentsJson(asset, config.templateRenderingForVectors, config.preserveVectorData),
      })
    )
  }

  // --- Rasters -> PNG @1x / @2x / @3x per imageset -------------------------------
  // Group the per-scale renders of each asset by its id so one imageset gets
  // exactly its rendered files plus a single Contents.json.
  const scaleLookups = catalogue.rasterRendersByScale.map((rendered) => {
    const byId = new Map<string, RenderedAsset>()
    for (const asset of rendered) {
      byId.set(asset.assetId, asset)
    }
    return byId
  })

  // The canonical list of raster imagesets is the union of every scale's renders
  // (first available render wins), so an asset whose @1x render failed still gets
  // an imageset from its remaining scales instead of being dropped silently.
  const baseRenders = new Map<string, RenderedAsset>()
  for (const rendered of catalogue.rasterRendersByScale) {
    for (const asset of rendered) {
      if (!baseRenders.has(asset.assetId)) {
        baseRenders.set(asset.assetId, asset)
      }
    }
  }

  for (const baseAsset of baseRenders.values()) {
    if (isPathIgnored(config.ignoredAssetPaths, baseAsset)) {
      continue
    }
    const directory = imagesetDirectory(baseAsset)
    groupDirectories(baseAsset).forEach((folder) => groupFolders.add(folder))

    // Contents.json must only reference files that actually exist, so collect the
    // scales whose render succeeded (a miss would otherwise become an Xcode warning).
    const renderedScales: Array<AssetScale> = []
    RASTER_SCALES.forEach((scale, index) => {
      const scaled = scaleLookups[index].get(baseAsset.assetId)
      if (!scaled) {
        return
      }
      renderedScales.push(scale)
      files.push(
        FileHelper.createCopyRemoteFile({
          url: scaled.sourceUrl,
          relativePath: directory,
          fileName: assetFileName(scaled, scale),
        })
      )
    })

    files.push(
      FileHelper.createTextFile({
        relativePath: directory,
        fileName: "Contents.json",
        content: rasterContentsJson(baseAsset, renderedScales),
      })
    )
  }

  // --- Catalog structure: root + one Contents.json per group folder --------------
  // The root Contents.json matches what Xcode itself writes into every catalog.
  // Group folders are either plain (organizational only) or namespacing, in which
  // case both the runtime lookup names and the generated Swift symbols are scoped.
  files.push(
    FileHelper.createTextFile({
      relativePath: ASSET_CATALOG,
      fileName: "Contents.json",
      content: infoContentsJson(),
    })
  )
  for (const folder of groupFolders) {
    files.push(
      FileHelper.createTextFile({
        relativePath: folder,
        fileName: "Contents.json",
        content: config.providesNamespace ? namespaceGroupContentsJson() : infoContentsJson(),
      })
    )
  }

  return files
}
