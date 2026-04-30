// iex-runtime.js — macOS shim for `react-native`.
// Provides components + module surfaces used by user code, backed by
// react-reconciler 0.32 and global.__iex.* host functions in HermesBridge.
//
// Imports pulled in below resolve from the shell's own node_modules.

const React = require('react');
const ReactReconciler = require('react-reconciler');

const native = global.__iex;
if (!native) {
  throw new Error('iex-runtime: global.__iex host functions not installed');
}

const ROOT_TAG = 1;

// ─── style helpers ───

function flattenStyle(style) {
  if (!style) return {};
  if (Array.isArray(style)) {
    const out = {};
    for (let i = 0; i < style.length; i++) {
      const s = flattenStyle(style[i]);
      for (const k in s) out[k] = s[k];
    }
    return out;
  }
  if (typeof style === 'object') {
    const out = {};
    for (const k in style) out[k] = resolveAnimated(style[k]);
    return out;
  }
  return {};
}

function resolveAnimated(v) {
  if (v && typeof v === 'object' && typeof v.__getValue === 'function') {
    return v.__getValue();
  }
  return v;
}

function applyProp(tag, key, value) {
  if (typeof value === 'function') {
    native.setProp(tag, key, value);
    return;
  }
  if (key === 'transform') {
    if (Array.isArray(value)) {
      const ops = value.map(op => {
        const out = {};
        for (const k in op) out[k] = resolveAnimated(op[k]);
        return out;
      });
      native.setProp(tag, 'transform', JSON.stringify(ops));
    } else if (value == null) {
      native.setProp(tag, 'transform', null);
    }
    return;
  }
  if (value == null) {
    native.setProp(tag, key, null);
    return;
  }
  if (typeof value === 'object') return;
  native.setProp(tag, key, value);
}

function applyProps(tag, props) {
  for (const key in props) {
    if (key === 'children') continue;
    const v = props[key];
    if (v == null) continue;
    if (key === 'style') {
      const flat = flattenStyle(v);
      for (const sk in flat) applyProp(tag, sk, flat[sk]);
      continue;
    }
    applyProp(tag, key, v);
  }
}

// ─── react-reconciler host config ───

const DefaultEventPriority = 32;
const NoEventPriority = 0;
let currentUpdatePriority = NoEventPriority;

const noop = function () {};
const returnFalse = function () { return false; };
const returnNull = function () { return null; };

