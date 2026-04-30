#import "HermesBridge.h"

#import <hermes/hermes.h>
#import <jsi/jsi.h>
#import <objc/runtime.h>
#import <yoga/Yoga.h>
#import <UserNotifications/UserNotifications.h>

@implementation NSFlippedView {
    NSTrackingArea *_iexTrackingArea;
    BOOL _iexHasHover;
}

static __weak HermesBridge *gIexBridge = nil;
+ (HermesBridge *)iexBridge { return gIexBridge; }
+ (void)setIexBridge:(HermesBridge *)b { gIexBridge = b; }

- (BOOL)isFlipped { return YES; }

- (void)setIexHandlesPress:(BOOL)v {
    if (_iexHandlesPress == v) return;
    _iexHandlesPress = v;
    [self.window invalidateCursorRectsForView:self];
    [self _updateHoverTracking];
}

- (void)setIexHasHover:(BOOL)v {
    if (_iexHasHover == v) return;
    _iexHasHover = v;
    [self _updateHoverTracking];
}

- (BOOL)iexHasHover { return _iexHasHover; }

- (void)_updateHoverTracking {
    BOOL needs = _iexHasHover || _iexHandlesPress;
    if (needs && !_iexTrackingArea) {
        NSTrackingAreaOptions opts = NSTrackingMouseEnteredAndExited
                                   | NSTrackingActiveInActiveApp
                                   | NSTrackingInVisibleRect;
        _iexTrackingArea = [[NSTrackingArea alloc] initWithRect:NSZeroRect
                                                        options:opts
                                                          owner:self
                                                       userInfo:nil];
        [self addTrackingArea:_iexTrackingArea];
    } else if (!needs && _iexTrackingArea) {
        [self removeTrackingArea:_iexTrackingArea];
        _iexTrackingArea = nil;
    }
}

- (void)resetCursorRects {
    if (self.iexHandlesPress) {
        [self addCursorRect:self.bounds cursor:[NSCursor pointingHandCursor]];
    }
}

- (void)mouseEntered:(NSEvent *)e {
    if (!_iexHasHover) return;
    NSNumber *tag = objc_getAssociatedObject(self, "iex_tag");
    HermesBridge *b = NSFlippedView.iexBridge;
    if (b && tag) [b dispatchHoverForTag:tag.intValue entered:YES];
}

- (void)mouseExited:(NSEvent *)e {
    if (!_iexHasHover) return;
    NSNumber *tag = objc_getAssociatedObject(self, "iex_tag");
    HermesBridge *b = NSFlippedView.iexBridge;
    if (b && tag) [b dispatchHoverForTag:tag.intValue entered:NO];
}

- (void)setIexHandlesFileDrop:(BOOL)v {
    if (_iexHandlesFileDrop == v) return;
    _iexHandlesFileDrop = v;
    if (v) [self registerForDraggedTypes:@[NSPasteboardTypeFileURL]];
    else   [self unregisterDraggedTypes];
}

- (NSDragOperation)draggingEntered:(id<NSDraggingInfo>)sender {
    if (!_iexHandlesFileDrop) return NSDragOperationNone;
    NSArray<Class> *classes = @[[NSURL class]];
    NSDictionary *opts = @{ NSPasteboardURLReadingFileURLsOnlyKey: @YES };
    NSArray *urls = [sender.draggingPasteboard readObjectsForClasses:classes options:opts];
    return urls.count > 0 ? NSDragOperationCopy : NSDragOperationNone;
}

- (NSDragOperation)draggingUpdated:(id<NSDraggingInfo>)sender {
    return [self draggingEntered:sender];
}

- (BOOL)performDragOperation:(id<NSDraggingInfo>)sender {
    if (!_iexHandlesFileDrop) return NO;
    NSArray<Class> *classes = @[[NSURL class]];
    NSDictionary *opts = @{ NSPasteboardURLReadingFileURLsOnlyKey: @YES };
    NSArray<NSURL *> *urls = [sender.draggingPasteboard readObjectsForClasses:classes options:opts];
    if (urls.count == 0) return NO;
    NSMutableArray<NSString *> *paths = [NSMutableArray new];
    for (NSURL *u in urls) if (u.path) [paths addObject:u.path];
    NSNumber *tag = objc_getAssociatedObject(self, "iex_tag");
    HermesBridge *b = NSFlippedView.iexBridge;
    if (b && tag) [b dispatchFileDropForTag:tag.intValue paths:paths];
    return YES;
}

- (void)mouseDown:(NSEvent *)event {
    if (!self.iexHandlesPress && !self.iexHandlesDrag) { [super mouseDown:event]; return; }

    HermesBridge *bridge = NSFlippedView.iexBridge;
    NSNumber *tagN = objc_getAssociatedObject(self, "iex_tag");
    int32_t tag = tagN.intValue;

    NSPoint startPoint = [self convertPoint:event.locationInWindow fromView:nil];
    CGFloat normalAlpha = self.alphaValue;
    CGFloat dim = self.iexActiveOpacity;

    BOOL pressMode = self.iexHandlesPress;
    BOOL dragMode  = self.iexHandlesDrag;
    BOOL inside = YES;
    BOOL dragging = NO;

    if (pressMode) self.alphaValue = dim;

    while (YES) {
        @autoreleasepool {
            NSEventMask mask = NSEventMaskLeftMouseUp | NSEventMaskLeftMouseDragged;
            NSEvent *e = [self.window nextEventMatchingMask:mask];
            NSPoint p = [self convertPoint:e.locationInWindow fromView:nil];
            CGFloat dx = p.x - startPoint.x;
            CGFloat dy = p.y - startPoint.y;

            if (e.type == NSEventTypeLeftMouseUp) {
                self.alphaValue = normalAlpha;
                if (dragging) {
                    if (bridge && tag) [bridge dispatchDragForTag:tag phase:@"end" dx:dx dy:dy];
                } else if (pressMode && inside) {
                    if (bridge && tag) [bridge dispatchOnPressForTag:tag];
                }
                return;
            }

            // mouseDragged
            if (!dragging && dragMode && (fabs(dx) + fabs(dy) > 5)) {
                dragging = YES;
                self.alphaValue = normalAlpha;  // press feedback ends; drag starts
                if (bridge && tag) [bridge dispatchDragForTag:tag phase:@"start" dx:0 dy:0];
            }
            if (dragging) {
                if (bridge && tag) [bridge dispatchDragForTag:tag phase:@"move" dx:dx dy:dy];
            } else if (pressMode) {
                inside = NSPointInRect(p, self.bounds);
                self.alphaValue = inside ? dim : normalAlpha;
            }
        }
    }
}

@end

#pragma mark - IEXSFSymbolView

static NSFontWeight iexFontWeightForName(NSString *s) {
    if ([s isEqualToString:@"ultralight"] || [s isEqualToString:@"100"]) return NSFontWeightUltraLight;
    if ([s isEqualToString:@"thin"]       || [s isEqualToString:@"200"]) return NSFontWeightThin;
    if ([s isEqualToString:@"light"]      || [s isEqualToString:@"300"]) return NSFontWeightLight;
    if ([s isEqualToString:@"medium"]     || [s isEqualToString:@"500"]) return NSFontWeightMedium;
    if ([s isEqualToString:@"semibold"]   || [s isEqualToString:@"600"]) return NSFontWeightSemibold;
    if ([s isEqualToString:@"bold"]       || [s isEqualToString:@"700"]) return NSFontWeightBold;
    if ([s isEqualToString:@"heavy"]      || [s isEqualToString:@"800"]) return NSFontWeightHeavy;
    if ([s isEqualToString:@"black"]      || [s isEqualToString:@"900"]) return NSFontWeightBlack;
    return NSFontWeightRegular;
}

API_AVAILABLE(macos(11.0))
static NSImageSymbolScale iexSymbolScaleFromString(NSString *s) {
    if ([s isEqualToString:@"small"]) return NSImageSymbolScaleSmall;
    if ([s isEqualToString:@"large"]) return NSImageSymbolScaleLarge;
    return NSImageSymbolScaleMedium;
}

// NSVisualEffectView subclass with flipped (top-left) coords so Yoga-laid
// children stack from the top instead of AppKit's default bottom-up.
@interface IEXFlippedVibrancyView : NSVisualEffectView
@end
@implementation IEXFlippedVibrancyView
- (BOOL)isFlipped { return YES; }
@end

@interface IEXSFSymbolView : NSImageView
@property (nonatomic, copy, nullable) NSString *symName;
@property (nonatomic, assign) CGFloat symPointSize;
@property (nonatomic, copy) NSString *symWeight;
@property (nonatomic, copy) NSString *symScale;
- (void)applySymbolConfig;
@end

@implementation IEXSFSymbolView
- (instancetype)init {
    if ((self = [super init])) {
        _symPointSize = 14;
        _symWeight = @"regular";
        _symScale = @"medium";
        self.imageScaling = NSImageScaleProportionallyDown;
    }
    return self;
}
- (void)applySymbolConfig {
    if (!_symName.length) { self.image = nil; return; }
    if (@available(macOS 11.0, *)) {
        NSImage *base = [NSImage imageWithSystemSymbolName:_symName accessibilityDescription:nil];
        if (!base) { self.image = nil; return; }
        NSImageSymbolConfiguration *cfg =
            [NSImageSymbolConfiguration configurationWithPointSize:_symPointSize
                                                            weight:iexFontWeightForName(_symWeight)
                                                             scale:iexSymbolScaleFromString(_symScale)];
        self.image = [base imageWithSymbolConfiguration:cfg];
    } else {
        self.image = nil;
    }
}
@end

#include <atomic>
#include <memory>
#include <string>
#include <unordered_map>

using namespace facebook;
using namespace facebook::jsi;

@interface HermesBridge () <NSTextFieldDelegate, UNUserNotificationCenterDelegate>
@end

@implementation HermesBridge {
    std::unique_ptr<Runtime> _runtime;
    void (^_logHandler)(NSString *);
    void (^_reloadHandler)(void);
    void (^_switchBundleHandler)(NSString *);
    void (^_showLauncherHandler)(void);
    void (^_refreshSidebarHandler)(void);
    NSView *_redBoxOverlay;
    NSTextView *_redBoxText;
    NSMutableDictionary<NSNumber *, NSView *> *_views;       // child-anchor view (where appendChild puts subviews)
    NSMutableDictionary<NSNumber *, NSView *> *_outerViews;  // view that gets attached to parent (==_views unless wrapped, e.g. ScrollView)
    NSMutableDictionary<NSNumber *, NSTimer *> *_timers;
    std::atomic<int32_t> _nextTag;
    std::atomic<int32_t> _nextTimerId;
    std::unordered_map<std::string, std::shared_ptr<Function>> _callbacks;  // "tag:event" → fn
    std::unordered_map<int32_t, YGNodeRef> _nodes;
    std::unordered_map<YGNodeRef, int32_t> _nodeTags;  // reverse index for tagForNode
    std::shared_ptr<Function> _appStateCallback;
    std::shared_ptr<Function> _windowResizeCallback;
    NSMutableDictionary<NSNumber *, NSURLSessionWebSocketTask *> *_wsTasks;
    NSMutableDictionary<NSNumber *, NSMenuItem *> *_customMenuItems;
    std::unordered_map<int32_t, std::shared_ptr<Function>> _menuCallbacks;
    std::atomic<int32_t> _nextMenuId;
    void (^_toolbarHandler)(NSDictionary *);
    std::shared_ptr<Function> _toolbarDispatch;
    std::shared_ptr<Function> _colorSchemeCallback;
    std::shared_ptr<Function> _newWindowCallback;
    std::shared_ptr<Function> _closeWindowCallback;
    std::shared_ptr<Function> _notifTapCallback;
    NSMutableDictionary<NSNumber *, NSStatusItem *> *_statusItems;
    std::unordered_map<int32_t, std::shared_ptr<Function>> _statusItemMenuDispatch;
    std::unordered_map<int32_t, std::shared_ptr<Function>> _statusItemPress;
    std::atomic<int32_t> _nextStatusItemId;
    std::unordered_map<int32_t, double> _animValues;
    std::unordered_map<int32_t, std::vector<std::pair<int32_t, std::string>>> _animBindings;
    NSTimer *_animTimer;
    YGConfigRef _yogaConfig;
}

namespace iex {
struct AnimTransform { double tx = 0; double ty = 0; double scale = 1; double rotate = 0; };
struct AnimState { int32_t valueId; double startTime; double startValue; double toValue; double duration; int32_t completionId; };
}
static std::unordered_map<int32_t, iex::AnimState> gAnimations;
static std::unordered_map<int32_t, iex::AnimTransform> gAnimTransforms;

- (void)dispatchToJS:(void (^)(Runtime &rt))block {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!self->_runtime) return;
        try {
            block(*self->_runtime);
        } catch (const JSError &e) {
            NSLog(@"[iex] dispatchToJS error: %s", e.getMessage().c_str());
        } catch (const std::exception &e) {
            NSLog(@"[iex] dispatchToJS error: %s", e.what());
        }
    });
}

- (void)callJSGlobal:(NSString *)name onRuntime:(Runtime &)rt args:(std::initializer_list<Value>)args {
    Value cb = rt.global().getProperty(rt, [name UTF8String]);
    if (!cb.isObject()) return;
    Object obj = cb.asObject(rt);
    if (!obj.isFunction(rt)) return;
    obj.asFunction(rt).call(rt, args);
}

static YGFlexDirection parseFlexDirection(NSString *s) {
    if ([s isEqualToString:@"row"]) return YGFlexDirectionRow;
    if ([s isEqualToString:@"row-reverse"]) return YGFlexDirectionRowReverse;
    if ([s isEqualToString:@"column-reverse"]) return YGFlexDirectionColumnReverse;
    return YGFlexDirectionColumn;
}

static YGJustify parseJustify(NSString *s) {
    if ([s isEqualToString:@"center"]) return YGJustifyCenter;
    if ([s isEqualToString:@"flex-end"]) return YGJustifyFlexEnd;
    if ([s isEqualToString:@"space-between"]) return YGJustifySpaceBetween;
    if ([s isEqualToString:@"space-around"]) return YGJustifySpaceAround;
    if ([s isEqualToString:@"space-evenly"]) return YGJustifySpaceEvenly;
    return YGJustifyFlexStart;
}

static YGAlign parseAlign(NSString *s) {
    if ([s isEqualToString:@"center"]) return YGAlignCenter;
    if ([s isEqualToString:@"flex-end"]) return YGAlignFlexEnd;
    if ([s isEqualToString:@"stretch"]) return YGAlignStretch;
    if ([s isEqualToString:@"baseline"]) return YGAlignBaseline;
    if ([s isEqualToString:@"space-between"]) return YGAlignSpaceBetween;
    if ([s isEqualToString:@"space-around"]) return YGAlignSpaceAround;
    return YGAlignFlexStart;
}

static inline float safeFloat(float v) {
    return isfinite(v) ? v : 0.0f;
}

static YGSize measureTextNode(YGNodeConstRef node, float width, YGMeasureMode wMode,
                               float height, YGMeasureMode hMode) {
    NSTextField *tf = (__bridge NSTextField *)YGNodeGetContext(node);
    if (!tf) return YGSize{0, 16};
    NSFont *font = tf.font ?: [NSFont systemFontOfSize:14];
    float lineHeight = (float)ceil(font.ascender - font.descender + font.leading) + 2;

    NSString *text = tf.stringValue ?: @"";
    if (text.length == 0) {
        return YGSize{0, lineHeight};
    }

    NSDictionary *attrs = @{NSFontAttributeName: font};
    NSAttributedString *as = [[NSAttributedString alloc] initWithString:text attributes:attrs];

    CGFloat constraintW;
    if (wMode == YGMeasureModeUndefined || !isfinite(width)) {
        constraintW = CGFLOAT_MAX;
    } else {
        constraintW = width;
    }
    NSRect r = [as boundingRectWithSize:NSMakeSize(constraintW, CGFLOAT_MAX)
                                options:NSStringDrawingUsesLineFragmentOrigin |
                                        NSStringDrawingUsesFontLeading];
    // NSTextField uses NSTextFieldCell for drawing, which adds a small horizontal
    // inset that boundingRectWithSize: doesn't account for. Without this pad, the
    // last glyph (e.g. "Hello" → "Hell") gets clipped by ~1-2pt at render time.
    float w = (float)ceil(r.size.width) + 2;
    float h = (float)ceil(r.size.height) + 2;
    if (h < lineHeight) h = lineHeight;
    return YGSize{safeFloat(w), safeFloat(h)};
}

static YGSize measureControlNode(YGNodeConstRef node, float width, YGMeasureMode wMode,
                                  float height, YGMeasureMode hMode) {
    NSControl *c = (__bridge NSControl *)YGNodeGetContext(node);
    if (!c) return YGSize{50, 22};
    NSSize s = [c intrinsicContentSize];
    if (s.width <= 0 || !isfinite(s.width)) s.width = 50;
    if (s.height <= 0 || !isfinite(s.height)) s.height = 22;
    return YGSize{(float)s.width, (float)s.height};
}

static void *kIexAppearanceObserverContext = &kIexAppearanceObserverContext;

- (instancetype)init {
    if ((self = [super init])) {
        _views = [NSMutableDictionary new];
        _outerViews = [NSMutableDictionary new];
        _timers = [NSMutableDictionary new];
        _wsTasks = [NSMutableDictionary new];
        _customMenuItems = [NSMutableDictionary new];
        _statusItems = [NSMutableDictionary new];
        _nextStatusItemId.store(1);
        _nextMenuId.store(1);
        _nextTag.store(100);  // tags 1..99 reserved for native-allocated roots
        _nextTimerId.store(1);

        // Yoga config — round all dimensions to physical-pixel boundaries so
        // 1pt borders, text, and SF Symbols stay crisp on retina screens.
        // Default config rounds to 1.0 (point) which produces blurry edges
        // when computed positions land on half-points.
        _yogaConfig = YGConfigNew();
        CGFloat scale = [NSScreen mainScreen].backingScaleFactor;
        if (scale <= 0) scale = 1.0;
        YGConfigSetPointScaleFactor(_yogaConfig, (float)scale);

        [self bootstrapRuntime];
        [NSApp addObserver:self
                forKeyPath:@"effectiveAppearance"
                   options:NSKeyValueObservingOptionNew
                   context:kIexAppearanceObserverContext];
        UNUserNotificationCenter.currentNotificationCenter.delegate = self;
    }
    return self;
}

