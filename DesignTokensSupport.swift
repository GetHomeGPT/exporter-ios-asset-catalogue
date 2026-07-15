//
//  DesignTokensSupport.swift
//
//  This file was generated automatically by Supernova.io and should not be changed manually.
//  To modify the format or content of this file, please contact your design system team.
//

import UIKit
import CoreText

// MARK: - Dynamic colors

extension UIColor {

    /// A dynamic color that resolves against the current user interface style.
    /// - Note: `.unspecified` resolves to the light variant.
    convenience init(light: UIColor, dark: UIColor) {
        self.init { traitCollection in
            switch traitCollection.userInterfaceStyle {
            case .dark:
                return dark
            default:
                return light
            }
        }
    }
}

// MARK: - Token value types

/// Namespace for all generated design tokens.
enum DesignTokens {}

extension DesignTokens {

    /// A complete text style token: font, line height, letter spacing, case and decoration.
    ///
    /// `UIFont` alone cannot express line height or letter spacing. Use
    /// `attributes(...)` or `attributedString(from:)` for full fidelity, or
    /// `font` / `scaledFont(compatibleWith:)` when only the font is needed.
    /// Set `adjustsFontForContentSizeCategory = true` on labels using scaled fonts.
    struct TextStyle {

        /// Font family display name, e.g. "Inter". `nil` uses the system font.
        let fontFamily: String?
        /// Weight for system-font fallback and descriptor-based resolution.
        let fontWeight: UIFont.Weight
        /// Design-tool weight name used to try PostScript names like "Inter-SemiBold".
        let fontWeightName: String?
        let fontSize: CGFloat
        /// Line height in points. `nil` keeps the font's natural line height.
        let lineHeight: CGFloat?
        /// Letter spacing (kern) in points.
        let letterSpacing: CGFloat?
        /// Spacing appended after each paragraph, in points.
        let paragraphSpacing: CGFloat?
        /// Indentation of the first line of each paragraph, in points.
        let paragraphIndent: CGFloat?
        let textCase: Case
        let decoration: Decoration
        /// Dynamic Type anchor used by `scaledFont(compatibleWith:)`.
        let dynamicTypeStyle: UIFont.TextStyle

        enum Case {
            case original
            case uppercase
            case lowercase
            case capitalized
            case smallCaps
        }

        enum Decoration {
            case none
            case underline
            case strikethrough
        }

        init(
            fontFamily: String?,
            fontWeight: UIFont.Weight = .regular,
            fontWeightName: String? = nil,
            fontSize: CGFloat,
            lineHeight: CGFloat? = nil,
            letterSpacing: CGFloat? = nil,
            paragraphSpacing: CGFloat? = nil,
            paragraphIndent: CGFloat? = nil,
            textCase: Case = .original,
            decoration: Decoration = .none,
            dynamicTypeStyle: UIFont.TextStyle = .body
        ) {
            self.fontFamily = fontFamily
            self.fontWeight = fontWeight
            self.fontWeightName = fontWeightName
            self.fontSize = fontSize
            self.lineHeight = lineHeight
            self.letterSpacing = letterSpacing
            self.paragraphSpacing = paragraphSpacing
            self.paragraphIndent = paragraphIndent
            self.textCase = textCase
            self.decoration = decoration
            self.dynamicTypeStyle = dynamicTypeStyle
        }

        /// The base (unscaled) font. Tries the exact PostScript name first, then the
        /// family via a font descriptor with the weight trait, then falls back to the
        /// system font at `fontWeight`. Custom fonts must be registered with the app
        /// (Info.plist `UIAppFonts` or CoreText registration).
        var font: UIFont {
            guard let family = fontFamily, !family.isEmpty else {
                return .systemFont(ofSize: fontSize, weight: fontWeight)
            }
            if let weightName = fontWeightName, !weightName.isEmpty {
                let compactFamily = family.replacingOccurrences(of: " ", with: "")
                let candidates = [
                    compactFamily + "-" + weightName,
                    family + "-" + weightName,
                    family + " " + weightName,
                ]
                for name in candidates {
                    if let font = UIFont(name: name, size: fontSize) {
                        return font
                    }
                }
            }
            let descriptor = UIFontDescriptor(fontAttributes: [
                .family: family,
                .traits: [UIFontDescriptor.TraitKey.weight: fontWeight.rawValue],
            ])
            let candidate = UIFont(descriptor: descriptor, size: fontSize)
            if candidate.familyName.caseInsensitiveCompare(family) == .orderedSame {
                return candidate
            }
            return .systemFont(ofSize: fontSize, weight: fontWeight)
        }

