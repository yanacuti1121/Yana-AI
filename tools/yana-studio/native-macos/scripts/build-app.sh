#!/bin/zsh
set -euo pipefail

root="${0:A:h:h}"
app="$root/release/Yana Studio Native.app"
contents="$app/Contents"

swift build --package-path "$root" -c release
mkdir -p "$contents/MacOS" "$contents/Resources"
cp "$root/.build/release/YanaStudioNative" "$contents/MacOS/YanaStudioNative"
cp "$root/App/Info.plist" "$contents/Info.plist"
codesign --force --sign - "$app"

print "Created: $app"
