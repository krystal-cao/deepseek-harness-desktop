import AppKit

/// A transparent drag region overlay placed along the top of the window.
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
        // AppKit supplies `point` in this view's local coordinate space.
        // Converting it from the superview makes a positioned overlay miss
        // its own bounds.
        guard bounds.contains(point) else {
            return nil
        }
        // Pass through traffic lights region (< 88px)
        if point.x < 88 {
            return nil
        }
        // Pass through top-right action buttons (> width - 120px)
        if point.x > bounds.width - 120 {
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
