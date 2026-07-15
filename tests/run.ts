/**
 * Generation smoke test: builds the asset catalogue from plain-object fixtures in
 * five representative configurations and writes them to tests/output/<scenario>/.
 * Text files are written as-is; copy-remote descriptors are materialized as tiny
 * placeholder binaries so each scenario directory is a complete .xcassets that
 * tests/validate.sh can lint and compile with actool.
 */
import * as fs from "fs"
import * as path from "path"
import { AnyOutputFile, AssetFormat, AssetScale, OutputFileType, RenderedAsset } from "@supernovaio/sdk-exporters"
import { ExporterConfiguration } from "../config"
import {
  RASTER_SCALES,
  familyMembers,
  generateAssetCatalogue,
  groupAssetFamilies,
  hasVectorRepresentation,
  normalizeConfiguration,
  routeFamilies,
} from "../src/generator"
import { Fixture, makeFixture } from "./fixtures"
import configOptions from "../config.json"

/** Default configuration resolved from config.json (single source of truth). */
function defaultConfiguration(): ExporterConfiguration {
  const config: { [key: string]: unknown } = {}
  for (const option of configOptions as Array<{ key: string; default: unknown }>) {
    config[option.key] = option.default
  }
  return normalizeConfiguration(config as unknown as ExporterConfiguration)
}

/** A 1x1 transparent PNG, so actool sees a real bitmap where a PNG would be copied. */
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
)
const PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'

function writeFiles(root: string, files: Array<AnyOutputFile>): void {
  for (const file of files) {
    const directory = path.join(root, file.path)
    fs.mkdirSync(directory, { recursive: true })
    const destination = path.join(directory, file.name)
    if (file.type === OutputFileType.text) {
      fs.writeFileSync(destination, (file as { content: string }).content)
    } else if (file.type === OutputFileType.copyRemoteUrl) {
      if (file.name.endsWith(".png")) {
        fs.writeFileSync(destination, PLACEHOLDER_PNG)
      } else {
        fs.writeFileSync(destination, PLACEHOLDER_SVG)
      }
    }
  }
}

function fail(scenario: string, message: string): never {
  throw new Error(`[${scenario}] ${message}`)
}

/**
 * Structural invariants that must hold for every generated catalogue:
 * no duplicate outputs, a root Contents.json, valid JSON everywhere, and every
 * imageset's Contents.json referencing exactly the binaries emitted next to it.
 */
function assertInvariants(scenario: string, files: Array<AnyOutputFile>): void {
  const seen = new Set<string>()
  for (const file of files) {
    const key = `${file.path}/${file.name}`
    if (seen.has(key)) {
      fail(scenario, `duplicate output file: ${key}`)
    }
    seen.add(key)
  }

  if (!files.some((file) => file.path === "Assets.xcassets" && file.name === "Contents.json")) {
    fail(scenario, "missing root Assets.xcassets/Contents.json")
  }

  const binariesByDirectory = new Map<string, Set<string>>()
  for (const file of files) {
    if (file.type === OutputFileType.copyRemoteUrl) {
      const set = binariesByDirectory.get(file.path) ?? new Set<string>()
      set.add(file.name)
      binariesByDirectory.set(file.path, set)
    }
  }

  for (const file of files) {
    if (file.type !== OutputFileType.text) {
      continue
    }
    const content = (file as { content: string }).content
    let parsed: { images?: Array<{ filename?: string }> }
    try {
      parsed = JSON.parse(content)
    } catch {
      fail(scenario, `invalid JSON in ${file.path}/${file.name}`)
    }
    if (!file.path.endsWith(".imageset")) {
      continue
    }
    const referenced = new Set((parsed.images ?? []).map((image) => image.filename ?? ""))
    const emitted = binariesByDirectory.get(file.path) ?? new Set<string>()
    for (const name of referenced) {
      if (!emitted.has(name)) {
        fail(scenario, `${file.path}/Contents.json references ${name} but no binary is emitted there`)
      }
    }
    for (const name of emitted) {
      if (!referenced.has(name)) {
        fail(scenario, `${file.path} emits ${name} but Contents.json does not reference it`)
      }
    }
  }
}

/** Mirrors the assetId -> group key map that index.ts builds from asset groups. */
function groupKeys(fixtures: Array<Fixture>): Map<string, string> {
  return new Map(fixtures.map((fixture) => [fixture.asset.id, fixture.groupKey]))
}