- (void)dealloc {
    @try {
        [NSApp removeObserver:self
                   forKeyPath:@"effectiveAppearance"
                      context:kIexAppearanceObserverContext];
    } @catch (NSException *e) { /* observer never registered */ }
    if (_yogaConfig) YGConfigFree(_yogaConfig);
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary *)change
                       context:(void *)context {
    if (context == kIexAppearanceObserverContext) {
        [self dispatchColorScheme];
    } else {
        [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
    }
}

- (NSString *)currentColorScheme {
    NSAppearance *appearance = NSApp.effectiveAppearance ?: [NSAppearance currentAppearance];
    NSAppearanceName matched =
        [appearance bestMatchFromAppearancesWithNames:@[NSAppearanceNameAqua, NSAppearanceNameDarkAqua]];
    return [matched isEqualToString:NSAppearanceNameDarkAqua] ? @"dark" : @"light";
}

- (void)dispatchColorScheme {
    if (!_colorSchemeCallback) return;
    NSString *scheme = [self currentColorScheme];
    auto cb = _colorSchemeCallback;
    [self dispatchToJS:^(Runtime &rt) {
        cb->call(rt, String::createFromUtf8(rt, scheme.UTF8String));
    }];
}

- (void)bootstrapRuntime {
    _runtime = facebook::hermes::makeHermesRuntime();
    [self installPolyfills];
    [self installNativeLog];
    [self installHostFunctions];
}

- (NSView *)outerForTag:(int32_t)tag {
    NSView *o = _outerViews[@(tag)];
    return o ?: _views[@(tag)];
}

- (int32_t)scheduleTimerWithDelay:(double)delayMs
                          repeats:(BOOL)repeats
                         function:(std::shared_ptr<Function>)fn {
    int32_t timerId = _nextTimerId.fetch_add(1);
    __weak HermesBridge *weakSelf = self;
    NSTimer *timer = [NSTimer scheduledTimerWithTimeInterval:MAX(delayMs, 0.0) / 1000.0
                                                     repeats:repeats
                                                       block:^(NSTimer *t) {
        HermesBridge *strong = weakSelf;
        if (!strong) { [t invalidate]; return; }
        try {
            fn->call(*strong->_runtime);
        } catch (const JSError &e) {
            NSLog(@"[iex] timer cb error: %s", e.getMessage().c_str());
        } catch (const std::exception &e) {
            NSLog(@"[iex] timer cb error: %s", e.what());
        }
        if (!repeats) {
            [strong->_timers removeObjectForKey:@(timerId)];
        }
    }];
    _timers[@(timerId)] = timer;
    return timerId;
}

- (void)cancelTimer:(int32_t)timerId {
    NSTimer *t = _timers[@(timerId)];
    if (t) {
        [t invalidate];
        [_timers removeObjectForKey:@(timerId)];
    }
}

- (void)installPolyfills {
    Runtime &rt = *_runtime;
    __weak HermesBridge *weakSelf = self;

    auto makeTimerFn = ^(BOOL repeats, NSString *name) {
        return Function::createFromHostFunction(
            rt, PropNameID::forAscii(rt, name.UTF8String), 2,
            [weakSelf, repeats](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1 || !args[0].isObject() || !args[0].asObject(rt).isFunction(rt)) {
                    return Value(0.0);
                }
                auto fnPtr = std::make_shared<Function>(args[0].asObject(rt).asFunction(rt));
                double delay = (count > 1 && args[1].isNumber()) ? args[1].asNumber() : 0;
                HermesBridge *strong = weakSelf;
                if (!strong) return Value(0.0);
                int32_t id = [strong scheduleTimerWithDelay:delay repeats:repeats function:fnPtr];
                return Value((double)id);
            });
    };

    auto makeCancelFn = ^(NSString *name) {
        return Function::createFromHostFunction(
            rt, PropNameID::forAscii(rt, name.UTF8String), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1 || !args[0].isNumber()) return Value::undefined();
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                [strong cancelTimer:(int32_t)args[0].asNumber()];
                return Value::undefined();
            });
    };

    rt.global().setProperty(rt, "setTimeout", makeTimerFn(NO, @"setTimeout"));
    rt.global().setProperty(rt, "clearTimeout", makeCancelFn(@"clearTimeout"));
    rt.global().setProperty(rt, "setInterval", makeTimerFn(YES, @"setInterval"));
    rt.global().setProperty(rt, "clearInterval", makeCancelFn(@"clearInterval"));
    rt.global().setProperty(rt, "setImmediate", makeTimerFn(NO, @"setImmediate"));
    rt.global().setProperty(rt, "clearImmediate", makeCancelFn(@"clearImmediate"));
}

- (void)installNativeLog {
    Runtime &rt = *_runtime;
    __weak HermesBridge *weakSelf = self;
    auto fn = Function::createFromHostFunction(
        rt,
        PropNameID::forAscii(rt, "nativeLog"),
        1,
        [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
            if (count == 0) return Value::undefined();
            std::string msg;
            if (args[0].isString()) {
                msg = args[0].getString(rt).utf8(rt);
            } else {
                msg = args[0].toString(rt).utf8(rt);
            }
            HermesBridge *strongSelf = weakSelf;
            NSString *m = [NSString stringWithUTF8String:msg.c_str()];
            if (strongSelf && strongSelf->_logHandler) {
                strongSelf->_logHandler(m);
            } else {
                NSLog(@"[JS] %@", m);
            }
            return Value::undefined();
        });
    rt.global().setProperty(rt, "nativeLog", fn);
}

- (NSString *)evaluateScript:(NSString *)source {
    Runtime &rt = *_runtime;
    try {
        auto buf = std::make_shared<StringBuffer>(std::string([source UTF8String]));
        Value result = rt.evaluateJavaScript(buf, "<inline>");
        std::string out = result.toString(rt).utf8(rt);
        return [NSString stringWithUTF8String:out.c_str()];
    } catch (const JSError &e) {
        NSString *msg = [NSString stringWithFormat:@"%s\n\n%s",
                         e.getMessage().c_str(), e.getStack().c_str()];
        [self showRedBoxTitle:@"Bundle eval error" message:msg];
        return [NSString stringWithFormat:@"<JS error: %s\nStack:\n%s>",
                e.getMessage().c_str(), e.getStack().c_str()];
    } catch (const std::exception &e) {
        return [NSString stringWithFormat:@"<error: %s>", e.what()];
    }
}

- (nullable NSString *)fetchBundleFromURL:(NSString *)urlString {
    NSURL *url = [NSURL URLWithString:urlString];
    if (!url) return nil;

    const int maxAttempts = 15;
    for (int attempt = 1; attempt <= maxAttempts; attempt++) {
        NSError *err = nil;
        NSData *data = [NSData dataWithContentsOfURL:url options:0 error:&err];
        if (data) {
            NSString *src = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
            NSLog(@"[iexpo] bundle fetched (%lu bytes)", (unsigned long)data.length);
            return src;
        }
        NSLog(@"[iexpo] waiting for metro at %@ (%d/%d): %@",
              urlString, attempt, maxAttempts,
              err.localizedDescription ?: @"connection refused");
        [NSThread sleepForTimeInterval:1.0];
    }
    return nil;
}

- (void)setLogHandler:(void (^)(NSString *))handler {
    _logHandler = [handler copy];
}

- (void)setReloadHandler:(void (^)(void))handler {
    _reloadHandler = [handler copy];
}

- (void)setSwitchBundleHandler:(void (^)(NSString *))handler {
    _switchBundleHandler = [handler copy];
}

- (void)setShowLauncherHandler:(void (^)(void))handler {
    _showLauncherHandler = [handler copy];
}

- (void)setRefreshSidebarHandler:(void (^)(void))handler {
    _refreshSidebarHandler = [handler copy];
}

- (void)setToolbarHandler:(void (^)(NSDictionary *))handler {
    _toolbarHandler = [handler copy];
}

- (void)applyToolbarConfigJSON:(NSString *)json dispatch:(std::shared_ptr<Function>)dispatch {
    NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *cfg = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    if (![cfg isKindOfClass:[NSDictionary class]]) cfg = @{ @"items": @[] };
    _toolbarDispatch = dispatch;
    if (_toolbarHandler) _toolbarHandler(cfg);
}

- (void)dispatchToolbarItemId:(NSString *)itemId {
    if (!_toolbarDispatch || !itemId) return;
    auto fn = _toolbarDispatch;
    [self dispatchToJS:^(Runtime &rt) {
        fn->call(rt, String::createFromUtf8(rt, itemId.UTF8String));
    }];
}

- (void)_callTagCallback:(std::shared_ptr<Function>)cb tag:(int32_t)tag {
    if (!cb) return;
    [self dispatchToJS:^(Runtime &rt) { cb->call(rt, (double)tag); }];
}

- (void)dispatchNewWindowForRootTag:(int32_t)tag   { [self _callTagCallback:_newWindowCallback   tag:tag]; }
- (void)dispatchCloseWindowForRootTag:(int32_t)tag { [self _callTagCallback:_closeWindowCallback tag:tag]; }

- (void)unregisterRootTag:(int32_t)tag {
    if (tag <= 0 || tag >= 100) return;  // only root tags
    YGNodeRef root = [self nodeForTag:tag];
    if (root) {
        // Free the entire Yoga subtree under this root before freeing the root.
        while (YGNodeGetChildCount(root) > 0) {
            YGNodeRef c = YGNodeGetChild(root, 0);
            YGNodeRemoveChild(root, c);
            [self cleanupYogaSubtree:c];
        }
        _nodeTags.erase(root);
        _nodes.erase(tag);
        YGNodeFree(root);
    }
    [_views removeObjectForKey:@(tag)];
    [_outerViews removeObjectForKey:@(tag)];
    [self clearCallbacksForTag:tag];
}

#pragma mark - RedBox

- (void)showRedBoxTitle:(NSString *)title message:(NSString *)message {
    dispatch_async(dispatch_get_main_queue(), ^{
        [self _showRedBoxOnMain:title message:message];
    });
}

- (void)_showRedBoxOnMain:(NSString *)title message:(NSString *)message {
    NSView *root = _views[@(1)];
    NSView *parent = root.window.contentView ?: root;
    if (!parent) return;

    if (_redBoxOverlay) {
        _redBoxText.string = message;
        return;
    }

    NSFlippedView *overlay = [[NSFlippedView alloc] initWithFrame:parent.bounds];
    overlay.wantsLayer = YES;
    overlay.layer.backgroundColor = [NSColor colorWithRed:0.78 green:0.16 blue:0.16 alpha:0.97].CGColor;
    overlay.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

    NSTextField *titleLabel = [NSTextField labelWithString:title];
    titleLabel.font = [NSFont boldSystemFontOfSize:16];
    titleLabel.textColor = [NSColor whiteColor];
    titleLabel.frame = NSMakeRect(20, 16, parent.bounds.size.width - 40, 22);
    titleLabel.autoresizingMask = NSViewWidthSizable;
    [overlay addSubview:titleLabel];

    NSScrollView *scroll = [[NSScrollView alloc]
        initWithFrame:NSMakeRect(20, 50, parent.bounds.size.width - 40, parent.bounds.size.height - 100)];
    scroll.hasVerticalScroller = YES;
    scroll.borderType = NSNoBorder;
    scroll.drawsBackground = NO;
    scroll.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

    NSTextView *tv = [[NSTextView alloc] init];
    tv.editable = NO;
    tv.selectable = YES;
    tv.font = [NSFont monospacedSystemFontOfSize:12 weight:NSFontWeightRegular];
    tv.textColor = [NSColor whiteColor];
    tv.backgroundColor = [NSColor clearColor];
    tv.minSize = NSMakeSize(0, 0);
    tv.maxSize = NSMakeSize(FLT_MAX, FLT_MAX);
    tv.verticallyResizable = YES;
    tv.horizontallyResizable = NO;
    tv.autoresizingMask = NSViewWidthSizable;
    tv.textContainer.containerSize = NSMakeSize(scroll.contentSize.width, FLT_MAX);
    tv.textContainer.widthTracksTextView = YES;
    tv.string = message;
    scroll.documentView = tv;
    [overlay addSubview:scroll];
    _redBoxText = tv;

    NSButton *reloadBtn = [NSButton buttonWithTitle:@"Reload"
                                             target:self
                                             action:@selector(_redBoxReload:)];
    reloadBtn.bezelColor = [NSColor whiteColor];
    reloadBtn.frame = NSMakeRect(parent.bounds.size.width - 200, parent.bounds.size.height - 44, 80, 28);
    reloadBtn.autoresizingMask = NSViewMinXMargin | NSViewMinYMargin;
    [overlay addSubview:reloadBtn];

    NSButton *dismissBtn = [NSButton buttonWithTitle:@"Dismiss"
                                              target:self
                                              action:@selector(_redBoxDismiss:)];
    dismissBtn.frame = NSMakeRect(parent.bounds.size.width - 110, parent.bounds.size.height - 44, 80, 28);
    dismissBtn.autoresizingMask = NSViewMinXMargin | NSViewMinYMargin;
    [overlay addSubview:dismissBtn];

    [parent addSubview:overlay positioned:NSWindowAbove relativeTo:nil];
    _redBoxOverlay = overlay;

    // Kick off symbolication asynchronously — JS shim queries metro's
    // /symbolicate endpoint and calls __iex.updateRedBox to refine the message.
    [self requestSymbolicate:message];
}

- (void)requestSymbolicate:(NSString *)stack {
    [self dispatchToJS:^(Runtime &rt) {
        Value cb = rt.global().getProperty(rt, "__iex_symbolicate");
        if (!cb.isObject()) return;
        Object obj = cb.asObject(rt);
        if (!obj.isFunction(rt)) return;
        obj.asFunction(rt).call(rt, jsi::String::createFromUtf8(rt, [stack UTF8String]));
    }];
}

- (void)updateRedBoxText:(NSString *)message {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self->_redBoxText) self->_redBoxText.string = message;
    });
}

- (IBAction)_redBoxReload:(id)sender {
    [self _redBoxDismiss:nil];
    if (_reloadHandler) _reloadHandler();
}

- (IBAction)_redBoxDismiss:(id)sender {
    [_redBoxOverlay removeFromSuperview];
    _redBoxOverlay = nil;
    _redBoxText = nil;
}

#pragma mark - Step 3: host views