const HostConfig = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  supportsResources: false,
  supportsSingletons: false,
  supportsMicrotasks: false,
  supportsTestSelectors: false,
  isPrimaryRenderer: true,
  warnsIfNotActing: false,

  noTimeout: -1,
  scheduleTimeout: typeof setTimeout === 'function' ? setTimeout : null,
  cancelTimeout: typeof clearTimeout === 'function' ? clearTimeout : null,
  scheduleMicrotask: typeof queueMicrotask === 'function' ? queueMicrotask : function (cb) { Promise.resolve().then(cb); },

  rendererPackageName: 'iex-runtime',
  rendererVersion: '0.0.1',
  extraDevToolsConfig: null,

  HostTransitionContext: React.createContext(null),
  NotPendingTransition: null,

  getCurrentUpdatePriority() { return currentUpdatePriority; },
  setCurrentUpdatePriority(prio) { currentUpdatePriority = prio; },
  resolveUpdatePriority() {
    return currentUpdatePriority !== NoEventPriority ? currentUpdatePriority : DefaultEventPriority;
  },
  resolveEventType: returnNull,
  resolveEventTimeStamp() { return -1.1; },
  trackSchedulerEvent: noop,
  shouldAttemptEagerTransition: returnFalse,
  requestPostPaintCallback: noop,

  getRootHostContext() { return {}; },
  getChildHostContext(parentContext) { return parentContext; },
  prepareForCommit() { return null; },
  resetAfterCommit() {
    if (typeof native.flushLayout !== 'function') return;
    for (const tag of containersByTag.keys()) native.flushLayout(tag);
  },
  getPublicInstance(instance) {
    // `instance` is the integer tag returned from createInstance. Wrap it
    // in an imperative-handle so refs receive an RN-style host instance.
    return makeHostHandle(instance);
  },
  shouldSetTextContent(type, props) {
    if (type !== 'iex_text') return false;
    const c = props && props.children;
    return typeof c === 'string' || typeof c === 'number';
  },
  finalizeInitialChildren: returnFalse,
  clearContainer: noop,
  detachDeletedInstance(instance) {
    _hostHandleCache.delete(instance);
  },
  getInstanceFromNode: returnNull,
  beforeActiveInstanceBlur: noop,
  afterActiveInstanceBlur: noop,
  prepareScopeUpdate: noop,
  getInstanceFromScope: returnNull,
  preparePortalMount: noop,
  resetFormInstance: noop,
  bindToConsole(name, args) {
    const fn = (typeof console !== 'undefined' && console[name]) || function () {};
    return Function.prototype.bind.apply(fn, [console].concat(args));
  },

  maySuspendCommit: returnFalse,
  mayResourceSuspendCommit: returnFalse,
  preloadInstance: returnFalse,
  preloadResource: returnFalse,
  startSuspendingCommit: noop,
  suspendInstance: noop,
  suspendResource: noop,
  suspendOnActiveViewTransition: noop,
  waitForCommitToBeReady: returnNull,
  startViewTransition: returnFalse,
  startGestureTransition: returnNull,
  stopGestureTransition: noop,
  createViewTransitionInstance: returnNull,
  cancelViewTransitionName: noop,
  cancelRootViewTransitionName: noop,
  restoreRootViewTransitionName: noop,
  cloneRootViewTransitionContainer: returnNull,
  removeRootViewTransitionClone: noop,
  measureClonedInstance: returnNull,
  hasInstanceAffectedParent: returnFalse,
  hasInstanceChanged: returnFalse,
  getCurrentGestureOffset: returnNull,
  subscribeToGestureDirection: noop,
  setupIntersectionObserver: noop,
  matchAccessibilityRole: returnFalse,
  setFocusIfFocusable: returnFalse,
  getBoundingRect: returnNull,
  getTextContent() { return ''; },

  createFragmentInstance: returnNull,
  updateFragmentInstanceFiber: noop,
  commitNewChildToFragmentInstance: noop,
  deleteChildFromFragmentInstance: noop,

  isHostHoistableType: returnFalse,
  isHostSingletonType: returnFalse,
  isSingletonScope: returnFalse,
  isHiddenSubtree: returnFalse,
  resolveSingletonInstance: returnNull,
  acquireSingletonInstance: noop,
  releaseSingletonInstance: noop,
  acquireResource: returnNull,
  releaseResource: noop,
  getResource: returnNull,
  createHoistableInstance: returnNull,
  mountHoistable: noop,
  unmountHoistable: noop,
  hydrateHoistable: returnNull,
  getHoistableRoot: returnNull,
  prepareToCommitHoistables: noop,

  hideInstance: noop,
  hideTextInstance: noop,
  unhideInstance: noop,
  unhideTextInstance: noop,
  resetTextContent: noop,
  commitMount: noop,

  createInstance(type, props) {
    const tag = native.createView(type);
    applyProps(tag, props);
    if (type === 'iex_text') {
      const c = props && props.children;
      if (typeof c === 'string' || typeof c === 'number') {
        native.setProp(tag, 'text', String(c));
      }
    }
    return tag;
  },
  createTextInstance(text) {
    const tag = native.createView('iex_text');
    native.setProp(tag, 'text', String(text));
    return tag;
  },
  appendInitialChild(parent, child) { native.appendChild(parent, child); },
  appendChild(parent, child) { native.appendChild(parent, child); },
  appendChildToContainer(container, child) { native.appendChild(container, child); },
  removeChild(parent, child) { native.removeChild(parent, child); },
  removeChildFromContainer(container, child) { native.removeChild(container, child); },
  insertBefore(parent, child, before) {
    if (typeof native.insertBefore === 'function') native.insertBefore(parent, child, before || 0);
    else native.appendChild(parent, child);
  },
  insertInContainerBefore(container, child, before) {
    if (typeof native.insertBefore === 'function') native.insertBefore(container, child, before || 0);
    else native.appendChild(container, child);
  },
  commitUpdate(instance, type, oldProps, newProps) {
    const oldStyle = flattenStyle(oldProps.style);
    const newStyle = flattenStyle(newProps.style);
    for (const sk in newStyle) {
      if (oldStyle[sk] !== newStyle[sk]) applyProp(instance, sk, newStyle[sk]);
    }
    for (const sk in oldStyle) {
      if (!(sk in newStyle)) applyProp(instance, sk, null);
    }

    for (const key in newProps) {
      if (key === 'children' || key === 'style') continue;
      if (oldProps[key] !== newProps[key]) applyProp(instance, key, newProps[key]);
    }
    for (const key in oldProps) {
      if (key === 'children' || key === 'style') continue;
      if (!(key in newProps)) applyProp(instance, key, null);
    }

    if (type === 'iex_text' && oldProps.children !== newProps.children) {
      const c = newProps.children;
      native.setProp(instance, 'text', c == null ? '' : String(c));
    }
  },
  commitTextUpdate(textInstance, oldText, newText) {
    native.setProp(textInstance, 'text', String(newText));
  },
};

const _hostHandleCache = new Map();
function makeHostHandle(tag) {
  let h = _hostHandleCache.get(tag);
  if (h) return h;
  h = {
    _tag: tag,
    focus() { if (typeof native.focus === 'function') native.focus(tag); },
    blur() { if (typeof native.blur === 'function') native.blur(tag); },
    measure(cb) {
      if (typeof native.measure !== 'function') return;
      try {
        const data = JSON.parse(native.measure(tag) || '{}');
        if (cb) cb(data.x, data.y, data.width, data.height, data.pageX, data.pageY);
      } catch (e) {}
    },
    measureInWindow(cb) {
      if (typeof native.measure !== 'function') return;
      try {
        const data = JSON.parse(native.measure(tag) || '{}');
        if (cb) cb(data.pageX, data.pageY, data.width, data.height);
      } catch (e) {}
    },
    scrollTo(opts) {
      if (typeof native.scrollTo !== 'function') return;
      const x = (opts && typeof opts.x === 'number') ? opts.x : 0;
      const y = (opts && typeof opts.y === 'number') ? opts.y : 0;
      const animated = !opts || opts.animated !== false;
      native.scrollTo(tag, x, y, animated);
    },
    scrollToEnd(opts) {
      // Best-effort: scroll to a large y; AppKit clamps to content.
      if (typeof native.scrollTo === 'function') {
        native.scrollTo(tag, 0, 1e7, !opts || opts.animated !== false);
      }
    },
    setNativeProps(props) {
      // Imperative direct prop write — bypasses React commit.
      if (!props) return;
      for (const k in props) applyProp(tag, k, props[k]);
    },
  };
  _hostHandleCache.set(tag, h);
  return h;
}

