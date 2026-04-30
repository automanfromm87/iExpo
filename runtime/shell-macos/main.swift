import Cocoa
import Darwin

let ROOT_TAG: Int32 = 1

@_cdecl("iexpo_atexit_log")
func iexpo_atexit_log() {
    let s = "[iexpo] atexit fired\n".cString(using: .utf8)!
    write(2, s, s.count)
}

func installCrashHandlers() {
    atexit(iexpo_atexit_log)
    NSSetUncaughtExceptionHandler { ex in
        NSLog("[iexpo] UNCAUGHT NSException: %@ - %@\n%@",
              ex.name.rawValue, ex.reason ?? "(no reason)",
              ex.callStackSymbols.joined(separator: "\n"))
        fflush(stderr)
    }
    let handler: @convention(c) (Int32) -> Void = { sig in
        let n = "[iexpo] FATAL signal \(sig)\n".cString(using: .utf8)!
        write(2, n, n.count)
        var frames = [UnsafeMutableRawPointer?](repeating: nil, count: 64)
        let count = backtrace(&frames, 64)
        backtrace_symbols_fd(&frames, count, 2)
        signal(sig, SIG_DFL)
        raise(sig)
    }
    signal(SIGSEGV, handler)
    signal(SIGBUS, handler)
    signal(SIGABRT, handler)
    signal(SIGILL, handler)
    signal(SIGFPE, handler)
    signal(SIGTRAP, handler)
}

class AppDelegate: NSObject, NSApplicationDelegate, NSToolbarDelegate {
    var window: NSWindow!
    var bridge: HermesBridge!
    var rootContainer: NSFlippedView!
    var lastBundleSignature: String?
    var pollTimer: Timer?
    var isReleaseBuild: Bool = false
    var toolbar: NSToolbar?
    var toolbarSpec: [[String: Any]] = []
    var secondaryWindows: [NSWindow] = []
    var secondaryWindowObservers: [NSWindow: [NSObjectProtocol]] = [:]
    var inUseSecondaryTags: Set<Int32> = []  // 2..99 are valid; 1 is primary

    /// URL the launcher was first booted from. Stays constant for the process
    /// lifetime — `showLauncher` always hops back to this.
    var launcherURL: String = ""
    /// URL of whatever bundle is currently mounted. Hot-reload + Metro polling
    /// only kick in when this is the launcher dev URL; installed app bundles
    /// use `file://` and shouldn't be polled.
    var currentBundleURL: String = ""

    /// Native rail down the left of the window, lives across bundle swaps so
    /// the user always has a Slack-style workspace nav. Driven by the
    /// installed.json the launcher writes.
    var sidebarStack: NSStackView?
    var sidebarItems: [String: RailItem] = [:]

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSLog("[iexpo] AppDelegate launched")

        installMenu()

        let frame = NSRect(x: 0, y: 0, width: 800, height: 600)
        window = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "iExpo"
        window.center()
        // Opt into native window tabbing — when the user creates a second
        // window with the same tabbingIdentifier (and macOS is configured to
        // auto-merge), the two windows fold into a single tab bar.
        // Multi-root rendering (so a second window has its own JS-driven
        // content) is a separate piece of work.
        window.tabbingMode = .preferred
        window.tabbingIdentifier = "iex.main"

