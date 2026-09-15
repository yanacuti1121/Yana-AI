#!/bin/zsh
set -euo pipefail

root="${0:A:h:h}"
app="$root/release/Yana Studio Native.app"
contents="$app/Contents"

swift build --package-path "$root" -c release
mkdir -p "$contents/MacOS" "$contents/Resources"
cp "$root/.build/release/YanaStudioNative" "$contents/MacOS/YanaStudioNative"
cp "$root/App/Info.plist" "$contents/Info.plist"

# Google's token endpoint rejects a Desktop-app token exchange without
# client_secret (confirmed live) -- the value ships inside the built .app,
# never in the tracked Info.plist (GitHub's push protection rejects a
# committed secret regardless of Google's own "not meant to stay
# confidential for Desktop clients" stance).
if [[ -n "${YANA_GOOGLE_CLIENT_SECRET:-}" ]]; then
  /usr/libexec/PlistBuddy -c "Add :GoogleOAuthClientSecret string ${YANA_GOOGLE_CLIENT_SECRET}" \
    "$contents/Info.plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Set :GoogleOAuthClientSecret ${YANA_GOOGLE_CLIENT_SECRET}" \
      "$contents/Info.plist"
else
  print "[build-app] YANA_GOOGLE_CLIENT_SECRET not set -- Google sign-in will fail on this Desktop-app Client ID."
fi

codesign --force --sign - "$app"

print "Created: $app"