const Reconciler = ReactReconciler(HostConfig);
const containersByTag = new Map();
const RootTagContext = React.createContext(ROOT_TAG);

function _reportError(source, e) {
  const msg = (e && e.message) ? e.message : String(e);
  const stack = (e && e.stack) ? e.stack : '';
  if (typeof native.showRedBox === 'function') {
    native.showRedBox(source, msg + (stack ? '\n\n' + stack : ''));
  } else {
    nativeLog('[iex error] ' + source + ': ' + msg);
  }
}

global.__iex_handleError = _reportError;

global.__iex_symbolicate = function (rawStack) {
  // POST to metro's /symbolicate to map bundle line/cols back to source.
  const port = (typeof __IEX_APP_CONFIG__ !== 'undefined' && __IEX_APP_CONFIG__.port) || 8081;
  const url = 'http://localhost:' + port + '/symbolicate';
  const frames = [];
  const re = /at\s+([^\s(]+)?\s*\(?([^):]+):(\d+):(\d+)\)?/g;
  let m;
  while ((m = re.exec(rawStack)) !== null) {
    frames.push({ methodName: m[1] || '<anonymous>', file: m[2], lineNumber: Number(m[3]), column: Number(m[4]) });
  }
  if (frames.length === 0) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stack: frames }),
  }).then(r => r.json()).then(data => {
    if (!data || !data.stack) return;
    const lines = data.stack.map(f =>
      `    at ${f.methodName || '<anonymous>'} (${f.file || '?'}:${f.lineNumber}:${f.column})`);
    const head = rawStack.split('\n')[0] || '';
    if (typeof native.updateRedBox === 'function') {
      native.updateRedBox(head + '\n\n' + lines.join('\n'));
    }
  }).catch(() => { /* leave raw stack */ });
};

function render(element, rootTag) {
  const tag = rootTag != null ? rootTag : ROOT_TAG;
  let container = containersByTag.get(tag);
  if (!container) {
    container = Reconciler.createContainer(
      tag, 0, null, false, null, '',
      function (e) { _reportError('Uncaught error', e); },
      function (e) { _reportError('Caught error', e); },
      function (e) { _reportError('Recoverable error', e); },
      null
    );
    containersByTag.set(tag, container);
  }
  Reconciler.updateContainer(element, container, null, function () {});
}

// ─── components ───

function View(props) {
  const p = props || {};
  if (p.onFileDrop) {
    const userCb = p.onFileDrop;
    const wrapped = function (json) {
      try { userCb(JSON.parse(json || '[]')); } catch (e) { userCb([]); }
    };
    return React.createElement('iex_view', { ...p, onFileDrop: wrapped }, p.children);
  }
  return React.createElement('iex_view', p, p.children);
}

function flattenTextChildren(c) {
  if (c == null || c === false) return '';
  if (typeof c === 'string' || typeof c === 'number') return String(c);
  if (Array.isArray(c)) return c.map(flattenTextChildren).join('');
  // React element — try to extract its rendered string children, else ignore.
  if (c && typeof c === 'object' && c.props && 'children' in c.props) {
    return flattenTextChildren(c.props.children);
  }
  return '';
}

function Text(props) {
  const text = flattenTextChildren(props && props.children);
  return React.createElement('iex_text', { ...(props || {}), children: text });
}

function TouchableOpacity(props) {
  const { onPress, onHoverIn, onHoverOut, style, children, hitSlop, activeOpacity, disabled, ...rest } = props || {};
  return React.createElement('iex_view',
    {
      ...rest,
      style,
      activeOpacity: activeOpacity == null ? 0.2 : activeOpacity,
      onPress: disabled ? undefined : onPress,
      onHoverIn,
      onHoverOut,
    },
    children);
}

function Pressable(props) {
  const { onPress, style, children, disabled, ...rest } = props || {};
  return React.createElement('iex_view',
    {
      ...rest,
      style,
      activeOpacity: 0.6,
      onPress: disabled ? undefined : onPress,
    },
    children);
}

function ScrollView(props) {
  const { onScroll, contentInset, children, contentContainerStyle, style, ...rest } = props || {};

  const wrappedScroll = onScroll
    ? (jsonStr) => {
        try { onScroll({ nativeEvent: JSON.parse(jsonStr) }); } catch (e) {}
      }
    : undefined;

  const insetProps = {};
  if (contentInset) {
    if (typeof contentInset.top === 'number') insetProps.contentInsetTop = contentInset.top;
    if (typeof contentInset.right === 'number') insetProps.contentInsetRight = contentInset.right;
    if (typeof contentInset.bottom === 'number') insetProps.contentInsetBottom = contentInset.bottom;
    if (typeof contentInset.left === 'number') insetProps.contentInsetLeft = contentInset.left;
  }

  return React.createElement('iex_scroll',
    { ...rest, ...insetProps, style, onScroll: wrappedScroll },
    React.createElement('iex_view', { style: contentContainerStyle }, children));
}

function SafeAreaView(props) {
  return React.createElement('iex_view', props, props && props.children);
}

