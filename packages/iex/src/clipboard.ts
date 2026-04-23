import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

interface ClipboardSpec extends TurboModule {
  getString(): Promise<string>;
  setString(content: string): void;
}

const NativeClipboard = TurboModuleRegistry.getEnforcing<ClipboardSpec>('Clipboard');

export async function getString(): Promise<string> {
  return NativeClipboard.getString();
}

export function setString(content: string): void {
  NativeClipboard.setString(content);
}

export async function hasString(): Promise<boolean> {
  return (await getString()).length > 0;
}

export const clipboard = {
  getString,
  setString,
  hasString,
};

export default clipboard;