        let content = window.contentView!
        let sidebar = buildSidebar()
        content.addSubview(sidebar)
        rootContainer = NSFlippedView()
        rootContainer.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(rootContainer)
        NSLayoutConstraint.activate([
            sidebar.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            sidebar.topAnchor.constraint(equalTo: content.topAnchor),
            sidebar.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            sidebar.widthAnchor.constraint(equalToConstant: 72),

            rootContainer.leadingAnchor.constraint(equalTo: sidebar.trailingAnchor),
            rootContainer.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            rootContainer.topAnchor.constraint(equalTo: content.topAnchor),
            rootContainer.bottomAnchor.constraint(equalTo: content.bottomAnchor),
        ])

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        NotificationCenter.default.addObserver(
            self, selector: #selector(windowDidResize(_:)),
            name: NSWindow.didResizeNotification, object: window)
        NotificationCenter.default.addObserver(
            self, selector: #selector(appBecameActive(_:)),
            name: NSApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(
            self, selector: #selector(appResignedActive(_:)),
            name: NSApplication.didResignActiveNotification, object: nil)

        bridge = HermesBridge()
        NSFlippedView.iexBridge = bridge
        bridge.setLogHandler { msg in
            NSLog("[JS→native] %@", msg)
        }
        bridge.setReloadHandler { [weak self] in
            self?.reload()
        }
        bridge.setSwitchBundleHandler { [weak self] url in
            DispatchQueue.main.async { self?.switchBundle(toURL: url) }
        }
        bridge.setShowLauncherHandler { [weak self] in
            DispatchQueue.main.async { self?.showLauncher() }
        }
        bridge.setRefreshSidebarHandler { [weak self] in
            DispatchQueue.main.async { self?.rebuildSidebar() }
        }
        bridge.setToolbarHandler { [weak self] cfg in
            DispatchQueue.main.async { self?.applyToolbar(cfg) }
        }
        bridge.registerRootView(rootContainer, withTag: ROOT_TAG)

        launcherURL = Self.bundleURL()
        currentBundleURL = launcherURL
        loadBundle()
        if !isReleaseBuild { startBundlePoller() }
    }

