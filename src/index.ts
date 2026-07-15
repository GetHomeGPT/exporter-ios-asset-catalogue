import {
  Supernova,
  PulsarContext,
  RemoteVersionIdentifier,
  AnyOutputFile,
  AssetFormat,
  AssetScale,
  Asset,
  RenderedAsset,
} from "@supernovaio/sdk-exporters"
import { FileHelper } from "@supernovaio/export-helpers"
import { ExporterConfiguration } from "../config"
import { imagesetDirectory, assetFileName, isPathIgnored, isForcedRasterPath } from "./paths"
import { vectorContentsJson, rasterContentsJson } from "./contents"

/** Raster assets are exported at these scales. Vectors are a single, scale-independent SVG. */
const RASTER_SCALES: Array<AssetScale> = [AssetScale.x1, AssetScale.x2, AssetScale.x3]

/**
 * An asset is treated as a vector when Supernova has an SVG representation for it
 * (`svgUrl`). Supernova's recognition engine extracts vector data first and only
 * falls back to a bitmap when an asset genuinely cannot be represented as a vector.
 * This is not sufficient on its own: Supernova can produce an SVG wrapper even for
 * true images (photos / app artwork), so groups listed in `rasterAssetPaths` are
 * additionally forced to the raster pipeline further below.
 *
 * Note: svgUrl is populated for assets imported (or re-imported) after 2023-11-07.
 * A vector imported before that date and never re-imported has no svgUrl and would
 * be exported as PNG until it is re-imported.
 */
function hasVectorRepresentation(asset: Asset): boolean {
  return typeof asset.svgUrl === "string" && asset.svgUrl.length > 0
}

/**
 * Export entrypoint. Called when running `export` through extensions or pipelines.
 * Context contains the design system and version currently being exported.
 */
Pulsar.export(async (sdk: Supernova, context: PulsarContext): Promise<Array<AnyOutputFile>> => {
  const remoteVersionIdentifier: RemoteVersionIdentifier = {
    designSystemId: context.dsId,
    versionId: context.versionId,
  }

  const assets = await sdk.assets.getAssets(remoteVersionIdentifier)
  const assetGroups = await sdk.assets.getAssetGroups(remoteVersionIdentifier)

  // Route each asset to the representation that fits it best.
  const vectorCapableAssets = assets.filter((asset) => hasVectorRepresentation(asset))
  const bitmapOnlyAssets = assets.filter((asset) => !hasVectorRepresentation(asset))

  const files: Array<AnyOutputFile> = []

  // Assets under a configured raster path (e.g. "Images") are photos / app artwork
  // whose Figma export settings are 1x/2x/3x PNG. Supernova may still hold an SVG
  // wrapper for them, so they would otherwise be mis-routed to the vector pipeline.
  // The group of an asset is only resolved on RenderedAsset, so the split happens
  // after the SVG render below.
  let rasterAssets = bitmapOnlyAssets

  // --- Vectors -> a single SVG per imageset (Preserve Vector Data) ---------------
  if (vectorCapableAssets.length > 0) {
    const rendered = await sdk.assets.getRenderedAssets(
      remoteVersionIdentifier,
      vectorCapableAssets,
      assetGroups,
      AssetFormat.svg,
      AssetScale.x1
    )

    const forcedRasterIds = new Set<string>()
    for (const asset of rendered) {
      if (isForcedRasterPath(exportConfiguration.rasterAssetPaths, asset)) {
        forcedRasterIds.add(asset.assetId)
        if (asset.asset) {
          forcedRasterIds.add(asset.asset.id)
        }
      }
    }
    rasterAssets = [...bitmapOnlyAssets, ...vectorCapableAssets.filter((asset) => forcedRasterIds.has(asset.id))]

    for (const asset of rendered) {
      if (forcedRasterIds.has(asset.assetId) || isPathIgnored(exportConfiguration.ignoredAssetPaths, asset)) {
        continue
      }
      const directory = imagesetDirectory(asset)
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
          content: vectorContentsJson(asset, exportConfiguration.templateRenderingForVectors),
        })
      )
    }
  }

  // --- Rasters -> PNG @1x / @2x / @3x per imageset -------------------------------
  if (rasterAssets.length > 0) {
    // Render every scale, then group the three renders of each asset by its id so
    // one imageset gets exactly its @1x/@2x/@3x files plus a single Contents.json.
    const renderedByScale = await Promise.all(
      RASTER_SCALES.map((scale) =>
        sdk.assets.getRenderedAssets(remoteVersionIdentifier, rasterAssets, assetGroups, AssetFormat.png, scale)
      )
    )

    const scaleLookups = renderedByScale.map((rendered) => {
      const byId = new Map<string, RenderedAsset>()
      for (const asset of rendered) {
        byId.set(asset.assetId, asset)
      }
      return byId
    })

    // Iterate the @1x set as the canonical list of raster imagesets.
    for (const baseAsset of renderedByScale[0]) {
      if (isPathIgnored(exportConfiguration.ignoredAssetPaths, baseAsset)) {
        continue
      }
      const directory = imagesetDirectory(baseAsset)

      RASTER_SCALES.forEach((scale, index) => {
        const scaled = scaleLookups[index].get(baseAsset.assetId)
        if (!scaled) {
          return
        }
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
          content: rasterContentsJson(baseAsset),
        })
      )
    }
  }

  return files
})

/**
 * Exporter configuration. Its content comes from the resolved default configuration
 * (config.json) plus any user overrides of the configuration keys.
 */
export const exportConfiguration = Pulsar.exportConfig<ExporterConfiguration>()
