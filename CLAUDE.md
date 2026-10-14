# Hither

macOS menü çubuğu uygulaması. Tauri v2 + Vue 3 + TypeScript + Vite. Ürün ve mimari planı: [docs/PLAN.md](docs/PLAN.md) — işe başlamadan oku.

## Aşama kuralı

**Bir aşamanın kapısı geçilmeden sonrakine geçme.** Aşamalar ve kapı kriterleri `docs/PLAN.md` → "Yol haritası" tablosunda (M0 İskelet → M1 Gelen → M2 Giden → M3 Agentlar → M4 Öneriler → M5 Dağıtım). Bir oturumda yalnızca istenen aşama yapılır; sonraki aşamanın kodu "hazırlık" adıyla da yazılmaz.

## Mimari ilkeler

1. **Rust ince kabuk.** Yalnızca işletim sistemine dokunan işler: tray, popover pencere, keychain, `gh auth token`, bildirim. `src-tauri/src` toplamı 300 satırın altında kalır.
2. **Mantık saf TypeScript'te** ve Vitest ile test edilir. Tauri API'sine dokunan kod `src/native.ts` ve `src/ui` ile sınırlı kalır; `src/core` ve `src/sources` Tauri'den bağımsızdır.
3. **Bağımlılıklar minimum.** UI kütüphanesi ve Pinia yok; durum için `reactive()`.
   - Rust'ta izinli: `tauri-plugin-positioner`, `tauri-plugin-notification`, `tauri-plugin-store`, `tauri-plugin-http`, `keyring`.
   - Bunların dışında bir paket (JS ya da Rust) eklemeden önce sor.
4. **Panel penceresi kapatılmaz, yalnızca gizlenir.** Webview'daki zamanlayıcı arka planda çalışmaya devam eder.
5. **Hiçbir hata boş liste olarak gösterilmez.** Her hata panelde görünür bir satırdır (`src/core/errors.ts` → `ErrorRow`). "Bakamadım" ≠ "bekleyen yok".

## Şeritler

| Şerit | Sekme | Kaynaklar | Aşama |
| --- | --- | --- | --- |
| Gelen | Incoming | GitHub (GHBar'ın beş araması) | M1 |
| Giden | Outgoing | GitHub CI, Forge, Sentry | M2 |
| Agentlar | Agents | Claude Code hook'ları, agent PR'ları | M3 |
| Öneriler | Suggestions | Diğer şeritlerin sinyallerinden deterministik kurallar | M4 |

Her kaynak `src/sources/<kaynak>/` altında, verisini tek tipe (`Signal`, `src/core/types.ts`) çevirir.

## Yapı

- `src-tauri/src/lib.rs` — tray, popover, ayarlar penceresi
- `src-tauri/src/gh.rs` — `gh_token` (tam yollar → PATH, 5 sn watchdog)
- `src-tauri/src/secret.rs` — `secret_get/set/delete` (Keychain)
- `src/core` — tipler, hatalar, `RefreshGate`
- `src/sources/{github,forge,sentry,claude-code}` — kaynak adapter'ları
- `src/ui` — Vue bileşenleri
- `_ref/ghbar` — GHBar referans kopyası (git'e girmez). Kod kopyalanmaz; dosya yorumlarındaki kararlar okunur, testler spesifikasyon olarak çevrilir.

## Komutlar

- `npm test` — Vitest
- `cd src-tauri && cargo test` — Rust birim testleri
- `npm run tauri dev` / `npm run tauri build`