/** Mirrors the index.ts orchestration for a fixture set, without the SDK. */
function generate(
  fixtures: Array<Fixture>,
  config: ExporterConfiguration,
  options: { missingScales?: Map<string, Array<AssetScale>> } = {}
): Array<AnyOutputFile> {
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.asset.id, fixture]))
  const families = groupAssetFamilies(fixtures.map((fixture) => fixture.asset), config, groupKeys(fixtures))

  const vectorCandidates = families
    .filter((family) => familyMembers(family).every((member) => hasVectorRepresentation(member)))
    .flatMap((family) => familyMembers(family))
  const svgRenders = vectorCandidates.map((asset) => fixtureById.get(asset.id)!.render(AssetFormat.svg, AssetScale.x1))

  const { vectorRenders, rasterAssets } = routeFamilies(families, svgRenders, config)
  const rasterRendersByScale = RASTER_SCALES.map((scale) =>
    rasterAssets
      .filter((asset) => !(options.missingScales?.get(asset.id) ?? []).includes(scale))
      .map((asset) => fixtureById.get(asset.id)!.render(AssetFormat.png, scale))
  )

  return generateAssetCatalogue({ vectorRenders, rasterRendersByScale }, config)
}

function contentsOf(files: Array<AnyOutputFile>, directory: string): { images: Array<{ filename: string; scale?: string }>; properties?: Record<string, unknown> } {
  const file = files.find((candidate) => candidate.path === directory && candidate.name === "Contents.json")
  if (!file || file.type !== OutputFileType.text) {
    throw new Error(`no Contents.json generated in ${directory}`)
  }
  return JSON.parse((file as unknown as { content: string }).content)
}

/**
 * Anchor the output directory to the repository root (nearest package.json) so it
 * resolves identically for the compiled layout (tests/.build/tests/run.js) and a
 * direct `tsx tests/run.ts` run — the following rmSync must never escape the repo.
 */
function repositoryRoot(): string {
  let directory = __dirname
  while (!fs.existsSync(path.join(directory, "package.json"))) {
    const parent = path.dirname(directory)
    if (parent === directory) {
      throw new Error("could not locate package.json above " + __dirname)
    }
    directory = parent
  }
  return directory
}

const outputRoot = path.join(repositoryRoot(), "tests", "output")
fs.rmSync(outputRoot, { recursive: true, force: true })

function makeStandardFixtures(): Array<Fixture> {
  return [
    makeFixture({ name: "burger", group: ["Icons", "App"], svgUrl: "https://cdn.example.com/burger.svg" }),
    makeFixture({ name: "user profile", group: ["Icons", "App"], svgUrl: "https://cdn.example.com/user.svg", duplicates: 1 }),
    makeFixture({ name: "app-icon", group: ["Images"], svgUrl: "https://cdn.example.com/app-icon.svg" }),
    makeFixture({ name: "hero", group: ["Illustrations"] }),
    makeFixture({ name: "banner", group: ["Illustrations"] }),
    makeFixture({ name: "old-logo", group: ["deprecated"] }),
  ]
}

