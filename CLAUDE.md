# Hither

macOS menü çubuğu uygulaması. Tauri v2 + Vue 3 + TypeScript + Vite. Ürün ve mimari planı: [docs/PLAN.md](docs/PLAN.md) — işe başlamadan oku.

## Aşama kuralı

**Bir aşamanın kapısı geçilmeden sonrakine geçme.** Aşamalar ve kapı kriterleri `docs/PLAN.md` → "Yol haritası" tablosunda (M0 İskelet → M1 Gelen → M2 Giden → M3 Agentlar → M4 Öneriler → M5 Dağıtım). Bir oturumda yalnızca istenen aşama yapılır; sonraki aşamanın kodu "hazırlık" adıyla da yazılmaz.

## Mimari ilkeler

1. **Rust ince kabuk.** Yalnızca işletim sistemine dokunan işler: tray, popover pencere, keychain, `gh auth token`, bildirim, hook dinleyicisi, `~/.claude/settings.json` okuma/yazma. Hedef 300 satırdı; test hariç ~730 satır (süreç başlatma, hook dinleyicisi, dosya yazımı izinli eklentilerle TS'e taşınamıyor). Yeni Rust kodu eklemeden önce TS'e taşınabilir mi diye bak.
2. **Mantık saf TypeScript'te** ve Vitest ile test edilir. Tauri API'sine dokunan kod `src/native.ts` ve `src/ui` ile sınırlı kalır; `src/core` ve `src/sources` Tauri'den bağımsızdır.
3. **Bağımlılıklar minimum.** UI kütüphanesi ve Pinia yok; durum için `reactive()`.
   - Rust'ta izinli: `tauri-plugin-positioner`, `tauri-plugin-notification`, `tauri-plugin-store`, `tauri-plugin-http`, `tauri-plugin-updater`, `keyring`, `tiny_http` (`serde_json` zaten Tauri'nin bağımlılığı).
   - Bunların dışında bir paket (JS ya da Rust) eklemeden önce sor.
4. **Panel penceresi kapatılmaz, yalnızca gizlenir.** Webview'daki zamanlayıcı arka planda çalışmaya devam eder.
5. **Hiçbir hata boş liste olarak gösterilmez.** Her hata panelde görünür bir satırdır (`src/core/errors.ts` → `Banner`). "Bakamadım" ≠ "bekleyen yok".

## Şeritler

| Şerit | Sekme | Kaynaklar | Aşama |
| --- | --- | --- | --- |
| Gelen | Incoming | GitHub (GHBar'ın beş araması + bahsedilmeler ve atananlar) | M1 |
| Giden | Outgoing | GitHub CI, Forge, Sentry | M2 |
| Agentlar | Agents | Claude Code hook'ları, agent PR'ları | M3 |
| Öneriler | Suggestions | Diğer şeritlerin sinyallerinden deterministik kurallar | M4 |

Her kaynak `src/sources/<kaynak>/` altında, verisini tek tipe (`Signal`, `src/core/types.ts`) çevirir.

## Yapı

- `src-tauri/src/lib.rs` — tray (Mark All as Seen, Settings, Quit), popover, ayarlar penceresi, `set_tray` (sayı + normal/alert/error ikon), `open_url`, `copy_text`, `reveal_panel`
- `src-tauri/src/gh.rs` — `gh_token` (tam yollar → PATH, 5 sn watchdog)
- `src-tauri/src/secret.rs` — `secret_get/set/delete` (Keychain)
- `src-tauri/src/hooks.rs` — Claude Code hook dinleyicisi (`127.0.0.1:47811`), `claude_settings_read/write` (yedekli, atomik, izinleri genişletmez)
- `src-tauri/src/launch.rs` — seçili terminalde (iTerm, Terminal, Ghostty, Warp) `claude` başlatma, yalnız okuma araçlı `claude -p`, `git_repo`, şablon dosyaları
- `src-tauri/src/process.rs` — zaman aşımlı süreç çalıştırıcı ve ikili bulucu (gh, claude)
- `src/core` — tipler, hatalar, ayarlar, `RefreshGate`, filtreleme, `SeenStore`, bildirim planı, `board` (çok kaynaklı yenileme döngüsü), `recovery` (CI düzeldi), `http`, `openable`
- `src/sources/github` — sorgu kurucu, GraphQL istemcisi (CI + izlenen branch'ler, profil ve kota dahil), cevap ayrıştırıcı, `githubSource`; `account.ts` kota görünürlüğü ve repo sayaçları (`repos.json`); `activity.ts` GitHub Notifications'tan "New Activity" (yalnız okuma, `If-Modified-Since`)
- `src/sources/forge`, `src/sources/sentry` — Outgoing adapter'ları; token'lar Keychain'de (`forge-token`, `sentry-token`)
- `src/sources/claude-code` — oturumlardan Agents sinyalleri; durum makinesi `core/sessions.ts`, settings.json birleştirme `core/claude-settings.ts`
- `src/lanes.ts` — şerit başına bölüm sırası, başlıklar, "loud" kuralı (bildirim + rozet)
- `src/core/suggestions.ts` — öneri kuralları; `core/templates.ts` — kimlik-only prompt şablonları; `core/repo.ts` — git remote → owner/name
- `src/ui` — Vue bileşenleri ve Tauri'ye bağlanan runtime (`board-runtime.ts`, `suggestions-runtime.ts`, `settings-store.ts`)
- `_ref/ghbar` — GHBar referans kopyası (git'e girmez). Kod kopyalanmaz; dosya yorumlarındaki kararlar okunur, testler spesifikasyon olarak çevrilir.

## Dağıtım

- `scripts/release.sh` — imza, notarization, updater imzası, `latest.json`, Homebrew cask; `release/<version>/` altına yazar. Yayınlamaz (tag, `gh release`, tap push kullanıcıya ait).
- Sürüm tek yerde: `package.json` (`tauri.conf.json` oradan okur; `Cargo.toml` sürümünü de eşit tut).
- `site/` — tanıtım sayfası; `.github/workflows/pages.yml` yayınlar.

## Komutlar

- `npm test` — Vitest
- `cd src-tauri && cargo test` — Rust birim testleri
- `npm run tauri dev` / `npm run tauri build`