function Switch(props) {
  const { value, onValueChange, disabled, style, ...rest } = props || {};
  return React.createElement('iex_switch', {
    ...rest,
    style,
    value: !!value,
    disabled: !!disabled,
    onValueChange,
  });
}

function TextInput(props) {
  const {
    value, defaultValue, placeholder, onChangeText, onSubmitEditing,
    secureTextEntry, editable, multiline, style, ...rest
  } = props || {};
  const type = multiline
    ? 'iex_text_input_multi'
    : (secureTextEntry ? 'iex_text_input_secure' : 'iex_text_input');
  return React.createElement(type, {
    ...rest,
    style,
    value: value != null ? String(value) : (defaultValue != null ? String(defaultValue) : ''),
    placeholder: placeholder || '',
    editable: editable !== false,
    onChangeText,
    onSubmitEditing,
  });
}

function FlatList(props) {
  const {
    data, renderItem, keyExtractor, ListEmptyComponent, ListHeaderComponent,
    ListFooterComponent, contentContainerStyle, style, ...rest
  } = props || {};

  const items = (data || []).map((item, index) => {
    const key = keyExtractor ? keyExtractor(item, index) : String(index);
    return React.createElement(React.Fragment, { key }, renderItem({ item, index }));
  });

  let header = null, footer = null, empty = null;
  if (ListHeaderComponent) {
    header = typeof ListHeaderComponent === 'function'
      ? React.createElement(ListHeaderComponent) : ListHeaderComponent;
  }
  if (ListFooterComponent) {
    footer = typeof ListFooterComponent === 'function'
      ? React.createElement(ListFooterComponent) : ListFooterComponent;
  }
  if ((!data || data.length === 0) && ListEmptyComponent) {
    empty = typeof ListEmptyComponent === 'function'
      ? React.createElement(ListEmptyComponent) : ListEmptyComponent;
  }

  return React.createElement('iex_scroll', { ...rest, style },
    React.createElement('iex_view', { style: contentContainerStyle },
      header, ...items, empty, footer));
}

function ActivityIndicator(props) {
  return React.createElement('iex_view',
    { style: [{ width: 20, height: 20 }, props && props.style] });
}

function Image(props) {
  const { source, style, ...rest } = props || {};
  let uri = '';
  if (typeof source === 'string') uri = source;
  else if (source && typeof source === 'object') uri = source.uri || '';
  return React.createElement('iex_image', { ...rest, style, uri });
}

const StatusBar = function () { return null; };

function Modal(props) {
  const {
    visible, transparent, animationType, onRequestClose, onShow,
    presentationStyle, children, ...rest
  } = props || {};
  React.useEffect(() => {
    if (visible && typeof onShow === 'function') onShow();
  }, [visible]);
  if (!visible) return null;
  const bg = transparent ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.5)';
  return React.createElement(View, {
    ...rest,
    style: [
      StyleSheet.absoluteFillObject,
      { backgroundColor: bg, justifyContent: 'center', alignItems: 'center' },
    ],
    onPress: onRequestClose,
  }, children);
}

// ─── StyleSheet ───

const StyleSheet = {
  hairlineWidth: 1,
  absoluteFillObject: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
  },
  get absoluteFill() { return StyleSheet.absoluteFillObject; },
  create(styles) { return styles; },
  flatten: flattenStyle,
  compose(a, b) { return [a, b]; },
};

// ─── Platform / Dimensions / NativeModules ───

const Platform = {
  OS: 'macos',
  Version: 14,
  isPad: false,
  isTV: false,
  isTesting: false,
  constants: { systemName: 'macOS', osVersion: '14' },
  select(map) {
    return map.macos !== undefined ? map.macos
      : map.native !== undefined ? map.native
      : map.default;
  },
};

const NativeModules = {
  SettingsManager: { settings: { AppleLocale: 'en-US', AppleLanguages: ['en-US'] } },
};

const Appearance = {
  getColorScheme() {
    if (native && typeof native.getColorScheme === 'function') {
      return native.getColorScheme();
    }
    return 'light';
  },
  addChangeListener(_listener) {
    // Single-callback bridge: consumers should use iex/appearance's useColorScheme,
    // which fans out one onColorScheme registration to many listeners. Returning
    // a no-op subscription keeps RN-style API consumers happy.
    return { remove() {} };
  },
};

const _initialMetrics = (typeof native.screenMetrics === 'function')
  ? (() => { try { return JSON.parse(native.screenMetrics()); } catch (e) { return null; } })()
  : null;

const Dimensions = {
  _value: {
    window: _initialMetrics ? _initialMetrics.window
      : { width: 800, height: 600, scale: 2, fontScale: 1 },
    screen: _initialMetrics ? _initialMetrics.screen
      : { width: 1440, height: 900, scale: 2, fontScale: 1 },
  },
  _listeners: new Map(),
  _nextId: 1,
  get(key) { return Dimensions._value[key] || Dimensions._value.window; },
  set() {},
  addEventListener(type, cb) {
    if (type !== 'change') return { remove() {} };
    const id = Dimensions._nextId++;
    Dimensions._listeners.set(id, cb);
    return { remove() { Dimensions._listeners.delete(id); } };
  },
  removeEventListener() {},
  _emit() {
    const v = Dimensions._value;
    for (const cb of Dimensions._listeners.values()) {
      try { cb({ window: v.window, screen: v.screen }); } catch (e) {}
    }
  },
};

