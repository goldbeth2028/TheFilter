/**
 * Metro config, added only so the desktop simulator can build.
 *
 * `react-native-webview` is a native module: on web there is nothing to bind to
 * and importing it throws. Rather than putting a platform check inside
 * `BrowseScreen`, the module is swapped for a web-only stand-in at resolve time,
 * and only when `platform === 'web'`. The iOS and Android bundles resolve
 * `react-native-webview` exactly as before — this branch is never taken for them.
 */

const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/** Modules with no meaning on web, and the file that stands in for each. */
const WEB_SUBSTITUTES = {
  'react-native-webview': path.resolve(__dirname, 'src/web/WebViewShim.tsx'),
};

const inherited = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const substitute = platform === 'web' ? WEB_SUBSTITUTES[moduleName] : undefined;
  if (substitute) return { type: 'sourceFile', filePath: substitute };
  return (inherited ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