// --- Scenario 1: default config; forced raster + missing @2x and @1x renders ----
{
  const scenario = "default"
  const config = defaultConfiguration()
  const fixtures = makeStandardFixtures()
  const hero = fixtures[3]
  const banner = fixtures[4]
  const files = generate(fixtures, config, {
    missingScales: new Map([
      [hero.asset.id, [AssetScale.x2]],
      [banner.asset.id, [AssetScale.x1]],
    ]),
  })
  assertInvariants(scenario, files)

  // app-icon sits under Images (matches rasterAssetPaths) and must be a PNG set
  // despite having an svgUrl.
  const appIcon = contentsOf(files, "Assets.xcassets/Images/app-icon.imageset")
  if (appIcon.images.length !== 3 || appIcon.images.some((image) => !image.filename.endsWith(".png"))) {
    fail(scenario, `expected app-icon as 3 PNG scales, got ${JSON.stringify(appIcon.images)}`)
  }
  // hero is missing its @2x render: Contents.json must list exactly 1x and 3x.
  const heroContents = contentsOf(files, "Assets.xcassets/Illustrations/hero.imageset")
  if (heroContents.images.map((image) => image.scale).join(",") !== "1x,3x") {
    fail(scenario, `expected hero scales 1x,3x, got ${JSON.stringify(heroContents.images)}`)
  }
  // banner is missing its @1x render: the imageset must still be emitted from the
  // remaining scales instead of being dropped with the @1x canonical list.
  const bannerContents = contentsOf(files, "Assets.xcassets/Illustrations/banner.imageset")
  if (bannerContents.images.map((image) => image.scale).join(",") !== "2x,3x") {
    fail(scenario, `expected banner scales 2x,3x, got ${JSON.stringify(bannerContents.images)}`)
  }
  // true vectors stay SVG, template-rendered, with preserved vector data; the
  // deduplicated name keeps its -1 suffix in both file name and directory.
  const burger = contentsOf(files, "Assets.xcassets/Icons/App/burger.imageset")
  if (burger.images[0].filename !== "burger.svg") {
    fail(scenario, `expected burger.svg, got ${JSON.stringify(burger.images)}`)
  }
  if (burger.properties?.["template-rendering-intent"] !== "template" || burger.properties?.["preserves-vector-representation"] !== true) {
    fail(scenario, `unexpected vector properties: ${JSON.stringify(burger.properties)}`)
  }
  contentsOf(files, "Assets.xcassets/Icons/App/user profile-1.imageset")
  // plain (non-namespacing) group folders still get an info-only Contents.json.
  const group = contentsOf(files, "Assets.xcassets/Icons")
  if (group.properties !== undefined) {
    fail(scenario, `plain group folder must not carry properties: ${JSON.stringify(group.properties)}`)
  }
  writeFiles(path.join(outputRoot, scenario), files)
  console.log(`${scenario}: ${files.length} files`)
}

// --- Scenario 2: multicolor icons, rasterized at build time --------------------
{
  const scenario = "plain-vectors"
  const config = normalizeConfiguration({ ...defaultConfiguration(), templateRenderingForVectors: false, preserveVectorData: false })
  const files = generate(makeStandardFixtures(), config)
  assertInvariants(scenario, files)
  const burger = contentsOf(files, "Assets.xcassets/Icons/App/burger.imageset")
  if (burger.properties?.["template-rendering-intent"] !== "original") {
    fail(scenario, `expected explicit original intent, got ${JSON.stringify(burger.properties)}`)
  }
  if ("preserves-vector-representation" in (burger.properties ?? {})) {
    fail(scenario, "preserves-vector-representation must be omitted when preserveVectorData is off")
  }
  writeFiles(path.join(outputRoot, scenario), files)
  console.log(`${scenario}: ${files.length} files`)
}

// --- Scenario 3: namespaced folders ---------------------------------------------
{
  const scenario = "namespaced"
  const config = normalizeConfiguration({ ...defaultConfiguration(), providesNamespace: true })
  const files = generate(makeStandardFixtures(), config)
  assertInvariants(scenario, files)
  for (const directory of ["Assets.xcassets/Icons", "Assets.xcassets/Icons/App", "Assets.xcassets/Images"]) {
    const group = contentsOf(files, directory)
    if (group.properties?.["provides-namespace"] !== true) {
      fail(scenario, `${directory} must provide a namespace, got ${JSON.stringify(group.properties)}`)
    }
  }
  writeFiles(path.join(outputRoot, scenario), files)
  console.log(`${scenario}: ${files.length} files`)
}

// --- Scenario 4: forced-raster routing disabled ----------------------------------
{
  const scenario = "no-forced-raster"
  const config = normalizeConfiguration({ ...defaultConfiguration(), rasterAssetPaths: [] })
  const files = generate(makeStandardFixtures(), config)
  assertInvariants(scenario, files)
  const appIcon = contentsOf(files, "Assets.xcassets/Images/app-icon.imageset")
  if (appIcon.images.length !== 1 || appIcon.images[0].filename !== "app-icon.svg") {
    fail(scenario, `with no raster paths app-icon must stay SVG, got ${JSON.stringify(appIcon.images)}`)
  }
  writeFiles(path.join(outputRoot, scenario), files)
  console.log(`${scenario}: ${files.length} files`)
}