- (void)registerRootView:(NSView *)view withTag:(int32_t)tag {
    _views[@(tag)] = view;
    YGNodeRef node = YGNodeNewWithConfig(_yogaConfig);
    _nodes[tag] = node;
    _nodeTags[node] = tag;
    objc_setAssociatedObject(view, "iex_tag", @(tag), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}

- (void)dispatchAppState:(NSString *)state {
    if (!_appStateCallback) return;
    Runtime &rt = *_runtime;
    try {
        _appStateCallback->call(rt, jsi::String::createFromUtf8(rt, [state UTF8String]));
    } catch (const JSError &e) {
        NSLog(@"[iex] appState callback error: %s", e.getMessage().c_str());
    } catch (const std::exception &e) {
        NSLog(@"[iex] appState callback error: %s", e.what());
    }
}

#pragma mark - Scroll

- (void)handleScrollBoundsChanged:(NSNotification *)note {
    NSClipView *clip = note.object;
    if (![clip isKindOfClass:[NSClipView class]]) return;
    NSNumber *tagNum = objc_getAssociatedObject(clip, "iex_outer_tag");
    if (!tagNum) return;
    int32_t tag = tagNum.intValue;

    // Throttle: drop if a dispatch is already pending for this scroll.
    NSString *key = [NSString stringWithFormat:@"iex_scroll_pending_%d", tag];
    if (objc_getAssociatedObject(clip, [key UTF8String])) return;
    objc_setAssociatedObject(clip, [key UTF8String], @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);

    NSPoint offset = clip.bounds.origin;
    NSSize visible = clip.bounds.size;
    NSSize contentSize = clip.documentView.frame.size;

    [self invokeCallbackForTag:tag
                         event:@"onScroll"
                        noArgs:NO
                      withBool:NO
                    withString:[NSString stringWithFormat:@"{\"contentOffset\":{\"x\":%f,\"y\":%f},\"layoutMeasurement\":{\"width\":%f,\"height\":%f},\"contentSize\":{\"width\":%f,\"height\":%f}}",
                                offset.x, offset.y,
                                visible.width, visible.height,
                                contentSize.width, contentSize.height]];

    dispatch_async(dispatch_get_main_queue(), ^{
        objc_setAssociatedObject(clip, [key UTF8String], nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    });
}

#pragma mark - Network

- (void)networkRequest:(int32_t)reqId
                method:(NSString *)method
                   url:(NSString *)urlStr
               headers:(NSString *)headersJson
                  body:(NSString *)body {
    NSURL *url = [NSURL URLWithString:urlStr];
    if (!url) {
        [self dispatchNetworkComplete:reqId status:0 headers:nil body:@"" error:@"invalid url"];
        return;
    }
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
    req.HTTPMethod = method;

    NSData *headersData = [headersJson dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *headers = headersData
        ? [NSJSONSerialization JSONObjectWithData:headersData options:0 error:nil]
        : nil;
    if ([headers isKindOfClass:[NSDictionary class]]) {
        for (NSString *k in headers) {
            id v = headers[k];
            if ([v isKindOfClass:[NSString class]]) [req setValue:v forHTTPHeaderField:k];
        }
    }
    if (body.length > 0) {
        req.HTTPBody = [body dataUsingEncoding:NSUTF8StringEncoding];
    }

    __weak HermesBridge *weakSelf = self;
    NSURLSessionDataTask *task = [[NSURLSession sharedSession]
        dataTaskWithRequest:req
          completionHandler:^(NSData *data, NSURLResponse *resp, NSError *err) {
        HermesBridge *strong = weakSelf;
        if (!strong) return;
        if (err) {
            [strong dispatchNetworkComplete:reqId status:0 headers:nil body:@"" error:err.localizedDescription];
            return;
        }
        NSHTTPURLResponse *http = (NSHTTPURLResponse *)resp;
        NSString *bodyStr = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";
        [strong dispatchNetworkComplete:reqId
                                 status:(http ? http.statusCode : 0)
                                headers:(http ? http.allHeaderFields : nil)
                                   body:bodyStr
                                  error:nil];
    }];
    [task resume];
}

- (void)dispatchNetworkComplete:(int32_t)reqId
                         status:(NSInteger)status
                        headers:(NSDictionary *)headers
                           body:(NSString *)body
                          error:(NSString *)error {
    NSString *headersJson = @"{}";
    if (headers) {
        NSData *d = [NSJSONSerialization dataWithJSONObject:headers options:0 error:nil];
        if (d) headersJson = [[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding] ?: @"{}";
    }
    NSString *errCopy = [error copy];
    NSString *bodyCopy = [body copy];

    [self dispatchToJS:^(Runtime &rt) {
        Value cb = rt.global().getProperty(rt, "__iex_networkComplete");
        if (!cb.isObject()) return;
        Object obj = cb.asObject(rt);
        if (!obj.isFunction(rt)) return;
        Value errVal = errCopy
            ? Value(jsi::String::createFromUtf8(rt, [errCopy UTF8String]))
            : Value::null();
        obj.asFunction(rt).call(rt,
            Value((double)reqId),
            Value((double)status),
            jsi::String::createFromUtf8(rt, [headersJson UTF8String]),
            jsi::String::createFromUtf8(rt, [bodyCopy UTF8String]),
            errVal);
    }];
}

#pragma mark - File system

- (void)dispatchFSResult:(int32_t)reqId result:(NSString *)result error:(NSString *)error {
    NSString *resultCopy = [result copy];
    NSString *errCopy = [error copy];
    [self dispatchToJS:^(Runtime &rt) {
        Value cb = rt.global().getProperty(rt, "__iex_fsComplete");
        if (!cb.isObject()) return;
        Object obj = cb.asObject(rt);
        if (!obj.isFunction(rt)) return;
        Value resVal = resultCopy
            ? Value(jsi::String::createFromUtf8(rt, [resultCopy UTF8String]))
            : Value::null();
        Value errVal = errCopy
            ? Value(jsi::String::createFromUtf8(rt, [errCopy UTF8String]))
            : Value::null();
        obj.asFunction(rt).call(rt, Value((double)reqId), resVal, errVal);
    }];
}

- (NSString *)fsAppDirsJSON {
    NSFileManager *fm = NSFileManager.defaultManager;
    NSString *bundleId = NSBundle.mainBundle.bundleIdentifier ?: @"com.iexpo.shell.mac";
    NSURL *appSupport = [[fm URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask] firstObject];
    NSURL *caches    = [[fm URLsForDirectory:NSCachesDirectory             inDomains:NSUserDomainMask] firstObject];
    NSURL *documents = [[fm URLsForDirectory:NSDocumentDirectory           inDomains:NSUserDomainMask] firstObject];

    // Namespace App Support and Caches by bundle id; create on demand.
    NSString *nsAppSupport = appSupport ? [appSupport.path stringByAppendingPathComponent:bundleId] : @"";
    NSString *nsCaches     = caches     ? [caches.path     stringByAppendingPathComponent:bundleId] : @"";
    if (nsAppSupport.length) [fm createDirectoryAtPath:nsAppSupport withIntermediateDirectories:YES attributes:nil error:nil];
    if (nsCaches.length)     [fm createDirectoryAtPath:nsCaches     withIntermediateDirectories:YES attributes:nil error:nil];

    NSDictionary *paths = @{
        @"appSupport": nsAppSupport,
        @"caches":     nsCaches,
        @"documents":  documents.path  ?: @"",
        @"home":       NSHomeDirectory() ?: @"",
        @"temp":       NSTemporaryDirectory() ?: @"",
        @"bundle":     NSBundle.mainBundle.bundlePath ?: @"",
    };
    NSData *d = [NSJSONSerialization dataWithJSONObject:paths options:0 error:nil];
    return d ? [[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding] : @"{}";
}

- (void)fsBackground:(int32_t)reqId work:(void (^)(NSString **outResult, NSString **outError))work {
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSString *result = nil, *error = nil;
        @try { work(&result, &error); }
        @catch (NSException *e) { error = e.reason ?: e.name; }
        [self dispatchFSResult:reqId result:result error:error];
    });
}

- (void)fsReadText:(int32_t)reqId path:(NSString *)path {
    [self fsBackground:reqId work:^(NSString **out, NSString **err) {
        NSError *e = nil;
        NSString *s = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&e];
        if (e) *err = e.localizedDescription; else *out = s ?: @"";
    }];
}

- (void)fsWriteText:(int32_t)reqId path:(NSString *)path content:(NSString *)content {
    [self fsBackground:reqId work:^(NSString **out, NSString **err) {
        NSError *e = nil;
        BOOL ok = [content writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:&e];
        if (!ok) *err = e.localizedDescription ?: @"write failed"; else *out = @"ok";
    }];
}

- (void)fsReadBytes:(int32_t)reqId path:(NSString *)path {
    [self fsBackground:reqId work:^(NSString **out, NSString **err) {
        NSError *e = nil;
        NSData *d = [NSData dataWithContentsOfFile:path options:0 error:&e];
        if (e || !d) { *err = e.localizedDescription ?: @"read failed"; return; }
        *out = [d base64EncodedStringWithOptions:0];
    }];
}

- (void)fsWriteBytes:(int32_t)reqId path:(NSString *)path base64:(NSString *)b64 {
    [self fsBackground:reqId work:^(NSString **out, NSString **err) {
        NSData *d = [[NSData alloc] initWithBase64EncodedString:b64 options:0];
        if (!d) { *err = @"invalid base64"; return; }
        NSError *e = nil;
        BOOL ok = [d writeToFile:path options:NSDataWritingAtomic error:&e];
        if (!ok) *err = e.localizedDescription ?: @"write failed"; else *out = @"ok";
    }];
}

- (void)fsExists:(int32_t)reqId path:(NSString *)path {
    [self fsBackground:reqId work:^(NSString **out, NSString **err) {
        *out = [NSFileManager.defaultManager fileExistsAtPath:path] ? @"true" : @"false";
    }];
}

- (void)fsStat:(int32_t)reqId path:(NSString *)path {
    [self fsBackground:reqId work:^(NSString **out, NSString **err) {
        BOOL isDir = NO;
        if (![NSFileManager.defaultManager fileExistsAtPath:path isDirectory:&isDir]) {
            *err = @"not found"; return;
        }
        NSError *e = nil;
        NSDictionary *attrs = [NSFileManager.defaultManager attributesOfItemAtPath:path error:&e];
        if (e) { *err = e.localizedDescription; return; }
        NSDate *mtime = attrs[NSFileModificationDate];
        NSDate *ctime = attrs[NSFileCreationDate];
        NSDictionary *result = @{
            @"size":        attrs[NSFileSize] ?: @0,
            @"isDirectory": @(isDir),
            @"mtime":       @((mtime ? mtime.timeIntervalSince1970 : 0) * 1000),
            @"ctime":       @((ctime ? ctime.timeIntervalSince1970 : 0) * 1000),
        };
        NSData *d = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
        *out = d ? [[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding] : @"{}";
    }];
}

- (void)fsList:(int32_t)reqId path:(NSString *)path {
    [self fsBackground:reqId work:^(NSString **out, NSString **err) {
        NSError *e = nil;
        NSArray *names = [NSFileManager.defaultManager contentsOfDirectoryAtPath:path error:&e];
        if (e) { *err = e.localizedDescription; return; }
        NSData *d = [NSJSONSerialization dataWithJSONObject:names options:0 error:nil];
        *out = d ? [[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding] : @"[]";
    }];
}

- (void)fsMkdir:(int32_t)reqId path:(NSString *)path recursive:(BOOL)recursive {
    [self fsBackground:reqId work:^(NSString **out, NSString **err) {
        NSError *e = nil;
        BOOL ok = [NSFileManager.defaultManager createDirectoryAtPath:path
                                          withIntermediateDirectories:recursive
                                                           attributes:nil error:&e];
        if (!ok) *err = e.localizedDescription ?: @"mkdir failed"; else *out = @"ok";
    }];
}

- (void)fsRemove:(int32_t)reqId path:(NSString *)path {
    [self fsBackground:reqId work:^(NSString **out, NSString **err) {
        NSError *e = nil;
        BOOL ok = [NSFileManager.defaultManager removeItemAtPath:path error:&e];
        if (!ok) *err = e.localizedDescription ?: @"remove failed"; else *out = @"ok";
    }];
}

- (void)fsMove:(int32_t)reqId from:(NSString *)from to:(NSString *)to {
    [self fsBackground:reqId work:^(NSString **out, NSString **err) {
        NSError *e = nil;
        BOOL ok = [NSFileManager.defaultManager moveItemAtPath:from toPath:to error:&e];
        if (!ok) *err = e.localizedDescription ?: @"move failed"; else *out = @"ok";
    }];
}

- (void)fsCopy:(int32_t)reqId from:(NSString *)from to:(NSString *)to {
    [self fsBackground:reqId work:^(NSString **out, NSString **err) {
        NSError *e = nil;
        BOOL ok = [NSFileManager.defaultManager copyItemAtPath:from toPath:to error:&e];
        if (!ok) *err = e.localizedDescription ?: @"copy failed"; else *out = @"ok";
    }];
}

- (void)fsOpenPanel:(int32_t)reqId opts:(NSDictionary *)opts {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSOpenPanel *panel = [NSOpenPanel openPanel];
        panel.allowsMultipleSelection = [opts[@"allowMultiple"] boolValue];
        panel.canChooseDirectories    = [opts[@"canChooseDirectories"] boolValue];
        panel.canChooseFiles          = opts[@"canChooseFiles"]
            ? [opts[@"canChooseFiles"] boolValue]
            : !panel.canChooseDirectories;
        if ([opts[@"message"] isKindOfClass:[NSString class]]) panel.message = opts[@"message"];
        if ([opts[@"allowedTypes"] isKindOfClass:[NSArray class]]) panel.allowedFileTypes = opts[@"allowedTypes"];
        NSModalResponse resp = [panel runModal];
        if (resp != NSModalResponseOK) {
            [self dispatchFSResult:reqId result:nil error:nil];
            return;
        }
        NSMutableArray<NSString *> *paths = [NSMutableArray new];
        for (NSURL *u in panel.URLs) [paths addObject:u.path];
        NSData *d = [NSJSONSerialization dataWithJSONObject:paths options:0 error:nil];
        NSString *out = d ? [[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding] : @"[]";
        [self dispatchFSResult:reqId result:out error:nil];
    });
}

- (void)fsSavePanel:(int32_t)reqId opts:(NSDictionary *)opts {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSSavePanel *panel = [NSSavePanel savePanel];
        if ([opts[@"defaultName"] isKindOfClass:[NSString class]])  panel.nameFieldStringValue = opts[@"defaultName"];
        if ([opts[@"message"] isKindOfClass:[NSString class]])      panel.message = opts[@"message"];
        if ([opts[@"allowedTypes"] isKindOfClass:[NSArray class]])  panel.allowedFileTypes = opts[@"allowedTypes"];
        NSModalResponse resp = [panel runModal];
        if (resp != NSModalResponseOK) {
            [self dispatchFSResult:reqId result:nil error:nil];
            return;
        }
        [self dispatchFSResult:reqId result:panel.URL.path error:nil];
    });
}

- (void)fsReveal:(NSString *)path {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!path.length) return;
        NSURL *url = [NSURL fileURLWithPath:path];
        [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[url]];
    });
}

#pragma mark - NSApplication (dock icon / badge / attention)

- (void)appSetIcon:(NSDictionary *)opts {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!opts || ![opts isKindOfClass:[NSDictionary class]]) {
            NSApp.applicationIconImage = nil;
            return;
        }
        if ([opts[@"path"] isKindOfClass:[NSString class]]) {
            NSString *path = opts[@"path"];
            if (path.length) {
                NSImage *img = [[NSImage alloc] initWithContentsOfFile:path];
                if (img) NSApp.applicationIconImage = img;
            }
            return;
        }
        if ([opts[@"symbol"] isKindOfClass:[NSString class]]) {
            if (@available(macOS 11.0, *)) {
                NSImage *base = [NSImage imageWithSystemSymbolName:opts[@"symbol"] accessibilityDescription:nil];
                if (!base) return;
                CGFloat size = [opts[@"size"] doubleValue];
                if (size <= 0) size = 128;
                NSString *weight = [opts[@"weight"] isKindOfClass:[NSString class]] ? opts[@"weight"] : @"regular";
                NSImageSymbolConfiguration *cfg =
                    [NSImageSymbolConfiguration configurationWithPointSize:size
                                                                    weight:iexFontWeightForName(weight)
                                                                     scale:NSImageSymbolScaleLarge];
                NSImage *cfgd = [base imageWithSymbolConfiguration:cfg];
                if (cfgd) NSApp.applicationIconImage = cfgd;
            }
        }
    });
}

- (void)appSetBadge:(NSString *)text {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSApp.dockTile.badgeLabel = text.length ? text : nil;
    });
}

- (void)appRequestAttention:(BOOL)critical {
    dispatch_async(dispatch_get_main_queue(), ^{
        [NSApp requestUserAttention:critical ? NSCriticalRequest : NSInformationalRequest];
    });
}

- (void)appActivate {
    dispatch_async(dispatch_get_main_queue(), ^{
        [NSApp activateIgnoringOtherApps:YES];
        NSWindow *w = NSApp.mainWindow ?: NSApp.windows.firstObject;
        if (w) [w makeKeyAndOrderFront:nil];
    });
}

- (void)appQuit {
    dispatch_async(dispatch_get_main_queue(), ^{ [NSApp terminate:nil]; });
}

#pragma mark - Notifications (UNUserNotificationCenter)

- (void)dispatchNotifResult:(int32_t)reqId result:(NSString *)result error:(NSString *)error {
    NSString *resultCopy = [result copy];
    NSString *errCopy = [error copy];
    [self dispatchToJS:^(Runtime &rt) {
        Value cb = rt.global().getProperty(rt, "__iex_notifComplete");
        if (!cb.isObject()) return;
        Object obj = cb.asObject(rt);
        if (!obj.isFunction(rt)) return;
        Value resVal = resultCopy ? Value(jsi::String::createFromUtf8(rt, resultCopy.UTF8String)) : Value::null();
        Value errVal = errCopy ? Value(jsi::String::createFromUtf8(rt, errCopy.UTF8String)) : Value::null();
        obj.asFunction(rt).call(rt, Value((double)reqId), resVal, errVal);
    }];
}

- (void)notifRequestAuth:(int32_t)reqId {
    UNAuthorizationOptions opts = UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge;
    [UNUserNotificationCenter.currentNotificationCenter
        requestAuthorizationWithOptions:opts
                      completionHandler:^(BOOL granted, NSError *err) {
            if (err) {
                [self dispatchNotifResult:reqId result:@"denied" error:err.localizedDescription];
                return;
            }
            [self dispatchNotifResult:reqId result:granted ? @"granted" : @"denied" error:nil];
        }];
}

- (void)notifSchedule:(int32_t)reqId opts:(NSDictionary *)opts {
    if (![opts isKindOfClass:[NSDictionary class]]) {
        [self dispatchNotifResult:reqId result:nil error:@"invalid opts"];
        return;
    }
    NSString *idStr = opts[@"id"];
    if (![idStr isKindOfClass:[NSString class]] || idStr.length == 0) {
        idStr = NSUUID.UUID.UUIDString;
    }
    UNMutableNotificationContent *content = [UNMutableNotificationContent new];
    if ([opts[@"title"] isKindOfClass:[NSString class]])    content.title = opts[@"title"];
    if ([opts[@"body"] isKindOfClass:[NSString class]])     content.body = opts[@"body"];
    if ([opts[@"subtitle"] isKindOfClass:[NSString class]]) content.subtitle = opts[@"subtitle"];
    BOOL withSound = [opts[@"sound"] isKindOfClass:[NSString class]]
        ? ![opts[@"sound"] isEqualToString:@"none"]
        : YES;
    if (withSound) content.sound = UNNotificationSound.defaultSound;
    if ([opts[@"userInfo"] isKindOfClass:[NSDictionary class]]) content.userInfo = opts[@"userInfo"];

    UNNotificationTrigger *trigger = nil;
    if ([opts[@"delay"] isKindOfClass:[NSNumber class]]) {
        NSTimeInterval delay = MAX(1.0, [opts[@"delay"] doubleValue]);
        trigger = [UNTimeIntervalNotificationTrigger triggerWithTimeInterval:delay repeats:NO];
    } else if ([opts[@"fireDate"] isKindOfClass:[NSNumber class]]) {
        NSDate *date = [NSDate dateWithTimeIntervalSince1970:[opts[@"fireDate"] doubleValue] / 1000.0];
        NSDateComponents *comps = [NSCalendar.currentCalendar
            components:NSCalendarUnitYear|NSCalendarUnitMonth|NSCalendarUnitDay|NSCalendarUnitHour|NSCalendarUnitMinute|NSCalendarUnitSecond
              fromDate:date];
        trigger = [UNCalendarNotificationTrigger triggerWithDateMatchingComponents:comps repeats:NO];
    }

    UNNotificationRequest *req = [UNNotificationRequest requestWithIdentifier:idStr content:content trigger:trigger];
    NSString *idCopy = [idStr copy];
    [UNUserNotificationCenter.currentNotificationCenter
        addNotificationRequest:req
         withCompletionHandler:^(NSError *err) {
            if (err) [self dispatchNotifResult:reqId result:nil error:err.localizedDescription];
            else     [self dispatchNotifResult:reqId result:idCopy error:nil];
        }];
}

- (void)notifCancel:(NSString *)idStr {
    if (!idStr.length) return;
    [UNUserNotificationCenter.currentNotificationCenter
        removePendingNotificationRequestsWithIdentifiers:@[idStr]];
    [UNUserNotificationCenter.currentNotificationCenter
        removeDeliveredNotificationsWithIdentifiers:@[idStr]];
}

- (void)notifCancelAll {
    [UNUserNotificationCenter.currentNotificationCenter removeAllPendingNotificationRequests];
    [UNUserNotificationCenter.currentNotificationCenter removeAllDeliveredNotifications];
}

- (void)notifListPending:(int32_t)reqId {
    [UNUserNotificationCenter.currentNotificationCenter
        getPendingNotificationRequestsWithCompletionHandler:^(NSArray<UNNotificationRequest *> *requests) {
            NSMutableArray *out = [NSMutableArray new];
            for (UNNotificationRequest *r in requests) {
                NSMutableDictionary *d = [@{
                    @"id":       r.identifier ?: @"",
                    @"title":    r.content.title ?: @"",
                    @"body":     r.content.body ?: @"",
                    @"subtitle": r.content.subtitle ?: @"",
                } mutableCopy];
                if (r.content.userInfo) d[@"userInfo"] = r.content.userInfo;
                [out addObject:d];
            }
            NSData *data = [NSJSONSerialization dataWithJSONObject:out options:0 error:nil];
            NSString *json = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"[]";
            [self dispatchNotifResult:reqId result:json error:nil];
        }];
}

- (void)dispatchNotifTapForId:(NSString *)idStr userInfo:(NSDictionary *)userInfo {
    if (!_notifTapCallback) return;
    NSString *userInfoJson = @"{}";
    if (userInfo) {
        NSData *d = [NSJSONSerialization dataWithJSONObject:userInfo options:0 error:nil];
        if (d) userInfoJson = [[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding] ?: @"{}";
    }
    NSString *idCopy = [idStr copy];
    NSString *uiCopy = [userInfoJson copy];
    auto cb = _notifTapCallback;
    [self dispatchToJS:^(Runtime &rt) {
        cb->call(rt,
            jsi::String::createFromUtf8(rt, idCopy.UTF8String),
            jsi::String::createFromUtf8(rt, uiCopy.UTF8String));
    }];
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler {
    completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionSound);
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler {
    [self dispatchNotifTapForId:response.notification.request.identifier
                       userInfo:response.notification.request.content.userInfo];
    completionHandler();
}

#pragma mark - NSStatusItem (menu bar)

- (void)applyStatusItem:(NSStatusItem *)si opts:(NSDictionary *)opts {
    if (![opts isKindOfClass:[NSDictionary class]]) return;
    if ([opts[@"systemImage"] isKindOfClass:[NSString class]] && [opts[@"systemImage"] length] > 0) {
        if (@available(macOS 11.0, *)) {
            si.button.image = [NSImage imageWithSystemSymbolName:opts[@"systemImage"]
                                          accessibilityDescription:opts[@"tooltip"]];
        }
    } else if ([opts[@"image"] isKindOfClass:[NSString class]] && [opts[@"image"] length] > 0) {
        si.button.image = [[NSImage alloc] initWithContentsOfFile:opts[@"image"]];
    } else if (opts[@"image"] == NSNull.null || opts[@"systemImage"] == NSNull.null) {
        si.button.image = nil;
    }
    if ([opts[@"title"] isKindOfClass:[NSString class]]) si.button.title = opts[@"title"];
    if ([opts[@"tooltip"] isKindOfClass:[NSString class]]) si.button.toolTip = opts[@"tooltip"];
}

- (int32_t)statusBarAdd:(NSDictionary *)opts {
    int32_t itemId = _nextStatusItemId.fetch_add(1);
    dispatch_async(dispatch_get_main_queue(), ^{
        NSStatusItem *si = [NSStatusBar.systemStatusBar statusItemWithLength:NSVariableStatusItemLength];
        si.button.tag = itemId;
        si.button.target = self;
        si.button.action = @selector(_statusBarPressed:);
        [self applyStatusItem:si opts:opts];
        self->_statusItems[@(itemId)] = si;
    });
    return itemId;
}

- (void)statusBarUpdate:(int32_t)itemId opts:(NSDictionary *)opts {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSStatusItem *si = self->_statusItems[@(itemId)];
        if (!si) return;
        [self applyStatusItem:si opts:opts];
    });
}

- (void)statusBarRemove:(int32_t)itemId {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSStatusItem *si = self->_statusItems[@(itemId)];
        if (!si) return;
        [NSStatusBar.systemStatusBar removeStatusItem:si];
        [self->_statusItems removeObjectForKey:@(itemId)];
        self->_statusItemMenuDispatch.erase(itemId);
        self->_statusItemPress.erase(itemId);
    });
}

