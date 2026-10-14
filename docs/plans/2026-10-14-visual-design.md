# Hither Görsel Tasarım Uygulama Planı

> **For agentic workers:** Implement this plan task-by-task — a fresh subagent per task where tasks are independent, otherwise inline with a review checkpoint per batch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/specs/2026-10-14-visual-design.md`'deki Native görsel dili (iki nokta işareti, sistem renkleri, segmented panel, araç çubuklu Settings) uygulamak.

**Architecture:** Tasarım değerleri `src/ui/base.css`'te tek yerde; `src/ui/components/` altında tek işli Vue bileşenleri; panel ve Settings bu bileşenlerle yeniden yazılır, runtime'lar (`board-runtime.ts`, `suggestions-runtime.ts`, `update-runtime.ts`) ve çekirdek mantık değişmez. İkonlar `scripts/icons.swift` ile CoreGraphics'te çizilir. Rust tarafında yalnız tray ikonu, pencere ayarları ve `open_settings` komutu değişir.

**Tech Stack:** Tauri 2.12 (`macos-private-api`, `windowEffects`), Vue 3 `<script setup>`, TypeScript, Swift (yalnız ikon üretimi), Vitest.

## Global Constraints

- Yeni npm ya da Rust paketi yok. `macos-private-api` mevcut `tauri` crate'inin özelliğidir.
- Kod yorumu yok; tanımlayıcılar İngilizce; kullanıcıya dönük metinler İngilizce (uygulama dili).
- Çekirdek (`src/core`, `src/sources`) değişmez; `npm test` (175) ve `cargo test` (15) değişmeden geçer, `vue-tsc --noEmit` temiz.
- Renkler yalnız `base.css` değerlerinden (`--fg`, `--fg-2`, `--fg-3`, `--separator`, `--fill`, `--fill-hover`, `--fill-selected`, `--blue`, `--orange`, `--red`, `--green`, `--window`).
- Hiçbir hata görünmez kalmaz: bugün `ErrorRow` ile gösterilen her şey `Banner` ile gösterilir.
- Commit kullanıcı isteyince atılır (global kural); görev sonlarında yalnız doğrulama yapılır.

## Dosya yapısı

| Dosya | Görev |
| --- | --- |
| `scripts/icons.swift` | İşareti çizer; `src-tauri/icons/tray-template.png` (18 px), `tray-template@2x.png` (36 px), `app-icon.png` (1024 px) |
| `src/ui/base.css` | Tasarım değerleri (açık/koyu), temel tipografi, şeffaf panel zemini |
| `src/ui/components/Mark.vue` | İşaret SVG'si |
| `src/ui/components/Segmented.vue` | Panel sekmeleri + rozet |
| `src/ui/components/Banner.vue` | Hata/uyarı/eylem şeridi; `AppError` ya da düz metin alır |
| `src/ui/components/SectionHeader.vue` | Bölüm başlığı + sayaç + Mark seen |
| `src/ui/components/SignalRow.vue` | Sinyal satırı ve grup satırı |
| `src/ui/components/Group.vue` | Gruplu yüzey (+ isteğe bağlı başlık) |
| `src/ui/components/Toggle.vue` | macOS switch |
| `src/ui/components/SettingsTabs.vue` | Settings araç çubuğu |
| `src/ui/Panel.vue`, `LaneView.vue`, `SuggestionsView.vue` | Bileşenlerle yeniden yazılır |
| `src/ui/Settings.vue` | Sekme kabuğu + anlık kayıt |
| `src/ui/settings/*.vue` | `GeneralTab`, `GitHubTab`, `ForgeTab`, `SentryTab`, `AgentsTab`, `SuggestionsTab` |
| `src/ui/settings/context.ts` | Sekmelerin paylaştığı durum ve eylemler (`provide/inject`) |
| `src/ui/ErrorRow.vue` | Silinir (yerine `Banner`) |
| `src-tauri/src/lib.rs` | Template tray ikonu, Settings başlık çubuğu, `open_settings` komutu |
| `src-tauri/tauri.conf.json`, `Cargo.toml` | `transparent`, `windowEffects`, `macOSPrivateApi`, `macos-private-api` |
| `src/native.ts` | `openSettings()` |

---

### Task 1: İkonlar

**Files:** Create `scripts/icons.swift`; Create `src-tauri/icons/tray-template.png`, `tray-template@2x.png`, `app-icon.png`; regenerate `src-tauri/icons/*` via `tauri icon`; Modify `src-tauri/src/lib.rs` (tray builder).

**Interfaces:** Produces `src-tauri/icons/tray-template@2x.png` (siyah + şeffaf, 36×36). Rust tray `include_bytes!("../icons/tray-template@2x.png")`.

- [ ] Step 1: `scripts/icons.swift` — `drawMark(ctx, rect, dot, ring)`: 18 birimlik kutuyu `rect`'e ölçekle; dolu daire (4.5, 9, r 2.6), halka (13.5, 9, r 2.6, çizgi 1.6), çizgi (7.4→10.6, 1.6, yuvarlak uç). Tray: 18 ve 36 px, siyah. Uygulama ikonu: 1024 px, yuvarlak kare (köşe %22.37, ~100 px kenar boşluğuyla 824 px gövde — macOS ikon ızgarası), dikey degrade `#FFFFFF→#E9EBF0`, iç kenar `rgba(0,0,0,.18)`, işaret gövde genişliğinin %55'i, dolu nokta `#0A84FF`, halka/çizgi `#1D1D1F`. `CGImageDestination` ile PNG yazar; çıkış dizini argüman.
- [ ] Step 2: Run `swift scripts/icons.swift src-tauri/icons` → üç dosya; `sips -g pixelWidth -g pixelHeight` ile boyutları doğrula.
- [ ] Step 3: Run `npm run tauri icon src-tauri/icons/app-icon.png` → `icon.icns`, PNG'ler yenilenir.
- [ ] Step 4: `lib.rs`: `.icon(Image::from_bytes(include_bytes!("../icons/tray-template@2x.png"))?)` + `.icon_as_template(true)`.
- [ ] Step 5: `cargo build` temiz.

### Task 2: Tasarım değerleri ve temel bileşenler

**Files:** Modify `src/ui/base.css`; Create `src/ui/components/{Mark,Segmented,Banner,SectionHeader,SignalRow,Group,Toggle}.vue`; Delete `src/ui/ErrorRow.vue` (Task 3–4'te kullanımlar değiştikten sonra).

**Interfaces (props):**
- `Mark`: `{ size?: number; tone?: 'color' | 'muted' }`
- `Segmented`: `{ items: { id: string; label: string; badge?: number; critical?: boolean }[]; modelValue: string }`, emit `update:modelValue`
- `Banner`: `{ tone: 'error' | 'warning' | 'action'; error?: AppError; text?: string; detail?: string }`, slot `action`; `error` verilirse metin `errorText`, ipucu `errorHint`'ten (command ise "Run `x` in a terminal")
- `SectionHeader`: `{ title: string; count: number; unseen: number }`, emit `markSeen`
- `SignalRow`: `{ title: string; subtitle: string; age: string; severity: Signal['severity']; unseen: boolean; group?: boolean; expanded?: boolean; nested?: boolean }`, emit `activate`
- `Group`: `{ label?: string }`, default slot
- `Toggle`: `{ modelValue: boolean; disabled?: boolean }`, emit `update:modelValue`

- [ ] Step 1: `base.css` — spec'teki tablo değerleri `:root` ve koyu `@media`; `html, body { background: transparent }` (panel cam için), `body.window { background: var(--window) }` (Settings); `tabular-nums` yardımcı sınıfı `.num`; `prefers-reduced-motion` için `--motion: 1`/`0`.
- [ ] Step 2: Bileşenleri yaz (yalnız `base.css` değişkenleri; ölçüler spec'teki tipografi ve köşe tablosundan).
- [ ] Step 3: `npx vue-tsc --noEmit` temiz.

### Task 3: Panel

**Files:** Modify `src/ui/Panel.vue`, `src/ui/LaneView.vue`, `src/ui/SuggestionsView.vue`, `src/ui/main.ts` (body sınıfı), `src/native.ts`; Modify `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`.

**Interfaces:** Consumes Task 2 bileşenleri. Produces `openSettings(): Promise<void>` (`native.ts`) → Rust `open_settings` komutu.

- [ ] Step 1: `tauri.conf.json`: panel penceresine `"transparent": true`, `"windowEffects": { "effects": ["popover"], "state": "active", "radius": 12 }`; `app.macOSPrivateApi: true`. `Cargo.toml`: `tauri` özelliklerine `macos-private-api`.
- [ ] Step 2: `lib.rs`: `#[tauri::command] fn open_settings_window(app: AppHandle) { open_settings(&app) }` kaydı; `native.ts`: `openSettings = () => invoke('open_settings_window')`.
- [ ] Step 3: `Panel.vue`: `Segmented` (rozet = `laneBadges`, `critical` = şeritte `severity === 'critical'` görülmemiş öğe var mı), hesap satırı (`Mark` + hesap + "· {ago}" + ↻ + ⚙︎), güncelleme ve hook şeritleri `Banner tone="action"`.
- [ ] Step 4: `LaneView.vue`: problemler `Banner tone="error"`, notice'lar `Banner tone="warning"`, bölümler `SectionHeader` + `SignalRow`; boş durum `Mark size=32 tone=muted`.
- [ ] Step 5: `SuggestionsView.vue`: kart = `Group`; ilk eylem birincil buton, diğerleri ikincil; hatalar `Banner`; özet kutusu; alt bilgi.
- [ ] Step 6: `npx vue-tsc --noEmit`, `npm test` geçer.

### Task 4: Settings

**Files:** Modify `src/ui/Settings.vue`; Create `src/ui/components/SettingsTabs.vue`, `src/ui/settings/context.ts`, `src/ui/settings/{GeneralTab,GitHubTab,ForgeTab,SentryTab,AgentsTab,SuggestionsTab}.vue`; Modify `src-tauri/src/lib.rs` (Settings penceresi); Delete `src/ui/ErrorRow.vue`.

**Interfaces:**
- `context.ts`: `createSettingsContext()` → `{ state, save(patch: Partial<Settings>): Promise<void>, attempt(task), updates, …eylemler }`; `provideSettings(ctx)`, `useSettings()`.
- `save(patch)`: `state.settings = normalizeSettings({ ...state.settings, ...patch })`, `writeSettings(store, state.settings)`; hata `state.errors`'a.

- [ ] Step 1: `context.ts` — bugünkü `Settings.vue` script'indeki durum ve eylemleri taşı (token, Forge listeleri, hook durumu, güncellemeler); `save(patch)` ekle.
- [ ] Step 2: Sekme dosyaları — spec'teki tablo; denetimler `Group` + `Toggle` + `select`/`input`; metin alanları `@change` ile `save`, switch/onay kutusu/select anında `save`.
- [ ] Step 3: `Settings.vue` — `SettingsTabs` (General, GitHub, Forge, Sentry, Agents, Suggestions), seçili sekme, üstte hata `Banner`'ları; Save butonu yok.
- [ ] Step 4: `lib.rs` Settings penceresi: `.inner_size(520.0, 560.0)`, `.title_bar_style(TitleBarStyle::Overlay)`, `.hidden_title(true)`, `.min_inner_size(520.0, 360.0)`.
- [ ] Step 5: `ErrorRow.vue`'yu sil (artık kullanılmıyor), `vue-tsc`, `npm test`, `cargo test`.

### Task 5: Doğrulama

- [ ] `npm test`, `cargo test`, `npx vue-tsc --noEmit`.
- [ ] `npm run tauri build`; `.app` boyutu; çalışan Hither'i PID ile kapat, yenisini aç.
- [ ] Kullanıcıdan görsel kontrol listesi: açık/koyu temada panel, menü çubuğu ikonu, Dock/Finder ikonu, Settings'in altı sekmesi, anlık kaydın uygulama yeniden başlayınca korunması.