// --- Scenario 5: ignored paths + config normalization ----------------------------
{
  const scenario = "ignored"
  // normalizeConfiguration must trim fragments and drop empties. Untrimmed
  // " deprecated " matches nothing (the joined path never contains the padded
  // string) and an un-dropped "" matches everything - either mutation makes the
  // assertions below fail.
  const config = normalizeConfiguration({ ...defaultConfiguration(), ignoredAssetPaths: [" deprecated ", ""] })
  if (config.ignoredAssetPaths.join(",") !== "deprecated") {
    fail(scenario, `normalizeConfiguration must yield ["deprecated"], got ${JSON.stringify(config.ignoredAssetPaths)}`)
  }
  const files = generate(makeStandardFixtures(), config)
  assertInvariants(scenario, files)
  if (files.some((file) => file.path.includes("old-logo"))) {
    fail(scenario, "old-logo under deprecated/ must be excluded")
  }
  if (!files.some((file) => file.path.includes("burger.imageset"))) {
    fail(scenario, "non-ignored assets must survive an ignored-paths filter")
  }
  writeFiles(path.join(outputRoot, scenario), files)
  console.log(`${scenario}: ${files.length} files`)
}

// --- Scenario 6: path-style filters match their subtree only ---------------------
{
  const scenario = "path-filter"
  const config = normalizeConfiguration({ ...defaultConfiguration(), ignoredAssetPaths: ["Icons/App"] })
  const files = generate(makeStandardFixtures(), config)
  assertInvariants(scenario, files)
  if (files.some((file) => file.path.includes("burger.imageset") || file.path.includes("user profile"))) {
    fail(scenario, "assets under Icons/App must be excluded by a path-style filter")
  }
  if (!files.some((file) => file.path.includes("hero.imageset"))) {
    fail(scenario, "assets outside Icons/App must survive a path-style filter")
  }
  writeFiles(path.join(outputRoot, scenario), files)
  console.log(`${scenario}: ${files.length} files`)
}

// --- Scenario 7: localized asset families -----------------------------------------
{
  const scenario = "localized"
  const config = normalizeConfiguration({ ...defaultConfiguration(), assetLocales: ["tr", "de"] })
  const fixtures = [
    // all-SVG family -> one localized vector imageset
    makeFixture({ name: "onboarding-hero", group: ["Icons", "App"], svgUrl: "https://cdn.example.com/hero.svg" }),
    makeFixture({ name: "onboarding-hero-tr", group: ["Icons", "App"], svgUrl: "https://cdn.example.com/hero-tr.svg" }),
    makeFixture({ name: "onboarding-hero-de", group: ["Icons", "App"], svgUrl: "https://cdn.example.com/hero-de.svg" }),
    // all-SVG family under a forced-raster group -> one localized PNG imageset
    makeFixture({ name: "app-icon", group: ["Images"], svgUrl: "https://cdn.example.com/app-icon.svg" }),
    makeFixture({ name: "app-icon-tr", group: ["Images"], svgUrl: "https://cdn.example.com/app-icon-tr.svg" }),
    // mixed family (variant has no SVG) -> the WHOLE family becomes raster
    makeFixture({ name: "map", group: ["Illustrations"], svgUrl: "https://cdn.example.com/map.svg" }),
    makeFixture({ name: "map-tr", group: ["Illustrations"] }),
  ]
  const files = generate(fixtures, config)
  assertInvariants(scenario, files)

  const hero = contentsOf(files, "Assets.xcassets/Icons/App/onboarding-hero.imageset")
  const heroImages = hero.images as Array<{ filename: string; locale?: string }>
  if (
    heroImages.length !== 3 ||
    heroImages[0].filename !== "onboarding-hero.svg" ||
    heroImages[0].locale !== undefined ||
    heroImages[1].locale !== "de" ||
    heroImages[2].locale !== "tr"
  ) {
    fail(scenario, `unexpected localized vector entries: ${JSON.stringify(heroImages)}`)
  }
  if (files.some((file) => file.path.includes("onboarding-hero-tr.imageset") || file.path.includes("onboarding-hero-de.imageset"))) {
    fail(scenario, "localized variants must not get their own imagesets")
  }

  const appIcon = contentsOf(files, "Assets.xcassets/Images/app-icon.imageset")
  const appIconLocales = appIcon.images.filter((image) => (image as { locale?: string }).locale === "tr")
  if (appIcon.images.length !== 6 || appIconLocales.length !== 3 || appIcon.images.some((image) => !image.filename.endsWith(".png"))) {
    fail(scenario, `expected app-icon as base+tr PNG scales, got ${JSON.stringify(appIcon.images)}`)
  }

  const map = contentsOf(files, "Assets.xcassets/Illustrations/map.imageset")
  if (map.images.length !== 6 || map.images.some((image) => !image.filename.endsWith(".png"))) {
    fail(scenario, `mixed family must fall back to raster entirely, got ${JSON.stringify(map.images)}`)
  }
  if (files.some((file) => file.path.includes("app-icon-tr.imageset") || file.path.includes("map-tr.imageset"))) {
    fail(scenario, "raster localized variants must not get their own imagesets either")
  }

  writeFiles(path.join(outputRoot, scenario), files)
  console.log(`${scenario}: ${files.length} files`)
}