- (void)statusBarSetMenu:(int32_t)itemId
                   items:(NSArray *)items
                dispatch:(std::shared_ptr<Function>)fn {
    if (fn) _statusItemMenuDispatch[itemId] = fn;
    else    _statusItemMenuDispatch.erase(itemId);

    dispatch_async(dispatch_get_main_queue(), ^{
        NSStatusItem *si = self->_statusItems[@(itemId)];
        if (!si) return;
        if (![items isKindOfClass:[NSArray class]] || items.count == 0) {
            si.menu = nil;
            return;
        }
        NSMenu *menu = [NSMenu new];
        for (NSDictionary *spec in items) {
            if (![spec isKindOfClass:[NSDictionary class]]) continue;
            if ([spec[@"separator"] boolValue]) {
                [menu addItem:NSMenuItem.separatorItem];
                continue;
            }
            NSString *label = [spec[@"label"] isKindOfClass:[NSString class]] ? spec[@"label"] : @"";
            NSString *shortcut = [spec[@"shortcut"] isKindOfClass:[NSString class]] ? spec[@"shortcut"] : @"";
            NSString *entryId = [spec[@"id"] isKindOfClass:[NSString class]] ? spec[@"id"] : label;
            NSMenuItem *mi = [[NSMenuItem alloc] initWithTitle:label
                                                        action:@selector(_statusBarMenuItemTriggered:)
                                                 keyEquivalent:shortcut];
            mi.target = self;
            mi.identifier = entryId;
            mi.tag = itemId;
            if ([spec[@"disabled"] boolValue]) mi.enabled = NO;
            [menu addItem:mi];
        }
        si.menu = menu;
    });
}

- (void)statusBarSetPress:(int32_t)itemId callback:(std::shared_ptr<Function>)fn {
    if (fn) _statusItemPress[itemId] = fn;
    else    _statusItemPress.erase(itemId);
}

- (void)_statusBarPressed:(NSStatusBarButton *)sender {
    int32_t itemId = (int32_t)sender.tag;
    auto it = _statusItemPress.find(itemId);
    if (it == _statusItemPress.end()) return;
    auto cb = it->second;
    [self dispatchToJS:^(Runtime &rt) { cb->call(rt); }];
}

- (void)_statusBarMenuItemTriggered:(NSMenuItem *)sender {
    int32_t itemId = (int32_t)sender.tag;
    auto it = _statusItemMenuDispatch.find(itemId);
    if (it == _statusItemMenuDispatch.end()) return;
    auto cb = it->second;
    NSString *entryId = sender.identifier ?: @"";
    NSString *idCopy = [entryId copy];
    [self dispatchToJS:^(Runtime &rt) {
        cb->call(rt, jsi::String::createFromUtf8(rt, idCopy.UTF8String));
    }];
}

#pragma mark - Animated (native driver)

- (void)applyAnimProp:(int32_t)tag property:(const std::string &)prop value:(double)val {
    NSView *v = _views[@(tag)];
    if (!v) return;
    if (prop == "opacity") {
        v.alphaValue = val;
        return;
    }
    iex::AnimTransform &t = gAnimTransforms[tag];
    if      (prop == "translateX") t.tx = val;
    else if (prop == "translateY") t.ty = val;
    else if (prop == "scale")      t.scale = val;
    else if (prop == "rotate")     t.rotate = val;
    else return;
    v.wantsLayer = YES;
    CGAffineTransform xf = CGAffineTransformIdentity;
    xf = CGAffineTransformTranslate(xf, t.tx, t.ty);
    xf = CGAffineTransformScale(xf, t.scale, t.scale);
    xf = CGAffineTransformRotate(xf, t.rotate);
    v.layer.affineTransform = xf;
}

- (void)animCreateValue:(int32_t)valueId initial:(double)initial {
    _animValues[valueId] = initial;
}

- (void)animSetValue:(int32_t)valueId value:(double)val {
    _animValues[valueId] = val;
    auto it = _animBindings.find(valueId);
    if (it == _animBindings.end()) return;
    for (auto &b : it->second) [self applyAnimProp:b.first property:b.second value:val];
}

- (void)animBindView:(int32_t)valueId tag:(int32_t)tag property:(NSString *)property {
    auto &vec = _animBindings[valueId];
    std::string p = property.UTF8String;
    for (auto &b : vec) if (b.first == tag && b.second == p) return;
    vec.emplace_back(tag, p);
    auto vit = _animValues.find(valueId);
    if (vit != _animValues.end()) [self applyAnimProp:tag property:p value:vit->second];
}

- (void)animUnbindView:(int32_t)valueId tag:(int32_t)tag property:(NSString *)property {
    auto it = _animBindings.find(valueId);
    if (it == _animBindings.end()) return;
    std::string p = property.UTF8String;
    auto &vec = it->second;
    for (auto i = vec.begin(); i != vec.end(); ) {
        if (i->first == tag && i->second == p) i = vec.erase(i);
        else ++i;
    }
    if (vec.empty()) _animBindings.erase(it);
}

- (void)startAnimTimerIfNeeded {
    if (_animTimer) return;
    _animTimer = [NSTimer scheduledTimerWithTimeInterval:1.0/60.0
                                                  target:self
                                                selector:@selector(_animTick:)
                                                userInfo:nil
                                                 repeats:YES];
}

- (void)stopAnimTimer {
    [_animTimer invalidate];
    _animTimer = nil;
}

- (void)animTimingStart:(int32_t)animId
                valueId:(int32_t)valueId
                toValue:(double)toValue
               duration:(double)duration
           completionId:(int32_t)completionId {
    iex::AnimState a;
    a.valueId      = valueId;
    a.startTime    = NSDate.timeIntervalSinceReferenceDate;
    a.startValue   = _animValues.count(valueId) ? _animValues[valueId] : 0;
    a.toValue      = toValue;
    a.duration     = MAX(0.0, duration / 1000.0);
    a.completionId = completionId;
    gAnimations[animId] = a;
    [self startAnimTimerIfNeeded];
}

- (void)animStop:(int32_t)animId {
    auto it = gAnimations.find(animId);
    if (it == gAnimations.end()) return;
    int32_t completionId = it->second.completionId;
    gAnimations.erase(it);
    if (completionId != 0) [self dispatchAnimComplete:completionId finished:NO];
    if (gAnimations.empty()) [self stopAnimTimer];
}

- (void)dispatchAnimComplete:(int32_t)completionId finished:(BOOL)finished {
    [self dispatchToJS:^(Runtime &rt) {
        Value cb = rt.global().getProperty(rt, "__iex_animComplete");
        if (!cb.isObject()) return;
        Object obj = cb.asObject(rt);
        if (!obj.isFunction(rt)) return;
        obj.asFunction(rt).call(rt, Value((double)completionId), Value((bool)finished));
    }];
}

- (void)_animTick:(NSTimer *)t {
    NSTimeInterval now = NSDate.timeIntervalSinceReferenceDate;
    std::vector<std::pair<int32_t, int32_t>> finished;  // (animId, completionId)
    for (auto &kv : gAnimations) {
        iex::AnimState &a = kv.second;
        double elapsed = now - a.startTime;
        double newVal;
        bool done = false;
        if (a.duration <= 0 || elapsed >= a.duration) {
            newVal = a.toValue;
            done = true;
        } else {
            double t01 = elapsed / a.duration;
            double eased = 1.0 - pow(1.0 - t01, 3.0);  // ease-out cubic
            newVal = a.startValue + (a.toValue - a.startValue) * eased;
        }
        _animValues[a.valueId] = newVal;
        auto bit = _animBindings.find(a.valueId);
        if (bit != _animBindings.end()) {
            for (auto &b : bit->second) [self applyAnimProp:b.first property:b.second value:newVal];
        }
        if (done) finished.emplace_back(kv.first, a.completionId);
    }
    for (auto &p : finished) {
        gAnimations.erase(p.first);
        if (p.second != 0) [self dispatchAnimComplete:p.second finished:YES];
    }
    if (gAnimations.empty()) [self stopAnimTimer];
}

- (void)dispatchFileDropForTag:(int32_t)tag paths:(NSArray<NSString *> *)paths {
    NSData *d = [NSJSONSerialization dataWithJSONObject:paths options:0 error:nil];
    NSString *json = d ? [[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding] : @"[]";
    [self invokeCallbackForTag:tag event:@"onFileDrop" noArgs:NO withBool:NO withString:json];
}

#pragma mark - WebSocket

- (void)wsConnectId:(int32_t)wsId url:(NSString *)urlStr {
    NSURL *url = [NSURL URLWithString:urlStr];
    if (!url) {
        [self dispatchWsEvent:wsId event:@"error" data:@"invalid url"];
        return;
    }
    NSURLSessionWebSocketTask *task = [[NSURLSession sharedSession] webSocketTaskWithURL:url];
    _wsTasks[@(wsId)] = task;
    [task resume];
    [self dispatchWsEvent:wsId event:@"open" data:@""];
    [self wsListenId:wsId task:task];
}

- (void)wsListenId:(int32_t)wsId task:(NSURLSessionWebSocketTask *)task {
    __weak HermesBridge *weakSelf = self;
    [task receiveMessageWithCompletionHandler:^(NSURLSessionWebSocketMessage *msg, NSError *err) {
        HermesBridge *strong = weakSelf;
        if (!strong) return;
        if (err) {
            [strong dispatchWsEvent:wsId event:@"error" data:err.localizedDescription];
            [strong dispatchWsEvent:wsId event:@"close" data:@""];
            [strong->_wsTasks removeObjectForKey:@(wsId)];
            return;
        }
        NSString *text = msg.string;
        if (!text && msg.data) {
            text = [[NSString alloc] initWithData:msg.data encoding:NSUTF8StringEncoding] ?: @"";
        }
        [strong dispatchWsEvent:wsId event:@"message" data:text ?: @""];
        NSURLSessionWebSocketTask *next = strong->_wsTasks[@(wsId)];
        if (next) [strong wsListenId:wsId task:next];
    }];
}

- (void)wsSendId:(int32_t)wsId data:(NSString *)data {
    NSURLSessionWebSocketTask *task = _wsTasks[@(wsId)];
    if (!task) return;
    NSURLSessionWebSocketMessage *msg =
        [[NSURLSessionWebSocketMessage alloc] initWithString:data];
    [task sendMessage:msg completionHandler:^(NSError *err) {
        if (err) NSLog(@"[iex] ws send error: %@", err.localizedDescription);
    }];
}

- (void)wsCloseId:(int32_t)wsId {
    NSURLSessionWebSocketTask *task = _wsTasks[@(wsId)];
    if (!task) return;
    [task cancelWithCloseCode:NSURLSessionWebSocketCloseCodeNormalClosure reason:nil];
    [_wsTasks removeObjectForKey:@(wsId)];
    [self dispatchWsEvent:wsId event:@"close" data:@""];
}

- (void)dispatchWsEvent:(int32_t)wsId event:(NSString *)event data:(NSString *)data {
    NSString *eventCopy = [event copy];
    NSString *dataCopy = [data copy] ?: @"";
    [self dispatchToJS:^(Runtime &rt) {
        Value cb = rt.global().getProperty(rt, "__iex_wsEvent");
        if (!cb.isObject()) return;
        Object obj = cb.asObject(rt);
        if (!obj.isFunction(rt)) return;
        obj.asFunction(rt).call(rt,
            Value((double)wsId),
            jsi::String::createFromUtf8(rt, [eventCopy UTF8String]),
            jsi::String::createFromUtf8(rt, [dataCopy UTF8String]));
    }];
}

#pragma mark -

- (void)applyWindowConfigJSON:(NSString *)json {
    NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *cfg = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    if (![cfg isKindOfClass:[NSDictionary class]]) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *w = NSApp.mainWindow ?: NSApp.windows.firstObject;
        if (!w) return;
        if ([cfg[@"title"] isKindOfClass:[NSString class]]) w.title = cfg[@"title"];
        if ([cfg[@"size"] isKindOfClass:[NSDictionary class]]) {
            NSDictionary *s = cfg[@"size"];
            CGFloat ww = [s[@"width"] doubleValue];
            CGFloat hh = [s[@"height"] doubleValue];
            if (ww > 0 && hh > 0) {
                NSRect f = w.frame;
                BOOL animated = [cfg[@"animated"] boolValue];
                f.size = NSMakeSize(ww, hh);
                [w setFrame:f display:YES animate:animated];
            }
        }
        if ([cfg[@"minSize"] isKindOfClass:[NSDictionary class]]) {
            NSDictionary *s = cfg[@"minSize"];
            w.minSize = NSMakeSize([s[@"width"] doubleValue], [s[@"height"] doubleValue]);
        }
        if ([cfg[@"titleBarStyle"] isKindOfClass:[NSString class]]) {
            NSString *s = cfg[@"titleBarStyle"];
            if ([s isEqualToString:@"hidden"]) {
                w.styleMask = w.styleMask | NSWindowStyleMaskFullSizeContentView;
                w.titlebarAppearsTransparent = YES;
                w.titleVisibility = NSWindowTitleHidden;
            } else if ([s isEqualToString:@"transparent"]) {
                w.styleMask = w.styleMask | NSWindowStyleMaskFullSizeContentView;
                w.titlebarAppearsTransparent = YES;
                w.titleVisibility = NSWindowTitleVisible;
            } else {
                w.styleMask = w.styleMask & ~NSWindowStyleMaskFullSizeContentView;
                w.titlebarAppearsTransparent = NO;
                w.titleVisibility = NSWindowTitleVisible;
            }
        }
        if ([cfg[@"backgroundColor"] isKindOfClass:[NSString class]]) {
            NSString *s = cfg[@"backgroundColor"];
            w.backgroundColor = [self colorFromString:s];
        }
        if ([cfg[@"movableByBackground"] isKindOfClass:[NSNumber class]]) {
            w.movableByWindowBackground = [cfg[@"movableByBackground"] boolValue];
        }
        if ([cfg[@"center"] isKindOfClass:[NSNumber class]] && [cfg[@"center"] boolValue]) {
            [w center];
        }
    });
}

- (void)dispatchWindowSize:(CGSize)size {
    if (!_windowResizeCallback) return;
    Runtime &rt = *_runtime;
    try {
        _windowResizeCallback->call(rt, (double)size.width, (double)size.height);
    } catch (const JSError &e) {
        NSLog(@"[iex] windowResize cb error: %s", e.getMessage().c_str());
    } catch (const std::exception &e) {
        NSLog(@"[iex] windowResize cb error: %s", e.what());
    }
}

- (void)resetForReload {
    for (NSTimer *t in _timers.allValues) {
        [t invalidate];
    }
    [_timers removeAllObjects];

    for (NSURLSessionWebSocketTask *t in _wsTasks.allValues) {
        [t cancelWithCloseCode:NSURLSessionWebSocketCloseCodeGoingAway reason:nil];
    }
    [_wsTasks removeAllObjects];

    // Drop every JSI ref before tearing down the runtime — shared_ptr<Function>
    // holds handles into _runtime which become dangling once it's reset.
    _callbacks.clear();
    _appStateCallback.reset();
    _windowResizeCallback.reset();
    _toolbarDispatch.reset();
    if (_toolbarHandler) _toolbarHandler(@{ @"items": @[] });
    _colorSchemeCallback.reset();
    _newWindowCallback.reset();
    _closeWindowCallback.reset();
    _notifTapCallback.reset();
    _statusItemMenuDispatch.clear();
    _statusItemPress.clear();
    for (NSStatusItem *si in _statusItems.allValues) {
        [NSStatusBar.systemStatusBar removeStatusItem:si];
    }
    [_statusItems removeAllObjects];

    [self stopAnimTimer];
    _animValues.clear();
    _animBindings.clear();
    gAnimations.clear();
    gAnimTransforms.clear();

    // Custom menu items live across the JS runtime boundary; tear them down so
    // the new bundle can register fresh ones on its setup.
    for (NSMenuItem *item in _customMenuItems.allValues) {
        [item.menu removeItem:item];
    }
    [_customMenuItems removeAllObjects];
    _menuCallbacks.clear();

    NSMutableArray<NSNumber *> *toRemove = [NSMutableArray new];
    for (NSNumber *k in _views) {
        if (k.intValue >= 100) [toRemove addObject:k];
    }
    [_views removeObjectsForKeys:toRemove];
    [_outerViews removeObjectsForKeys:toRemove];

    for (auto it = _nodes.begin(); it != _nodes.end(); ) {
        if (it->first >= 100) {
            _nodeTags.erase(it->second);
            YGNodeFree(it->second);
            it = _nodes.erase(it);
        } else {
            while (YGNodeGetChildCount(it->second) > 0) {
                YGNodeRemoveChild(it->second, YGNodeGetChild(it->second, 0));
            }
            ++it;
        }
    }

    // Detach JS-mounted children from every root container (primary + every
    // secondary window). The native NSView for tag 1..99 stays — it's owned
    // by the AppDelegate / window — but its JS-driven subtree is gone.
    for (NSNumber *k in _views) {
        int32_t t = k.intValue;
        if (t > 0 && t < 100) {
            NSView *root = _views[k];
            for (NSView *child in [root.subviews copy]) {
                [child removeFromSuperview];
            }
        }
    }

    // Tear down and rebuild the JS engine — fresh module registry, no stale
    // singletons, no leaked listeners.
    _runtime.reset();
    [self bootstrapRuntime];
}

