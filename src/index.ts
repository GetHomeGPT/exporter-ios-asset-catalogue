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
  familyMembers,
  generateAssetCatalogue,
  groupAssetFamilies,
  hasVectorRepresentation,
  normalizeConfiguration,
  routeFamilies,
} from "./generator"
import configOptions from "../config.json"

/**
 * Exporter configuration. Its content comes from the resolved default configuration
 * (config.json) plus any user overrides of the configuration keys.
 *
 * This MUST be initialized before Pulsar.export() below: some executors invoke the
 * export callback synchronously, and the callback reads the configuration before its
 * first await — a later declaration would still be undefined at that point.
 */
export const exportConfiguration = Pulsar.exportConfig<ExporterConfiguration>()

/** config.json is the single source of truth for defaults; overrides merge on top. */
function resolveConfiguration(): ExporterConfiguration {
  const defaults: { [key: string]: unknown } = {}
  for (const option of configOptions as Array<{ key: string; default: unknown }>) {
    defaults[option.key] = option.default
  }
  return normalizeConfiguration({ ...(defaults as unknown as ExporterConfiguration), ...(exportConfiguration ?? {}) })
}

/**
 * Export entrypoint. Called when running `export` through extensions or pipelines.
 * Context contains the design system and version currently being exported.
 *
 * This file is the only one that touches the Pulsar bridge and the remote SDK —
 * everything downstream of the fetches lives in generator.ts as pure functions
 * (see tests/).
 */
Pulsar.export(async (sdk: Supernova, context: PulsarContext): Promise<Array<AnyOutputFile>> => {
  const config = resolveConfiguration()
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

  // Group assets into families (a base plus its localized variants, when
  // assetLocales is configured) — naming problems fail here, before any rendering.
  // The group map lets variants pair with the base in their own folder, so
  // same-named bases in different folders stay independent.
  const groupKeyByAssetId = new Map<string, string>()
  for (const group of assetGroups) {
    const key = [...group.path, group.name].filter((segment) => segment && segment.length > 0).join("/")
    for (const assetId of group.assetIds ?? []) {
      groupKeyByAssetId.set(assetId, key)
    }
  }
  const families = groupAssetFamilies(assets, config, groupKeyByAssetId)

  // Route each family to the representation that fits it best. A family is only a
  // vector candidate when every member has an SVG representation, so a base and
  // its localized variants always share one imageset format. Assets under a
  // configured raster path (e.g. "Images") are photos / app artwork whose Figma
  // export settings are 1x/2x/3x PNG - Supernova may still hold an SVG wrapper
  // for them, so families are re-routed after the SVG render resolves their groups.
  const vectorCandidateAssets = families
    .filter((family) => familyMembers(family).every((member) => hasVectorRepresentation(member)))
    .flatMap((family) => familyMembers(family))

  const svgRenders =
    vectorCandidateAssets.length > 0
      ? await sdk.assets.getRenderedAssets(remoteVersionIdentifier, vectorCandidateAssets, assetGroups, AssetFormat.svg, AssetScale.x1)
      : []
  const { vectorRenders, rasterAssets } = routeFamilies(families, svgRenders, config)

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
