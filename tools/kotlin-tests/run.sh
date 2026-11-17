#!/bin/bash
# Usage: tools/kotlin-tests/run.sh    (needs gradle and a JDK; copies the pure files into a scratch folder)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
WORK="${TMPDIR:-/tmp}/charge-dock-kotlin-tests"
rm -rf "$WORK" && mkdir -p "$WORK/src/main/kotlin" "$WORK/src/test/kotlin"
cp "$HERE/settings.gradle.kts" "$HERE/build.gradle.kts" "$WORK/"
MAIN="$REPO/app/src/main/java/app/chargedock"; TEST="$REPO/app/src/test/java/app/chargedock"
for f in BatteryJs NotificationCounts NotificationJs OrientationMath; do cp "$MAIN/$f.kt" "$WORK/src/main/kotlin/"; done
for f in BatteryJsTest NotificationCountsTest NotificationJsTest OrientationMathTest; do cp "$TEST/$f.kt" "$WORK/src/test/kotlin/"; done
cd "$WORK" && gradle test --console=plain -q
echo "Kotlin tests passed"
