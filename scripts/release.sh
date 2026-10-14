#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

IDENTITY="${HITHER_SIGNING_IDENTITY:-Developer ID Application: Eren Bekman (VSQKF92XRM)}"
PROFILE="${HITHER_NOTARY_PROFILE:-hither-notary}"
KEY="${HITHER_UPDATER_KEY:-$HOME/.tauri/hither.key}"
REPO="erenbekman/hither"

fail() {
  echo "release: $*" >&2
  exit 1
}
step() { printf '\n==> %s\n' "$*"; }

version=$(node -p "require('./package.json').version")
pubkey=$(node -p "require('./src-tauri/tauri.conf.json').plugins.updater.pubkey")
notes="${1:-}"

step "Checking prerequisites for v$version"
[ -n "$pubkey" ] || fail "plugins.updater.pubkey is empty in src-tauri/tauri.conf.json"
[ -f "$KEY" ] || fail "updater private key not found at $KEY"
[ -n "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD+set}" ] || fail "export TAURI_SIGNING_PRIVATE_KEY_PASSWORD (empty if the key has none)"
probe=$(mktemp)
env -u TAURI_SIGNING_PRIVATE_KEY npm run --silent tauri signer sign -- -f "$KEY" "$probe" >/dev/null 2>&1 || {
  rm -f "$probe" "$probe.sig"
  fail "TAURI_SIGNING_PRIVATE_KEY_PASSWORD does not unlock $KEY"
}
rm -f "$probe" "$probe.sig"
security find-identity -v -p codesigning | grep -qF "\"$IDENTITY\"" || fail "signing identity not found: $IDENTITY"
xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1 || fail "notary profile '$PROFILE' not found; run: xcrun notarytool store-credentials $PROFILE"
[ -z "$(git status --porcelain)" ] || fail "commit or stash your changes first"
git rev-parse -q --verify "refs/tags/v$version" >/dev/null && fail "tag v$version already exists; bump the version in package.json"

step "Running tests"
npm test
(cd src-tauri && cargo test --quiet)

step "Building and signing with $IDENTITY"
APPLE_SIGNING_IDENTITY="$IDENTITY" npm run tauri build

bundle=src-tauri/target/release/bundle
app="$bundle/macos/Hither.app"
dmg_name="Hither_${version}_aarch64.dmg"
out="release/$version"
rm -rf "$out"
mkdir -p "$out"
cp "$bundle/dmg/$dmg_name" "$out/$dmg_name"

step "Notarizing the app"
ditto -c -k --keepParent "$app" "$out/Hither.zip"
xcrun notarytool submit "$out/Hither.zip" --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$app"
rm "$out/Hither.zip"

step "Notarizing the disk image"
xcrun notarytool submit "$out/$dmg_name" --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$out/$dmg_name"

step "Verifying"
codesign --verify --deep --strict --verbose=2 "$app"
spctl --assess --type execute --verbose=2 "$app"
xcrun stapler validate "$app"
xcrun stapler validate "$out/$dmg_name"

scripts/sign-update.sh "$notes"
