#!/usr/bin/env bash
# Build the release APK, publish it to dist/ with a manifest the plugin serves,
# and optionally refresh the README screenshots.
#
#   ./build.sh              build + publish
#   CAPTURE=1 ./build.sh    also regenerate docs screenshots (Robolectric)
set -euo pipefail
cd "$(dirname "$0")"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"

if [ "${CAPTURE:-0}" = "1" ]; then
  ./gradlew --no-daemon testDebugUnitTest
  mkdir -p docs
  cp build/../app/build/screenshots/*.png docs/ 2>/dev/null || true
fi

./gradlew --no-daemon assembleRelease

VERSION_CODE=$(sed -n "s/^[[:space:]]*versionCode \([0-9]\+\).*/\1/p" app/build.gradle | head -1)
VERSION_NAME=$(sed -n "s/^[[:space:]]*versionName '\([^']*\)'.*/\1/p" app/build.gradle | head -1)
APK="dist/dsh-im-omni-${VERSION_NAME}.apk"

mkdir -p dist
cp app/build/outputs/apk/release/app-release.apk "$APK"
SHA=$(sha256sum "$APK" | cut -d' ' -f1)

cat > dist/latest.json <<JSON
{
  "versionCode": ${VERSION_CODE},
  "versionName": "${VERSION_NAME}",
  "minSdk": 26,
  "file": "$(basename "$APK")",
  "sha256": "${SHA}",
  "notes": "${NOTES:-全渠道 IM 首次发布：收件箱、渠道绑定、手机配对与在线升级。}",
  "publishedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
}
JSON

echo "APK      : $APK"
echo "manifest : dist/latest.json"
echo "sha256   : ${SHA}"
