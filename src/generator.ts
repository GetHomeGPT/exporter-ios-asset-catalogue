import { AnyOutputFile, Asset, AssetScale, RenderedAsset } from "@supernovaio/sdk-exporters"
import { FileHelper } from "@supernovaio/export-helpers"
import { ExporterConfiguration } from "../config"
import {
  ASSET_CATALOG,
  assetFileName,
  groupDirectories,
  groupSegments,
  imagesetDirectory,
  isForcedRasterPath,
  isPathIgnored,
} from "./paths"
import {
  LocalizedRaster,
  LocalizedVector,
  infoContentsJson,
  namespaceGroupContentsJson,
  rasterContentsJson,
  vectorContentsJson,
} from "./contents"

/** Raster assets are exported at these scales. Vectors are a single, scale-independent SVG. */
export const RASTER_SCALES: Array<AssetScale> = [AssetScale.x1, AssetScale.x2, AssetScale.x3]

/** A base asset together with its localized variants (empty when localization is off). */
export type AssetFamily = { base: Asset; variants: Array<{ locale: string; asset: Asset }> }

/** Everything the pure catalogue generation needs; produced by the SDK calls in index.ts. */
export type RenderedCatalogue = {
  /** SVG @1x renders of the assets that stay on the vector pipeline. */
  vectorRenders: Array<RenderedAsset>
  /** PNG renders of the raster assets, one array per entry of RASTER_SCALES. */
  rasterRendersByScale: Array<Array<RenderedAsset>>
}

const LOCALE_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/

/**
 * Canonical BCP-47 casing: language lowercase, 2-letter region uppercase, 4-letter
 * script capitalized ("TR" -> "tr", "pt-br" -> "pt-BR"). Xcode matches the app
 * language against these values at runtime, so non-canonical casing would be a
 * silently dead localization.
 */
function canonicalizeLocale(locale: string): string {
  return locale
    .split("-")
    .map((subtag, index) => {
      if (index === 0) {
        return subtag.toLowerCase()
      }
      if (subtag.length === 2) {
        return subtag.toUpperCase()
      }
      if (subtag.length === 4) {
        return subtag[0].toUpperCase() + subtag.slice(1).toLowerCase()
      }
      return subtag.toLowerCase()
    })
    .join("-")
}

/**
 * Resolves configuration values that arrive from user overrides into a safe,
 * canonical form: path filters and locales are trimmed and empty fragments
 * dropped, so a stray "" never matches every asset. Locales are canonicalized
 * and sorted longest-first (so "pt-BR" wins over an overlapping "BR" when both
 * are configured). Invalid locale codes fail loudly here — actool copies any
 * string verbatim into the compiled catalog without validation, so this is the
 * only guard.
 */
export function normalizeConfiguration(config: ExporterConfiguration): ExporterConfiguration {
  const cleanFragments = (fragments: Array<string>): Array<string> =>
    (fragments ?? []).map((fragment) => fragment.trim()).filter((fragment) => fragment.length > 0)

  const assetLocales = [...new Set(cleanFragments(config.assetLocales).map(canonicalizeLocale))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b)
  )
  const invalidLocales = assetLocales.filter((locale) => !LOCALE_PATTERN.test(locale))
  if (invalidLocales.length > 0) {
    throw new Error(`Invalid locale codes in assetLocales (expected BCP-47 like "tr" or "pt-BR"): ${invalidLocales.join(", ")}`)
  }

  // The separator is used verbatim (a space is valid for "hero tr" naming); only a
  // missing/empty value falls back to "-".
  const separator = config.localeSuffixSeparator ?? "-"
  return {
    ...config,
    ignoredAssetPaths: cleanFragments(config.ignoredAssetPaths),
    rasterAssetPaths: cleanFragments(config.rasterAssetPaths),
    assetLocales,
    localeSuffixSeparator: separator === "" ? "-" : separator,
  }
}

