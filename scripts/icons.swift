import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct RGBA {
    let r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat
    var cg: CGColor { CGColor(srgbRed: r, green: g, blue: b, alpha: a) }
    static let black = RGBA(r: 0, g: 0, b: 0, a: 1)
    static let blue = RGBA(r: 0x0A / 255, g: 0x84 / 255, b: 0xFF / 255, a: 1)
    static let ink = RGBA(r: 0x1D / 255, g: 0x1D / 255, b: 0x1F / 255, a: 1)
}

func drawMark(_ ctx: CGContext, in rect: CGRect, dot: RGBA, ring: RGBA) {
    let unit = rect.width / 18
    let point = { (x: CGFloat, y: CGFloat) in CGPoint(x: rect.minX + x * unit, y: rect.minY + (18 - y) * unit - (rect.width - rect.height) / 2) }
    let radius = 2.6 * unit
    let stroke = 1.6 * unit

    ctx.setFillColor(dot.cg)
    let dotCenter = point(4.5, 9)
    ctx.fillEllipse(in: CGRect(x: dotCenter.x - radius, y: dotCenter.y - radius, width: radius * 2, height: radius * 2))

    ctx.setStrokeColor(ring.cg)
    ctx.setLineWidth(stroke)
    ctx.setLineCap(.round)
    let ringCenter = point(13.5, 9)
    ctx.strokeEllipse(in: CGRect(x: ringCenter.x - radius, y: ringCenter.y - radius, width: radius * 2, height: radius * 2))
    ctx.move(to: point(7.4, 9))
    ctx.addLine(to: point(10.6, 9))
    ctx.strokePath()
}

func image(size: Int, draw: (CGContext) -> Void) -> CGImage {
    let ctx = CGContext(
        data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    ctx.setShouldAntialias(true)
    draw(ctx)
    return ctx.makeImage()!
}

func write(_ image: CGImage, to url: URL) {
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        FileHandle.standardError.write("cannot write \(url.path)\n".data(using: .utf8)!)
        exit(1)
    }
    CGImageDestinationAddImage(destination, image, nil)
    if !CGImageDestinationFinalize(destination) {
        FileHandle.standardError.write("cannot finalize \(url.path)\n".data(using: .utf8)!)
        exit(1)
    }
}

enum TrayState: String, CaseIterable {
    case normal = "tray"
    case alert = "tray-alert"
    case error = "tray-error"
}

func trayIcon(size: Int, state: TrayState) -> CGImage {
    image(size: size) { ctx in
        let px = CGFloat(size) / 36
        let box = { (x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat) in CGRect(x: x * px, y: y * px, width: w * px, height: h * px) }
        if state == .error { ctx.setAlpha(0.4) }
        ctx.setFillColor(RGBA.black.cg)
        ctx.fillEllipse(in: box(4, 13, 10, 10))
        ctx.fill(box(14, 16, 7, 4))
        ctx.addEllipse(in: box(21, 12, 12, 12))
        ctx.addEllipse(in: box(24, 15, 6, 6))
        ctx.fillPath(using: .evenOdd)
        guard state == .alert else { return }
        ctx.setBlendMode(.clear)
        ctx.fillEllipse(in: box(26, 25, 10, 10))
        ctx.setBlendMode(.normal)
        ctx.fillEllipse(in: box(27, 26, 8, 8))
    }
}

func appIcon() -> CGImage {
    image(size: 1024) { ctx in
        let body = CGRect(x: 100, y: 100, width: 824, height: 824)
        let shape = CGPath(roundedRect: body, cornerWidth: 824 * 0.2237, cornerHeight: 824 * 0.2237, transform: nil)

        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: -12), blur: 28, color: CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 0.28))
        ctx.addPath(shape)
        ctx.setFillColor(CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1))
        ctx.fillPath()
        ctx.restoreGState()

        ctx.saveGState()
        ctx.addPath(shape)
        ctx.clip()
        let colors = [CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1), CGColor(srgbRed: 0xE9 / 255, green: 0xEB / 255, blue: 0xF0 / 255, alpha: 1)] as CFArray
        let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!, colors: colors, locations: [0, 1])!
        ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: body.maxY), end: CGPoint(x: 0, y: body.minY), options: [])
        ctx.restoreGState()

        ctx.addPath(shape)
        ctx.setStrokeColor(CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 0.18))
        ctx.setLineWidth(2)
        ctx.strokePath()

        let markWidth = body.width * 0.55
        let markRect = CGRect(x: body.midX - markWidth / 2, y: body.midY - markWidth / 2, width: markWidth, height: markWidth)
        drawMark(ctx, in: markRect, dot: .blue, ring: .ink)
    }
}

guard CommandLine.arguments.count == 2 else {
    FileHandle.standardError.write("usage: swift scripts/icons.swift <output-dir>\n".data(using: .utf8)!)
    exit(2)
}
let out = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
for state in TrayState.allCases {
    write(trayIcon(size: 18, state: state), to: out.appendingPathComponent("\(state.rawValue)-template.png"))
    write(trayIcon(size: 36, state: state), to: out.appendingPathComponent("\(state.rawValue)-template@2x.png"))
}
write(appIcon(), to: out.appendingPathComponent("app-icon.png"))
print("wrote tray, tray-alert and tray-error templates and app-icon.png to \(out.path)")
