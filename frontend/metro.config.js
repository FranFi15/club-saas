const { getDefaultConfig } = require('expo/metro-config');

// Expo SDK 54+ auto-detects npm workspaces; no manual watchFolders needed.
module.exports = getDefaultConfig(__dirname);
