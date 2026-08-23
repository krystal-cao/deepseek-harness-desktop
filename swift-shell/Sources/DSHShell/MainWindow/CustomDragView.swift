import AppKit

/// A transparent drag region overlay placed along the top of the window.
/// It intercepts mouse drags and moves the host window while allowing traffic-light
/// and top-right interactive regions to pass directly to WKWebView.
public final class CustomDragView: NSView {
    private var dragStartWindowOrigin = NSPoint.zero
    private var dragStartMouseLocation = NSPoint.zero

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        self.wantsLayer = true
        self.layer?.backgroundColor = NSColor.clear.cgColor
        self.autoresizingMask = [.width, .minYMargin]
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    public override var mouseDownCanMoveWindow: Bool {
        true
    }

    public override func hitTest(_ point: NSPoint) -> NSView? {
        // AppKit supplies the hit-test point in the superview's coordinate
        // space for this positioned overlay. Convert it before checking the
        // overlay's own bounds, otherwise every click is treated as outside
        // the 70pt drag strip and falls through to WKWebView.
        let localPoint = superview.map { convert(point, from: $0) } ?? point
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
            return
        }

        guard let window else { return }
        dragStartWindowOrigin = window.frame.origin
        dragStartMouseLocation = NSEvent.mouseLocation
    }

    public override func mouseDragged(with event: NSEvent) {
        guard let window else { return }
        let currentMouseLocation = NSEvent.mouseLocation
        let delta = NSPoint(
            x: currentMouseLocation.x - dragStartMouseLocation.x,
            y: currentMouseLocation.y - dragStartMouseLocation.y
        )
        window.setFrameOrigin(NSPoint(
            x: dragStartWindowOrigin.x + delta.x,
            y: dragStartWindowOrigin.y + delta.y
        ))
    }
}