    func installMenu() {
        let mainMenu = NSMenu()

        // Application menu
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(NSMenuItem(title: "About iExpo",
            action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
            keyEquivalent: ""))
        appMenu.addItem(.separator())
        let services = NSMenuItem(title: "Services", action: nil, keyEquivalent: "")
        let servicesMenu = NSMenu(title: "Services")
        services.submenu = servicesMenu
        NSApp.servicesMenu = servicesMenu
        appMenu.addItem(services)
        appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "Hide iExpo",
            action: #selector(NSApplication.hide(_:)), keyEquivalent: "h"))
        let hideOthers = NSMenuItem(title: "Hide Others",
            action: #selector(NSApplication.hideOtherApplications(_:)),
            keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.option, .command]
        appMenu.addItem(hideOthers)
        appMenu.addItem(NSMenuItem(title: "Show All",
            action: #selector(NSApplication.unhideAllApplications(_:)),
            keyEquivalent: ""))
        appMenu.addItem(.separator())
        appMenu.addItem(NSMenuItem(title: "Quit iExpo",
            action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appItem.submenu = appMenu
        mainMenu.addItem(appItem)

        // File
        let fileItem = NSMenuItem()
        let fileMenu = NSMenu(title: "File")
        let newWindowItem = NSMenuItem(title: "New Window",
            action: #selector(newWindowForTab(_:)), keyEquivalent: "n")
        newWindowItem.keyEquivalentModifierMask = [.command, .shift]
        fileMenu.addItem(newWindowItem)
        fileMenu.addItem(NSMenuItem(title: "Close",
            action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w"))
        fileMenu.addItem(.separator())
        fileMenu.addItem(NSMenuItem(title: "Reload",
            action: #selector(reloadFromMenu), keyEquivalent: "r"))
        fileItem.submenu = fileMenu
        mainMenu.addItem(fileItem)

        // Edit — standard responder-chain selectors
        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(NSMenuItem(title: "Undo",
            action: Selector(("undo:")), keyEquivalent: "z"))
        let redoItem = NSMenuItem(title: "Redo",
            action: Selector(("redo:")), keyEquivalent: "z")
        redoItem.keyEquivalentModifierMask = [.shift, .command]
        editMenu.addItem(redoItem)
        editMenu.addItem(.separator())
        editMenu.addItem(NSMenuItem(title: "Cut",
            action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "Copy",
            action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(NSMenuItem(title: "Paste",
            action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(NSMenuItem(title: "Select All",
            action: #selector(NSResponder.selectAll(_:)), keyEquivalent: "a"))
        editItem.submenu = editMenu
        mainMenu.addItem(editItem)

        // View
        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        // The launcher is owned by native — survives bundle swaps so the user
        // always has a way back from any installed app.
        let showLauncher = NSMenuItem(title: "Show Launcher",
            action: #selector(showLauncherFromMenu), keyEquivalent: "a")
        showLauncher.keyEquivalentModifierMask = [.shift, .command]
        showLauncher.target = self
        viewMenu.addItem(showLauncher)
        viewMenu.addItem(.separator())
        let fullScreen = NSMenuItem(title: "Enter Full Screen",
            action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.control, .command]
        viewMenu.addItem(fullScreen)
        viewItem.submenu = viewMenu
        mainMenu.addItem(viewItem)

        // Window — system manages contents (lists open windows, etc.)
        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(NSMenuItem(title: "Minimize",
            action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"))
        windowMenu.addItem(NSMenuItem(title: "Zoom",
            action: #selector(NSWindow.performZoom(_:)), keyEquivalent: ""))
        windowMenu.addItem(.separator())
        windowMenu.addItem(NSMenuItem(title: "Bring All to Front",
            action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: ""))
        windowItem.submenu = windowMenu
        mainMenu.addItem(windowItem)
        NSApp.windowsMenu = windowMenu

        // Help
        let helpItem = NSMenuItem()
        let helpMenu = NSMenu(title: "Help")
        helpItem.submenu = helpMenu
        mainMenu.addItem(helpItem)
        NSApp.helpMenu = helpMenu

        NSApp.mainMenu = mainMenu
    }

    @objc func reloadFromMenu() {
        NSLog("[iexpo] reload requested via ⌘R")
        reload()
    }

    func loadBundle() {
        // Prefer an embedded jsbundle (Release build); fall back to whatever
        // currentBundleURL points at (Metro launcher in dev, file:// for an
        // installed app, etc.).
        if !isReleaseBuild {
            let resURL = Bundle.main.url(forResource: "main", withExtension: "jsbundle")
                ?? URL(fileURLWithPath: Bundle.main.bundlePath)
                    .appendingPathComponent("Contents/Resources/main.jsbundle")
            if FileManager.default.fileExists(atPath: resURL.path),
               let src = try? String(contentsOf: resURL, encoding: .utf8) {
                isReleaseBuild = true
                NSLog("[iexpo] loading embedded bundle (%lu bytes)", src.utf8.count)
                let result = bridge.evaluateScript(src)
                NSLog("[iexpo] bundle eval result: %@", result)
                return
            }
        }

        let url = currentBundleURL
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            NSLog("[iexpo] bundle url = %@", url)
            guard let src = self.bridge.fetchBundle(fromURL: url) else {
                NSLog("[iexpo] bundle fetch failed: %@", url)
                return
            }
            DispatchQueue.main.async {
                let result = self.bridge.evaluateScript(src)
                NSLog("[iexpo] bundle eval result: %@", result)
                let size = self.rootContainer.bounds.size
                self.bridge.flushLayout(forTag: ROOT_TAG, width: size.width, height: size.height)
            }
        }
    }

    func reload() {
        bridge.resetForReload()
        loadBundle()
    }

    /// Tear down the live JS engine and re-host on a new bundle URL. Pre-fetches
    /// before tearing anything down — a fetch failure leaves the current app
    /// untouched.
    func switchBundle(toURL urlString: String) {
        if urlString == currentBundleURL {
            NSLog("[iexpo] switchBundle: already on %@, skipping", urlString)
            return
        }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            guard let src = self.bridge.fetchBundle(fromURL: urlString) else {
                NSLog("[iexpo] switchBundle fetch failed: %@", urlString)
                return
            }
            DispatchQueue.main.async {
                NSLog("[iexpo] switching: %@ → %@", self.currentBundleURL, urlString)
                self.currentBundleURL = urlString
                self.bridge.resetForReload()
                let result = self.bridge.evaluateScript(src)
                NSLog("[iexpo] switch eval: %@", result)
                let size = self.rootContainer.bounds.size
                self.bridge.flushLayout(forTag: ROOT_TAG, width: size.width, height: size.height)
                self.updateSidebarActive()
                // Metro polling only makes sense for the launcher's dev URL.
                self.refreshPollerForCurrentURL()
            }
        }
    }

    func showLauncher() {
        switchBundle(toURL: launcherURL)
    }

    @objc func showLauncherFromMenu() {
        showLauncher()
    }

    func refreshPollerForCurrentURL() {
        let isLauncherDev = currentBundleURL.hasPrefix("http://localhost") && !isReleaseBuild
        if isLauncherDev {
            if pollTimer == nil { startBundlePoller() }
        } else {
            pollTimer?.invalidate()
            pollTimer = nil
        }
    }

    @objc func windowDidResize(_ note: Notification) {
        let size = rootContainer.bounds.size
        bridge.flushLayout(forTag: ROOT_TAG, width: size.width, height: size.height)
        bridge.dispatchWindowSize(size)
    }

    @objc func appBecameActive(_ note: Notification) {
        bridge?.dispatchAppState("active")
        refreshPollerForCurrentURL()
    }

    @objc func appResignedActive(_ note: Notification) {
        bridge?.dispatchAppState("background")
        pollTimer?.invalidate()
        pollTimer = nil
    }

    func startBundlePoller() {
        pollTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.checkBundleChange()
        }
    }

    func checkBundleChange() {
        guard let url = URL(string: currentBundleURL) else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "HEAD"
        req.timeoutInterval = 1.5
        URLSession.shared.dataTask(with: req) { [weak self] _, resp, _ in
            guard let self = self, let http = resp as? HTTPURLResponse else { return }
            let delta = http.value(forHTTPHeaderField: "X-Metro-Delta-ID") ?? ""
            let mod = http.value(forHTTPHeaderField: "Last-Modified") ?? ""
            if delta.isEmpty && mod.isEmpty { return }
            let signature = "\(delta)|\(mod)"
            if let prev = self.lastBundleSignature, prev != signature {
                NSLog("[iexpo] bundle changed (%@ → %@); reloading", prev, signature)
                DispatchQueue.main.async { self.reload() }
            }
            self.lastBundleSignature = signature
        }.resume()
    }

    static func bundleURL() -> String {
        let port = ProcessInfo.processInfo.environment["IEX_METRO_PORT"] ?? "8081"
        return "http://localhost:\(port)/index.bundle?platform=macos&dev=true"
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    // MARK: - NSToolbar (driven by JS Toolbar.set)

    func applyToolbar(_ cfg: [AnyHashable: Any]) {
        let items = (cfg["items"] as? [[String: Any]]) ?? []
        toolbarSpec = items

        if items.isEmpty {
            window.toolbar = nil
            toolbar = nil
            return
        }

        if #available(macOS 11.0, *), let styleStr = cfg["style"] as? String {
            switch styleStr {
            case "unifiedCompact": window.toolbarStyle = .unifiedCompact
            case "expanded":       window.toolbarStyle = .expanded
            case "preference":     window.toolbarStyle = .preference
            default:               window.toolbarStyle = .unified
            }
        } else if #available(macOS 11.0, *) {
            window.toolbarStyle = .unified
        }

        let tb: NSToolbar = toolbar ?? {
            let t = NSToolbar(identifier: "iex.main")
            t.delegate = self
            t.allowsUserCustomization = false
            t.autosavesConfiguration = false
            t.displayMode = .iconAndLabel
            return t
        }()
        toolbar = tb
        window.toolbar = tb

        // NSToolbar requires explicit insert/remove to refresh from spec.
        while !tb.items.isEmpty { tb.removeItem(at: 0) }
        for (idx, _) in items.enumerated() {
            tb.insertItem(withItemIdentifier: identifierForSpec(items[idx], idx: idx), at: idx)
        }
    }

    private func identifierForSpec(_ spec: [String: Any], idx: Int) -> NSToolbarItem.Identifier {
        switch (spec["kind"] as? String) ?? "button" {
        case "flexibleSpace": return .flexibleSpace
        case "space":         return .space
        default:              return NSToolbarItem.Identifier((spec["id"] as? String) ?? "iex.item.\(idx)")
        }
    }

    func toolbar(_ toolbar: NSToolbar,
                 itemForItemIdentifier identifier: NSToolbarItem.Identifier,
                 willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        guard let spec = toolbarSpec.first(where: { ($0["id"] as? String) == identifier.rawValue }) else {
            return nil  // system identifier (.flexibleSpace, .space) — let NSToolbar provide
        }
        let item = NSToolbarItem(itemIdentifier: identifier)
        item.label = (spec["label"] as? String) ?? ""
        item.paletteLabel = item.label
        item.toolTip = spec["tooltip"] as? String
        item.isBordered = (spec["bordered"] as? Bool) ?? true
        if let symbol = spec["systemImage"] as? String, !symbol.isEmpty,
           #available(macOS 11.0, *) {
            item.image = NSImage(systemSymbolName: symbol, accessibilityDescription: item.label)
        }
        item.target = self
        item.action = #selector(toolbarItemTriggered(_:))
        return item
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        return toolbarSpec.enumerated().map { identifierForSpec($1, idx: $0) }
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        return toolbarDefaultItemIdentifiers(toolbar)
    }

    @objc func toolbarItemTriggered(_ sender: NSToolbarItem) {
        bridge?.dispatchToolbarItemId(sender.itemIdentifier.rawValue)
    }

    // MARK: - Secondary windows (multi-root)

    @objc func newWindowForTab(_ sender: Any?) {
        spawnSecondaryWindow()
    }

    private func allocateSecondaryRootTag() -> Int32? {
        for tag: Int32 in 2..<100 where !inUseSecondaryTags.contains(tag) {
            inUseSecondaryTags.insert(tag)
            return tag
        }
        return nil
    }

    private func releaseSecondaryRootTag(_ tag: Int32) {
        inUseSecondaryTags.remove(tag)
    }

    func spawnSecondaryWindow() {
        guard let tag = allocateSecondaryRootTag() else {
            NSLog("[iexpo] all secondary root tags in use (limit 98)")
            return
        }
        let frame = window?.frame ?? NSRect(x: 0, y: 0, width: 1024, height: 720)
        let win = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        win.title = "iExpo"
        win.titlebarAppearsTransparent = true
        win.titleVisibility = .hidden
        win.tabbingMode = .preferred
        win.tabbingIdentifier = "iex.main"
        win.isReleasedWhenClosed = false

        let container = NSFlippedView()
        container.translatesAutoresizingMaskIntoConstraints = false
        let content = win.contentView!
        content.addSubview(container)
        NSLayoutConstraint.activate([
            container.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            container.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            container.topAnchor.constraint(equalTo: content.topAnchor),
            container.bottomAnchor.constraint(equalTo: content.bottomAnchor),
        ])

        bridge.registerRootView(container, withTag: tag)

        let resizeObs = NotificationCenter.default.addObserver(
            forName: NSWindow.didResizeNotification, object: win, queue: .main
        ) { [weak self, weak container] _ in
            guard let self = self, let container = container else { return }
            let s = container.bounds.size
            self.bridge.flushLayout(forTag: tag, width: s.width, height: s.height)
        }

        let closeObs = NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification, object: win, queue: .main
        ) { [weak self, weak win] _ in
            guard let self = self, let win = win else { return }
            // Order matters: let JS unmount its tree (cleanup effects fire while
            // native views still exist) before we free the root in the bridge.
            self.bridge.dispatchCloseWindow(forRootTag: tag)
            self.bridge.unregisterRootTag(tag)
            self.releaseSecondaryRootTag(tag)
            for ob in self.secondaryWindowObservers[win] ?? [] {
                NotificationCenter.default.removeObserver(ob)
            }
            self.secondaryWindowObservers.removeValue(forKey: win)
            self.secondaryWindows.removeAll { $0 === win }
        }

        secondaryWindowObservers[win] = [resizeObs, closeObs]
        secondaryWindows.append(win)
        win.makeKeyAndOrderFront(nil)

        // After the window has its real size, ask JS to render the registered
        // app into this root tag. Initial flushLayout primes Yoga's root size.
        DispatchQueue.main.async { [weak self, weak container] in
            guard let self = self, let container = container else { return }
            let s = container.bounds.size
            self.bridge.flushLayout(forTag: tag, width: s.width, height: s.height)
            self.bridge.dispatchNewWindow(forRootTag: tag)
        }
    }
}

// ─── Native sidebar (Slack-style workspace rail) ──────────────────
//
// Lives in the window's contentView outside the JS root, so it survives every
// bundle swap. The launcher writes installed.json (id/displayName/icon/path);
// we read it on boot, after every refresh prod from JS, and after every
// bundle swap (just to flip the active highlight).

struct InstalledRecord {
    let id: String
    let displayName: String
    let icon: String
    let bundlePath: String
}

class RailItem: NSView {
    let id: String
    let bundleURL: String
    var isActive: Bool = false { didSet { updateAppearance() } }
    private var isHovered: Bool = false { didSet { updateAppearance() } }
    private weak var owner: AppDelegate?
    private let bg = NSView()
    private let indicator = NSView()
    private var trackingArea: NSTrackingArea?

    init(id: String, bundleURL: String, glyph: NSView, owner: AppDelegate?) {
        self.id = id
        self.bundleURL = bundleURL
        self.owner = owner
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        wantsLayer = true

        bg.translatesAutoresizingMaskIntoConstraints = false
        bg.wantsLayer = true
        bg.layer?.cornerRadius = 11

        indicator.translatesAutoresizingMaskIntoConstraints = false
        indicator.wantsLayer = true
        indicator.layer?.cornerRadius = 1.5
        indicator.layer?.backgroundColor = NSColor(red: 0.039, green: 0.518, blue: 1.0, alpha: 1).cgColor
        indicator.layer?.maskedCorners = [.layerMaxXMinYCorner, .layerMaxXMaxYCorner]

        glyph.translatesAutoresizingMaskIntoConstraints = false

        addSubview(indicator)
        addSubview(bg)
        bg.addSubview(glyph)

        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 52),
            widthAnchor.constraint(equalToConstant: 72),

            indicator.leadingAnchor.constraint(equalTo: leadingAnchor),
            indicator.centerYAnchor.constraint(equalTo: centerYAnchor),
            indicator.widthAnchor.constraint(equalToConstant: 3),
            indicator.heightAnchor.constraint(equalToConstant: 28),

            bg.centerXAnchor.constraint(equalTo: centerXAnchor),
            bg.centerYAnchor.constraint(equalTo: centerYAnchor),
            bg.widthAnchor.constraint(equalToConstant: 44),
            bg.heightAnchor.constraint(equalToConstant: 44),

            glyph.centerXAnchor.constraint(equalTo: bg.centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: bg.centerYAnchor),
        ])
        updateAppearance()
    }
    required init?(coder: NSCoder) { fatalError() }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let ta = trackingArea { removeTrackingArea(ta) }
        let ta = NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self, userInfo: nil)
        addTrackingArea(ta)
        trackingArea = ta
    }
    override func mouseEntered(with event: NSEvent) {
        isHovered = true
        NSCursor.pointingHand.push()
    }
    override func mouseExited(with event: NSEvent) {
        isHovered = false
        NSCursor.pop()
    }
    override func mouseDown(with event: NSEvent) {
        owner?.switchBundle(toURL: bundleURL)
    }

    private func updateAppearance() {
        if isActive {
            bg.layer?.backgroundColor = NSColor(red: 0.039, green: 0.518, blue: 1.0, alpha: 0.28).cgColor
            indicator.alphaValue = 1
        } else if isHovered {
            bg.layer?.backgroundColor = NSColor(white: 1, alpha: 0.08).cgColor
            indicator.alphaValue = 0
        } else {
            bg.layer?.backgroundColor = NSColor.clear.cgColor
            indicator.alphaValue = 0
        }
    }
}

extension AppDelegate {
    func buildSidebar() -> NSView {
        let sidebar = NSView()
        sidebar.translatesAutoresizingMaskIntoConstraints = false
        sidebar.wantsLayer = true
        sidebar.layer?.backgroundColor = NSColor(red: 28/255, green: 28/255, blue: 30/255, alpha: 1).cgColor

        let border = NSView()
        border.translatesAutoresizingMaskIntoConstraints = false
        border.wantsLayer = true
        border.layer?.backgroundColor = NSColor(white: 1, alpha: 0.08).cgColor
        sidebar.addSubview(border)

        let stack = NSStackView()
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 10
        sidebar.addSubview(stack)

        NSLayoutConstraint.activate([
            border.topAnchor.constraint(equalTo: sidebar.topAnchor),
            border.bottomAnchor.constraint(equalTo: sidebar.bottomAnchor),
            border.trailingAnchor.constraint(equalTo: sidebar.trailingAnchor),
            border.widthAnchor.constraint(equalToConstant: 1),
            stack.topAnchor.constraint(equalTo: sidebar.topAnchor, constant: 32),
            stack.leadingAnchor.constraint(equalTo: sidebar.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: sidebar.trailingAnchor),
        ])

        sidebarStack = stack
        rebuildSidebar()
        return sidebar
    }

    func rebuildSidebar() {
        guard let stack = sidebarStack else { return }
        for v in stack.arrangedSubviews {
            stack.removeArrangedSubview(v)
            v.removeFromSuperview()
        }
        sidebarItems.removeAll()

        // Home
        let homeGlyph: NSView
        if #available(macOS 11.0, *),
           let img = NSImage(systemSymbolName: "square.grid.2x2.fill", accessibilityDescription: nil) {
            let cfg = NSImage.SymbolConfiguration(pointSize: 22, weight: .medium)
            let iv = NSImageView(image: img.withSymbolConfiguration(cfg) ?? img)
            iv.contentTintColor = NSColor(white: 0.6, alpha: 1)
            iv.imageScaling = .scaleProportionallyUpOrDown
            homeGlyph = iv
        } else {
            let label = NSTextField(labelWithString: "≡")
            label.font = .systemFont(ofSize: 22, weight: .medium)
            label.textColor = NSColor(white: 0.6, alpha: 1)
            homeGlyph = label
        }
        let homeItem = RailItem(id: "__home__", bundleURL: launcherURL, glyph: homeGlyph, owner: self)
        stack.addArrangedSubview(homeItem)
        sidebarItems[homeItem.id] = homeItem

        let installed = readInstalledFromDisk()
        if !installed.isEmpty {
            let sep = NSView()
            sep.translatesAutoresizingMaskIntoConstraints = false
            sep.wantsLayer = true
            sep.layer?.backgroundColor = NSColor(white: 1, alpha: 0.10).cgColor
            NSLayoutConstraint.activate([
                sep.widthAnchor.constraint(equalToConstant: 28),
                sep.heightAnchor.constraint(equalToConstant: 1),
            ])
            stack.addArrangedSubview(sep)
        }

        for r in installed {
            let glyphText = r.icon.isEmpty ? String(r.id.prefix(1)).uppercased() : r.icon
            let label = NSTextField(labelWithString: glyphText)
            label.font = .systemFont(ofSize: 24)
            label.textColor = .white
            label.backgroundColor = .clear
            label.isBordered = false
            label.isEditable = false
            let item = RailItem(id: r.id,
                                bundleURL: "file://" + r.bundlePath,
                                glyph: label, owner: self)
            stack.addArrangedSubview(item)
            sidebarItems[r.id] = item
        }

        updateSidebarActive()
    }

    func updateSidebarActive() {
        for (key, item) in sidebarItems {
            item.isActive = (key == "__home__")
                ? (currentBundleURL == launcherURL)
                : (currentBundleURL == item.bundleURL)
        }
    }

    func readInstalledFromDisk() -> [InstalledRecord] {
        // JS uses FS.paths.appSupport which is namespaced by bundle identifier
        // (HermesBridge.fsAppDirsJSON). Mirror that here so native and JS read
        // and write the same file.
        let support = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        let bundleId = Bundle.main.bundleIdentifier ?? "com.iexpo.shell.mac"
        guard let dir = support?.appendingPathComponent(bundleId) else { return [] }
        let path = dir.appendingPathComponent("installed.json")
        guard let data = try? Data(contentsOf: path),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let records = json["records"] as? [[String: Any]] else { return [] }
        return records.compactMap { r in
            guard let id = r["id"] as? String,
                  let bundlePath = r["bundlePath"] as? String else { return nil }
            return InstalledRecord(
                id: id,
                displayName: (r["displayName"] as? String) ?? id,
                icon: (r["icon"] as? String) ?? "",
                bundlePath: bundlePath)
        }
    }
}

installCrashHandlers()
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