        /// The font scaled for the current Dynamic Type setting, anchored to
        /// `dynamicTypeStyle`'s scaling curve.
        func scaledFont(compatibleWith traitCollection: UITraitCollection? = nil) -> UIFont {
            UIFontMetrics(forTextStyle: dynamicTypeStyle)
                .scaledFont(for: font, compatibleWith: traitCollection)
        }

        /// Attributes ready for `NSAttributedString` / `UILabel.attributedText`.
        /// - Parameter scaled: scales the font and line height with Dynamic Type
        ///   (default). Pass `false` for pixel-exact rendering.
        func attributes(
            alignment: NSTextAlignment = .natural,
            lineBreakMode: NSLineBreakMode = .byTruncatingTail,
            scaled: Bool = true
        ) -> [NSAttributedString.Key: Any] {
            var resolvedFont = scaled ? scaledFont() : font
            if textCase == .smallCaps {
                resolvedFont = resolvedFont.withSmallCaps()
            }
            var attributes: [NSAttributedString.Key: Any] = [.font: resolvedFont]

            if let letterSpacing = letterSpacing {
                attributes[.kern] = letterSpacing
            }

            let paragraphStyle = NSMutableParagraphStyle()
            var needsParagraphStyle = false
            if let lineHeight = lineHeight {
                let resolvedLineHeight = scaled
                    ? UIFontMetrics(forTextStyle: dynamicTypeStyle).scaledValue(for: lineHeight)
                    : lineHeight
                paragraphStyle.minimumLineHeight = resolvedLineHeight
                paragraphStyle.maximumLineHeight = resolvedLineHeight
                // Centers glyphs within the taller line box.
                attributes[.baselineOffset] = (resolvedLineHeight - resolvedFont.lineHeight) / 4
                needsParagraphStyle = true
            }
            if let paragraphSpacing = paragraphSpacing {
                paragraphStyle.paragraphSpacing = paragraphSpacing
                needsParagraphStyle = true
            }
            if let paragraphIndent = paragraphIndent {
                paragraphStyle.firstLineHeadIndent = paragraphIndent
                needsParagraphStyle = true
            }
            if needsParagraphStyle || alignment != .natural || lineBreakMode != .byTruncatingTail {
                paragraphStyle.alignment = alignment
                paragraphStyle.lineBreakMode = lineBreakMode
                attributes[.paragraphStyle] = paragraphStyle
            }

            switch decoration {
            case .underline:
                attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
            case .strikethrough:
                attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
            case .none:
                break
            }
            return attributes
        }

        /// Applies `textCase` and builds an attributed string with the full style.
        func attributedString(
            from text: String,
            alignment: NSTextAlignment = .natural,
            lineBreakMode: NSLineBreakMode = .byTruncatingTail,
            scaled: Bool = true
        ) -> NSAttributedString {
            NSAttributedString(
                string: applyingCase(to: text),
                attributes: attributes(alignment: alignment, lineBreakMode: lineBreakMode, scaled: scaled)
            )
        }

        /// Applies the token's text case transform to a string.
        func applyingCase(to text: String) -> String {
            switch textCase {
            case .original, .smallCaps:
                return text
            case .uppercase:
                return text.uppercased()
            case .lowercase:
                return text.lowercased()
            case .capitalized:
                return text.capitalized
            }
        }
    }

    /// A single shadow layer with design-tool (Figma) semantics.
    struct ShadowLayer {

        let color: UIColor
        let offset: CGSize
        /// Design-tool blur radius. Core Animation's `shadowRadius` is the Gaussian
        /// sigma - roughly half the design blur - so `apply(to:)` converts it.
        let blur: CGFloat
        let spread: CGFloat
        let kind: Kind