const PixelRatio = {
  get() { return Dimensions._value.window.scale || 1; },
  getFontScale() { return Dimensions._value.window.fontScale || 1; },
  getPixelSizeForLayoutSize(s) { return Math.round(s * PixelRatio.get()); },
  roundToNearestPixel(s) {
    const r = PixelRatio.get();
    return Math.round(s * r) / r;
  },
};

if (typeof native.onWindowResize === 'function') {
  native.onWindowResize(function (w, h) {
    const win = Dimensions._value.window;
    if (win.width === w && win.height === h) return;
    Dimensions._value.window = { ...win, width: w, height: h };
    Dimensions._emit();
  });
}

function useWindowDimensions() {
  const [, force] = React.useReducer(x => (x + 1) | 0, 0);
  React.useEffect(() => {
    const sub = Dimensions.addEventListener('change', force);
    return () => sub.remove();
  }, []);
  return Dimensions.get('window');
}

// ─── AppState ───

const AppState = {
  currentState: 'active',
  _listeners: [],
  addEventListener(type, cb) {
    AppState._listeners.push(cb);
    return { remove() {
      const idx = AppState._listeners.indexOf(cb);
      if (idx >= 0) AppState._listeners.splice(idx, 1);
    } };
  },
};

if (typeof native.onAppStateChange === 'function') {
  native.onAppStateChange(function (next) {
    AppState.currentState = next;
    for (const cb of AppState._listeners.slice()) {
      try { cb && cb(next); } catch (e) { nativeLog('AppState listener error: ' + e); }
    }
  });
}

// ─── Animated ───

let _nextAnimValueId = 1;
let _nextAnimAnimId  = 1;
let _nextAnimCompId  = 1;
const _animCompletions = new Map();

if (typeof globalThis.__iex_animComplete !== 'function') {
  globalThis.__iex_animComplete = function (compId, finished) {
    const cb = _animCompletions.get(compId);
    if (!cb) return;
    _animCompletions.delete(compId);
    try { cb({ finished: !!finished }); } catch (e) {}
  };
}

class AnimatedValue {
  constructor(v) {
    this._v = typeof v === 'number' ? v : 0;
    this._listeners = new Map();
    this._nextId = 1;
    this._nativeId = _nextAnimValueId++;
    if (typeof native.animCreateValue === 'function') {
      native.animCreateValue(this._nativeId, this._v);
    }
  }
  setValue(v) {
    if (typeof v === 'number' && v === this._v) return;
    this._v = v;
    if (typeof native.animSetValue === 'function') {
      native.animSetValue(this._nativeId, v);
    }
    this._notify();
  }
  setOffset() {}
  flattenOffset() {}
  extractOffset() {}
  __getValue() { return this._v; }
  __isAnimatedValue() { return true; }
  interpolate(config) { return new AnimatedInterpolation(this, config); }
  addListener(cb) {
    const id = this._nextId++;
    this._listeners.set(id, cb);
    return id;
  }
  removeListener(id) { this._listeners.delete(id); }
  removeAllListeners() { this._listeners.clear(); }
  stopAnimation(cb) { if (cb) cb(this._v); }
  _notify() {
    for (const cb of this._listeners.values()) {
      try { cb({ value: this._v }); } catch (e) {}
    }
  }
}

class AnimatedInterpolation {
  constructor(parent, config) {
    this._parent = parent;
    this._inputRange = config.inputRange || [0, 1];
    this._outputRange = config.outputRange || [0, 1];
    this._listeners = new Map();
    this._nextId = 1;
    parent.addListener(() => this._notify());
  }
  __getValue() {
    const v = this._parent.__getValue();
    const i = this._inputRange, o = this._outputRange;
    if (typeof v !== 'number') return o[0];
    if (v <= i[0]) return o[0];
    if (v >= i[i.length - 1]) return o[o.length - 1];
    for (let k = 1; k < i.length; k++) {
      if (v <= i[k]) {
        const t = (v - i[k - 1]) / (i[k] - i[k - 1] || 1);
        const a = o[k - 1], b = o[k];
        if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
        return t < 0.5 ? a : b;
      }
    }
    return o[o.length - 1];
  }
  __isAnimatedValue() { return true; }
  addListener(cb) {
    const id = this._nextId++;
    this._listeners.set(id, cb);
    return id;
  }
  removeListener(id) { this._listeners.delete(id); }
  _notify() {
    const v = this.__getValue();
    for (const cb of this._listeners.values()) {
      try { cb({ value: v }); } catch (e) {}
    }
  }
}

function _findAnimatedValues(node, out) {
  if (node == null) return;
  if (typeof node === 'object' && typeof node.__isAnimatedValue === 'function') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) _findAnimatedValues(node[i], out);
    return;
  }
  if (typeof node === 'object') {
    for (const k in node) _findAnimatedValues(node[k], out);
  }
}

function _flattenStyleRaw(style, out) {
  if (!style) return out;
  if (Array.isArray(style)) {
    for (let i = 0; i < style.length; i++) _flattenStyleRaw(style[i], out);
  } else if (typeof style === 'object') {
    for (const k in style) out[k] = style[k];
  }
  return out;
}

