// Stub module that any `react-native/Libraries/...` deep import resolves to
// on macOS. Returns a Proxy that swallows every property access / call /
// construct, so that load-time side effects (TurboModuleRegistry.getEnforcing
// etc.) do nothing instead of throwing.
const handler = {
  get(target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return target;
    if (prop === Symbol.toPrimitive) return () => '[iex-stub]';
    if (prop === Symbol.iterator) return function* () {};
    return target;
  },
  apply() { return undefined; },
  construct() { return new Proxy(function () {}, handler); },
};
const stub = new Proxy(function () {}, handler);
module.exports = stub;
module.exports.default = stub;
