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
  isMulticolorPath,
  isPathIgnored,
} from "./paths"
import {
  RasterVariant,
  VectorVariant,
  infoContentsJson,
  namespaceGroupContentsJson,
  rasterContentsJson,
  vectorContentsJson,
} from "./contents"

/** Raster assets are exported at these scales. Vectors are a single, scale-independent SVG. */
export const RASTER_SCALES: Array<AssetScale> = [AssetScale.x1, AssetScale.x2, AssetScale.x3]

/**
 * Device idioms the exporter can emit, with the raster scales each supports.
 * actool silently drops an `ipad` 3x slot from the compiled catalog (a diagnostic
 * appears only with --warnings), so 3x is never emitted for iPad. Idioms are a
 * closed set — actool copies unknown values into the catalog with only a warning,
 * so membership is validated here.
 */
export const IDIOM_RASTER_SCALES: Record<string, Array<AssetScale>> = {
  ipad: [AssetScale.x1, AssetScale.x2],
  iphone: [AssetScale.x1, AssetScale.x2, AssetScale.x3],
}

/** Identifies one variant of a base asset: a device idiom, a locale, or both. */
export type VariantKey = { idiom?: string; locale?: string }

/** A base asset together with its variants (empty when neither locales nor idioms are configured). */
export type AssetFamily = { base: Asset; variants: Array<VariantKey & { asset: Asset }> }

/** Deterministic imageset entry order: universal entries first, then per-idiom, locales alphabetical within. */
function variantOrder(a: VariantKey, b: VariantKey): number {
  return (a.idiom ?? "").localeCompare(b.idiom ?? "") || (a.locale ?? "").localeCompare(b.locale ?? "")
}

