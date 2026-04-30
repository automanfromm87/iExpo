#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>

NS_ASSUME_NONNULL_BEGIN

@class HermesBridge;

/// NSView with flipped (top-left) coords for Yoga, plus optional press +
/// hover + drag behaviour driven by the flags below.
@interface NSFlippedView : NSView
@property (nonatomic, assign) BOOL iexHandlesPress;
@property (nonatomic, assign) BOOL iexHasHover;
@property (nonatomic, assign) BOOL iexHandlesDrag;
@property (nonatomic, assign) BOOL iexHandlesFileDrop;
@property (nonatomic, assign) double iexActiveOpacity;

@property (class, weak, nonatomic, nullable) HermesBridge *iexBridge;
@end

@interface HermesBridge : NSObject
- (instancetype)init;
- (NSString *)evaluateScript:(NSString *)source;
- (nullable NSString *)fetchBundleFromURL:(NSString *)urlString;
- (void)setLogHandler:(void (^)(NSString *message))handler;
- (void)setReloadHandler:(void (^)(void))handler;
/// Called from JS via `__iex.switchBundle(url)` — used by the launcher to
/// hand the screen over to a freshly-downloaded app bundle.
- (void)setSwitchBundleHandler:(void (^)(NSString *url))handler;
/// Called from JS via `__iex.showLauncher()` — return to the launcher bundle
/// the shell originally booted with. Native side also wires this to a global
/// menu item so it survives across bundle swaps.
- (void)setShowLauncherHandler:(void (^)(void))handler;
/// Called from JS via `__iex.refreshSidebar()` after install/uninstall —
/// the sidebar lives in native code and needs to re-read installed.json.
- (void)setRefreshSidebarHandler:(void (^)(void))handler;
/// Called whenever JS calls Toolbar.set(...). `config` is a parsed JSON dict
/// with an `items` array and optional `style`. AppDelegate rebuilds NSToolbar
/// from this and invokes `dispatchToolbarItemId:` on press to call back into JS.
- (void)setToolbarHandler:(void (^)(NSDictionary *config))handler;
- (void)dispatchToolbarItemId:(NSString *)itemId;
/// Tell JS to render the registered app into a fresh root tag (a secondary
/// window's container). The native side has already called registerRootView
/// for `tag` before invoking this.
- (void)dispatchNewWindowForRootTag:(int32_t)tag;
/// Tell JS to unmount the React tree mounted at `tag` and drop its container.
/// Call this *before* unregisterRootTag so the JS side has a chance to run
/// cleanup effects while the native views still exist.
- (void)dispatchCloseWindowForRootTag:(int32_t)tag;
/// Drop a registered root: removes the view from the bridge maps, recursively
/// frees the Yoga subtree, and clears any callback handles tagged for it.
- (void)unregisterRootTag:(int32_t)tag;

#pragma mark - View management

- (void)registerRootView:(NSView *)view withTag:(int32_t)tag;
- (void)resetForReload;

#pragma mark - Layout

- (void)flushLayoutForTag:(int32_t)tag width:(CGFloat)width height:(CGFloat)height;

#pragma mark - App events

- (void)dispatchAppState:(NSString *)state;
- (void)dispatchWindowSize:(CGSize)size;
- (void)dispatchOnPressForTag:(int32_t)tag;
- (void)dispatchHoverForTag:(int32_t)tag entered:(BOOL)entered;
- (void)dispatchDragForTag:(int32_t)tag phase:(NSString *)phase dx:(CGFloat)dx dy:(CGFloat)dy;
- (void)dispatchFileDropForTag:(int32_t)tag paths:(NSArray<NSString *> *)paths;
@end

NS_ASSUME_NONNULL_END
