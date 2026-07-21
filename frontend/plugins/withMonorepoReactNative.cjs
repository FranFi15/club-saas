const { withProjectBuildGradle } = require('@expo/config-plugins');

const MARKER = 'REACT_NATIVE_NODE_MODULES_DIR';

const GRADLE_SNIPPET = `
// npm workspaces: react-native may be hoisted above the app package (EAS Build monorepo).
def resolveReactNativePackageDir = {
  def process = ["node", "--print", "require.resolve('react-native/package.json')"].execute(null, rootDir)
  process.waitFor()
  if (process.exitValue() == 0) {
    return new File(process.text.trim()).getParentFile()
  }
  def candidates = [
    new File(rootDir, "../node_modules/react-native"),
    new File(rootDir, "../../node_modules/react-native"),
  ]
  return candidates.find { it.exists() }
}
rootProject.ext.${MARKER} = resolveReactNativePackageDir().getAbsolutePath()
`;

/** @type {import('@expo/config-plugins').ConfigPlugin} */
function withMonorepoReactNative(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.contents.includes(MARKER)) {
      return config;
    }
    config.modResults.contents += `\n${GRADLE_SNIPPET}\n`;
    return config;
  });
}

module.exports = withMonorepoReactNative;