function _splitNativeBindings(style) {
  // Returns { bindings: [{valueId, property}], staticStyle, hasJsValues }.
  // staticStyle has all non-animated keys plus AnimatedInterpolations resolved
  // to their current numeric value (those re-render via forceUpdate).
  const raw = _flattenStyleRaw(style, {});
  const bindings = [];
  const staticStyle = {};
  let hasJsValues = false;
  const isNative = v => v && typeof v === 'object' && typeof v.__isAnimatedValue === 'function'
    && v.__isAnimatedValue() && typeof v._nativeId === 'number';
  const isJsAnimated = v => v && typeof v === 'object' && typeof v.__isAnimatedValue === 'function'
    && v.__isAnimatedValue() && typeof v._nativeId !== 'number';

  for (const k in raw) {
    const v = raw[k];
    if (k === 'transform' && Array.isArray(v)) {
      const ops = [];
      for (const op of v) {
        if (!op || typeof op !== 'object') continue;
        for (const opK in op) {
          const opV = op[opK];
          if (isNative(opV)) bindings.push({ valueId: opV._nativeId, property: opK });
          else if (isJsAnimated(opV)) { ops.push({ [opK]: opV.__getValue() }); hasJsValues = true; }
          else ops.push({ [opK]: opV });
        }
      }
      if (ops.length > 0) staticStyle.transform = ops;
    } else if (isNative(v)) {
      bindings.push({ valueId: v._nativeId, property: k });
    } else if (isJsAnimated(v)) {
      staticStyle[k] = v.__getValue();
      hasJsValues = true;
    } else {
      staticStyle[k] = v;
    }
  }
  return { bindings, staticStyle, hasJsValues };
}

function _makeAnimatedComponent(Component) {
  return function AnimatedWrapper(props) {
    const ref = React.useRef(null);
    const userRef = props.ref;
    const setRef = React.useCallback((node) => {
      ref.current = node;
      if (typeof userRef === 'function') userRef(node);
      else if (userRef && typeof userRef === 'object') userRef.current = node;
    }, [userRef]);

    const { bindings, staticStyle, hasJsValues } = _splitNativeBindings(props.style);
    const bindKey = bindings.map(b => `${b.valueId}:${b.property}`).join('|');

    React.useEffect(() => {
      if (typeof native.animBindView !== 'function') return;
      const tag = ref.current && ref.current._tag;
      if (!tag) return;
      bindings.forEach(b => native.animBindView(b.valueId, tag, b.property));
      return () => bindings.forEach(b => native.animUnbindView(b.valueId, tag, b.property));
    }, [bindKey]);

    // JS-driven interpolations / non-native values still need re-render on tick.
    const [, forceUpdate] = React.useReducer(x => (x + 1) | 0, 0);
    React.useEffect(() => {
      if (!hasJsValues) return;
      const values = [];
      _findAnimatedValues(props.style, values);
      const jsOnly = values.filter(v => typeof v._nativeId !== 'number');
      const ids = jsOnly.map(v => v.addListener(forceUpdate));
      return () => jsOnly.forEach((v, i) => v.removeListener(ids[i]));
    }, [props.style, hasJsValues]);

    return React.createElement(
      Component,
      { ...props, ref: setRef, style: staticStyle },
      props.children
    );
  };
}

function _makeAnimation(value, config, easing) {
  const fromV = value.__getValue();
  const toV = (config && typeof config.toValue === 'number') ? config.toValue : fromV;
  const duration = (config && typeof config.duration === 'number') ? config.duration : 250;
  const useNative = !!(config && config.useNativeDriver) &&
    typeof native.animTimingStart === 'function' &&
    typeof value._nativeId === 'number';

  if (useNative) {
    let animId = 0;
    let compId = 0;
    return {
      start(cb) {
        animId = _nextAnimAnimId++;
        compId = cb ? _nextAnimCompId++ : 0;
        if (cb) {
          _animCompletions.set(compId, info => {
            if (info.finished) value._v = toV;
            cb(info);
          });
        }
        native.animTimingStart(animId, value._nativeId, toV, duration, compId);
      },
      stop() {
        if (animId) native.animStop(animId);
        if (compId) _animCompletions.delete(compId);
      },
      reset() { value.setValue(fromV); },
    };
  }

  let cancelled = false;
  let startT = 0;
  return {
    start(cb) {
      cancelled = false;
      startT = Date.now();
      const tick = () => {
        if (cancelled) return;
        const elapsed = Date.now() - startT;
        const t = duration > 0 ? Math.min(1, elapsed / duration) : 1;
        const eased = easing ? easing(t) : t;
        value.setValue(fromV + (toV - fromV) * eased);
        if (t < 1) {
          setTimeout(tick, 16);
        } else if (cb) {
          cb({ finished: true });
        }
      };
      if (duration <= 0) {
        value.setValue(toV);
        if (cb) cb({ finished: true });
      } else {
        tick();
      }
    },
    stop() { cancelled = true; },
    reset() { value.setValue(fromV); },
  };
}

