# Tanıtım sayfası (ikinci sürüm)

Durum: onaylandı ve uygulandı (15 Ekim 2026). İlk sürümün (`2026-10-14-landing-page-design.md`) yerini alır. 0.1.3'ü anlatır (yeni panel, Intel, GitHub girişi); 0.1.3 ile birlikte yayınlanır.

## Neden yeniden

Eski sayfada panel kopyası eski görünümdeydi, sayfa uzun ve kalabalıktı, görsel stil zayıftı ve mesaj net değildi.

## Mesaj

"GitHub menü çubuğu, artı fazlası": önce GHBar'dan tanıdık PR'lar, ardından Hither'ın ekledikleri (check'ler ve deploy'lar, Claude ve Codex oturumları, öneriler).

## Sayfa (A yönü: açık, sakin masaüstü)

1. Sahte macOS menü çubuğu; Hither ikonunun yanındaki sayı panelle birlikte değişir.
2. Üst bölüm: uygulama ikonu, "Your pull requests, in the menu bar. And everything after.", tek cümle açıklama, "Download for Mac" (`Hither.dmg`) ve kopyalanan `brew install --cask erenbekman/tap/hither`, "macOS 13+ · Apple silicon and Intel · Free and open source". Sağda uygulamanın yeni panelinin etkileşimli kopyası (sekmeler, satıra tıklayınca görüldü, "Mark these as seen", Suggestions kartları).
3. Üç kutu: Pull requests, Checks & deploys, Agents; tıklayınca panel o şeride geçer (dar ekranda panele kayar).
4. Install: indirme ve Homebrew satırı; "Sign in with GitHub on first launch, or let Hither use your GitHub CLI account. Every lane can be turned off."
5. Alt bilgi: "Nothing leaves your Mac except the calls Hither makes to GitHub, Forge and Sentry.", GitHub, Releases, MIT, "Inspired by GHBar by Mert Çobanov".

Açık/koyu `prefers-color-scheme`'e uyar; 900 px altında tek sütun, 560 px altında 16 px kenar boşluğu ve yatay kaydırma yok (375 px'te ölçüldü). Derleme yok: `site/index.html`, `styles.css`, `app.js`.
