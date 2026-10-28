/**
 * Changing the phone's text or display size recreated MainActivity, and the
 * first navigation after it threw "The imperative router is unavailable before
 * the first render has finished" — a crash on the next tap (found 28 Oct 2026
 * on the 2.0.3 emulator test). Handling both changes in place lets React
 * Native re-measure instead of the activity being torn down. A plugin because
 * EAS regenerates android/ on every build.
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = (config) =>
  withAndroidManifest(config, (c) => {
    const main = c.modResults.manifest.application[0].activity.find((a) => a.$['android:name'] === '.MainActivity');
    const have = (main.$['android:configChanges'] ?? '').split('|').filter(Boolean);
    main.$['android:configChanges'] = [...new Set([...have, 'fontScale', 'density'])].join('|');
    return c;
  });