/**
 * An asset is treated as a vector when Supernova has an SVG representation for it
 * (`svgUrl`). Supernova's recognition engine extracts vector data first and only
 * falls back to a bitmap when an asset genuinely cannot be represented as a vector.
 * This is not sufficient on its own: Supernova can produce an SVG wrapper even for
 * true images (photos / app artwork), so groups listed in `rasterAssetPaths` are
 * additionally forced to the raster pipeline by routeFamilies().
 *
 * Note: svgUrl is populated for assets imported (or re-imported) after 2023-11-07.
 * A vector imported before that date and never re-imported has no svgUrl and would
 * be exported as PNG until it is re-imported.
 */
export function hasVectorRepresentation(asset: Asset): boolean {
  return typeof asset.svgUrl === "string" && asset.svgUrl.length > 0
}

/**
 * Parses `<base><separator><locale>` names; null when the name carries no configured
 * locale suffix. Matching is case-insensitive ("hero-TR" folds under locale "tr")
 * and the returned locale is always the canonical configured code. Locales arrive
 * longest-first from normalizeConfiguration, so overlapping codes resolve correctly.
 */
export function parseLocaleSuffix(name: string, config: ExporterConfiguration): { baseName: string; locale: string } | null {
  const nameLower = name.toLowerCase()
  for (const locale of config.assetLocales) {
    const suffix = `${config.localeSuffixSeparator}${locale}`.toLowerCase()
    if (name.length > suffix.length && nameLower.endsWith(suffix)) {
      return { baseName: name.slice(0, name.length - suffix.length), locale }
    }
  }
  return null
}

/**
 * Groups assets into families: each base asset plus the localized variants whose
 * name is `<base><separator><locale>`. When `groupKeyByAssetId` is provided (from
 * the asset groups), a variant is paired with the base in its OWN folder, so
 * same-named bases in different folders stay independent. Fails loudly on naming
 * problems — an orphan variant would otherwise become a locale-only imageset that
 * silently serves no image for every other language at runtime.
 */
export function groupAssetFamilies(
  assets: Array<Asset>,
  config: ExporterConfiguration,
  groupKeyByAssetId?: Map<string, string>
): Array<AssetFamily> {
  if (config.assetLocales.length === 0) {
    return assets.map((asset) => ({ base: asset, variants: [] }))
  }
  const keyOf = (asset: Asset): string | undefined => groupKeyByAssetId?.get(asset.id)

  const bases: Array<Asset> = []
  const variants: Array<{ baseName: string; locale: string; asset: Asset }> = []
  for (const asset of assets) {
    const parsed = parseLocaleSuffix(asset.name, config)
    if (parsed) {
      variants.push({ ...parsed, asset })
    } else {
      bases.push(asset)
    }
  }

  const basesByName = new Map<string, Array<Asset>>()
  for (const base of bases) {
    basesByName.set(base.name, [...(basesByName.get(base.name) ?? []), base])
  }

  const families = new Map<Asset, AssetFamily>()
  for (const base of bases) {
    families.set(base, { base, variants: [] })
  }

  const problems: Array<string> = []
  for (const variant of variants) {
    const candidates = basesByName.get(variant.baseName) ?? []
    if (candidates.length === 0) {
      problems.push(`"${variant.asset.name}" has no base asset named "${variant.baseName}"`)
      continue
    }

    let chosen: Asset | undefined
    const variantKey = keyOf(variant.asset)
    if (variantKey !== undefined) {
      const sameFolder = candidates.filter((base) => keyOf(base) === variantKey)
      if (sameFolder.length === 1) {
        chosen = sameFolder[0]
      } else if (sameFolder.length > 1) {
        problems.push(
          `"${variant.asset.name}" matches ${sameFolder.length} base assets named "${variant.baseName}" in the same folder — rename them to disambiguate`
        )
        continue
      } else if (candidates.length === 1 && keyOf(candidates[0]) === undefined) {
        // Group unknown for the base - cannot disprove the same-folder rule.
        chosen = candidates[0]
      } else {
        problems.push(
          `"${variant.asset.name}" has no base asset named "${variant.baseName}" in its folder — keep each variant next to its base`
        )
        continue
      }
    } else if (candidates.length === 1) {
      chosen = candidates[0]
    } else {
      problems.push(`"${variant.asset.name}" matches ${candidates.length} base assets named "${variant.baseName}" — rename them to disambiguate`)
      continue
    }

    const family = families.get(chosen)!
    if (family.variants.some((existing) => existing.locale === variant.locale)) {
      problems.push(`duplicate "${variant.locale}" variant for base asset "${variant.baseName}"`)
      continue
    }
    family.variants.push({ locale: variant.locale, asset: variant.asset })
  }
  if (problems.length > 0) {
    throw new Error(`Localized asset problems:\n- ${problems.join("\n- ")}`)
  }
  return [...families.values()]
}