/** Human-readable variant tag for error messages: "ipad", "tr" or "ipad+tr". */
function variantLabel(key: VariantKey): string {
  return [key.idiom, key.locale].filter((part): part is string => part !== undefined).join("+")
}

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

  const assetIdioms = [...new Set(cleanFragments(config.assetIdioms).map((idiom) => idiom.toLowerCase()))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b)
  )
  const invalidIdioms = assetIdioms.filter((idiom) => !(idiom in IDIOM_RASTER_SCALES))
  if (invalidIdioms.length > 0) {
    throw new Error(
      `Invalid device idioms in assetIdioms (supported: ${Object.keys(IDIOM_RASTER_SCALES).sort().join(", ")}): ${invalidIdioms.join(", ")}`
    )
  }
  // The supported idioms cannot pass LOCALE_PATTERN today, but a future entry
  // (e.g. "mac") also parses as a locale — one suffix must never match both axes.
  const ambiguous = assetIdioms.filter((idiom) => assetLocales.includes(idiom))
  if (ambiguous.length > 0) {
    throw new Error(`assetIdioms and assetLocales must not share codes: ${ambiguous.join(", ")}`)
  }

  // The separator is used verbatim (a space is valid for "hero tr" naming); only a
  // missing/empty value falls back to "-".
  const separator = config.localeSuffixSeparator ?? "-"
  return {
    ...config,
    ignoredAssetPaths: cleanFragments(config.ignoredAssetPaths),
    rasterAssetPaths: cleanFragments(config.rasterAssetPaths),
    multicolorAssetPaths: cleanFragments(config.multicolorAssetPaths),
    assetLocales,
    assetIdioms,
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
 * Case-insensitive `<separator><value>` suffix strip; null when no configured value
 * matches. Values arrive longest-first from normalizeConfiguration, so overlapping
 * codes resolve correctly, and the returned value is always the canonical configured
 * code ("hero-TR" folds under locale "tr").
 */
function stripVariantSuffix(name: string, values: Array<string>, separator: string): { baseName: string; value: string } | null {
  const nameLower = name.toLowerCase()
  for (const value of values) {
    const suffix = `${separator}${value}`.toLowerCase()
    if (name.length > suffix.length && nameLower.endsWith(suffix)) {
      return { baseName: name.slice(0, name.length - suffix.length), value }
    }
  }
  return null
}

/**
 * Parses `<base><sep><idiom><sep><locale>` names, either suffix optional; null when
 * the name carries neither. The locale is the last suffix, so it is stripped first
 * ("hero-ipad-tr" -> locale "tr", then idiom "ipad", base "hero"). The reverse
 * order ("hero-tr-ipad") is NOT parsed as both axes — it strips to base "hero-tr",
 * which fails loudly as an orphan instead of silently mis-pairing.
 */
export function parseVariantSuffix(name: string, config: ExporterConfiguration): ({ baseName: string } & VariantKey) | null {
  const locale = stripVariantSuffix(name, config.assetLocales, config.localeSuffixSeparator)
  const idiom = stripVariantSuffix(locale?.baseName ?? name, config.assetIdioms, config.localeSuffixSeparator)
  if (!locale && !idiom) {
    return null
  }
  return { baseName: (idiom ?? locale)!.baseName, idiom: idiom?.value, locale: locale?.value }
}

/**
 * Groups assets into families: each base asset plus the variants whose name is
 * `<base><sep><idiom><sep><locale>` (either suffix optional). When
 * `groupKeyByAssetId` is provided (from the asset groups), a variant is paired
 * with the base in its OWN folder, so same-named bases in different folders stay
 * independent. Fails loudly on naming problems — an orphan variant would otherwise
 * become a variant-only imageset that silently serves no image everywhere else
 * at runtime.
 */
export function groupAssetFamilies(
  assets: Array<Asset>,
  config: ExporterConfiguration,
  groupKeyByAssetId?: Map<string, string>
): Array<AssetFamily> {
  if (config.assetLocales.length === 0 && config.assetIdioms.length === 0) {
    return assets.map((asset) => ({ base: asset, variants: [] }))
  }
  const keyOf = (asset: Asset): string | undefined => groupKeyByAssetId?.get(asset.id)

  const bases: Array<Asset> = []
  const variants: Array<{ baseName: string; asset: Asset } & VariantKey> = []
  for (const asset of assets) {
    const parsed = parseVariantSuffix(asset.name, config)
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
    if (family.variants.some((existing) => existing.idiom === variant.idiom && existing.locale === variant.locale)) {
      problems.push(`duplicate "${variantLabel(variant)}" variant for base asset "${variant.baseName}"`)
      continue
    }
    family.variants.push({ idiom: variant.idiom, locale: variant.locale, asset: variant.asset })
  }
  if (problems.length > 0) {
    throw new Error(`Asset variant problems:\n- ${problems.join("\n- ")}`)
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
 * Decides per FAMILY which pipeline to use, so a base and its variants always
 * land in one imageset with one format:
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

/** Stable key that pairs a variant render with its base render. */
function familyKey(render: RenderedAsset, baseName: string): string {
  return `${groupSegments(render).join("/")}//${baseName}`
}

/**
 * Pure catalogue generation: turns rendered assets into the full Assets.xcassets
 * file list — root Contents.json, one Contents.json per group folder, and one
 * imageset (binaries + Contents.json) per asset FAMILY: variants are folded into
 * their base imageset as per-locale / per-idiom entries.
 */
export function generateAssetCatalogue(catalogue: RenderedCatalogue, config: ExporterConfiguration): Array<AnyOutputFile> {
  const files: Array<AnyOutputFile> = []
  const groupFolders = new Set<string>()

  // --- Vectors -> one imageset per family, a single SVG per variant --------------
  const vectorRenders = catalogue.vectorRenders.filter((render) => !isPathIgnored(config.ignoredAssetPaths, render))
  const vectorVariants = new Map<string, Array<VectorVariant>>()
  const vectorBases: Array<RenderedAsset> = []
  for (const render of vectorRenders) {
    const parsed = parseVariantSuffix(render.originalName, config)
    if (parsed) {
      const key = familyKey(render, parsed.baseName)
      vectorVariants.set(key, [...(vectorVariants.get(key) ?? []), { idiom: parsed.idiom, locale: parsed.locale, asset: render }])
    } else {
      vectorBases.push(render)
    }
  }

  for (const asset of vectorBases) {
    const directory = imagesetDirectory(asset)
    groupDirectories(asset).forEach((folder) => groupFolders.add(folder))

    const key = familyKey(asset, asset.originalName)
    const variants = (vectorVariants.get(key) ?? []).sort(variantOrder)
    vectorVariants.delete(key)

    for (const render of [asset, ...variants.map((variant) => variant.asset)]) {
      files.push(
        FileHelper.createCopyRemoteFile({
          url: render.sourceUrl,
          relativePath: directory,
          fileName: assetFileName(render, AssetScale.x1),
        })
      )
    }
    // Multicolor folders opt out of template rendering per asset, so tintable
    // icons and full-color illustrations can share one export.
    const templateRendering = config.templateRenderingForVectors && !isMulticolorPath(config.multicolorAssetPaths, asset)
    files.push(
      FileHelper.createTextFile({
        relativePath: directory,
        fileName: "Contents.json",
        content: vectorContentsJson(asset, templateRendering, config.preserveVectorData, variants),
      })
    )
  }

  if (vectorVariants.size > 0) {
    const orphans = [...vectorVariants.values()].flat().map((variant) => variant.asset.originalName)
    throw new Error(
      `Asset variants without a usable base: ${orphans.join(", ")} — each variant needs a base asset in the same folder (and the base must have rendered)`
    )
  }

  // --- Rasters -> one imageset per family, PNG per variant x rendered scale ------
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
  const rasterVariants = new Map<string, Array<VariantKey & { render: RenderedAsset }>>()
  const seenVariantIds = new Set<string>()
  for (const rendered of rasterRendersByScale) {
    for (const asset of rendered) {
      const parsed = parseVariantSuffix(asset.originalName, config)
      if (parsed) {
        if (!seenVariantIds.has(asset.assetId)) {
          seenVariantIds.add(asset.assetId)
          const key = familyKey(asset, parsed.baseName)
          rasterVariants.set(key, [...(rasterVariants.get(key) ?? []), { idiom: parsed.idiom, locale: parsed.locale, render: asset }])
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
    // Idiom variants are capped to the scales their device family supports
    // (IDIOM_RASTER_SCALES) — an out-of-range slot like ipad@3x would be silently
    // dropped by actool, leaving a dead file in the catalog.
    const variants: Array<RasterVariant> = (rasterVariants.get(key) ?? [])
      .sort(variantOrder)
      .map((variant) => ({
        idiom: variant.idiom,
        locale: variant.locale,
        asset: variant.render,
        scales: renderedScalesOf(variant.render.assetId).filter(
          (scale) => variant.idiom === undefined || IDIOM_RASTER_SCALES[variant.idiom].includes(scale)
        ),
      }))
    rasterVariants.delete(key)

    // Contents.json must only reference files that actually exist, so collect the
    // scales whose render succeeded (a miss would otherwise become an Xcode warning).
    const baseScales = renderedScalesOf(baseAsset.assetId)
    for (const member of [{ asset: baseAsset, scales: baseScales }, ...variants.map((variant) => ({ asset: variant.asset, scales: variant.scales }))]) {
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
        content: rasterContentsJson(baseAsset, baseScales, variants),
      })
    )
  }

  if (rasterVariants.size > 0) {
    const orphans = [...rasterVariants.values()].flat().map((variant) => variant.render.originalName)
    throw new Error(
      `Asset variants without a usable base: ${orphans.join(", ")} — each variant needs a base asset in the same folder (and the base must have rendered)`
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
