// macOS shell entry — shares the iOS-side generated entry so Router + all
// pages run unchanged. metro `resolveRequest` redirects `react-native` to
// ./iex-runtime when platform=macos.
require('./.iex-generated/index.generated');