        enum Kind {
            case drop
            /// Inner shadows cannot be rendered with plain CALayer shadow properties.
            case inner
        }

        init(color: UIColor, offset: CGSize, blur: CGFloat, spread: CGFloat = 0, kind: Kind = .drop) {
            self.color = color
            self.offset = offset
            self.blur = blur
            self.spread = spread
            self.kind = kind
        }

        /// Applies this shadow to a layer. Pass `bounds` (and `cornerRadius`) to also
        /// set a `shadowPath` - required for `spread` support and a significant
        /// rendering-performance win.
        /// - Important: `cgColor` snapshots dynamic colors. Re-apply on
        ///   `traitCollectionDidChange` (or `registerForTraitChanges` on iOS 17+)
        ///   when using light/dark colors.
        func apply(to layer: CALayer, bounds: CGRect? = nil, cornerRadius: CGFloat = 0) {
            layer.shadowColor = color.cgColor
            layer.shadowOpacity = 1
            layer.shadowOffset = offset
            // Figma/CSS blur -> Core Animation sigma (visually close approximation).
            layer.shadowRadius = blur / 2
            if let bounds = bounds {
                let rect = bounds.insetBy(dx: -spread, dy: -spread)
                layer.shadowPath = UIBezierPath(
                    roundedRect: rect,
                    cornerRadius: max(0, cornerRadius + spread)
                ).cgPath
            }
            layer.masksToBounds = false
        }
    }

    /// A shadow token: one or more shadow layers, topmost first.
    struct ShadowStyle {

        let layers: [ShadowLayer]

        init(layers: [ShadowLayer]) {
            self.layers = layers
        }

        /// The first drop layer (CALayer natively renders a single shadow).
        /// `nil` for inner-only shadow tokens - inner shadows cannot be expressed
        /// with CALayer shadow properties, so applying them is a no-op rather than
        /// a wrong outer shadow.
        var primary: ShadowLayer? {
            layers.first { $0.kind == .drop }
        }

        /// Applies the primary layer. For full multi-layer fidelity create one
        /// sublayer per element of `layers` and apply each shadow separately.
        func apply(to layer: CALayer, bounds: CGRect? = nil, cornerRadius: CGFloat = 0) {
            primary?.apply(to: layer, bounds: bounds, cornerRadius: cornerRadius)
        }

        /// Applies the primary layer to a view using its current bounds.
        func apply(to view: UIView, cornerRadius: CGFloat = 0) {
            apply(to: view.layer, bounds: view.bounds, cornerRadius: cornerRadius)
        }
    }

    /// A single gradient fill in the unit coordinate space (origin top-left,
    /// matching `CAGradientLayer`).
    struct GradientFill {

        let kind: Kind
        let colors: [UIColor]
        let locations: [CGFloat]
        let startPoint: CGPoint
        let endPoint: CGPoint

        enum Kind {
            case linear
            /// Note: `CAGradientLayer`'s radial gradient is elliptical and fits the
            /// bounds - close to, but not identical with, the design-tool model.
            case radial
            case angular

            var layerType: CAGradientLayerType {
                switch self {
                case .linear:
                    return .axial
                case .radial:
                    return .radial
                case .angular:
                    return .conic
                }
            }
        }

        init(kind: Kind = .linear, colors: [UIColor], locations: [CGFloat], startPoint: CGPoint, endPoint: CGPoint) {
            self.kind = kind
            self.colors = colors
            self.locations = locations
            self.startPoint = startPoint
            self.endPoint = endPoint
        }

        /// Builds a `CAGradientLayer` for this fill.
        /// - Important: `cgColor` snapshots dynamic colors - rebuild the layer on
        ///   trait changes when using light/dark colors.
        func makeLayer(frame: CGRect = .zero) -> CAGradientLayer {
            let layer = CAGradientLayer()
            layer.frame = frame
            layer.type = kind.layerType
            layer.colors = colors.map { $0.cgColor }
            layer.locations = locations.map { NSNumber(value: Double($0)) }
            layer.startPoint = startPoint
            layer.endPoint = endPoint
            return layer
        }
    }