- (NSView *)nativeCreateViewOfType:(NSString *)type tag:(int32_t)tag {
    YGNodeRef node = YGNodeNewWithConfig(_yogaConfig);
    _nodes[tag] = node;
    _nodeTags[node] = tag;

    NSView *v = nil;
    if ([type isEqualToString:@"iex_view"]) {
        NSFlippedView *fv = [[NSFlippedView alloc] init];
        fv.wantsLayer = YES;
        fv.iexActiveOpacity = 0.2;
        v = fv;
    }
    else if ([type isEqualToString:@"iex_text"]) {
        NSTextField *t = [NSTextField labelWithString:@""];
        t.font = [NSFont systemFontOfSize:14.0];
        t.lineBreakMode = NSLineBreakByWordWrapping;
        t.maximumNumberOfLines = 0;
        t.translatesAutoresizingMaskIntoConstraints = YES;
        YGNodeSetContext(node, (__bridge void *)t);
        YGNodeSetMeasureFunc(node, measureTextNode);
        v = t;
    }
    else if ([type isEqualToString:@"iex_text_input"] ||
             [type isEqualToString:@"iex_text_input_secure"] ||
             [type isEqualToString:@"iex_text_input_multi"]) {
        BOOL secure = [type isEqualToString:@"iex_text_input_secure"];
        BOOL multiline = [type isEqualToString:@"iex_text_input_multi"];
        NSTextField *tf = secure ? [[NSSecureTextField alloc] init] : [[NSTextField alloc] init];
        tf.bezeled = YES;
        tf.bezelStyle = NSTextFieldRoundedBezel;
        tf.editable = YES;
        tf.font = [NSFont systemFontOfSize:14.0];
        tf.delegate = self;
        tf.translatesAutoresizingMaskIntoConstraints = YES;
        if (multiline) {
            tf.usesSingleLineMode = NO;
            tf.cell.wraps = YES;
            tf.cell.scrollable = NO;
            tf.lineBreakMode = NSLineBreakByWordWrapping;
            tf.maximumNumberOfLines = 0;
        }
        YGNodeSetContext(node, (__bridge void *)tf);
        YGNodeSetMeasureFunc(node, measureControlNode);
        v = tf;
    }
    else if ([type isEqualToString:@"iex_switch"]) {
        NSSwitch *sw = [[NSSwitch alloc] init];
        sw.target = self;
        sw.action = @selector(handleSwitchChange:);
        sw.translatesAutoresizingMaskIntoConstraints = YES;
        YGNodeSetContext(node, (__bridge void *)sw);
        YGNodeSetMeasureFunc(node, measureControlNode);
        v = sw;
    }
    else if ([type isEqualToString:@"iex_sf_symbol"]) {
        IEXSFSymbolView *iv = [[IEXSFSymbolView alloc] init];
        iv.translatesAutoresizingMaskIntoConstraints = YES;
        YGNodeSetContext(node, (__bridge void *)iv);
        YGNodeSetMeasureFunc(node, measureControlNode);
        v = iv;
    }
    else if ([type isEqualToString:@"iex_vibrancy"]) {
        IEXFlippedVibrancyView *vev = [[IEXFlippedVibrancyView alloc] init];
        vev.material = NSVisualEffectMaterialSidebar;
        vev.blendingMode = NSVisualEffectBlendingModeBehindWindow;
        vev.state = NSVisualEffectStateActive;
        v = vev;
    }
    else if ([type isEqualToString:@"iex_image"]) {
        NSImageView *iv = [[NSImageView alloc] init];
        iv.imageScaling = NSImageScaleProportionallyUpOrDown;
        iv.imageAlignment = NSImageAlignCenter;
        iv.translatesAutoresizingMaskIntoConstraints = YES;
        v = iv;
    }
    else if ([type isEqualToString:@"iex_scroll"]) {
        NSScrollView *scroll = [[NSScrollView alloc] init];
        scroll.hasVerticalScroller = YES;
        scroll.hasHorizontalScroller = NO;
        scroll.autohidesScrollers = YES;
        scroll.drawsBackground = NO;
        scroll.borderType = NSNoBorder;
        scroll.translatesAutoresizingMaskIntoConstraints = YES;

        NSFlippedView *content = [[NSFlippedView alloc] init];
        content.translatesAutoresizingMaskIntoConstraints = YES;
        scroll.documentView = content;

        objc_setAssociatedObject(content, "iex_tag", @(tag), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        objc_setAssociatedObject(scroll, "iex_outer_tag", @(tag), OBJC_ASSOCIATION_RETAIN_NONATOMIC);

        // Observe scroll for onScroll dispatch (throttled to one frame).
        scroll.contentView.postsBoundsChangedNotifications = YES;
        [[NSNotificationCenter defaultCenter]
            addObserver:self
               selector:@selector(handleScrollBoundsChanged:)
                   name:NSViewBoundsDidChangeNotification
                 object:scroll.contentView];
        objc_setAssociatedObject(scroll.contentView, "iex_outer_tag", @(tag), OBJC_ASSOCIATION_RETAIN_NONATOMIC);

        _outerViews[@(tag)] = scroll;
        v = content;
    }
    else {
        v = [[NSFlippedView alloc] init];
    }

    objc_setAssociatedObject(v, "iex_tag", @(tag), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    return v;
}

- (YGNodeRef)nodeForTag:(int32_t)tag {
    auto it = _nodes.find(tag);
    return (it != _nodes.end()) ? it->second : nullptr;
}

- (NSString *)stringFrom:(id)value {
    if ([value isKindOfClass:[NSString class]]) return value;
    if (!value) return @"";
    return [value description];
}

- (CGFloat)doubleFrom:(id)value {
    if ([value isKindOfClass:[NSNumber class]]) return [value doubleValue];
    if ([value isKindOfClass:[NSString class]]) return [value doubleValue];
    return 0;
}

- (BOOL)boolFrom:(id)value {
    if ([value isKindOfClass:[NSNumber class]]) return [value boolValue];
    if ([value isKindOfClass:[NSString class]]) {
        return ![value isEqualToString:@"false"] && [value length] > 0;
    }
    return NO;
}

- (NSColor *)colorFromString:(NSString *)s {
    if ([s hasPrefix:@"#"] && s.length == 7) {
        unsigned int r = 0, g = 0, b = 0;
        sscanf([s UTF8String], "#%02x%02x%02x", &r, &g, &b);
        return [NSColor colorWithRed:r/255.0 green:g/255.0 blue:b/255.0 alpha:1.0];
    }
    if ([s hasPrefix:@"#"] && s.length == 9) {
        unsigned int r = 0, g = 0, b = 0, a = 0;
        sscanf([s UTF8String], "#%02x%02x%02x%02x", &r, &g, &b, &a);
        return [NSColor colorWithRed:r/255.0 green:g/255.0 blue:b/255.0 alpha:a/255.0];
    }
    return [NSColor clearColor];
}

- (NSColor *)colorFrom:(id)value {
    if ([value isKindOfClass:[NSString class]]) return [self colorFromString:value];
    return [NSColor clearColor];
}

- (CALayer *)edgeBorderLayerForView:(NSView *)v key:(NSString *)edgeName create:(BOOL)create {
    static const char kBorderTop = 0, kBorderBottom = 0, kBorderLeft = 0, kBorderRight = 0;
    const void *key =
        [edgeName isEqualToString:@"top"] ? &kBorderTop :
        [edgeName isEqualToString:@"bottom"] ? &kBorderBottom :
        [edgeName isEqualToString:@"left"] ? &kBorderLeft : &kBorderRight;
    CALayer *layer = objc_getAssociatedObject(v, key);
    if (!layer && create) {
        layer = [CALayer layer];
        layer.backgroundColor = [NSColor colorWithWhite:0 alpha:0.15].CGColor;
        [v.layer addSublayer:layer];
        objc_setAssociatedObject(v, key, layer, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    return layer;
}

- (void)applyEdgeBorder:(NSView *)v key:(NSString *)key value:(id)value {
    CGFloat w = [self doubleFrom:value];
    NSString *edge =
        [key isEqualToString:@"borderTopWidth"] ? @"top" :
        [key isEqualToString:@"borderBottomWidth"] ? @"bottom" :
        [key isEqualToString:@"borderLeftWidth"] ? @"left" : @"right";
    CALayer *l = [self edgeBorderLayerForView:v key:edge create:(w > 0)];
    if (!l) return;
    [self layoutEdgeBorder:l on:v edge:edge width:w];
}

- (void)applyEdgeBorderColor:(NSView *)v key:(NSString *)key value:(id)value {
    NSString *edge =
        [key isEqualToString:@"borderTopColor"] ? @"top" :
        [key isEqualToString:@"borderBottomColor"] ? @"bottom" :
        [key isEqualToString:@"borderLeftColor"] ? @"left" : @"right";
    CALayer *l = [self edgeBorderLayerForView:v key:edge create:YES];
    if (l) l.backgroundColor = [self colorFrom:value].CGColor;
}

- (void)layoutEdgeBorder:(CALayer *)l on:(NSView *)v edge:(NSString *)edge width:(CGFloat)w {
    CGRect b = v.bounds;
    if ([edge isEqualToString:@"top"])    l.frame = CGRectMake(0, 0, b.size.width, w);
    else if ([edge isEqualToString:@"bottom"]) l.frame = CGRectMake(0, b.size.height - w, b.size.width, w);
    else if ([edge isEqualToString:@"left"])   l.frame = CGRectMake(0, 0, w, b.size.height);
    else                                       l.frame = CGRectMake(b.size.width - w, 0, w, b.size.height);
}

- (void)loadImage:(NSImageView *)iv fromURI:(NSString *)uri {
    if (!uri.length) { iv.image = nil; return; }
    NSURL *url = [NSURL URLWithString:uri];
    if (!url) {
        // Fall back to file path
        if ([uri hasPrefix:@"/"]) {
            iv.image = [[NSImage alloc] initWithContentsOfFile:uri];
        }
        return;
    }
    if (url.isFileURL) {
        iv.image = [[NSImage alloc] initWithContentsOfURL:url];
        return;
    }
    if ([url.scheme isEqualToString:@"data"]) {
        iv.image = [[NSImage alloc] initWithContentsOfURL:url];
        return;
    }
    __weak NSImageView *weakIv = iv;
    NSURLSessionDataTask *task = [[NSURLSession sharedSession]
        dataTaskWithURL:url
      completionHandler:^(NSData *data, NSURLResponse *resp, NSError *err) {
        if (err || !data) {
            NSLog(@"[iex] image load failed: %@ (%@)", uri, err.localizedDescription);
            return;
        }
        NSImage *img = [[NSImage alloc] initWithData:data];
        if (!img) return;
        dispatch_async(dispatch_get_main_queue(), ^{
            NSImageView *strong = weakIv;
            if (strong) strong.image = img;
        });
    }];
    [task resume];
}

- (void)applyTransform:(NSView *)v jsonString:(NSString *)json {
    if (!json.length) {
        v.layer.affineTransform = CGAffineTransformIdentity;
        return;
    }
    NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
    NSArray *arr = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    if (![arr isKindOfClass:[NSArray class]]) return;

    // Avoid changing anchorPoint on layer-backed views (it confuses AppKit's
    // frame/position invariants). Translate-only handled with identity anchor;
    // for rotate/scale we accept rotation-around-top-left for now.
    CGAffineTransform t = CGAffineTransformIdentity;
    for (NSDictionary *e in arr) {
        if (![e isKindOfClass:[NSDictionary class]]) continue;
        if (e[@"translateX"]) t = CGAffineTransformTranslate(t, [e[@"translateX"] doubleValue], 0);
        if (e[@"translateY"]) t = CGAffineTransformTranslate(t, 0, [e[@"translateY"] doubleValue]);
        if (e[@"scale"]) {
            double s = [e[@"scale"] doubleValue];
            t = CGAffineTransformScale(t, s, s);
        }
        if (e[@"scaleX"]) t = CGAffineTransformScale(t, [e[@"scaleX"] doubleValue], 1);
        if (e[@"scaleY"]) t = CGAffineTransformScale(t, 1, [e[@"scaleY"] doubleValue]);
        id rot = e[@"rotate"] ?: e[@"rotateZ"];
        if ([rot isKindOfClass:[NSString class]]) {
            NSString *s = rot;
            double rad;
            if ([s hasSuffix:@"deg"]) rad = [s doubleValue] * M_PI / 180.0;
            else rad = [s doubleValue];
            t = CGAffineTransformRotate(t, rad);
        }
    }
    v.layer.affineTransform = t;
}

- (CGFloat)fontWeightFrom:(id)value {
    if ([value isKindOfClass:[NSNumber class]]) {
        double n = [value doubleValue];
        if (n <= 200) return NSFontWeightUltraLight;
        if (n <= 300) return NSFontWeightLight;
        if (n <= 400) return NSFontWeightRegular;
        if (n <= 500) return NSFontWeightMedium;
        if (n <= 600) return NSFontWeightSemibold;
        if (n <= 700) return NSFontWeightBold;
        if (n <= 800) return NSFontWeightHeavy;
        return NSFontWeightBlack;
    }
    return iexFontWeightForName([self stringFrom:value]);
}

- (BOOL)applyYogaStyle:(NSString *)key value:(id)value toNode:(YGNodeRef)node {
    if (!node) return NO;
    BOOL clear = (value == nil);
    CGFloat n = clear ? YGUndefined : [self doubleFrom:value];
    NSString *s = (clear || ![value isKindOfClass:[NSString class]]) ? nil : (NSString *)value;

    if ([key isEqualToString:@"flex"]) {
        // Match React Native's shadow-node decomposition of `flex` shorthand:
        //   flex > 0 → flexGrow=n, flexShrink=1, flexBasis=0
        //   flex = 0 → flexGrow=0, flexShrink=0, flexBasis=auto
        //   flex < 0 → flexGrow=0, flexShrink=-n, flexBasis=auto
        if (clear || isnan(n)) {
            YGNodeStyleSetFlexGrow(node, YGUndefined);
            YGNodeStyleSetFlexShrink(node, YGUndefined);
            YGNodeStyleSetFlexBasisAuto(node);
        } else if (n > 0) {
            YGNodeStyleSetFlexGrow(node, n);
            YGNodeStyleSetFlexShrink(node, 1);
            YGNodeStyleSetFlexBasis(node, 0);
        } else {
            YGNodeStyleSetFlexGrow(node, 0);
            YGNodeStyleSetFlexShrink(node, n < 0 ? -n : 0);
            YGNodeStyleSetFlexBasisAuto(node);
        }
        return YES;
    }
    if ([key isEqualToString:@"flexGrow"]) {
        YGNodeStyleSetFlexGrow(node, n);
        return YES;
    }
    if ([key isEqualToString:@"flexShrink"]) {
        YGNodeStyleSetFlexShrink(node, n);
        return YES;
    }
    if ([key isEqualToString:@"flexBasis"]) {
        YGNodeStyleSetFlexBasis(node, n);
        return YES;
    }
    if ([key isEqualToString:@"flexDirection"]) {
        YGNodeStyleSetFlexDirection(node, parseFlexDirection(s ?: @"column"));
        return YES;
    }
    if ([key isEqualToString:@"justifyContent"]) {
        YGNodeStyleSetJustifyContent(node, parseJustify(s ?: @"flex-start"));
        return YES;
    }
    if ([key isEqualToString:@"alignItems"]) {
        YGNodeStyleSetAlignItems(node, parseAlign(s ?: @"stretch"));
        return YES;
    }
    if ([key isEqualToString:@"alignSelf"]) {
        YGNodeStyleSetAlignSelf(node, parseAlign(s ?: @"auto"));
        return YES;
    }
    if ([key isEqualToString:@"alignContent"]) {
        YGNodeStyleSetAlignContent(node, parseAlign(s ?: @"flex-start"));
        return YES;
    }
    if ([key isEqualToString:@"flexWrap"]) {
        YGWrap w = ([s isEqualToString:@"wrap"]) ? YGWrapWrap
                 : ([s isEqualToString:@"wrap-reverse"]) ? YGWrapWrapReverse
                 : YGWrapNoWrap;
        YGNodeStyleSetFlexWrap(node, w);
        return YES;
    }
    if ([key isEqualToString:@"gap"]) { YGNodeStyleSetGap(node, YGGutterAll, n); return YES; }
    if ([key isEqualToString:@"rowGap"]) { YGNodeStyleSetGap(node, YGGutterRow, n); return YES; }
    if ([key isEqualToString:@"columnGap"]) { YGNodeStyleSetGap(node, YGGutterColumn, n); return YES; }
    if ([key isEqualToString:@"width"]) {
        if (s && [s hasSuffix:@"%"]) YGNodeStyleSetWidthPercent(node, [s doubleValue]);
        else YGNodeStyleSetWidth(node, n);
        return YES;
    }
    if ([key isEqualToString:@"height"]) {
        if (s && [s hasSuffix:@"%"]) YGNodeStyleSetHeightPercent(node, [s doubleValue]);
        else YGNodeStyleSetHeight(node, n);
        return YES;
    }
    if ([key isEqualToString:@"minWidth"]) { YGNodeStyleSetMinWidth(node, n); return YES; }
    if ([key isEqualToString:@"minHeight"]) { YGNodeStyleSetMinHeight(node, n); return YES; }
    if ([key isEqualToString:@"maxWidth"]) { YGNodeStyleSetMaxWidth(node, n); return YES; }
    if ([key isEqualToString:@"maxHeight"]) { YGNodeStyleSetMaxHeight(node, n); return YES; }
    if ([key isEqualToString:@"padding"]) { YGNodeStyleSetPadding(node, YGEdgeAll, n); return YES; }
    if ([key isEqualToString:@"paddingHorizontal"]) { YGNodeStyleSetPadding(node, YGEdgeHorizontal, n); return YES; }
    if ([key isEqualToString:@"paddingVertical"]) { YGNodeStyleSetPadding(node, YGEdgeVertical, n); return YES; }
    if ([key isEqualToString:@"paddingLeft"]) { YGNodeStyleSetPadding(node, YGEdgeLeft, n); return YES; }
    if ([key isEqualToString:@"paddingRight"]) { YGNodeStyleSetPadding(node, YGEdgeRight, n); return YES; }
    if ([key isEqualToString:@"paddingTop"]) { YGNodeStyleSetPadding(node, YGEdgeTop, n); return YES; }
    if ([key isEqualToString:@"paddingBottom"]) { YGNodeStyleSetPadding(node, YGEdgeBottom, n); return YES; }
    if ([key isEqualToString:@"margin"]) { YGNodeStyleSetMargin(node, YGEdgeAll, n); return YES; }
    if ([key isEqualToString:@"marginHorizontal"]) { YGNodeStyleSetMargin(node, YGEdgeHorizontal, n); return YES; }
    if ([key isEqualToString:@"marginVertical"]) { YGNodeStyleSetMargin(node, YGEdgeVertical, n); return YES; }
    if ([key isEqualToString:@"marginLeft"]) { YGNodeStyleSetMargin(node, YGEdgeLeft, n); return YES; }
    if ([key isEqualToString:@"marginRight"]) { YGNodeStyleSetMargin(node, YGEdgeRight, n); return YES; }
    if ([key isEqualToString:@"marginTop"]) { YGNodeStyleSetMargin(node, YGEdgeTop, n); return YES; }
    if ([key isEqualToString:@"marginBottom"]) { YGNodeStyleSetMargin(node, YGEdgeBottom, n); return YES; }
    if ([key isEqualToString:@"position"]) {
        YGNodeStyleSetPositionType(node,
            [s isEqualToString:@"absolute"] ? YGPositionTypeAbsolute : YGPositionTypeRelative);
        return YES;
    }
    if ([key isEqualToString:@"left"])   { YGNodeStyleSetPosition(node, YGEdgeLeft, n); return YES; }
    if ([key isEqualToString:@"right"])  { YGNodeStyleSetPosition(node, YGEdgeRight, n); return YES; }
    if ([key isEqualToString:@"top"])    { YGNodeStyleSetPosition(node, YGEdgeTop, n); return YES; }
    if ([key isEqualToString:@"bottom"]) { YGNodeStyleSetPosition(node, YGEdgeBottom, n); return YES; }
    if ([key isEqualToString:@"display"]) {
        YGNodeStyleSetDisplay(node, [s isEqualToString:@"none"] ? YGDisplayNone : YGDisplayFlex);
        return YES;
    }
    return NO;
}

- (void)nativeSetProp:(int32_t)tag key:(NSString *)key value:(id)value {
    NSView *v = _views[@(tag)];
    if (!v) return;

    YGNodeRef node = [self nodeForTag:tag];
    if ([self applyYogaStyle:key value:value toNode:node]) return;

    if ([key isEqualToString:@"text"] && [v isKindOfClass:[NSTextField class]]) {
        ((NSTextField *)v).stringValue = [self stringFrom:value];
        if (node && YGNodeHasMeasureFunc(node)) YGNodeMarkDirty(node);
        return;
    }

    if ([v isKindOfClass:[IEXSFSymbolView class]]) {
        IEXSFSymbolView *iv = (IEXSFSymbolView *)v;
        if ([key isEqualToString:@"name"]) {
            iv.symName = [self stringFrom:value];
            [iv applySymbolConfig];
            if (node && YGNodeHasMeasureFunc(node)) YGNodeMarkDirty(node);
            return;
        }
        if ([key isEqualToString:@"size"]) {
            CGFloat s = [self doubleFrom:value];
            if (s > 0) iv.symPointSize = s;
            [iv applySymbolConfig];
            if (node && YGNodeHasMeasureFunc(node)) YGNodeMarkDirty(node);
            return;
        }
        if ([key isEqualToString:@"weight"]) {
            iv.symWeight = [self stringFrom:value] ?: @"regular";
            [iv applySymbolConfig];
            return;
        }
        if ([key isEqualToString:@"scale"]) {
            iv.symScale = [self stringFrom:value] ?: @"medium";
            [iv applySymbolConfig];
            return;
        }
        if ([key isEqualToString:@"color"]) {
            iv.contentTintColor = [self colorFromString:[self stringFrom:value]];
            return;
        }
    }

    if ([v isKindOfClass:[NSVisualEffectView class]]) {
        NSVisualEffectView *vev = (NSVisualEffectView *)v;
        if ([key isEqualToString:@"material"]) {
            NSString *m = [self stringFrom:value];
            if ([m isEqualToString:@"titlebar"]) vev.material = NSVisualEffectMaterialTitlebar;
            else if ([m isEqualToString:@"menu"]) vev.material = NSVisualEffectMaterialMenu;
            else if ([m isEqualToString:@"popover"]) vev.material = NSVisualEffectMaterialPopover;
            else if ([m isEqualToString:@"selection"]) vev.material = NSVisualEffectMaterialSelection;
            else if ([m isEqualToString:@"headerView"]) vev.material = NSVisualEffectMaterialHeaderView;
            else if ([m isEqualToString:@"sheet"]) vev.material = NSVisualEffectMaterialSheet;
            else if ([m isEqualToString:@"hudWindow"]) vev.material = NSVisualEffectMaterialHUDWindow;
            else if ([m isEqualToString:@"fullScreenUI"]) vev.material = NSVisualEffectMaterialFullScreenUI;
            else if ([m isEqualToString:@"toolTip"]) vev.material = NSVisualEffectMaterialToolTip;
            else if ([m isEqualToString:@"contentBackground"]) vev.material = NSVisualEffectMaterialContentBackground;
            else if ([m isEqualToString:@"underWindowBackground"]) vev.material = NSVisualEffectMaterialUnderWindowBackground;
            else if ([m isEqualToString:@"underPageBackground"]) vev.material = NSVisualEffectMaterialUnderPageBackground;
            else vev.material = NSVisualEffectMaterialSidebar;
            return;
        }
        if ([key isEqualToString:@"blending"]) {
            NSString *m = [self stringFrom:value];
            vev.blendingMode = [m isEqualToString:@"withinWindow"]
                ? NSVisualEffectBlendingModeWithinWindow
                : NSVisualEffectBlendingModeBehindWindow;
            return;
        }
    }

    if ([v isKindOfClass:[NSImageView class]]) {
        NSImageView *iv = (NSImageView *)v;
        if ([key isEqualToString:@"uri"]) {
            [self loadImage:iv fromURI:[self stringFrom:value]];
            return;
        }
        if ([key isEqualToString:@"resizeMode"]) {
            NSString *m = [self stringFrom:value];
            if ([m isEqualToString:@"contain"]) iv.imageScaling = NSImageScaleProportionallyUpOrDown;
            else if ([m isEqualToString:@"cover"]) iv.imageScaling = NSImageScaleAxesIndependently;
            else if ([m isEqualToString:@"stretch"]) iv.imageScaling = NSImageScaleAxesIndependently;
            else if ([m isEqualToString:@"center"]) iv.imageScaling = NSImageScaleNone;
            return;
        }
    }

    // ─── Switch ───
    if ([v isKindOfClass:[NSSwitch class]]) {
        NSSwitch *sw = (NSSwitch *)v;
        if ([key isEqualToString:@"value"]) {
            sw.state = ([self boolFrom:value]) ? NSControlStateValueOn : NSControlStateValueOff;
            return;
        }
        if ([key isEqualToString:@"disabled"]) {
            sw.enabled = ![self boolFrom:value];
            return;
        }
    }

    // ─── TextInput ───
    if ([v isKindOfClass:[NSTextField class]] && ((NSTextField *)v).isEditable) {
        NSTextField *tf = (NSTextField *)v;
        if ([key isEqualToString:@"value"]) {
            NSString *s = [self stringFrom:value];
            if (![tf.stringValue isEqualToString:s]) {
                NSText *editor = (NSText *)[tf currentEditor];
                NSRange sel = editor ? editor.selectedRange : NSMakeRange(s.length, 0);
                tf.stringValue = s;
                if (editor) {
                    NSUInteger loc = MIN(sel.location, s.length);
                    [editor setSelectedRange:NSMakeRange(loc, 0)];
                }
                if (node && YGNodeHasMeasureFunc(node)) YGNodeMarkDirty(node);
            }
            return;
        }
        if ([key isEqualToString:@"placeholder"]) {
            tf.placeholderString = [self stringFrom:value];
            return;
        }
        if ([key isEqualToString:@"editable"]) {
            tf.editable = [self boolFrom:value];
            return;
        }
        if ([key isEqualToString:@"secure"]) {
            // Toggle to NSSecureTextField requires recreating; skip for now.
            return;
        }
    }

    if ([key isEqualToString:@"backgroundColor"]) {
        v.wantsLayer = YES;
        v.layer.backgroundColor = value ? [self colorFrom:value].CGColor : NULL;
        return;
    }
    if ([key isEqualToString:@"borderRadius"]) {
        v.wantsLayer = YES;
        v.layer.cornerRadius = value ? [self doubleFrom:value] : 0;
        v.layer.masksToBounds = (v.layer.cornerRadius > 0);
        return;
    }
    if ([key isEqualToString:@"borderWidth"]) {
        v.wantsLayer = YES;
        v.layer.borderWidth = value ? [self doubleFrom:value] : 0;
        return;
    }
    if ([key isEqualToString:@"borderColor"]) {
        v.wantsLayer = YES;
        v.layer.borderColor = value ? [self colorFrom:value].CGColor : NULL;
        return;
    }
    if ([key isEqualToString:@"borderTopWidth"] ||
        [key isEqualToString:@"borderBottomWidth"] ||
        [key isEqualToString:@"borderLeftWidth"] ||
        [key isEqualToString:@"borderRightWidth"]) {
        v.wantsLayer = YES;
        [self applyEdgeBorder:v key:key value:value];
        return;
    }
    if ([key isEqualToString:@"borderTopColor"] ||
        [key isEqualToString:@"borderBottomColor"] ||
        [key isEqualToString:@"borderLeftColor"] ||
        [key isEqualToString:@"borderRightColor"]) {
        v.wantsLayer = YES;
        [self applyEdgeBorderColor:v key:key value:value];
        return;
    }
    if ([key isEqualToString:@"opacity"]) {
        v.alphaValue = value ? [self doubleFrom:value] : 1.0;
        return;
    }
    if ([key isEqualToString:@"contextMenu"]) {
        if (!value) { v.menu = nil; return; }
        [self attachContextMenuToView:v tag:tag json:[self stringFrom:value]];
        return;
    }
    if ([key hasPrefix:@"contentInset"]) {
        NSView *outer = _outerViews[@(tag)];
        if ([outer isKindOfClass:[NSScrollView class]]) {
            NSScrollView *scroll = (NSScrollView *)outer;
            NSEdgeInsets ins = scroll.contentInsets;
            CGFloat n = value ? [self doubleFrom:value] : 0;
            if ([key isEqualToString:@"contentInsetTop"]) ins.top = n;
            else if ([key isEqualToString:@"contentInsetBottom"]) ins.bottom = n;
            else if ([key isEqualToString:@"contentInsetLeft"]) ins.left = n;
            else if ([key isEqualToString:@"contentInsetRight"]) ins.right = n;
            scroll.contentInsets = ins;
        }
        return;
    }
    if ([key isEqualToString:@"activeOpacity"]) {
        if ([v isKindOfClass:[NSFlippedView class]]) {
            ((NSFlippedView *)v).iexActiveOpacity = value ? [self doubleFrom:value] : 0.2;
        }
        return;
    }
    if ([key isEqualToString:@"shadowColor"]) {
        v.wantsLayer = YES;
        v.layer.shadowColor = [self colorFrom:value].CGColor;
        v.layer.masksToBounds = NO;
        return;
    }
    if ([key isEqualToString:@"shadowOpacity"]) {
        v.wantsLayer = YES;
        v.layer.shadowOpacity = [self doubleFrom:value];
        return;
    }
    if ([key isEqualToString:@"shadowRadius"]) {
        v.wantsLayer = YES;
        v.layer.shadowRadius = [self doubleFrom:value];
        return;
    }
    if ([key isEqualToString:@"shadowOffset"]) {
        // applyProp drops object values; RN-style { width, height } not supported.
        return;
    }
    if ([key isEqualToString:@"transform"]) {
        v.wantsLayer = YES;
        [self applyTransform:v jsonString:value ? [self stringFrom:value] : @""];
        return;
    }

    if ([v isKindOfClass:[NSTextField class]]) {
        NSTextField *tf = (NSTextField *)v;
        if ([key isEqualToString:@"color"]) {
            tf.textColor = [self colorFrom:value];
            return;
        }
        if ([key isEqualToString:@"fontSize"]) {
            CGFloat size = [self doubleFrom:value];
            CGFloat weight = (tf.font.fontDescriptor.symbolicTraits & NSFontDescriptorTraitBold)
                ? NSFontWeightBold : NSFontWeightRegular;
            tf.font = [NSFont systemFontOfSize:size weight:weight];
            return;
        }
        if ([key isEqualToString:@"fontWeight"]) {
            CGFloat weight = [self fontWeightFrom:value];
            tf.font = [NSFont systemFontOfSize:tf.font.pointSize weight:weight];
            return;
        }
        if ([key isEqualToString:@"textAlign"]) {
            NSString *s = [self stringFrom:value];
            if ([s isEqualToString:@"center"]) tf.alignment = NSTextAlignmentCenter;
            else if ([s isEqualToString:@"right"]) tf.alignment = NSTextAlignmentRight;
            else tf.alignment = NSTextAlignmentLeft;
            return;
        }
    }

}

#pragma mark - Yoga layout flush

- (void)flushLayoutForTag:(int32_t)tag width:(CGFloat)width height:(CGFloat)height {
    YGNodeRef root = [self nodeForTag:tag];
    NSView *rootView = _views[@(tag)];
    if (!root || !rootView) return;

    if (width <= 0 || height <= 0) {
        NSSize s = rootView.bounds.size;
        width = s.width;
        height = s.height;
    }

    // Root box size pinned explicitly.
    YGNodeStyleSetWidth(root, (float)width);
    YGNodeStyleSetHeight(root, (float)height);

    YGNodeCalculateLayout(root, (float)width, (float)height, YGDirectionLTR);
    [self applyLayoutForTag:tag];
}

- (void)applyLayoutForTag:(int32_t)tag {
    YGNodeRef node = [self nodeForTag:tag];
    if (!node) return;
    NSView *outer = [self outerForTag:tag];
    if (!outer) return;

    CGFloat left = YGNodeLayoutGetLeft(node);
    CGFloat top = YGNodeLayoutGetTop(node);
    CGFloat width = YGNodeLayoutGetWidth(node);
    CGFloat height = YGNodeLayoutGetHeight(node);

    if (!isfinite(left)) left = 0;
    if (!isfinite(top)) top = 0;
    if (!isfinite(width)) width = 0;
    if (!isfinite(height)) height = 0;

    if (tag >= 100) {
        outer.frame = NSMakeRect(left, top, width, height);
    }

    // For iex_scroll, also size the inner content view to Yoga's calculated bounds.
    NSView *inner = _views[@(tag)];
    if (inner != outer && [outer isKindOfClass:[NSScrollView class]]) {
        NSScrollView *sv = (NSScrollView *)outer;
        // documentView height = sum of children intrinsic; width = scroll content width.
        CGFloat innerW = sv.contentView.bounds.size.width;
        CGFloat innerH = MAX(height, [self contentHeightOfNode:node]);
        inner.frame = NSMakeRect(0, 0, innerW, innerH);
    }

    // Recurse into children based on the Yoga tree (which mirrors React's children).
    uint32_t count = YGNodeGetChildCount(node);
    for (uint32_t i = 0; i < count; i++) {
        YGNodeRef cn = YGNodeGetChild(node, i);
        // Find tag by reverse lookup.
        int32_t childTag = [self tagForNode:cn];
        if (childTag > 0) [self applyLayoutForTag:childTag];
    }
}

- (CGFloat)contentHeightOfNode:(YGNodeRef)node {
    CGFloat maxBottom = 0;
    uint32_t count = YGNodeGetChildCount(node);
    for (uint32_t i = 0; i < count; i++) {
        YGNodeRef c = YGNodeGetChild(node, i);
        CGFloat b = YGNodeLayoutGetTop(c) + YGNodeLayoutGetHeight(c);
        if (b > maxBottom) maxBottom = b;
    }
    return maxBottom;
}

- (int32_t)tagForNode:(YGNodeRef)node {
    auto it = _nodeTags.find(node);
    return it != _nodeTags.end() ? it->second : 0;
}

- (void)nativeInsertChild:(int32_t)parentTag child:(int32_t)childTag before:(int32_t)beforeTag {
    NSView *p = _views[@(parentTag)];
    NSView *c = [self outerForTag:childTag];
    if (!p || !c) {
        NSLog(@"[iex] insertChild MISS parent=%d child=%d", parentTag, childTag);
        return;
    }

    YGNodeRef pn = [self nodeForTag:parentTag];
    YGNodeRef cn = [self nodeForTag:childTag];
    NSView *bv = beforeTag > 0 ? [self outerForTag:beforeTag] : nil;
    YGNodeRef bn = beforeTag > 0 ? [self nodeForTag:beforeTag] : nullptr;

    // Detach from old parents (move semantics for both Yoga and AppKit).
    if (cn) {
        YGNodeRef oldParent = YGNodeGetParent(cn);
        if (oldParent) YGNodeRemoveChild(oldParent, cn);
    }
    [c removeFromSuperview];

    if (bv && bv.superview == p) {
        // Insert below `bv` in z-order so subviews array index matches doc order.
        [p addSubview:c positioned:NSWindowBelow relativeTo:bv];
    } else {
        [p addSubview:c];
    }

    if (pn && cn) {
        uint32_t idx = YGNodeGetChildCount(pn);
        if (bn) {
            uint32_t cnt = YGNodeGetChildCount(pn);
            for (uint32_t i = 0; i < cnt; i++) {
                if (YGNodeGetChild(pn, i) == bn) { idx = i; break; }
            }
        }
        YGNodeInsertChild(pn, cn, idx);
    }
}

- (void)nativeAppendChild:(int32_t)parentTag child:(int32_t)childTag {
    [self nativeInsertChild:parentTag child:childTag before:0];
}

- (void)cleanupYogaSubtree:(YGNodeRef)node {
    if (!node) return;
    int32_t tag = [self tagForNode:node];

    // Recursively cleanup children first.
    while (YGNodeGetChildCount(node) > 0) {
        YGNodeRef c = YGNodeGetChild(node, 0);
        YGNodeRemoveChild(node, c);
        [self cleanupYogaSubtree:c];
    }

    if (tag > 0) {
        _nodes.erase(tag);
        [_views removeObjectForKey:@(tag)];
        [_outerViews removeObjectForKey:@(tag)];
        [self clearCallbacksForTag:tag];
        gAnimTransforms.erase(tag);
        for (auto it = _animBindings.begin(); it != _animBindings.end(); ) {
            auto &vec = it->second;
            for (auto bi = vec.begin(); bi != vec.end(); ) {
                if (bi->first == tag) bi = vec.erase(bi); else ++bi;
            }
            if (vec.empty()) it = _animBindings.erase(it); else ++it;
        }
    }
    _nodeTags.erase(node);
    YGNodeFree(node);
}

- (void)nativeRemoveChild:(int32_t)parentTag child:(int32_t)childTag {
    NSView *c = [self outerForTag:childTag];
    if (c) [c removeFromSuperview];

    YGNodeRef pn = [self nodeForTag:parentTag];
    YGNodeRef cn = [self nodeForTag:childTag];
    if (pn && cn) YGNodeRemoveChild(pn, cn);
    if (cn) [self cleanupYogaSubtree:cn];
}

- (void)clearCallbacksForTag:(int32_t)tag {
    NSString *prefix = [NSString stringWithFormat:@"%d:", tag];
    std::string p = prefix.UTF8String;
    for (auto it = _callbacks.begin(); it != _callbacks.end(); ) {
        if (it->first.compare(0, p.size(), p) == 0) it = _callbacks.erase(it);
        else ++it;
    }
}

- (void)nativeSetCallback:(int32_t)tag
                      key:(NSString *)key
                 function:(std::shared_ptr<Function>)fn {
    std::string ck = std::to_string(tag) + ":" + [key UTF8String];
    if (fn) _callbacks[ck] = fn; else _callbacks.erase(ck);

    if ([key isEqualToString:@"onPress"]) {
        NSView *v = _views[@(tag)];
        if ([v isKindOfClass:[NSFlippedView class]]) {
            ((NSFlippedView *)v).iexHandlesPress = (fn != nullptr);
        }
    }
    if ([key isEqualToString:@"onHoverIn"] || [key isEqualToString:@"onHoverOut"]) {
        NSView *v = _views[@(tag)];
        if ([v isKindOfClass:[NSFlippedView class]]) {
            std::string inKey = std::to_string(tag) + ":onHoverIn";
            std::string outKey = std::to_string(tag) + ":onHoverOut";
            BOOL hasAny = (_callbacks.find(inKey) != _callbacks.end())
                       || (_callbacks.find(outKey) != _callbacks.end());
            ((NSFlippedView *)v).iexHasHover = hasAny;
        }
    }
    if ([key isEqualToString:@"onDragStart"] || [key isEqualToString:@"onDragMove"]
        || [key isEqualToString:@"onDragEnd"]) {
        NSView *v = _views[@(tag)];
        if ([v isKindOfClass:[NSFlippedView class]]) {
            std::string anyKey = std::to_string(tag) + ":onDragMove";
            BOOL has = (_callbacks.find(anyKey) != _callbacks.end());
            ((NSFlippedView *)v).iexHandlesDrag = has;
        }
    }
    if ([key isEqualToString:@"onFileDrop"]) {
        NSView *v = _views[@(tag)];
        if ([v isKindOfClass:[NSFlippedView class]]) {
            ((NSFlippedView *)v).iexHandlesFileDrop = (fn != nullptr);
        }
    }
}

- (void)dispatchOnPressForTag:(int32_t)tag {
    [self invokeCallbackForTag:tag event:@"onPress" noArgs:YES withBool:NO withString:nil];
}

- (void)dispatchHoverForTag:(int32_t)tag entered:(BOOL)entered {
    [self invokeCallbackForTag:tag
                         event:entered ? @"onHoverIn" : @"onHoverOut"
                        noArgs:YES withBool:NO withString:nil];
}

- (void)dispatchDragForTag:(int32_t)tag phase:(NSString *)phase dx:(CGFloat)dx dy:(CGFloat)dy {
    NSString *event;
    if ([phase isEqualToString:@"start"]) event = @"onDragStart";
    else if ([phase isEqualToString:@"end"]) event = @"onDragEnd";
    else event = @"onDragMove";
    NSString *payload = [NSString stringWithFormat:@"{\"dx\":%f,\"dy\":%f}", dx, dy];
    [self invokeCallbackForTag:tag event:event
                        noArgs:NO withBool:NO withString:payload];
}

- (std::shared_ptr<Function>)callbackFor:(int32_t)tag event:(NSString *)event {
    std::string ck = std::to_string(tag) + ":" + [event UTF8String];
    auto it = _callbacks.find(ck);
    if (it == _callbacks.end()) return nullptr;
    return it->second;
}

- (void)invokeCallbackForTag:(int32_t)tag event:(NSString *)event noArgs:(BOOL)noArgs withBool:(BOOL)b withString:(NSString *)s {
    auto fn = [self callbackFor:tag event:event];
    if (!fn) return;
    Runtime &rt = *_runtime;
    try {
        if (noArgs) {
            fn->call(rt);
        } else if (s) {
            fn->call(rt, jsi::String::createFromUtf8(rt, [s UTF8String]));
        } else {
            fn->call(rt, b);
        }
    } catch (const JSError &e) {
        NSLog(@"[iex] %@(tag=%d) error: %s", event, tag, e.getMessage().c_str());
    } catch (const std::exception &e) {
        NSLog(@"[iex] %@(tag=%d) error: %s", event, tag, e.what());
    }
}

- (NSMenu *)_findAppMenuNamed:(NSString *)name {
    for (NSMenuItem *item in NSApp.mainMenu.itemArray) {
        if (item.submenu && [item.submenu.title isEqualToString:name]) return item.submenu;
    }
    return nil;
}

- (int32_t)addMenuItemTo:(NSString *)menuName
                   label:(NSString *)label
           keyEquivalent:(NSString *)key
            modifierMask:(NSUInteger)mask
                callback:(std::shared_ptr<Function>)cb {
    NSMenu *menu = [self _findAppMenuNamed:menuName];
    if (!menu) return 0;
    int32_t id = _nextMenuId.fetch_add(1);
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:label
                                                  action:@selector(_customMenuTriggered:)
                                           keyEquivalent:key];
    item.target = self;
    item.keyEquivalentModifierMask = (NSEventModifierFlags)mask;
    item.tag = id;
    [menu addItem:item];
    _customMenuItems[@(id)] = item;
    _menuCallbacks[id] = cb;
    return id;
}

- (void)removeMenuItemId:(int32_t)id {
    NSMenuItem *item = _customMenuItems[@(id)];
    if (item) [item.menu removeItem:item];
    [_customMenuItems removeObjectForKey:@(id)];
    _menuCallbacks.erase(id);
}

- (void)_customMenuTriggered:(NSMenuItem *)sender {
    auto it = _menuCallbacks.find((int32_t)sender.tag);
    if (it == _menuCallbacks.end()) return;
    Runtime &rt = *_runtime;
    try { it->second->call(rt); }
    catch (const JSError &e) { NSLog(@"[iex] menu cb err: %s", e.getMessage().c_str()); }
    catch (const std::exception &e) { NSLog(@"[iex] menu cb err: %s", e.what()); }
}

- (void)attachContextMenuToView:(NSView *)v tag:(int32_t)tag json:(NSString *)json {
    NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
    NSArray *items = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    if (![items isKindOfClass:[NSArray class]]) { v.menu = nil; return; }

    NSMenu *menu = [[NSMenu alloc] init];
    NSInteger idx = 0;
    for (id raw in items) {
        if (![raw isKindOfClass:[NSDictionary class]]) { idx++; continue; }
        NSDictionary *spec = raw;
        if ([spec[@"separator"] boolValue]) {
            [menu addItem:[NSMenuItem separatorItem]];
        } else {
            NSString *label = [spec[@"label"] isKindOfClass:[NSString class]] ? spec[@"label"] : @"";
            NSMenuItem *mi = [[NSMenuItem alloc] initWithTitle:label
                                                        action:@selector(_contextMenuItemTriggered:)
                                                 keyEquivalent:@""];
            mi.target = self;
            mi.representedObject = @(idx);
            mi.enabled = ![spec[@"disabled"] boolValue];
            if ([spec[@"danger"] boolValue]) {
                NSMutableAttributedString *attr =
                    [[NSMutableAttributedString alloc] initWithString:label];
                [attr addAttribute:NSForegroundColorAttributeName
                             value:[NSColor systemRedColor]
                             range:NSMakeRange(0, label.length)];
                mi.attributedTitle = attr;
            }
            objc_setAssociatedObject(mi, "iex_tag", @(tag), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
            [menu addItem:mi];
        }
        idx++;
    }
    v.menu = menu;
}

- (void)_contextMenuItemTriggered:(NSMenuItem *)sender {
    NSNumber *tagNum = objc_getAssociatedObject(sender, "iex_tag");
    if (!tagNum) return;
    NSNumber *idx = sender.representedObject;
    [self invokeCallbackForTag:tagNum.intValue
                         event:@"onContextMenuItemPress"
                        noArgs:NO
                      withBool:NO
                    withString:[NSString stringWithFormat:@"%@", idx ?: @0]];
}

- (void)handleSwitchChange:(NSSwitch *)sw {
    NSNumber *tagNum = objc_getAssociatedObject(sw, "iex_tag");
    if (!tagNum) return;
    BOOL on = sw.state == NSControlStateValueOn;
    [self invokeCallbackForTag:tagNum.intValue event:@"onValueChange" noArgs:NO withBool:on withString:nil];
}

#pragma mark - NSTextFieldDelegate

- (void)controlTextDidChange:(NSNotification *)notif {
    NSTextField *tf = (NSTextField *)notif.object;
    NSNumber *tagNum = objc_getAssociatedObject(tf, "iex_tag");
    if (!tagNum) return;
    [self invokeCallbackForTag:tagNum.intValue event:@"onChangeText" noArgs:NO withBool:NO withString:tf.stringValue];
}

- (BOOL)control:(NSControl *)control textView:(NSTextView *)textView doCommandBySelector:(SEL)cmd {
    if (cmd == @selector(insertNewline:)) {
        NSNumber *tagNum = objc_getAssociatedObject(control, "iex_tag");
        if (tagNum) {
            [self invokeCallbackForTag:tagNum.intValue event:@"onSubmitEditing" noArgs:YES withBool:NO withString:nil];
        }
    }
    return NO;
}

- (void)installHostFunctions {
    Runtime &rt = *_runtime;
    __weak HermesBridge *weakSelf = self;

    Object iex(rt);

    // One JS callback slot, register-only-or-clear semantics. The setter block
    // owns the assignment to the right ivar; `after` runs once on successful
    // registration (used by onNewWindow to replay existing roots).
    auto installCallbackSetter =
        [&rt, &iex, weakSelf](const char *name,
                              void (^setter)(HermesBridge *, std::shared_ptr<Function>),
                              void (^after)(HermesBridge *)) {
        iex.setProperty(rt, name,
            Function::createFromHostFunction(rt, PropNameID::forAscii(rt, name), 1,
                [weakSelf, setter, after](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                    HermesBridge *strong = weakSelf;
                    if (!strong) return Value::undefined();
                    if (count < 1 || !args[0].isObject() || !args[0].asObject(rt).isFunction(rt)) {
                        setter(strong, nullptr);
                        return Value::undefined();
                    }
                    setter(strong, std::make_shared<Function>(args[0].asObject(rt).asFunction(rt)));
                    if (after) after(strong);
                    return Value::undefined();
                }));
    };

    iex.setProperty(rt, "createView",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "createView"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count == 0) return Value::undefined();
                std::string type = args[0].isString()
                    ? args[0].getString(rt).utf8(rt)
                    : args[0].toString(rt).utf8(rt);
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                NSString *t = [NSString stringWithUTF8String:type.c_str()];
                int32_t tag = strong->_nextTag.fetch_add(1);
                NSView *v = [strong nativeCreateViewOfType:t tag:tag];
                strong->_views[@(tag)] = v;
                return Value((double)tag);
            }));

    iex.setProperty(rt, "setProp",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "setProp"), 3,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 3) return Value::undefined();
                int32_t tag = (int32_t)args[0].asNumber();
                std::string key = args[1].isString()
                    ? args[1].getString(rt).utf8(rt)
                    : args[1].toString(rt).utf8(rt);
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                NSString *k = [NSString stringWithUTF8String:key.c_str()];

                if (args[2].isObject() && args[2].asObject(rt).isFunction(rt)) {
                    auto fnPtr = std::make_shared<Function>(args[2].asObject(rt).asFunction(rt));
                    [strong nativeSetCallback:tag key:k function:fnPtr];
                    return Value::undefined();
                }

                if (args[2].isNull() || args[2].isUndefined()) {
                    // Removed prop: clear the callback if it's an event handler,
                    // otherwise pass nil through to per-prop reset logic.
                    if ([k hasPrefix:@"on"]) {
                        [strong nativeSetCallback:tag key:k function:nullptr];
                    } else {
                        [strong nativeSetProp:tag key:k value:nil];
                    }
                    return Value::undefined();
                }

                id objVal = nil;
                if (args[2].isString()) {
                    objVal = [NSString stringWithUTF8String:args[2].getString(rt).utf8(rt).c_str()];
                } else if (args[2].isNumber()) {
                    objVal = @(args[2].asNumber());
                } else if (args[2].isBool()) {
                    objVal = @(args[2].getBool());
                }
                [strong nativeSetProp:tag key:k value:objVal];
                return Value::undefined();
            }));

    iex.setProperty(rt, "appendChild",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "appendChild"), 2,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 2) return Value::undefined();
                int32_t parent = (int32_t)args[0].asNumber();
                int32_t child = (int32_t)args[1].asNumber();
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                [strong nativeAppendChild:parent child:child];
                return Value::undefined();
            }));

    iex.setProperty(rt, "flushLayout",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "flushLayout"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1 || !args[0].isNumber()) return Value::undefined();
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                int32_t tag = (int32_t)args[0].asNumber();
                [strong flushLayoutForTag:tag width:0 height:0];
                return Value::undefined();
            }));

    installCallbackSetter("onWindowResize",
        ^(HermesBridge *s, std::shared_ptr<Function> fn) { s->_windowResizeCallback = fn; }, nil);

    installCallbackSetter("onAppStateChange",
        ^(HermesBridge *s, std::shared_ptr<Function> fn) { s->_appStateCallback = fn; }, nil);

    iex.setProperty(rt, "clipboardSetString",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "clipboardSetString"), 1,
            [](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1 || !args[0].isString()) return Value(false);
                NSString *s = [NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()];
                NSPasteboard *pb = [NSPasteboard generalPasteboard];
                [pb clearContents];
                BOOL ok = [pb setString:s ?: @"" forType:NSPasteboardTypeString];
                return Value((bool)ok);
            }));

    iex.setProperty(rt, "clipboardGetString",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "clipboardGetString"), 0,
            [](Runtime &rt, const Value &, const Value *, size_t) -> Value {
                NSString *s = [[NSPasteboard generalPasteboard] stringForType:NSPasteboardTypeString];
                return jsi::String::createFromUtf8(rt, [s ?: @"" UTF8String]);
            }));

    iex.setProperty(rt, "networkRequest",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "networkRequest"), 5,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 5) return Value::undefined();
                int32_t reqId = (int32_t)args[0].asNumber();
                NSString *method = [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()];
                NSString *urlStr = [NSString stringWithUTF8String:args[2].getString(rt).utf8(rt).c_str()];
                NSString *headersJson = [NSString stringWithUTF8String:args[3].getString(rt).utf8(rt).c_str()];
                NSString *body = [NSString stringWithUTF8String:args[4].getString(rt).utf8(rt).c_str()];
                HermesBridge *strong = weakSelf;
                if (strong) [strong networkRequest:reqId method:method url:urlStr headers:headersJson body:body];
                return Value::undefined();
            }));

    iex.setProperty(rt, "storageSet",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "storageSet"), 2,
            [](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 2 || !args[0].isString() || !args[1].isString()) return Value(false);
                NSString *k = [@"iex_" stringByAppendingString:[NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()]];
                NSString *v = [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()];
                [NSUserDefaults.standardUserDefaults setObject:v forKey:k];
                return Value(true);
            }));

    iex.setProperty(rt, "storageGet",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "storageGet"), 1,
            [](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1 || !args[0].isString()) return Value::null();
                NSString *k = [@"iex_" stringByAppendingString:[NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()]];
                NSString *v = [NSUserDefaults.standardUserDefaults stringForKey:k];
                if (!v) return Value::null();
                return jsi::String::createFromUtf8(rt, [v UTF8String]);
            }));

    iex.setProperty(rt, "storageRemove",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "storageRemove"), 1,
            [](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1 || !args[0].isString()) return Value::undefined();
                NSString *k = [@"iex_" stringByAppendingString:[NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()]];
                [NSUserDefaults.standardUserDefaults removeObjectForKey:k];
                return Value::undefined();
            }));

    iex.setProperty(rt, "storageClear",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "storageClear"), 0,
            [](Runtime &rt, const Value &, const Value *, size_t) -> Value {
                NSDictionary *all = NSUserDefaults.standardUserDefaults.dictionaryRepresentation;
                for (NSString *k in all) {
                    if ([k hasPrefix:@"iex_"]) [NSUserDefaults.standardUserDefaults removeObjectForKey:k];
                }
                return Value::undefined();
            }));

    iex.setProperty(rt, "storageKeys",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "storageKeys"), 0,
            [](Runtime &rt, const Value &, const Value *, size_t) -> Value {
                NSMutableArray *keys = [NSMutableArray new];
                for (NSString *k in NSUserDefaults.standardUserDefaults.dictionaryRepresentation) {
                    if ([k hasPrefix:@"iex_"]) [keys addObject:[k substringFromIndex:4]];
                }
                NSData *d = [NSJSONSerialization dataWithJSONObject:keys options:0 error:nil];
                NSString *s = [[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding] ?: @"[]";
                return jsi::String::createFromUtf8(rt, [s UTF8String]);
            }));

    iex.setProperty(rt, "fsAppDirs",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "fsAppDirs"), 0,
            [weakSelf](Runtime &rt, const Value &, const Value *, size_t) -> Value {
                HermesBridge *strong = weakSelf;
                NSString *json = strong ? [strong fsAppDirsJSON] : @"{}";
                return jsi::String::createFromUtf8(rt, [json UTF8String]);
            }));

    auto fsCallPath = [&rt, &iex, weakSelf](const char *name,
                                            void (^op)(HermesBridge *, int32_t, NSString *)) {
        iex.setProperty(rt, name,
            Function::createFromHostFunction(rt, PropNameID::forAscii(rt, name), 2,
                [weakSelf, op](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                    if (count < 2) return Value::undefined();
                    int32_t reqId = (int32_t)args[0].asNumber();
                    NSString *path = [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()];
                    HermesBridge *strong = weakSelf;
                    if (strong) op(strong, reqId, path);
                    return Value::undefined();
                }));
    };
    fsCallPath("fsReadText",  ^(HermesBridge *s, int32_t r, NSString *p) { [s fsReadText:r  path:p]; });
    fsCallPath("fsReadBytes", ^(HermesBridge *s, int32_t r, NSString *p) { [s fsReadBytes:r path:p]; });
    fsCallPath("fsExists",    ^(HermesBridge *s, int32_t r, NSString *p) { [s fsExists:r    path:p]; });
    fsCallPath("fsStat",      ^(HermesBridge *s, int32_t r, NSString *p) { [s fsStat:r      path:p]; });
    fsCallPath("fsList",      ^(HermesBridge *s, int32_t r, NSString *p) { [s fsList:r      path:p]; });
    fsCallPath("fsRemove",    ^(HermesBridge *s, int32_t r, NSString *p) { [s fsRemove:r    path:p]; });

    auto fsCallPathString = [&rt, &iex, weakSelf](const char *name,
                                                  void (^op)(HermesBridge *, int32_t, NSString *, NSString *)) {
        iex.setProperty(rt, name,
            Function::createFromHostFunction(rt, PropNameID::forAscii(rt, name), 3,
                [weakSelf, op](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                    if (count < 3) return Value::undefined();
                    int32_t reqId = (int32_t)args[0].asNumber();
                    NSString *a = [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()];
                    NSString *b = [NSString stringWithUTF8String:args[2].getString(rt).utf8(rt).c_str()];
                    HermesBridge *strong = weakSelf;
                    if (strong) op(strong, reqId, a, b);
                    return Value::undefined();
                }));
    };
    fsCallPathString("fsWriteText",  ^(HermesBridge *s, int32_t r, NSString *a, NSString *b) { [s fsWriteText:r  path:a content:b]; });
    fsCallPathString("fsWriteBytes", ^(HermesBridge *s, int32_t r, NSString *a, NSString *b) { [s fsWriteBytes:r path:a base64:b]; });
    fsCallPathString("fsMove",       ^(HermesBridge *s, int32_t r, NSString *a, NSString *b) { [s fsMove:r       from:a to:b]; });
    fsCallPathString("fsCopy",       ^(HermesBridge *s, int32_t r, NSString *a, NSString *b) { [s fsCopy:r       from:a to:b]; });

    iex.setProperty(rt, "fsMkdir",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "fsMkdir"), 3,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 2) return Value::undefined();
                int32_t reqId = (int32_t)args[0].asNumber();
                NSString *path = [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()];
                BOOL recursive = (count > 2 && args[2].isBool()) ? args[2].getBool() : NO;
                HermesBridge *strong = weakSelf;
                if (strong) [strong fsMkdir:reqId path:path recursive:recursive];
                return Value::undefined();
            }));

    auto fsCallPanel = [&rt, &iex, weakSelf](const char *name,
                                             void (^op)(HermesBridge *, int32_t, NSDictionary *)) {
        iex.setProperty(rt, name,
            Function::createFromHostFunction(rt, PropNameID::forAscii(rt, name), 2,
                [weakSelf, op](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                    if (count < 2) return Value::undefined();
                    int32_t reqId = (int32_t)args[0].asNumber();
                    NSString *json = [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()];
                    NSData *d = [json dataUsingEncoding:NSUTF8StringEncoding];
                    NSDictionary *opts = d ? [NSJSONSerialization JSONObjectWithData:d options:0 error:nil] : nil;
                    if (![opts isKindOfClass:[NSDictionary class]]) opts = @{};
                    HermesBridge *strong = weakSelf;
                    if (strong) op(strong, reqId, opts);
                    return Value::undefined();
                }));
    };
    fsCallPanel("fsOpenPanel", ^(HermesBridge *s, int32_t r, NSDictionary *o) { [s fsOpenPanel:r opts:o]; });
    fsCallPanel("fsSavePanel", ^(HermesBridge *s, int32_t r, NSDictionary *o) { [s fsSavePanel:r opts:o]; });

    iex.setProperty(rt, "fsReveal",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "fsReveal"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1 || !args[0].isString()) return Value::undefined();
                NSString *path = [NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()];
                HermesBridge *strong = weakSelf;
                if (strong) [strong fsReveal:path];
                return Value::undefined();
            }));

    iex.setProperty(rt, "appSetIcon",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "appSetIcon"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                NSDictionary *opts = nil;
                if (count >= 1 && args[0].isString()) {
                    NSString *json = [NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()];
                    NSData *d = [json dataUsingEncoding:NSUTF8StringEncoding];
                    id parsed = d ? [NSJSONSerialization JSONObjectWithData:d options:0 error:nil] : nil;
                    if ([parsed isKindOfClass:[NSDictionary class]]) opts = parsed;
                }
                [strong appSetIcon:opts];
                return Value::undefined();
            }));

    iex.setProperty(rt, "appSetBadge",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "appSetBadge"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                NSString *text = (count >= 1 && args[0].isString())
                    ? [NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()]
                    : nil;
                [strong appSetBadge:text];
                return Value::undefined();
            }));

    iex.setProperty(rt, "appRequestAttention",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "appRequestAttention"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                BOOL critical = (count >= 1 && args[0].isBool()) ? args[0].getBool() : NO;
                [strong appRequestAttention:critical];
                return Value::undefined();
            }));

    iex.setProperty(rt, "appActivate",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "appActivate"), 0,
            [weakSelf](Runtime &rt, const Value &, const Value *, size_t) -> Value {
                HermesBridge *strong = weakSelf;
                if (strong) [strong appActivate];
                return Value::undefined();
            }));

    iex.setProperty(rt, "appQuit",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "appQuit"), 0,
            [weakSelf](Runtime &rt, const Value &, const Value *, size_t) -> Value {
                HermesBridge *strong = weakSelf;
                if (strong) [strong appQuit];
                return Value::undefined();
            }));

    iex.setProperty(rt, "notifRequestAuth",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "notifRequestAuth"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1) return Value::undefined();
                int32_t reqId = (int32_t)args[0].asNumber();
                HermesBridge *strong = weakSelf;
                if (strong) [strong notifRequestAuth:reqId];
                return Value::undefined();
            }));

    iex.setProperty(rt, "notifSchedule",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "notifSchedule"), 2,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 2 || !args[1].isString()) return Value::undefined();
                int32_t reqId = (int32_t)args[0].asNumber();
                NSString *json = [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()];
                NSData *d = [json dataUsingEncoding:NSUTF8StringEncoding];
                id parsed = d ? [NSJSONSerialization JSONObjectWithData:d options:0 error:nil] : nil;
                NSDictionary *opts = [parsed isKindOfClass:[NSDictionary class]] ? parsed : @{};
                HermesBridge *strong = weakSelf;
                if (strong) [strong notifSchedule:reqId opts:opts];
                return Value::undefined();
            }));

    iex.setProperty(rt, "notifCancel",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "notifCancel"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1 || !args[0].isString()) return Value::undefined();
                NSString *idStr = [NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()];
                HermesBridge *strong = weakSelf;
                if (strong) [strong notifCancel:idStr];
                return Value::undefined();
            }));

    iex.setProperty(rt, "notifCancelAll",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "notifCancelAll"), 0,
            [weakSelf](Runtime &rt, const Value &, const Value *, size_t) -> Value {
                HermesBridge *strong = weakSelf;
                if (strong) [strong notifCancelAll];
                return Value::undefined();
            }));

    iex.setProperty(rt, "notifListPending",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "notifListPending"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1) return Value::undefined();
                int32_t reqId = (int32_t)args[0].asNumber();
                HermesBridge *strong = weakSelf;
                if (strong) [strong notifListPending:reqId];
                return Value::undefined();
            }));

    installCallbackSetter("onNotificationTap",
        ^(HermesBridge *s, std::shared_ptr<Function> fn) { s->_notifTapCallback = fn; }, nil);

    iex.setProperty(rt, "statusBarAdd",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "statusBarAdd"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                HermesBridge *strong = weakSelf;
                if (!strong) return Value(0.0);
                NSDictionary *opts = @{};
                if (count >= 1 && args[0].isString()) {
                    NSString *json = [NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()];
                    NSData *d = [json dataUsingEncoding:NSUTF8StringEncoding];
                    id parsed = d ? [NSJSONSerialization JSONObjectWithData:d options:0 error:nil] : nil;
                    if ([parsed isKindOfClass:[NSDictionary class]]) opts = parsed;
                }
                return Value((double)[strong statusBarAdd:opts]);
            }));

    iex.setProperty(rt, "statusBarUpdate",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "statusBarUpdate"), 2,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 2 || !args[1].isString()) return Value::undefined();
                int32_t itemId = (int32_t)args[0].asNumber();
                NSString *json = [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()];
                NSData *d = [json dataUsingEncoding:NSUTF8StringEncoding];
                id parsed = d ? [NSJSONSerialization JSONObjectWithData:d options:0 error:nil] : nil;
                NSDictionary *opts = [parsed isKindOfClass:[NSDictionary class]] ? parsed : @{};
                HermesBridge *strong = weakSelf;
                if (strong) [strong statusBarUpdate:itemId opts:opts];
                return Value::undefined();
            }));

    iex.setProperty(rt, "statusBarRemove",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "statusBarRemove"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1) return Value::undefined();
                int32_t itemId = (int32_t)args[0].asNumber();
                HermesBridge *strong = weakSelf;
                if (strong) [strong statusBarRemove:itemId];
                return Value::undefined();
            }));

    iex.setProperty(rt, "statusBarSetMenu",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "statusBarSetMenu"), 3,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 2 || !args[1].isString()) return Value::undefined();
                int32_t itemId = (int32_t)args[0].asNumber();
                NSString *json = [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()];
                NSData *d = [json dataUsingEncoding:NSUTF8StringEncoding];
                id parsed = d ? [NSJSONSerialization JSONObjectWithData:d options:0 error:nil] : nil;
                NSArray *items = [parsed isKindOfClass:[NSArray class]] ? parsed : @[];
                std::shared_ptr<Function> fn;
                if (count >= 3 && args[2].isObject() && args[2].asObject(rt).isFunction(rt)) {
                    fn = std::make_shared<Function>(args[2].asObject(rt).asFunction(rt));
                }
                HermesBridge *strong = weakSelf;
                if (strong) [strong statusBarSetMenu:itemId items:items dispatch:fn];
                return Value::undefined();
            }));

    iex.setProperty(rt, "statusBarSetPress",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "statusBarSetPress"), 2,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1) return Value::undefined();
                int32_t itemId = (int32_t)args[0].asNumber();
                std::shared_ptr<Function> fn;
                if (count >= 2 && args[1].isObject() && args[1].asObject(rt).isFunction(rt)) {
                    fn = std::make_shared<Function>(args[1].asObject(rt).asFunction(rt));
                }
                HermesBridge *strong = weakSelf;
                if (strong) [strong statusBarSetPress:itemId callback:fn];
                return Value::undefined();
            }));

    iex.setProperty(rt, "animCreateValue",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "animCreateValue"), 2,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 2) return Value::undefined();
                HermesBridge *strong = weakSelf;
                if (strong) [strong animCreateValue:(int32_t)args[0].asNumber() initial:args[1].asNumber()];
                return Value::undefined();
            }));

    iex.setProperty(rt, "animSetValue",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "animSetValue"), 2,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 2) return Value::undefined();
                HermesBridge *strong = weakSelf;
                if (strong) [strong animSetValue:(int32_t)args[0].asNumber() value:args[1].asNumber()];
                return Value::undefined();
            }));

    iex.setProperty(rt, "animBindView",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "animBindView"), 3,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 3 || !args[2].isString()) return Value::undefined();
                NSString *prop = [NSString stringWithUTF8String:args[2].getString(rt).utf8(rt).c_str()];
                HermesBridge *strong = weakSelf;
                if (strong) [strong animBindView:(int32_t)args[0].asNumber()
                                             tag:(int32_t)args[1].asNumber()
                                        property:prop];
                return Value::undefined();
            }));

    iex.setProperty(rt, "animUnbindView",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "animUnbindView"), 3,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 3 || !args[2].isString()) return Value::undefined();
                NSString *prop = [NSString stringWithUTF8String:args[2].getString(rt).utf8(rt).c_str()];
                HermesBridge *strong = weakSelf;
                if (strong) [strong animUnbindView:(int32_t)args[0].asNumber()
                                               tag:(int32_t)args[1].asNumber()
                                          property:prop];
                return Value::undefined();
            }));

    iex.setProperty(rt, "animTimingStart",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "animTimingStart"), 5,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 4) return Value::undefined();
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                int32_t completionId = count >= 5 ? (int32_t)args[4].asNumber() : 0;
                [strong animTimingStart:(int32_t)args[0].asNumber()
                                valueId:(int32_t)args[1].asNumber()
                                toValue:args[2].asNumber()
                               duration:args[3].asNumber()
                           completionId:completionId];
                return Value::undefined();
            }));

    iex.setProperty(rt, "animStop",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "animStop"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1) return Value::undefined();
                HermesBridge *strong = weakSelf;
                if (strong) [strong animStop:(int32_t)args[0].asNumber()];
                return Value::undefined();
            }));

    iex.setProperty(rt, "wsConnect",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "wsConnect"), 2,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 2) return Value::undefined();
                int32_t wsId = (int32_t)args[0].asNumber();
                NSString *url = [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()];
                HermesBridge *strong = weakSelf;
                if (strong) [strong wsConnectId:wsId url:url];
                return Value::undefined();
            }));

    iex.setProperty(rt, "wsSend",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "wsSend"), 2,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 2) return Value::undefined();
                int32_t wsId = (int32_t)args[0].asNumber();
                NSString *data = [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()];
                HermesBridge *strong = weakSelf;
                if (strong) [strong wsSendId:wsId data:data];
                return Value::undefined();
            }));

    iex.setProperty(rt, "wsClose",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "wsClose"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1) return Value::undefined();
                int32_t wsId = (int32_t)args[0].asNumber();
                HermesBridge *strong = weakSelf;
                if (strong) [strong wsCloseId:wsId];
                return Value::undefined();
            }));

    iex.setProperty(rt, "focus",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "focus"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1) return Value::undefined();
                int32_t tag = (int32_t)args[0].asNumber();
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                NSView *v = strong->_views[@(tag)];
                if (v && v.window) [v.window makeFirstResponder:v];
                return Value::undefined();
            }));

    iex.setProperty(rt, "blur",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "blur"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1) return Value::undefined();
                int32_t tag = (int32_t)args[0].asNumber();
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                NSView *v = strong->_views[@(tag)];
                if (v && v.window && v.window.firstResponder == v) {
                    [v.window makeFirstResponder:nil];
                }
                return Value::undefined();
            }));

    iex.setProperty(rt, "measure",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "measure"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1) return Value::undefined();
                int32_t tag = (int32_t)args[0].asNumber();
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                NSView *v = [strong outerForTag:tag];
                if (!v) return Value::undefined();
                NSRect f = v.frame;
                NSRect win = [v convertRect:v.bounds toView:nil];
                NSString *s = [NSString stringWithFormat:
                    @"{\"x\":%f,\"y\":%f,\"width\":%f,\"height\":%f,\"pageX\":%f,\"pageY\":%f}",
                    f.origin.x, f.origin.y, f.size.width, f.size.height,
                    win.origin.x, win.origin.y];
                return jsi::String::createFromUtf8(rt, [s UTF8String]);
            }));

    iex.setProperty(rt, "scrollTo",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "scrollTo"), 4,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 3) return Value::undefined();
                int32_t tag = (int32_t)args[0].asNumber();
                CGFloat x = args[1].asNumber();
                CGFloat y = args[2].asNumber();
                BOOL animated = (count > 3 && args[3].isBool()) ? args[3].getBool() : NO;
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                NSView *outer = strong->_outerViews[@(tag)];
                if (![outer isKindOfClass:[NSScrollView class]]) return Value::undefined();
                NSScrollView *scroll = (NSScrollView *)outer;
                NSPoint p = NSMakePoint(x, y);
                if (animated) [scroll.contentView.animator setBoundsOrigin:p];
                else [scroll.contentView scrollToPoint:p];
                [scroll reflectScrolledClipView:scroll.contentView];
                return Value::undefined();
            }));

    iex.setProperty(rt, "windowSet",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "windowSet"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1 || !args[0].isString()) return Value::undefined();
                NSString *json = [NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()];
                HermesBridge *strong = weakSelf;
                if (strong) [strong applyWindowConfigJSON:json];
                return Value::undefined();
            }));

    iex.setProperty(rt, "toolbarSet",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "toolbarSet"), 2,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 2 || !args[0].isString()) return Value::undefined();
                NSString *json = [NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()];
                std::shared_ptr<Function> fn;
                if (args[1].isObject() && args[1].asObject(rt).isFunction(rt)) {
                    fn = std::make_shared<Function>(args[1].asObject(rt).asFunction(rt));
                }
                HermesBridge *strong = weakSelf;
                if (strong) [strong applyToolbarConfigJSON:json dispatch:fn];
                return Value::undefined();
            }));

    iex.setProperty(rt, "getColorScheme",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "getColorScheme"), 0,
            [weakSelf](Runtime &rt, const Value &, const Value *, size_t) -> Value {
                HermesBridge *strong = weakSelf;
                NSString *s = strong ? [strong currentColorScheme] : @"light";
                return String::createFromUtf8(rt, s.UTF8String);
            }));

    installCallbackSetter("onColorScheme",
        ^(HermesBridge *s, std::shared_ptr<Function> fn) { s->_colorSchemeCallback = fn; }, nil);

    // Replay roots that already exist (e.g. survived a reload) on registration.
    installCallbackSetter("onNewWindow",
        ^(HermesBridge *s, std::shared_ptr<Function> fn) { s->_newWindowCallback = fn; },
        ^(HermesBridge *s) {
            for (NSNumber *k in s->_views) {
                int32_t t = k.intValue;
                if (t > 1 && t < 100) [s dispatchNewWindowForRootTag:t];
            }
        });

    installCallbackSetter("onCloseWindow",
        ^(HermesBridge *s, std::shared_ptr<Function> fn) { s->_closeWindowCallback = fn; }, nil);

    iex.setProperty(rt, "menuItemAdd",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "menuItemAdd"), 5,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 5) return Value(0.0);
                NSString *menu = [NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()];
                NSString *label = [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()];
                NSString *key = [NSString stringWithUTF8String:args[2].getString(rt).utf8(rt).c_str()];
                NSUInteger mask = (NSUInteger)args[3].asNumber();
                if (!args[4].isObject() || !args[4].asObject(rt).isFunction(rt)) return Value(0.0);
                auto fn = std::make_shared<Function>(args[4].asObject(rt).asFunction(rt));
                HermesBridge *strong = weakSelf;
                if (!strong) return Value(0.0);
                int32_t id = [strong addMenuItemTo:menu label:label keyEquivalent:key
                                       modifierMask:mask callback:fn];
                return Value((double)id);
            }));

    iex.setProperty(rt, "menuItemRemove",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "menuItemRemove"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1) return Value::undefined();
                int32_t id = (int32_t)args[0].asNumber();
                HermesBridge *strong = weakSelf;
                if (strong) [strong removeMenuItemId:id];
                return Value::undefined();
            }));

    iex.setProperty(rt, "screenMetrics",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "screenMetrics"), 0,
            [](Runtime &rt, const Value &, const Value *, size_t) -> Value {
                NSScreen *screen = NSScreen.mainScreen;
                CGFloat scale = screen.backingScaleFactor;
                NSSize screenSize = screen.frame.size;
                NSWindow *win = NSApp.mainWindow ?: NSApp.windows.firstObject;
                NSSize winSize = win ? win.contentView.bounds.size : NSMakeSize(800, 600);
                NSString *s = [NSString stringWithFormat:
                    @"{\"window\":{\"width\":%f,\"height\":%f,\"scale\":%f,\"fontScale\":1},"
                     "\"screen\":{\"width\":%f,\"height\":%f,\"scale\":%f,\"fontScale\":1}}",
                    winSize.width, winSize.height, scale,
                    screenSize.width, screenSize.height, scale];
                return jsi::String::createFromUtf8(rt, [s UTF8String]);
            }));

    iex.setProperty(rt, "showRedBox",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "showRedBox"), 2,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                NSString *title = (count > 0 && args[0].isString())
                    ? [NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()] : @"Error";
                NSString *msg = (count > 1 && args[1].isString())
                    ? [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()] : @"";
                HermesBridge *strong = weakSelf;
                if (strong) [strong showRedBoxTitle:title message:msg];
                return Value::undefined();
            }));

    iex.setProperty(rt, "updateRedBox",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "updateRedBox"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1 || !args[0].isString()) return Value::undefined();
                NSString *msg = [NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()];
                HermesBridge *strong = weakSelf;
                if (strong) [strong updateRedBoxText:msg];
                return Value::undefined();
            }));

    iex.setProperty(rt, "showAlert",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "showAlert"), 3,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                NSString *title = (count > 0 && args[0].isString())
                    ? [NSString stringWithUTF8String:args[0].getString(rt).utf8(rt).c_str()] : @"";
                NSString *msg = (count > 1 && args[1].isString())
                    ? [NSString stringWithUTF8String:args[1].getString(rt).utf8(rt).c_str()] : @"";
                NSMutableArray<NSString *> *buttons = [NSMutableArray new];
                if (count > 2 && args[2].isObject()) {
                    Object arr = args[2].getObject(rt);
                    if (arr.isArray(rt)) {
                        Array a = arr.getArray(rt);
                        size_t len = a.size(rt);
                        for (size_t i = 0; i < len; i++) {
                            Value v = a.getValueAtIndex(rt, i);
                            if (v.isString()) {
                                [buttons addObject:[NSString stringWithUTF8String:v.getString(rt).utf8(rt).c_str()]];
                            }
                        }
                    }
                }
                if (buttons.count == 0) [buttons addObject:@"OK"];
                dispatch_async(dispatch_get_main_queue(), ^{
                    NSAlert *a = [[NSAlert alloc] init];
                    a.messageText = title;
                    a.informativeText = msg;
                    for (NSString *b in buttons) [a addButtonWithTitle:b];
                    [a runModal];
                });
                return Value::undefined();
            }));

    iex.setProperty(rt, "insertBefore",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "insertBefore"), 3,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 2) return Value::undefined();
                int32_t parent = (int32_t)args[0].asNumber();
                int32_t child = (int32_t)args[1].asNumber();
                int32_t before = (count > 2 && args[2].isNumber())
                    ? (int32_t)args[2].asNumber() : 0;
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                [strong nativeInsertChild:parent child:child before:before];
                return Value::undefined();
            }));

    iex.setProperty(rt, "removeChild",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "removeChild"), 2,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 2) return Value::undefined();
                int32_t parent = (int32_t)args[0].asNumber();
                int32_t child = (int32_t)args[1].asNumber();
                HermesBridge *strong = weakSelf;
                if (!strong) return Value::undefined();
                [strong nativeRemoveChild:parent child:child];
                return Value::undefined();
            }));

    iex.setProperty(rt, "switchBundle",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "switchBundle"), 1,
            [weakSelf](Runtime &rt, const Value &, const Value *args, size_t count) -> Value {
                if (count < 1 || !args[0].isString()) return Value::undefined();
                std::string url = args[0].getString(rt).utf8(rt);
                HermesBridge *strong = weakSelf;
                if (!strong || !strong->_switchBundleHandler) return Value::undefined();
                NSString *u = [NSString stringWithUTF8String:url.c_str()];
                // Defer to the next runloop tick — we're mid-JS execution and
                // the Swift handler will tear down this very runtime.
                dispatch_async(dispatch_get_main_queue(), ^{
                    if (strong->_switchBundleHandler) strong->_switchBundleHandler(u);
                });
                return Value::undefined();
            }));

    iex.setProperty(rt, "showLauncher",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "showLauncher"), 0,
            [weakSelf](Runtime &, const Value &, const Value *, size_t) -> Value {
                HermesBridge *strong = weakSelf;
                if (!strong || !strong->_showLauncherHandler) return Value::undefined();
                dispatch_async(dispatch_get_main_queue(), ^{
                    if (strong->_showLauncherHandler) strong->_showLauncherHandler();
                });
                return Value::undefined();
            }));

    iex.setProperty(rt, "refreshSidebar",
        Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "refreshSidebar"), 0,
            [weakSelf](Runtime &, const Value &, const Value *, size_t) -> Value {
                HermesBridge *strong = weakSelf;
                if (!strong || !strong->_refreshSidebarHandler) return Value::undefined();
                dispatch_async(dispatch_get_main_queue(), ^{
                    if (strong->_refreshSidebarHandler) strong->_refreshSidebarHandler();
                });
                return Value::undefined();
            }));

    rt.global().setProperty(rt, "__iex", iex);
}

@end
