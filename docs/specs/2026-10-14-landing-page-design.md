# Hither · Tanıtım sayfası

Tarih: 14 Ekim 2026 · Durum: onaylandı · Yayın: kullanıcı onayından sonra

## Amaç

Ürün sayfası: ziyaretçi Hither'in ne yaptığını on saniyede anlasın ve indirsin (DMG ya da Homebrew). GitHub ikincil.

## Kararlar

| Konu | Seçim |
| --- | --- |
| Amaç | Ürün sayfası, indirme odaklı |
| Panel görseli | Uygulama panelinin etkileşimli HTML kopyası, demo verisiyle |
| Hero | A · ortalı metin ve çağrılar, altında masaüstü şeridi; panel menü çubuğu ikonundan açılmış |
| Bölümler | Dört şerit · Claude Code · Gizlilik ve güvenlik · alt bilgi (kurulum adımları ve SSS yok) |

## Sayfa

1. **Üst çubuk:** işaret + "Hither" solda, GitHub sağda.
2. **Hero:** uygulama ikonu, "Hither", alt başlık ("What's coming hither, what's gone thither — PRs, deploys and agents in your menu bar."), **Download for Mac** (`releases/latest/download/Hither.dmg`) ve tıklayınca kopyalanan `brew install --cask erenbekman/tap/hither`. Bilgi satırı: "macOS 13+ · Apple silicon · Free and open source · Needs the GitHub CLI".
3. **Masaüstü şeridi:** duvar kâğıdı degradesi, menü çubuğu (Wi-Fi, iki nokta işareti + sayı, saat), altında panel.
4. **Panel:** uygulamadaki Native panelin kopyası (segmented sekmeler, hesap satırı, bölüm başlıkları, durum noktaları, Suggestions kartları). Sekmeler tıklanır ve klavyeyle (←/→) gezilir; satıra tıklamak onu görülmüş yapar, "Mark seen" bölümü görülmüş yapar, rozetler ve menü çubuğu sayısı güncellenir. Veriler `src/demo.ts` ile aynı içerik.
5. **Dört şerit:** Incoming, Outgoing, Agents, Suggestions; her blok tıklanınca panel o sekmeye geçer ve sayfa panele kayar (hareketi azalt açıksa animasyonsuz).
6. **Claude Code:** bekleyen oturum bildirimi, "Open in Claude" ile doğru klasörde iTerm, prompt'a yalnız kimlik; yanında gerçek bir öneri kartı.
7. **Gizlilik ve güvenlik:** veri Mac'te kalır (yalnız senin token'larınla GitHub, Forge, Sentry), token'lar Keychain'de, Claude'a yalnız butonla, hook dinleyicisi yalnız 127.0.0.1.
8. **Alt bilgi:** GitHub, Releases, GHBar teşekkürü, MIT.

## Görsel dil

Uygulamadaki tasarım değerleri (`src/ui/base.css`): sistem renkleri, SF Pro, 0.5 px ayraçlar, 8/12 pt köşeler. Sayfa sistem temasına uyar (açık/koyu). Panel camı `backdrop-filter`. Dar ekranda (≤ 640 px) masaüstü şeridi daralır, panel tam genişlik olur.

## Teknik

- `site/index.html`, `site/styles.css`, `site/app.js`; `site/assets/icon.png` (256 px), `site/assets/og.png` (512 px), `site/assets/favicon.png` (32 px) mevcut ikonlardan kopyalanır.
- JavaScript yoksa sayfa okunur; panel statik Incoming görünümünde kalır.
- Yeni bağımlılık yok, derleme adımı yok; `.github/workflows/pages.yml` `site/` klasörünü yayınlar.

## Yayın (kullanıcı onayından sonra)

1. v0.1.0 release'ine sabit adlı `Hither.dmg` kopyası yüklenir; `scripts/sign-update.sh` yayın komutlarına eklenir.
2. GitHub Pages "GitHub Actions" kaynağıyla açılır.
3. Commit + push; site `https://erenbekman.github.io/hither/`.

## Doğrulama

Yerel önizleme: masaüstü (1280) ve mobil (375) genişlik, açık ve koyu tema, sekme/klavye/kopyalama/şerit bağlantıları. Yayından sonra canlı adres ve indirme linki.
