# Hither · Görsel tasarım

Tarih: 14 Ekim 2026 · Durum: onaylandı, uygulanacak · Kapsam: dağıtımdan (M5 yayın) ve tanıtım sayfasından önce.

## Amaç

Uygulamanın tek ve tutarlı bir görsel dili olsun: menü çubuğu ikonu, uygulama ikonu, panel ve Settings aynı işaret, renk ve bileşenleri kullansın. Hither macOS'un kendi parçası gibi görünsün (Native yön).

Kapsam dışı: yeni özellik, yeni veri, yeni şerit; tanıtım sayfası (ayrı iş, bu dili kullanacak).

## Kararlar

| Konu | Seçim |
| --- | --- |
| Yön | A · Native: buzlu cam, SF Pro, macOS sistem renkleri |
| Menü çubuğu ikonu | 2 · Buradan oraya: dolu nokta, kısa çizgi, boş halka |
| Uygulama ikonu | C · Açık zemin, mavi dolu nokta, koyu halka |
| Panel | A · Segmented control, düz liste |
| Settings | A · Araç çubuğu sekmeleri, anlık kayıt |

## İşaret

Tek geometri, her yerde aynı (18×18 birimlik kutuda):

- Dolu nokta: merkez (4.5, 9), yarıçap 2.6
- Boş halka: merkez (13.5, 9), yarıçap 2.6, çizgi 1.6
- Bağlantı çizgisi: (7.4, 9) → (10.6, 9), çizgi 1.6, yuvarlak uç

**Menü çubuğu ikonu:** template PNG, siyah + şeffaf, `tray-template.png` (18 px) ve `tray-template@2x.png` (36 px). `TrayIconBuilder::icon_as_template(true)`. Okunmamış sayısı bugünkü gibi ikonun yanında başlık metni.

**Uygulama ikonu:** 1024 px. macOS yuvarlak kare (yarıçap %22.37), dikey degrade `#FFFFFF → #E9EBF0`, ince iç kenar `rgba(0,0,0,.18)`. Dolu nokta `#0A84FF`, halka ve çizgi `#1D1D1F`. İşaret, kutunun ortasında genişliğin ~%55'i. `npm run tauri icon` ile tüm boyutlar üretilir.

**Üretim:** `scripts/icons.swift` işareti CoreGraphics ile çizer ve üç PNG'yi yazar; çıktılar repoya girer. Yeni paket yok.

## Tasarım değerleri

`src/ui/base.css` içinde `:root` (açık) ve `@media (prefers-color-scheme: dark)` (koyu). Uygulama sistem görünümünü izler, ayrı tema ayarı yoktur.

| Değer | Açık | Koyu | Kullanım |
| --- | --- | --- | --- |
| `--fg` | `#1D1D1F` | `#F5F5F7` | Ana metin |
| `--fg-2` | `#6E6E73` | `#A1A1A6` | İkincil metin, görülmüş başlık |
| `--fg-3` | `#8E8E93` | `#8E8E93` | Alt satır, yaş, sayaç |
| `--separator` | `rgba(0,0,0,.10)` | `rgba(255,255,255,.12)` | İnce çizgiler (0.5 px) |
| `--fill` | `rgba(0,0,0,.04)` | `rgba(255,255,255,.06)` | Gruplu yüzey |
| `--fill-hover` | `rgba(0,0,0,.06)` | `rgba(255,255,255,.09)` | Satır üzerine gelince |
| `--fill-selected` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.18)` | Seçili segment |
| `--blue` | `#007AFF` | `#0A84FF` | Görülmemiş, birincil eylem, bağlantı |
| `--orange` | `#FF9500` | `#FF9F0A` | Dikkat isteyen |
| `--red` | `#FF3B30` | `#FF453A` | Kritik, hata |
| `--green` | `#34C759` | `#30D158` | Bağlı hesap, açık anahtar |
| `--window` | `#ECECEC` | `#1E1E1E` | Settings penceresi zemini |

Tipografi: `-apple-system` (SF Pro), sayılarda `font-variant-numeric: tabular-nums`.

