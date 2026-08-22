import AppKit

/// A transparent drag region overlay placed strictly along the top 40px of the window.
/// It intercepts mouse drags and calls window.performDrag(with: event) while allowing
/// all clicks below 40px and interactive top regions (x < 88 and x > width - 120) to pass directly to WKWebView.
public final class CustomDragView: NSView {
    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        self.wantsLayer = true
        self.layer?.backgroundColor = NSColor.clear.cgColor
        self.autoresizingMask = [.width, .minYMargin]
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    public override func hitTest(_ point: NSPoint) -> NSView? {
        // CRITICAL: First check if point is strictly inside this view's bounds!
        let localPoint = convert(point, from: superview)
        guard bounds.contains(localPoint) else {
            return nil
        }
        // Pass through traffic lights region (< 88px)
        if localPoint.x < 88 {
            return nil
        }
        // Pass through top-right action buttons (> width - 120px)
        if localPoint.x > bounds.width - 120 {
            return nil
        }
        return self
    }

    public override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 {
            window?.zoom(nil)
        } else {
            window?.performDrag(with: event)
        }
    }
}
