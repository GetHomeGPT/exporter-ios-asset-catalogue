/**
 * Plain-object fixtures for the generator tests. No SDK classes are instantiated —
 * the generator only reads public fields, so object literals cast through
 * `as unknown as RenderedAsset` are sufficient (same pattern as the tokens
 * exporter's test suite). Only the AssetScale / AssetFormat enums are imported
 * as runtime values.
 */
import { Asset, AssetFormat, AssetScale, RenderedAsset } from "@supernovaio/sdk-exporters"

let counter = 0
function id(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

export type FixtureSpec = {
  name: string
  /** Group path segments, e.g. ["Icons", "App"]. Last segment is the group name. */
  group: Array<string>
  svgUrl?: string
  duplicates?: number
}

export type Fixture = {
  asset: Asset
  /** Slash-joined group path, e.g. "Icons/App" — mirrors what index.ts derives from asset groups. */
  groupKey: string
  /** One RenderedAsset per requested format/scale. */
  render: (format: AssetFormat, scale: AssetScale) => RenderedAsset
}

export function makeFixture(spec: FixtureSpec): Fixture {
  const assetId = id("asset")
  const asset = {
    id: assetId,
    brandId: "brand-1",
    svgUrl: spec.svgUrl ?? null,
    name: spec.name,
    previouslyDuplicatedNames: spec.duplicates ?? 0,
  } as unknown as Asset

  const path = spec.group.slice(0, -1)
  const groupName = spec.group[spec.group.length - 1] ?? ""
  const group = {
    path,
    name: groupName,
    brandId: "brand-1",
  }

  return {
    asset,
    groupKey: spec.group.filter((segment) => segment.length > 0).join("/"),
    render: (format: AssetFormat, scale: AssetScale): RenderedAsset =>
      ({
        assetId,
        originalName: spec.name,
        previouslyDuplicatedNames: spec.duplicates ?? 0,
        sourceUrl: `https://cdn.example.com/${assetId}-${format}-${scale}`,
        asset,
        group,
        scale,
        format,
      }) as unknown as RenderedAsset,
  }
}
