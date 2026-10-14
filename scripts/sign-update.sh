#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

KEY="${HITHER_UPDATER_KEY:-$HOME/.tauri/hither.key}"
REPO="erenbekman/hither"

fail() {
  echo "sign-update: $*" >&2
  exit 1
}
step() { printf '\n==> %s\n' "$*"; }

version=$(node -p "require('./package.json').version")
notes="${1:-}"
out="release/$version"
dmg_name="Hither_${version}_universal.dmg"
bundle=src-tauri/target/universal-apple-darwin/release/bundle/macos

[ -n "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD+set}" ] || fail "export TAURI_SIGNING_PRIVATE_KEY_PASSWORD (empty if the key has none)"
[ -f "$KEY" ] || fail "updater private key not found at $KEY"
[ -f "$out/$dmg_name" ] || fail "$out/$dmg_name not found; run scripts/release.sh first"
xcrun stapler validate "$bundle/Hither.app" >/dev/null || fail "Hither.app is not notarized; run scripts/release.sh first"

step "Packing and signing the update for v$version"
tar -czf "$out/Hither.app.tar.gz" -C "$bundle" Hither.app
env -u TAURI_SIGNING_PRIVATE_KEY npm run --silent tauri signer sign -- -f "$KEY" "$out/Hither.app.tar.gz"

node - "$version" "$out" "$REPO" "$notes" <<'JS'
const fs = require('fs')
const [version, out, repo, notes] = process.argv.slice(2)
const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: Object.fromEntries(
    ['darwin-aarch64', 'darwin-x86_64'].map((platform) => [
      platform,
      {
        signature: fs.readFileSync(`${out}/Hither.app.tar.gz.sig`, 'utf8').trim(),
        url: `https://github.com/${repo}/releases/download/v${version}/Hither.app.tar.gz`,
      },
    ]),
  ),
}
fs.writeFileSync(`${out}/latest.json`, JSON.stringify(latest, null, 2) + '\n')
JS

cp "$out/$dmg_name" "$out/Hither.dmg"

sha=$(shasum -a 256 "$out/$dmg_name" | cut -d' ' -f1)
sed -e "s/{{version}}/$version/" -e "s/{{sha256}}/$sha/" packaging/hither.rb.template > "$out/hither.rb"

step "Done: $out"
command ls -lh "$out"
cat <<NEXT

Publish:
  git tag v$version && git push origin v$version
  gh release create v$version --repo $REPO --title "Hither $version" --notes "$notes" \\
    "$out/$dmg_name" "$out/Hither.dmg" "$out/Hither.app.tar.gz" "$out/latest.json"
  cp "$out/hither.rb" <path-to>/homebrew-tap/Casks/hither.rb   # then commit and push the tap
NEXT
