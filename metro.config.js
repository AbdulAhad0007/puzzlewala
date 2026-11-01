const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Lets expo-sqlite bundle for the development browser build. Android doesn't use this file type.
config.resolver.assetExts.push('wasm');

module.exports = config;
