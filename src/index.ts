import {
  Pulsar,
  Supernova,
  PulsarContext,
  RemoteVersionIdentifier,
  AnyOutputFile,
  AssetFormat,
  AssetScale,
} from "@supernovaio/sdk-exporters"
import { ExporterConfiguration } from "../config"
import {
  RASTER_SCALES,
  generateAssetCatalogue,
  hasVectorRepresentation,
  normalizeConfiguration,
  partitionVectorRenders,
} from "./generator"

/**
 * Export entrypoint. Called when running `export` through extensions or pipelines.
 * Context contains the design system and version currently being exported.
 *
 * This file is the only one that touches the Pulsar bridge and the remote SDK —
 * everything downstream of the fetches lives in generator.ts as pure functions
 * (see tests/).
 */
Pulsar.export(async (sdk: Supernova, context: PulsarContext): Promise<Array<AnyOutputFile>> => {
  const config = normalizeConfiguration(exportConfiguration)
  const remoteVersionIdentifier: RemoteVersionIdentifier = {
    designSystemId: context.dsId,
    versionId: context.versionId,
  }

  let assets = await sdk.assets.getAssets(remoteVersionIdentifier)
  let assetGroups = await sdk.assets.getAssetGroups(remoteVersionIdentifier)

  // When the pipeline selects a brand, restrict the export to that brand's assets.
  if (context.brandId) {
    const brands = await sdk.brands.getBrands(remoteVersionIdentifier)
    const brand = brands.find((candidate) => candidate.id === context.brandId || candidate.idInVersion === context.brandId)
    if (!brand) {
      throw new Error(`Unable to find brand ${context.brandId}`)
    }
    assets = assets.filter((asset) => asset.brandId === brand.id)
    assetGroups = assetGroups.filter((group) => group.brandId === brand.id)
  }

  // Route each asset to the representation that fits it best. Assets under a
  // configured raster path (e.g. "Images") are photos / app artwork whose Figma
  // export settings are 1x/2x/3x PNG - Supernova may still hold an SVG wrapper
  // for them, so they are re-routed after the SVG render resolves their group.
  const vectorCapableAssets = assets.filter((asset) => hasVectorRepresentation(asset))
  const bitmapOnlyAssets = assets.filter((asset) => !hasVectorRepresentation(asset))

  const svgRenders =
    vectorCapableAssets.length > 0
      ? await sdk.assets.getRenderedAssets(remoteVersionIdentifier, vectorCapableAssets, assetGroups, AssetFormat.svg, AssetScale.x1)
      : []
  const { vectorRenders, forcedRasterIds } = partitionVectorRenders(svgRenders, config)

  const rasterAssets = [...bitmapOnlyAssets, ...vectorCapableAssets.filter((asset) => forcedRasterIds.has(asset.id))]
  const rasterRendersByScale =
    rasterAssets.length > 0
      ? await Promise.all(
          RASTER_SCALES.map((scale) =>
            sdk.assets.getRenderedAssets(remoteVersionIdentifier, rasterAssets, assetGroups, AssetFormat.png, scale)
          )
        )
      : RASTER_SCALES.map(() => [])

  return generateAssetCatalogue({ vectorRenders, rasterRendersByScale }, config)
})

/**
 * Exporter configuration. Its content comes from the resolved default configuration
 * (config.json) plus any user overrides of the configuration keys.
 */
export const exportConfiguration = Pulsar.exportConfig<ExporterConfiguration>()
