#!/usr/bin/env bash
# Builds Yana.app from the SwiftPM target and packs it as Yana-<version>.dmg and .zip in dist/.
# Usage: scripts/package.sh [version]   (default: CFBundleShortVersionString in Info.plist)
# STUDIO_APP=/path/to/Yana\ Studio.app puts the Studio IDE inside as Contents/Applications/Yana Studio.app,
# where EditorLauncher looks first, so one download carries both apps.
# The app is signed ad-hoc only (no Developer ID): macOS shows an "unidentified developer" prompt on
# first open, and the AppUpdater picks up the .dmg/.zip assets of a GitHub release tagged app-v<version>.
set -euo pipefail
IFS=$'\n\t'

here="$(cd "$(dirname "$0")/.." && pwd)"
plist_buddy=/usr/libexec/PlistBuddy
base_version="$("$plist_buddy" -c 'Print :CFBundleShortVersionString' "$here/Info.plist")"
version="${1:-$base_version}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "version must look like 1.2.3, got: $version" >&2
	exit 2
fi

dist="$here/dist"
app="$dist/Yana.app"
icon="$here/../yana-ide/branding/yana.icns"

cd "$here"
swift build -c release
bin_dir="$(swift build -c release --show-bin-path)"

mkdir -p "$dist"
if [[ -e "$app" ]]; then mv "$app" "$dist/.old-$(date +%s).app"; fi
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"

cp "$bin_dir/YanaApp" "$app/Contents/MacOS/YanaApp"
for bundle in "$bin_dir"/*.bundle; do cp -R "$bundle" "$app/Contents/Resources/"; done
if [[ -f "$icon" ]]; then cp "$icon" "$app/Contents/Resources/Yana.icns"; fi

cp "$here/Info.plist" "$app/Contents/Info.plist"
info="$app/Contents/Info.plist"
"$plist_buddy" -c "Set :CFBundleShortVersionString $version" "$info"
"$plist_buddy" -c "Set :CFBundleVersion $version" "$info"
"$plist_buddy" -c "Add :CFBundleExecutable string YanaApp" "$info"
"$plist_buddy" -c "Add :CFBundlePackageType string APPL" "$info"
"$plist_buddy" -c "Add :CFBundleIconFile string Yana" "$info"
"$plist_buddy" -c "Add :LSApplicationCategoryType string public.app-category.developer-tools" "$info"

studio="${STUDIO_APP:-}"
if [[ -n "$studio" ]]; then
	if [[ ! -f "$studio/Contents/Info.plist" || ! -d "$studio/Contents/MacOS" ]]; then
		echo "STUDIO_APP is not an app bundle: $studio" >&2
		exit 2
	fi
	mkdir -p "$app/Contents/Applications"
	ditto "$studio" "$app/Contents/Applications/Yana Studio.app"
	# Inside out: the nested app is sealed first, then the outer seal covers it.
	codesign --force --deep --sign - "$app/Contents/Applications/Yana Studio.app"
fi

codesign --force --sign - "$app"
codesign --verify --deep --strict "$app"

zip_out="$dist/Yana-$version.zip"
dmg_out="$dist/Yana-$version.dmg"
rm -f "$zip_out" "$dmg_out"
ditto -c -k --keepParent "$app" "$zip_out"

stage="$(mktemp -d)"
cp -R "$app" "$stage/"
ln -s /Applications "$stage/Applications"
hdiutil create -quiet -volname "Yana $version" -srcfolder "$stage" -format UDZO "$dmg_out"
mv "$stage" "$dist/.stage-$(date +%s)"

shasum -a 256 "$zip_out" "$dmg_out"
echo "built $app ($version)"