| Rol | Boyut / ağırlık |
| --- | --- |
| Hesap satırı | 12.5 / 600 |
| Satır başlığı | 12.5 / 500 (görülmüşse 400, `--fg-2`) |
| Alt satır, yaş | 11 / 400, `--fg-3` |
| Bölüm başlığı | 11 / 600, `--fg-2`, cümle biçimi (büyük harf yok) |
| Segment | 11.5 / 500 |
| Settings etiketi | 13 / 400 |

Ölçüler: 4 pt ızgara. Köşe: panel 12, grup 8, satır vurgusu 6, buton 6, rozet tam yuvarlak.

## Panel (A · Segmented)

Pencere: 380×520, `transparent: true`, `windowEffects: { effects: ["popover"], state: "active", radius: 12 }`, `macOSPrivateApi: true` (App Store'a girmeyi engeller; Developer ID dağıtımında sorun değil). Gövde zemini şeffaf; cam efekti macOS'tan gelir.

Yukarıdan aşağıya:

1. **Segmented control** (8 pt kenar boşluğu): Incoming · Outgoing · Agents · Suggestions. Zemin `--fill`, seçili segment `--fill-selected` ve hafif gölge. Rozet segmentin içinde, şeritte kritik öğe varsa `--red`, yoksa `--blue`.
2. **Hesap satırı:** 15×9 renkli işaret (dolu nokta `--blue`), hesap adı, "· 2m" (`--fg-3`). Sağda ↻ (yenilerken döner, `--blue`) ve ⚙︎ (Settings'i açar). Altında 0.5 px `--separator`.
3. **Şeritler (banner):** Güncelleme, hook kurulumu, hata ve uyarılar aynı bileşen: 8 pt yuvarlak, 8 pt iç boşluk, panel kenarından 8 pt içeride. Ton: hata `--red`, uyarı `--orange`, eylem çağrısı `--blue` (zemin rengin %12'si, metin rengin kendisi). Eylem butonu sağda, birincil buton stilinde.
4. **Bölüm başlığı:** "Review Requested" + sayaç (`--fg-3`) + sağda "Mark seen" (`--blue`, yalnızca görülmemiş öğe varsa).
5. **Satır:** solda 7 pt durum noktası, ortada başlık ve alt satır (tek satır, taşarsa üç nokta), sağda yaş. Durum noktası: görülmemiş + info `--blue`, görülmemiş + attention `--orange`, görülmemiş + critical `--red`, görülmüş = 1 pt `--fg-3` halka. Kritik satırın başlığı `--red`. Üzerine gelince 4 pt içeriden 6 pt yuvarlak `--fill-hover`. Katlanmış repo satırında ▸, açılınca 90° döner (120 ms).
6. **Suggestions kartı:** `--fill` grup yüzeyi; başlıkta önem noktası, başlık, yaş, gizle (×). Altında detay (`--fg-2`), ardından eylemler: ilk eylem birincil (dolu `--blue`), diğerleri ikincil (`--fill` zemin). Özet metni karta gömülü `--fill` kutuda, seçilebilir.
7. **Boş durum:** ortada 32 pt soluk işaret (`--fg-3`, %50 opaklık) ve tek satır metin.
8. **Alt bilgi** (yalnız Suggestions): "N suggestions acted on in the last 7 days", 11 pt `--fg-3`.

Hareket: yalnız ↻ dönüşü ve ▸ dönüşü; `prefers-reduced-motion` açıksa dönüş yavaşlar, ▸ anında değişir.

## Settings (A · Araç çubuğu sekmeleri)

Pencere: 520 pt genişlik, yükseklik sekme içeriğine göre (en az 360). `titleBarStyle: "Overlay"`, `hiddenTitle: true`; trafik ışıkları solda, sekme çubuğu başlık alanında ortada. Zemin `--window`.

| Sekme | İçerik |
| --- | --- |
| General | Yenileme aralığı, bildirimler; Updates grubu (sürüm, durum, Check now, Install and restart) |
| GitHub | Hesaplar, organizasyonlar, repo listesi + Hide/Only, ana branch'i izlenen repolar; Görünüm grubu (bölümler, bot, draft, gruplama eşiği) |
| Forge | Aç/kapa, token, organizasyon, sunucular |
| Sentry | Aç/kapa, token, organizasyon slug'ı, projeler, Forge sitesi → Sentry projesi |
| Agents | Claude Code hook'ları (durum, Install / Reinstall / Remove, yedek dosyası), agent hesapları, branch önekleri |
| Suggestions | Şablon klasörü, terminal (iTerm, bilgi satırı) |

Sekme: 18 pt simge + 10 pt etiket, seçili sekme `--fill-selected`. İçerik: etiketli gruplar (panelle aynı `--fill` yüzey, 8 pt köşe), her satır "etiket ··· denetim". Denetimler: macOS switch (açık `--green`), açılır liste, onay kutusu (`--blue`), metin alanı, ikincil buton.

**Anlık kayıt:** Save butonu kalkar. Switch, onay kutusu, açılır liste ve radio değişince; metin alanları odaktan çıkınca (`change`) kaydedilir. Her kayıt `store.save()` + `settings-changed` olayı; panel yeniden okur. Kayıt hatası ilgili sekmenin üstünde kırmızı banner olur.

**Token satırı:** "Saved in Keychain" + Change (alan açılır) + Remove; değer hiç gösterilmez. Token yoksa doğrudan şifre alanı + Save token.

## Bileşenler

`src/ui/components/` altında küçük, tek işli Vue bileşenleri; hepsi yalnız `base.css` değerlerini kullanır:

| Bileşen | Görev |
| --- | --- |
| `Mark.vue` | İşaret (boyut, renkli/soluk) |
| `Segmented.vue` | Panel sekmeleri, rozetli |
| `Banner.vue` | Hata / uyarı / eylem şeridi (`ErrorRow` bunun yerine geçer) |
| `SectionHeader.vue` | Başlık + sayaç + Mark seen |
| `SignalRow.vue` | Durum noktası + başlık + alt satır + yaş; grup satırı varyantı |
| `Group.vue` | Gruplu yüzey (panel kartı, Settings grubu) |
| `Toggle.vue` | macOS switch |
| `SettingsTabs.vue` | Settings araç çubuğu |

`LaneView`, `SuggestionsView`, `Panel` ve `Settings` bu bileşenlerle yeniden yazılır; davranış ve veri akışı değişmez. `Settings.vue` sekme başına bölünür (`settings/GeneralTab.vue` …).

## Rust değişiklikleri

- Tray: yeni template PNG, `icon_as_template(true)`.
- Panel penceresi: `transparent`, `windowEffects` (tauri.conf.json), `app.macOSPrivateApi: true`, `tauri` crate'inde `macos-private-api` özelliği.
- Settings penceresi: `title_bar_style(Overlay)`, `hidden_title(true)`, genişlik 520.
- `open_settings` komutu (dişli için); mevcut `open_settings` fonksiyonunu çağırır.

## Hata yönetimi

Görsel değişiklik hiçbir hata yolunu kaldırmaz: `ErrorRow`'un gösterdiği her şey `Banner`'da görünür. Ayar kaydı başarısız olursa sessiz kalmaz (yukarıda). İkon üretimi başarısız olursa script sıfırdan farklı kodla çıkar.

## Doğrulama

- `npm test` ve `cargo test` değişmeden geçer; `vue-tsc` temiz.
- Yeni saf mantık yok. Anlık kayıt Tauri'nin store'una dokunduğu için birim testiyle değil elle doğrulanır: bir ayarı değiştir, pencereyi kapat, uygulamayı yeniden başlat, değer kalmalı.
- Görsel kontrol kullanıcıda: açık ve koyu temada panel, menü çubuğu ikonu (açık/koyu menü çubuğu), Dock/Finder'da uygulama ikonu, Settings'in altı sekmesi.
- Release derlemesi ve `.app` boyutu raporlanır.
