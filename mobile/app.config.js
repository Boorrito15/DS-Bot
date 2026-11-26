// The phone app ships with DS Bot and carries its version. Android installs an update
// only over a lower versionCode, so the code grows with the version, and a pre-release
// (0.4.0-rc.1) stays below its release (0.4.0).
const { version } = require('../ds-bot/package.json')

function versionCode(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[a-z]+\.(\d+))?$/.exec(text)
  if (match === null) throw new Error(`app.config: cannot make an Android versionCode from ${text}`)
  const [, major, minor, patch, pre] = match.map(Number)
  if (minor > 999 || patch > 999 || pre > 98) throw new Error(`app.config: ${text} is out of the versionCode range`)
  return ((major * 1000 + minor) * 1000 + patch) * 100 + (match[4] === undefined ? 99 : pre)
}

// A build number that only ever goes up: the commit count of the repository, which grows
// with every commit. `0.` keeps it above a bare count, should anyone ever ship one.
function commitBuildNumber() {
  if (process.env.DS_BOT_IOS_BUILD_NUMBER) return process.env.DS_BOT_IOS_BUILD_NUMBER
  try {
    const { execSync } = require('node:child_process')
    const count = execSync('git rev-list --count HEAD', { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (/^\d+$/.test(count)) return `0.${count}`
  } catch { /* no git, or no checkout: fall back to the version */ }
  return version
}

// The Apple Developer team signs the archive; it is account data, so it comes from the
// environment and is never written here (docs/plans/2026-11-13-ios-release.md).
const appleTeamId = (process.env.DS_BOT_APPLE_TEAM_ID ?? '').trim()

module.exports = ({ config }) => ({
  ...config,
  version,
  // The document scanner ships its own native view; Expo needs it named here so a
  // prebuild links it.
  plugins: [...(config.plugins ?? []), 'react-native-document-scanner-plugin'],
  android: { ...config.android, versionCode: versionCode(version) },
  ios: {
    ...config.ios,
    // iOS installs an update only over a higher build number, and it counts in digits and
    // dots alone, so the version itself cannot carry it: every build of a release would
    // read the same and a sideload would never be offered. The default is a number that
    // grows with every commit, which is what makes a fresh build always newer.
    buildNumber: commitBuildNumber(),
    ...(appleTeamId === '' ? {} : { appleTeamId }),
  },
})
module.exports.versionCode = versionCode