// Critically-damped spring approximation (closed form).
function _makeSpring(value, config) {
  const fromV = value.__getValue();
  const toV = (config && typeof config.toValue === 'number') ? config.toValue : fromV;
  const tension = (config && config.tension) || 40;
  const friction = (config && config.friction) || 7;
  // omega/zeta from tension/friction; convert to duration heuristic.
  const omega0 = Math.sqrt(tension);
  const zeta = friction / (2 * Math.sqrt(tension));
  const duration = Math.min(2000, Math.max(120, (4 / (zeta * omega0 || 1)) * 1000 / 4));
  const easeOutBack = (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  return _makeAnimation(value, { toValue: toV, duration }, easeOutBack);
}

const Animated = {
  Value: AnimatedValue,
  ValueXY: AnimatedValue,
  createAnimatedComponent: _makeAnimatedComponent,
  View: _makeAnimatedComponent(View),
  Text: _makeAnimatedComponent(Text),
  ScrollView: _makeAnimatedComponent(ScrollView),
  Image: _makeAnimatedComponent(Image),
  spring: _makeSpring,
  timing: _makeAnimation,
  decay(value, config) {
    return _makeAnimation(value, { ...config, duration: 600 });
  },
  parallel(anims) {
    return {
      start(cb) {
        let remaining = anims.length;
        let result = { finished: true };
        const onOne = (r) => {
          if (r && r.finished === false) result.finished = false;
          if (--remaining === 0 && cb) cb(result);
        };
        if (remaining === 0 && cb) cb(result);
        for (const a of anims) if (a && a.start) a.start(onOne);
      },
      stop() { for (const a of anims) if (a && a.stop) a.stop(); },
    };
  },
  sequence(anims) {
    return {
      start(cb) {
        let i = 0;
        const next = (r) => {
          if (r && r.finished === false) { if (cb) cb({ finished: false }); return; }
          if (i >= anims.length) { if (cb) cb({ finished: true }); return; }
          const a = anims[i++];
          if (a && a.start) a.start(next);
          else next({ finished: true });
        };
        next({ finished: true });
      },
      stop() { for (const a of anims) if (a && a.stop) a.stop(); },
    };
  },
  loop(anim) {
    return {
      start(cb) {
        const run = () => {
          if (anim && anim.start) anim.start(() => {
            if (anim.reset) anim.reset();
            run();
          });
        };
        run();
      },
      stop() { if (anim && anim.stop) anim.stop(); },
    };
  },
  delay(t) {
    return {
      start(cb) { setTimeout(() => cb && cb({ finished: true }), t || 0); },
      stop: noop,
    };
  },
  event() { return noop; },
};

// ─── Alert ───

const Alert = {
  alert(title, message, buttons) {
    if (typeof native.showAlert === 'function') {
      const t = title || '';
      const m = message || '';
      const btns = (buttons || []).map(b => b.text || 'OK');
      native.showAlert(t, m, btns.length ? btns : ['OK']);
    } else if (typeof nativeLog === 'function') {
      nativeLog('[Alert] ' + (title || '') + ' / ' + (message || ''));
    }
  },
};

// ─── Network: fetch + Headers + Response (XHR-free) ───

class IexHeaders {
  constructor(init) {
    this._map = new Map();
    if (init && typeof init === 'object') {
      for (const k in init) this.set(k, init[k]);
    }
  }
  set(k, v) { this._map.set(String(k).toLowerCase(), String(v)); }
  get(k) { return this._map.get(String(k).toLowerCase()) || null; }
  has(k) { return this._map.has(String(k).toLowerCase()); }
  delete(k) { this._map.delete(String(k).toLowerCase()); }
  forEach(cb) { this._map.forEach((v, k) => cb(v, k, this)); }
  toJSON() {
    const o = {};
    this._map.forEach((v, k) => { o[k] = v; });
    return o;
  }
}

class IexResponse {
  constructor(body, init) {
    this._body = body || '';
    this.status = (init && init.status) || 200;
    this.statusText = (init && init.statusText) || '';
    this.headers = new IexHeaders((init && init.headers) || {});
    this.ok = this.status >= 200 && this.status < 300;
    this.url = (init && init.url) || '';
    this._consumed = false;
  }
  text() {
    if (this._consumed) return Promise.reject(new Error('body already consumed'));
    this._consumed = true;
    return Promise.resolve(this._body);
  }
  json() { return this.text().then(s => JSON.parse(s)); }
  arrayBuffer() {
    return this.text().then(s => {
      const buf = new ArrayBuffer(s.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xff;
      return buf;
    });
  }
}

let _nextNetReqId = 1;
const _pendingNetReqs = new Map();

global.__iex_networkComplete = function (id, status, headersJson, body, error) {
  const pending = _pendingNetReqs.get(id);
  if (!pending) return;
  _pendingNetReqs.delete(id);
  if (error) {
    pending.reject(new Error(error));
    return;
  }
  let respHeaders = {};
  try { respHeaders = JSON.parse(headersJson || '{}'); } catch (e) {}
  pending.resolve(new IexResponse(body, { status, headers: respHeaders, url: pending.url }));
};

function fetch(input, init) {
  init = init || {};
  let url, method, headers, body;
  if (typeof input === 'string') { url = input; }
  else { url = (input && input.url) || ''; }
  method = String((init.method || (typeof input === 'object' && input.method) || 'GET')).toUpperCase();
  headers = init.headers instanceof IexHeaders ? init.headers.toJSON() : (init.headers || {});
  body = init.body == null ? '' : (typeof init.body === 'string' ? init.body : JSON.stringify(init.body));

  if (typeof native.networkRequest !== 'function') {
    return Promise.reject(new Error('network not available'));
  }
  return new Promise((resolve, reject) => {
    const id = _nextNetReqId++;
    _pendingNetReqs.set(id, { resolve, reject, url });
    native.networkRequest(id, method, url, JSON.stringify(headers), body);
  });
}

global.fetch = fetch;
global.Headers = IexHeaders;
global.Response = IexResponse;

// ─── WebSocket ───

let _nextWsId = 1;
const _activeWs = new Map();

global.__iex_wsEvent = function (id, event, data) {
  const ws = _activeWs.get(id);
  if (!ws) return;
  if (event === 'open') {
    ws.readyState = 1;
    if (ws.onopen) try { ws.onopen({ type: 'open', target: ws }); } catch (e) {}
  } else if (event === 'message') {
    if (ws.onmessage) try { ws.onmessage({ type: 'message', data, target: ws }); } catch (e) {}
  } else if (event === 'error') {
    if (ws.onerror) try { ws.onerror({ type: 'error', message: data, target: ws }); } catch (e) {}
  } else if (event === 'close') {
    ws.readyState = 3;
    _activeWs.delete(id);
    if (ws.onclose) try { ws.onclose({ type: 'close', code: 1000, reason: data, target: ws }); } catch (e) {}
  }
};

class IexWebSocket {
  constructor(url, protocols) {
    this.url = url;
    this.readyState = 0;  // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this._id = _nextWsId++;
    _activeWs.set(this._id, this);
    if (typeof native.wsConnect === 'function') native.wsConnect(this._id, url);
  }
  send(data) {
    if (this.readyState !== 1) return;
    if (typeof native.wsSend === 'function') native.wsSend(this._id, String(data));
  }
  close() {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    if (typeof native.wsClose === 'function') native.wsClose(this._id);
  }
  addEventListener(type, cb) { this['on' + type] = cb; }
  removeEventListener(type) { this['on' + type] = null; }
}
IexWebSocket.CONNECTING = 0;
IexWebSocket.OPEN = 1;
IexWebSocket.CLOSING = 2;
IexWebSocket.CLOSED = 3;
global.WebSocket = IexWebSocket;

// ─── AsyncStorage (NSUserDefaults-backed) ───

const AsyncStorage = {
  setItem(k, v) {
    if (typeof native.storageSet === 'function') native.storageSet(String(k), String(v));
    return Promise.resolve();
  },
  getItem(k) {
    if (typeof native.storageGet === 'function') {
      const v = native.storageGet(String(k));
      return Promise.resolve(v == null ? null : v);
    }
    return Promise.resolve(null);
  },
  removeItem(k) {
    if (typeof native.storageRemove === 'function') native.storageRemove(String(k));
    return Promise.resolve();
  },
  clear() {
    if (typeof native.storageClear === 'function') native.storageClear();
    return Promise.resolve();
  },
  getAllKeys() {
    if (typeof native.storageKeys === 'function') {
      try { return Promise.resolve(JSON.parse(native.storageKeys() || '[]')); }
      catch (e) { return Promise.resolve([]); }
    }
    return Promise.resolve([]);
  },
  multiGet(keys) {
    return Promise.all(keys.map(k => AsyncStorage.getItem(k).then(v => [k, v])));
  },
  multiSet(pairs) {
    return Promise.all(pairs.map(([k, v]) => AsyncStorage.setItem(k, v)));
  },
  multiRemove(keys) {
    return Promise.all(keys.map(k => AsyncStorage.removeItem(k)));
  },
};

// ─── Linking (no-op) ───

const Linking = {
  openURL() { return Promise.resolve(); },
  canOpenURL() { return Promise.resolve(false); },
  addEventListener() { return { remove() {} }; },
  getInitialURL() { return Promise.resolve(null); },
};

// ─── AppRegistry ───

const AppRegistry = {
  _components: {},
  _windowSubscribed: false,
  registerComponent(name, factory) {
    AppRegistry._components[name] = factory;
    const Component = factory();
    render(React.createElement(
      RootTagContext.Provider,
      { value: ROOT_TAG },
      React.createElement(Component)
    ));
    if (AppRegistry._windowSubscribed || !native) return;
    AppRegistry._windowSubscribed = true;
    if (typeof native.onNewWindow === 'function') {
      native.onNewWindow(function (rootTag) {
        AppRegistry.runApplication(name, { rootTag });
      });
    }
    if (typeof native.onCloseWindow === 'function') {
      native.onCloseWindow(function (rootTag) {
        AppRegistry.unmountApplication(rootTag);
      });
    }
  },
  runApplication(name, params) {
    const factory = AppRegistry._components[name];
    if (!factory) return;
    const rootTag = params && params.rootTag != null ? params.rootTag : ROOT_TAG;
    render(React.createElement(
      RootTagContext.Provider,
      { value: rootTag },
      React.createElement(factory(), params || {})
    ), rootTag);
  },
  unmountApplication(rootTag) {
    const container = containersByTag.get(rootTag);
    if (!container) return;
    Reconciler.updateContainer(null, container, null, function () {});
    containersByTag.delete(rootTag);
  },
};

// ─── exports ───

module.exports = {
  // components
  View, Text, TouchableOpacity, Pressable, ScrollView, SafeAreaView,
  Switch, TextInput, FlatList, ActivityIndicator, Image, StatusBar, Modal,
  // modules
  StyleSheet, Platform, NativeModules, Dimensions, PixelRatio, AppState, Animated, Appearance,
  RootTagContext,
  Alert, Linking, AppRegistry, AsyncStorage,
  // hooks
  useWindowDimensions,
  // internals
  render, React,
};
