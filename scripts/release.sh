#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

IDENTITY="${HITHER_SIGNING_IDENTITY:-Developer ID Application: Eren Bekman (VSQKF92XRM)}"
PROFILE="${HITHER_NOTARY_PROFILE:-hither-notary}"
KEY="${HITHER_UPDATER_KEY:-$HOME/.tauri/hither.key}"
REPO="erenbekman/hither"
RUSTUP_BIN="$(brew --prefix rustup 2>/dev/null || true)/bin"

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
grep -q "GITHUB_CLIENT_ID = ''" src/core/github-app.ts && fail "set the GitHub OAuth client id in src/core/github-app.ts"
[ -x "$RUSTUP_BIN/rustup" ] || fail "rustup not found; run: brew install rustup"
for target in aarch64-apple-darwin x86_64-apple-darwin; do
  "$RUSTUP_BIN/rustup" target list --installed | grep -qx "$target" || fail "Rust target $target missing; run: $RUSTUP_BIN/rustup target add $target"
done

step "Running tests"
npm test
(cd src-tauri && cargo test --quiet)

step "Building and signing with $IDENTITY"
PATH="$RUSTUP_BIN:$PATH" APPLE_SIGNING_IDENTITY="$IDENTITY" npm run tauri build -- --target universal-apple-darwin

bundle=src-tauri/target/universal-apple-darwin/release/bundle
app="$bundle/macos/Hither.app"
dmg_name="Hither_${version}_universal.dmg"
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
lipo -archs "$app/Contents/MacOS/hither" | grep -q x86_64 || fail "Hither.app is not a universal binary"
codesign --verify --deep --strict --verbose=2 "$app"
spctl --assess --type execute --verbose=2 "$app"
xcrun stapler validate "$app"
xcrun stapler validate "$out/$dmg_name"

scripts/sign-update.sh "$notes"
