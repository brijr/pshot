// capture-window <windowID> <out.png>
// Captures a single window with ScreenCaptureKit at native (Retina) resolution, keeping its
// rounded alpha corners and dropping the system shadow.
import AppKit
import CoreGraphics
import Foundation
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 3, let windowID = UInt32(args[1]) else {
  FileHandle.standardError.write("usage: capture-window <windowID> <out.png>\n".data(using: .utf8)!)
  exit(2)
}
let outURL = URL(fileURLWithPath: args[2])
// Command-line tools need a window-server connection before ScreenCaptureKit works.
_ = NSApplication.shared

func fail(_ msg: String) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(1)
}

let done = DispatchSemaphore(value: 0)
Task {
  do {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    guard let window = content.windows.first(where: { $0.windowID == windowID }) else {
      fail("window \(windowID) not found")
    }
    let filter = SCContentFilter(desktopIndependentWindow: window)
    let config = SCStreamConfiguration()
    let scale = CGFloat(filter.pointPixelScale)
    config.width = Int(filter.contentRect.width * scale)
    config.height = Int(filter.contentRect.height * scale)
    config.ignoreShadowsSingleWindow = true
    config.showsCursor = false
    config.capturesAudio = false
    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
    guard let dest = CGImageDestinationCreateWithURL(outURL as CFURL, UTType.png.identifier as CFString, 1, nil) else {
      fail("cannot write \(outURL.path)")
    }
    CGImageDestinationAddImage(dest, image, nil)
    if !CGImageDestinationFinalize(dest) { fail("cannot finalize \(outURL.path)") }
  } catch {
    fail("capture failed: \(error.localizedDescription)")
  }
  done.signal()
}
done.wait()
