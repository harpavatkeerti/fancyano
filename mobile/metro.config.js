// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages and in what order
// IMPORTANT: mobile/node_modules first to prevent React version conflicts
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Force React and React Native to resolve from mobile/node_modules only
const mobileReactPath = path.resolve(projectRoot, 'node_modules/react');
const mobileRNPath = path.resolve(projectRoot, 'node_modules/react-native');

// Verify paths exist
if (fs.existsSync(mobileReactPath) && fs.existsSync(mobileRNPath)) {
  config.resolver.extraNodeModules = {
    'react': mobileReactPath,
    'react-native': mobileRNPath,
  };
  
  // Block React from root node_modules
  const rootReactPath = path.resolve(workspaceRoot, 'node_modules/react');
  if (fs.existsSync(rootReactPath)) {
    config.resolver.blockList = [
      new RegExp(path.resolve(workspaceRoot, 'node_modules/react/.*').replace(/\\/g, '/')),
    ];
  }
}

module.exports = config;

