// Replacement for `react-native/Libraries/Components/Clipboard/Clipboard` on macOS.
// Backed by NSPasteboard via __iex.clipboardSet/Get host functions.
const native = global.__iex || {};

const Clipboard = {
  setString(text) {
    if (typeof native.clipboardSetString === 'function') {
      native.clipboardSetString(String(text == null ? '' : text));
    }
  },
  async getString() {
    if (typeof native.clipboardGetString === 'function') {
      return native.clipboardGetString();
    }
    return '';
  },
  addListener() { return { remove() {} }; },
  removeAllListeners() {},
};

module.exports = Clipboard;
module.exports.default = Clipboard;
