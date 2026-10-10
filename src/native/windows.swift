// Lists on-screen app windows as JSON: [{id, app, title, x, y, width, height}]
import CoreGraphics
import Foundation

let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let info = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] ?? []
var out: [[String: Any]] = []
for w in info {
  guard (w[kCGWindowLayer as String] as? Int) == 0,
        let id = w[kCGWindowNumber as String] as? Int,
        let app = w[kCGWindowOwnerName as String] as? String,
        let b = w[kCGWindowBounds as String] as? [String: CGFloat] else { continue }
  if (b["Width"] ?? 0) < 50 || (b["Height"] ?? 0) < 50 { continue }
  out.append([
    "id": id, "pid": w[kCGWindowOwnerPID as String] as? Int ?? 0, "app": app, "title": w[kCGWindowName as String] as? String ?? "",
    "x": b["X"] ?? 0, "y": b["Y"] ?? 0, "width": b["Width"] ?? 0, "height": b["Height"] ?? 0,
  ])
}
let data = try! JSONSerialization.data(withJSONObject: out, options: [.prettyPrinted])
print(String(data: data, encoding: .utf8)!)