/** Every asset of a family, base first. */
export function familyMembers(family: AssetFamily): Array<Asset> {
  return [family.base, ...family.variants.map((variant) => variant.asset)]
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
 * Decides per FAMILY which pipeline to use, so a base and its localized variants
 * always land in one imageset with one format:
 * - vector: every member has an SVG representation and no member sits under a
 *   forced-raster group (checked on the SVG renders, where groups are resolved);
 * - raster: everything else (PNG is always renderable).
 */
export function routeFamilies(
  families: Array<AssetFamily>,
  svgRenders: Array<RenderedAsset>,
  config: ExporterConfiguration
): { vectorRenders: Array<RenderedAsset>; rasterAssets: Array<Asset> } {
  const { forcedRasterIds } = partitionVectorRenders(svgRenders, config)
  const isVectorFamily = (family: AssetFamily): boolean =>
    familyMembers(family).every((member) => hasVectorRepresentation(member) && !forcedRasterIds.has(member.id))

  const vectorIds = new Set(families.filter(isVectorFamily).flatMap((family) => familyMembers(family).map((member) => member.id)))
  return {
    vectorRenders: svgRenders.filter((render) => vectorIds.has(render.assetId) || (render.asset && vectorIds.has(render.asset.id))),
    rasterAssets: families.filter((family) => !isVectorFamily(family)).flatMap((family) => familyMembers(family)),
  }
}

/** Stable key that pairs a localized variant render with its base render. */
function familyKey(render: RenderedAsset, baseName: string): string {
  return `${groupSegments(render).join("/")}//${baseName}`
}

/**
 * Pure catalogue generation: turns rendered assets into the full Assets.xcassets
 * file list — root Contents.json, one Contents.json per group folder, and one
 * imageset (binaries + Contents.json) per asset FAMILY: localized variants are
 * folded into their base imageset as per-locale entries.
 */
export function generateAssetCatalogue(catalogue: RenderedCatalogue, config: ExporterConfiguration): Array<AnyOutputFile> {
  const files: Array<AnyOutputFile> = []
  const groupFolders = new Set<string>()

  // --- Vectors -> one imageset per family, a single SVG per locale ---------------
  const vectorRenders = catalogue.vectorRenders.filter((render) => !isPathIgnored(config.ignoredAssetPaths, render))
  const vectorVariants = new Map<string, Array<LocalizedVector>>()
  const vectorBases: Array<RenderedAsset> = []
  for (const render of vectorRenders) {
    const parsed = parseLocaleSuffix(render.originalName, config)
    if (parsed) {
      const key = familyKey(render, parsed.baseName)
      vectorVariants.set(key, [...(vectorVariants.get(key) ?? []), { locale: parsed.locale, asset: render }])
    } else {
      vectorBases.push(render)
    }
  }

  for (const asset of vectorBases) {
    const directory = imagesetDirectory(asset)
    groupDirectories(asset).forEach((folder) => groupFolders.add(folder))

    const key = familyKey(asset, asset.originalName)
    const localized = (vectorVariants.get(key) ?? []).sort((a, b) => a.locale.localeCompare(b.locale))
    vectorVariants.delete(key)

    for (const render of [asset, ...localized.map((variant) => variant.asset)]) {
      files.push(
        FileHelper.createCopyRemoteFile({
          url: render.sourceUrl,
          relativePath: directory,
          fileName: assetFileName(render, AssetScale.x1),
        })
      )
    }
    files.push(
      FileHelper.createTextFile({
        relativePath: directory,
        fileName: "Contents.json",
        content: vectorContentsJson(asset, config.templateRenderingForVectors, config.preserveVectorData, localized),
      })
    )
  }

  if (vectorVariants.size > 0) {
    const orphans = [...vectorVariants.values()].flat().map((variant) => variant.asset.originalName)
    throw new Error(
      `Localized variants without a usable base: ${orphans.join(", ")} — each variant needs a base asset in the same folder (and the base must have rendered)`
    )
  }

  // --- Rasters -> one imageset per family, PNG per locale x rendered scale -------
  const rasterRendersByScale = catalogue.rasterRendersByScale.map((rendered) =>
    rendered.filter((render) => !isPathIgnored(config.ignoredAssetPaths, render))
  )
  const scaleLookups = rasterRendersByScale.map((rendered) => {
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
  const rasterVariants = new Map<string, Array<{ locale: string; render: RenderedAsset }>>()
  const seenVariantIds = new Set<string>()
  for (const rendered of rasterRendersByScale) {
    for (const asset of rendered) {
      const parsed = parseLocaleSuffix(asset.originalName, config)
      if (parsed) {
        if (!seenVariantIds.has(asset.assetId)) {
          seenVariantIds.add(asset.assetId)
          const key = familyKey(asset, parsed.baseName)
          rasterVariants.set(key, [...(rasterVariants.get(key) ?? []), { locale: parsed.locale, render: asset }])
        }
      } else if (!baseRenders.has(asset.assetId)) {
        baseRenders.set(asset.assetId, asset)
      }
    }
  }

  const renderedScalesOf = (assetId: string): Array<AssetScale> =>
    RASTER_SCALES.filter((scale, index) => scaleLookups[index].has(assetId))

  for (const baseAsset of baseRenders.values()) {
    const directory = imagesetDirectory(baseAsset)
    groupDirectories(baseAsset).forEach((folder) => groupFolders.add(folder))

    const key = familyKey(baseAsset, baseAsset.originalName)
    const localized: Array<LocalizedRaster> = (rasterVariants.get(key) ?? [])
      .sort((a, b) => a.locale.localeCompare(b.locale))
      .map((variant) => ({ locale: variant.locale, asset: variant.render, scales: renderedScalesOf(variant.render.assetId) }))
    rasterVariants.delete(key)

    // Contents.json must only reference files that actually exist, so collect the
    // scales whose render succeeded (a miss would otherwise become an Xcode warning).
    const baseScales = renderedScalesOf(baseAsset.assetId)
    for (const member of [{ asset: baseAsset, scales: baseScales }, ...localized.map((variant) => ({ asset: variant.asset, scales: variant.scales }))]) {
      RASTER_SCALES.forEach((scale, index) => {
        if (!member.scales.includes(scale)) {
          return
        }
        const scaled = scaleLookups[index].get(member.asset.assetId)!
        files.push(
          FileHelper.createCopyRemoteFile({
            url: scaled.sourceUrl,
            relativePath: directory,
            fileName: assetFileName(scaled, scale),
          })
        )
      })
    }

    files.push(
      FileHelper.createTextFile({
        relativePath: directory,
        fileName: "Contents.json",
        content: rasterContentsJson(baseAsset, baseScales, localized),
      })
    )
  }

  if (rasterVariants.size > 0) {
    const orphans = [...rasterVariants.values()].flat().map((variant) => variant.render.originalName)
    throw new Error(
      `Localized variants without a usable base: ${orphans.join(", ")} — each variant needs a base asset in the same folder (and the base must have rendered)`
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