// --- Scenario 9: same-named bases in different folders stay independent ----------
{
  const scenario = "localized-per-folder"
  const config = normalizeConfiguration({ ...defaultConfiguration(), assetLocales: ["tr"] })
  const files = generate(
    [
      makeFixture({ name: "hero", group: ["Icons"], svgUrl: "https://x/a.svg" }),
      makeFixture({ name: "hero-tr", group: ["Icons"], svgUrl: "https://x/b.svg" }),
      makeFixture({ name: "hero", group: ["Marketing"], svgUrl: "https://x/c.svg", duplicates: 1 }),
      makeFixture({ name: "hero-tr", group: ["Marketing"], svgUrl: "https://x/d.svg", duplicates: 1 }),
    ],
    config
  )
  assertInvariants(scenario, files)
  for (const directory of ["Assets.xcassets/Icons/hero.imageset", "Assets.xcassets/Marketing/hero-1.imageset"]) {
    const contents = contentsOf(files, directory)
    if (contents.images.length !== 2 || (contents.images[1] as { locale?: string }).locale !== "tr") {
      fail(scenario, `${directory} must hold exactly its own folder's tr variant, got ${JSON.stringify(contents.images)}`)
    }
  }
  writeFiles(path.join(outputRoot, scenario), files)
  console.log(`${scenario}: ${files.length} files`)
}

// --- Scenario 10: case-insensitive suffixes, canonical locale codes ---------------
{
  const scenario = "locale-case"
  const config = normalizeConfiguration({ ...defaultConfiguration(), assetLocales: ["TR", "pt-br"] })
  if (config.assetLocales.join(",") !== "pt-BR,tr") {
    fail(scenario, `expected canonical, longest-first locales [pt-BR, tr], got ${JSON.stringify(config.assetLocales)}`)
  }
  const files = generate(
    [
      makeFixture({ name: "hero", group: ["Icons"], svgUrl: "https://x/a.svg" }),
      makeFixture({ name: "hero-TR", group: ["Icons"], svgUrl: "https://x/b.svg" }),
      makeFixture({ name: "hero-pt-BR", group: ["Icons"], svgUrl: "https://x/c.svg" }),
    ],
    config
  )
  assertInvariants(scenario, files)
  const hero = contentsOf(files, "Assets.xcassets/Icons/hero.imageset")
  const locales = hero.images.map((image) => (image as { locale?: string }).locale)
  if (locales.join(",") !== ",pt-BR,tr") {
    fail(scenario, `expected canonical locales [base, pt-BR, tr] (case-insensitive fold, longest-first parse), got ${JSON.stringify(locales)}`)
  }
  writeFiles(path.join(outputRoot, scenario), files)
  console.log(`${scenario}: ${files.length} files`)
}

// --- Scenario 8: custom separator --------------------------------------------------
{
  const scenario = "locale-separator"
  const config = normalizeConfiguration({ ...defaultConfiguration(), assetLocales: ["tr"], localeSuffixSeparator: "_" })
  const files = generate(
    [
      makeFixture({ name: "promo", group: ["Icons"], svgUrl: "https://cdn.example.com/promo.svg" }),
      makeFixture({ name: "promo_tr", group: ["Icons"], svgUrl: "https://cdn.example.com/promo-tr.svg" }),
    ],
    config
  )
  assertInvariants(scenario, files)
  const promo = contentsOf(files, "Assets.xcassets/Icons/promo.imageset")
  if (promo.images.length !== 2 || (promo.images[1] as { locale?: string }).locale !== "tr") {
    fail(scenario, `expected promo with tr variant via "_" separator, got ${JSON.stringify(promo.images)}`)
  }
  writeFiles(path.join(outputRoot, scenario), files)
  console.log(`${scenario}: ${files.length} files`)
}