    /// A gradient token: one or more stacked fills, topmost first.
    struct GradientStyle {

        let layers: [GradientFill]

        init(layers: [GradientFill]) {
            self.layers = layers
        }

        var primary: GradientFill? {
            layers.first
        }

        /// Builds a `CAGradientLayer` for the primary fill.
        func makeLayer(frame: CGRect = .zero) -> CAGradientLayer {
            primary?.makeLayer(frame: frame) ?? CAGradientLayer()
        }

        /// Builds one `CAGradientLayer` per fill, ordered for insertion
        /// (bottom-most fill first).
        func makeLayers(frame: CGRect = .zero) -> [CAGradientLayer] {
            layers.reversed().map { $0.makeLayer(frame: frame) }
        }
    }

    /// A border token. `CALayer` natively renders solid borders inside the bounds;
    /// `lineStyle` and `position` carry the design intent for custom drawing.
    struct BorderStyle {

        let color: UIColor
        let width: CGFloat
        let lineStyle: LineStyle
        let position: Position

        enum LineStyle {
            case solid
            case dashed
            case dotted
            case groove
        }

        enum Position {
            case inside
            case center
            case outside
        }

        init(color: UIColor, width: CGFloat, lineStyle: LineStyle = .solid, position: Position = .inside) {
            self.color = color
            self.width = width
            self.lineStyle = lineStyle
            self.position = position
        }

        /// Applies the border to a layer.
        /// - Important: `cgColor` snapshots dynamic colors. Re-apply on
        ///   `traitCollectionDidChange` (or `registerForTraitChanges` on iOS 17+)
        ///   when using light/dark colors.
        func apply(to layer: CALayer) {
            layer.borderColor = color.cgColor
            layer.borderWidth = width
        }

        /// Applies the border to a view's layer.
        func apply(to view: UIView) {
            apply(to: view.layer)
        }
    }

    /// A blur token. UIKit's public API cannot render arbitrary Gaussian blur
    /// radii; `makeBlurView()` approximates with system materials. Use `radius`
    /// directly with custom CoreImage/Metal pipelines when exact fidelity matters.
    struct BlurStyle {

        let kind: Kind
        /// Design blur radius in points.
        let radius: CGFloat

        enum Kind {
            /// Blurs the layer's own content (design-tool "layer blur").
            case layer
            /// Blurs the content behind the layer (design-tool "background blur").
            case background
        }

        init(kind: Kind = .layer, radius: CGFloat) {
            self.kind = kind
            self.radius = radius
        }

        /// A visual effect view approximating the blur with system materials.
        func makeBlurView() -> UIVisualEffectView {
            let style: UIBlurEffect.Style
            switch radius {
            case ..<10:
                style = .systemUltraThinMaterial
            case ..<20:
                style = .systemThinMaterial
            case ..<40:
                style = .systemMaterial
            default:
                style = .systemThickMaterial
            }
            return UIVisualEffectView(effect: UIBlurEffect(style: style))
        }
    }
}

// MARK: - Small caps support

private extension UIFont {

    /// Returns a variant of the font with small caps enabled where the font
    /// supports the corresponding OpenType feature. Only lowercase letters are
    /// converted (matching the design-tool "small caps" / CSS
    /// `font-variant: small-caps` semantics); uppercase letters keep full height.
    func withSmallCaps() -> UIFont {
        let features: [[UIFontDescriptor.FeatureKey: Int]]
        if #available(iOS 15.0, *) {
            features = [
                [.type: kLowerCaseType, .selector: kLowerCaseSmallCapsSelector],
            ]
        } else {
            // Deprecated keys kept intentionally for pre-iOS 15 deployment targets.
            features = [
                [.featureIdentifier: kLowerCaseType, .typeIdentifier: kLowerCaseSmallCapsSelector],
            ]
        }
        let descriptor = fontDescriptor.addingAttributes([.featureSettings: features])
        return UIFont(descriptor: descriptor, size: pointSize)
    }
}
