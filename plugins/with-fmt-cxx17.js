/**
 * Makes the iOS build survive a modern Xcode.
 *
 * React Native 0.76 pins fmt 11.0.2 and compiles it as C++20. Under that
 * standard fmt defines FMT_CONSTEVAL as `consteval` (base.h:114-137), and
 * Clang from Xcode 16.3 onwards rejects the FMT_STRING calls in format-inl.h
 * with "call to consteval function ... is not a constant expression". The
 * build dies there, before a line of app code is compiled. fmt fixed this in
 * 11.1; React Native 0.76 cannot take that version.
 *
 * The narrowest fix is to compile that one pod as C++17. fmt's own guard is
 * `FMT_CPLUSPLUS < 201709L -> FMT_USE_CONSTEVAL 0`, so C++17 leaves
 * FMT_CONSTEVAL empty and the rejected path is never generated. fmt supports
 * C++11 upwards, so nothing in it needs C++20, and the affected constructor is
 * header-inline rather than emitted from the pod's single source file — so
 * this does not change what other targets link against.
 *
 * This is a config plugin rather than a hand edit because `expo prebuild`
 * regenerates ios/ and would throw a hand edit away.
 */

const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const ANCHOR = 'post_install do |installer|';

const PATCH = `
    # fmt 11.0.2 (pinned by React Native 0.76) uses consteval in FMT_STRING,
    # which Clang from Xcode 16.3 onwards rejects under C++20. fmt disables
    # that path below C++17.1, so build this pod — and only this pod — as
    # C++17. See plugins/with-fmt-cxx17.js.
    installer.pods_project.targets.each do |pod_target|
      next unless pod_target.name == 'fmt'
      pod_target.build_configurations.each do |cfg|
        cfg.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end
`;

module.exports = function withFmtCxx17(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfile, 'utf8');

      if (contents.includes("pod_target.name == 'fmt'")) return cfg;

      if (!contents.includes(ANCHOR)) {
        throw new Error(
          `with-fmt-cxx17: no "${ANCHOR}" in the generated Podfile. The template ` +
            'changed; re-check whether this patch is still needed before adjusting the anchor.',
        );
      }

      fs.writeFileSync(podfile, contents.replace(ANCHOR, ANCHOR + PATCH));
      return cfg;
    },
  ]);
};