// --- Error cases: misconfiguration must fail loudly, before any rendering ---------
function expectThrow(label: string, run: () => void, messageFragment: string): void {
  try {
    run()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes(messageFragment)) {
      throw new Error(`[${label}] error message "${message}" does not mention "${messageFragment}"`)
    }
    console.log(`${label}: rejected as expected`)
    return
  }
  throw new Error(`[${label}] expected an error but none was thrown`)
}

expectThrow(
  "orphan-variant",
  () => {
    const config = normalizeConfiguration({ ...defaultConfiguration(), assetLocales: ["tr"] })
    const fixtures = [makeFixture({ name: "banner-tr", group: ["Icons"], svgUrl: "https://x/y.svg" })]
    groupAssetFamilies(fixtures.map((fixture) => fixture.asset), config, groupKeys(fixtures))
  },
  "has no base asset"
)

expectThrow(
  "base-in-other-folder",
  () => {
    const config = normalizeConfiguration({ ...defaultConfiguration(), assetLocales: ["tr"] })
    const fixtures = [
      makeFixture({ name: "promo", group: ["Icons"], svgUrl: "https://x/a.svg" }),
      makeFixture({ name: "promo", group: ["Illustrations"], svgUrl: "https://x/b.svg", duplicates: 1 }),
      makeFixture({ name: "promo-tr", group: ["Marketing"], svgUrl: "https://x/c.svg" }),
    ]
    groupAssetFamilies(fixtures.map((fixture) => fixture.asset), config, groupKeys(fixtures))
  },
  "in its folder"
)

expectThrow(
  "ambiguous-base-no-groups",
  () => {
    const config = normalizeConfiguration({ ...defaultConfiguration(), assetLocales: ["tr"] })
    groupAssetFamilies(
      [
        makeFixture({ name: "promo", group: ["Icons"], svgUrl: "https://x/a.svg" }).asset,
        makeFixture({ name: "promo", group: ["Illustrations"], svgUrl: "https://x/b.svg", duplicates: 1 }).asset,
        makeFixture({ name: "promo-tr", group: ["Icons"], svgUrl: "https://x/c.svg" }).asset,
      ],
      config
    )
  },
  "rename them to disambiguate"
)

expectThrow(
  "duplicate-locale",
  () => {
    const config = normalizeConfiguration({ ...defaultConfiguration(), assetLocales: ["tr"] })
    const fixtures = [
      makeFixture({ name: "promo", group: ["Icons"], svgUrl: "https://x/a.svg" }),
      makeFixture({ name: "promo-tr", group: ["Icons"], svgUrl: "https://x/b.svg" }),
      makeFixture({ name: "promo-tr", group: ["Icons"], svgUrl: "https://x/c.svg", duplicates: 1 }),
    ]
    groupAssetFamilies(fixtures.map((fixture) => fixture.asset), config, groupKeys(fixtures))
  },
  "duplicate"
)

expectThrow(
  "invalid-locale",
  () => normalizeConfiguration({ ...defaultConfiguration(), assetLocales: ["tr", "türkçe!"] }),
  "Invalid locale codes"
)

expectThrow(
  "render-time-orphan-vector",
  () => {
    const config = normalizeConfiguration({ ...defaultConfiguration(), assetLocales: ["tr"] })
    const variant = makeFixture({ name: "ghost-tr", group: ["Icons"], svgUrl: "https://x/y.svg" })
    generateAssetCatalogue(
      { vectorRenders: [variant.render(AssetFormat.svg, AssetScale.x1)], rasterRendersByScale: [[], [], []] },
      config
    )
  },
  "without a usable base"
)

expectThrow(
  "render-time-orphan-raster",
  () => {
    const config = normalizeConfiguration({ ...defaultConfiguration(), assetLocales: ["tr"] })
    const variant = makeFixture({ name: "ghost-tr", group: ["Images"] })
    generateAssetCatalogue(
      { vectorRenders: [], rasterRendersByScale: [[variant.render(AssetFormat.png, AssetScale.x1)], [], []] },
      config
    )
  },
  "without a usable base"
)

console.log("all scenarios generated")
