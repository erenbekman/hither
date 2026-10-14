# Hither — Ürün ve Mimari Planı

> Hither: eski İngilizcede "buraya". "Hither and thither" = gelip giden işler.

Son güncelleme: 14 Ekim 2026

## Özet

Hither (çalışma adı), solo geliştiricinin menü çubuğunda üç soruyu tek bakışta cevaplayan bir Tauri + Vue uygulaması: **bana ne geldi, gönderdiğim ne oldu, agent'larım ne yapıyor**. GHBar sadece ilkini cevaplıyor ve bunu bilerek yapıyor; biz onun disiplinini koruyup diğer ikisini ekliyoruz.

- **Gelen** — GHBar ile aynı: başkalarının repolarına açtığı PR/issue, senden review bekleyen PR'lar.
- **Giden (Ship)** — PR'larının ve ana branch'in CI durumu, Forge deploy'ları, production hataları (Sentry).
- **Agentlar** — çalışan Claude Code oturumları, input/izin bekleyenler, agent'ların açtığı ve review bekleyen PR'lar.
- **Öneriler** — üç şeridin sinyallerinden çıkan aksiyonlar; bir tıkla Claude Code'u ilgili repoda doğru prompt'la başlatır.

Tasarım ilkesi GHBar'dan miras: liste okunacak kadar kısa kalır, hata asla boş liste gibi görünmez, veri Mac'ten ayrılmaz (Claude'a gönderim yalnızca açık onayla).

## GHBar'dan öğrendiklerimiz

GHBar 28 Swift dosyası ve yaklaşık 4.300 satır; değerli olan kod değil, her dosyanın yorumunda yazan **önceden yanlış yapıp düzeltilmiş kararlar**. Bunları TypeScript'e modül modül taşıyoruz; testlerini de spesifikasyon olarak çeviriyoruz. Referans kopya: `_ref/ghbar` (git'e girmez).

| GHBar dosyası | Taşınacak karar | Hither karşılığı |
| --- | --- | --- |
| Query.swift | Beş arama tek GraphQL isteğinde; 4000 karakter tavanı; dışlama filtreleri düşerse sessiz kalmaz, uyarı satırı olur | `sources/github/query.ts` |
| GitHubClient.swift | 15 sn timeout; 403'ü rate limit ile SSO reddini ayırmak; reset zamanı `retry-after` → `x-ratelimit-reset` → 1 saat | `sources/github/client.ts` |
| Filtering.swift | Aynı PR birden fazla aramada çıkarsa en güçlü sinyal kazanır; gizli bölüm öğe "sahiplenmez"; 3'ten fazla öğeli repo tek satıra katlanır | `core/filtering.ts` |
| SeenStore.swift | **Görüldü ile bildirildi ayrı kümeler**; ilk açılışta bildirim yağmuru yok ama her şey okunmamış başlar | `core/seen-store.ts` |
| RefreshGate.swift | Aynı anda tek yenileme; çakışan istek düşmez, kuyruğa girer | `core/refresh-gate.ts` |
| AppError.swift | Her hata menüde görünür satır; "bakamadım" ≠ "bekleyen yok" | `core/errors.ts` (kaynak başına) |
| Notifier.swift | İzin ilk gerçek bildirimde istenir; 5'ten fazla öğe tek özet bildirimi olur | Rust `tauri-plugin-notification` |
| TokenProvider.swift | `gh auth token --hostname github.com`; .app PATH'i boş olduğu için tam yollar denenir; 5 sn watchdog | Rust komutu `gh_token` |

Lisans notu: GHBar MIT. Mantığı çeviriyorsak repoya `NOTICE` dosyası ekleyip Mert Çobanov'un telif satırını koruyoruz; README'de esinlenme kaynağı olarak anıyoruz.

## Mimari

Rust tarafı yalnızca işletim sistemine dokunan işleri yapar; tüm mantık, test edilebilir saf TypeScript modüllerindedir. Rust'ta 300 satırı geçmeyen bir kabuk hedefleniyor.

Katmanlar (veri aşağı akar, aksiyon yukarı çıkar):

```
Dış dünya        GitHub · Forge · Sentry API     Claude Code (http hook POST)    claude CLI / Terminal
                          │ istek                          │ POST                          ▲ başlatır
Rust kabuk       plugin-http (token keychain'den)  Hook dinleyici (127.0.0.1+token)  Süreç başlatıcı
                          │                                │                               ▲ aksiyon
TypeScript       Source adapter'lar → Signal (seen/notified deposu, RefreshGate)  →  Kural motoru
                          │ sinyal listesi                                                 ▲ tıkla
Vue panel        [Gelen]  [Giden]  [Agentlar]  [Öneriler]
```

Gizli pencere kapatılmaz, yalnızca saklanır; bu sayede webview'daki zamanlayıcı panel kapalıyken de çalışır.

**Tek model: Signal.** Her kaynak kendi verisini aynı şekle çevirir; filtreleme, gruplama, görüldü durumu ve bildirim bu tek tip üzerinde çalışır.

```ts
type Lane = 'incoming' | 'outgoing' | 'agents'

interface Signal {
  id: string            // kararlı anahtar, genelde URL
  source: 'github' | 'forge' | 'sentry' | 'claude-code'
  lane: Lane
  kind: string          // 'pr' | 'ci-failed' | 'deploy' | 'error' | 'session' ...
  severity: 'info' | 'attention' | 'critical'
  project: string       // owner/repo ya da Forge site adı
  title: string
  url?: string
  actor?: string
  at: string            // ISO tarih
  meta?: Record<string, unknown>
}

interface PollResult {
  signals: Signal[]
  notices: string[]     // ölümcül olmayan uyarılar: filtre düştü, arama kırpıldı, kısmi hata
  account?: string      // hesap değişince seen deposu sıfırlanır
  retryAt?: string      // rate limit bittiyse bir sonraki deneme zamanı
}

interface Source {
  id: string
  interval: number      // sn; hook kaynağı için 0 (push)
  poll(ctx: Ctx): Promise<PollResult>   // hata fırlatır, yutmaz
}
```

- **Bağımlılıklar minimum:** Vue 3, Vite, TypeScript, Vitest. Rust tarafında `tauri-plugin-http`, `-notification`, `-positioner`, `-store`, `keyring`, `tiny_http`. GitHub GraphQL webview `fetch`'i ile çağrılır (CORS ve rate-limit header'ları açık); Forge ve Sentry `tauri-plugin-http` ile. Link açma Rust'ta `open_url` (yalnız http/https); hangi host'ların açılabileceğine TS'teki `isOpenable` karar verir (GitHub, Sentry, Forge ve izlenen Forge siteleri). UI kütüphanesi ve state kütüphanesi yok; `reactive()` yeterli.
- **Depolama:** GHBar gibi düz JSON (`seen.json`, `settings.json`) `tauri-plugin-store` ile. SQLite'a ancak geçmiş sorgulamak gerekirse geçilir.
- **Gizli bilgiler:** Forge ve Sentry token'ları macOS Keychain'de; diskte düz metin yok.

## Şeritler ve veri kaynakları

Üç şerit de GHBar'ın bütçe kuralına uyar: **kaynak başına yenileme başına bir istek**. GitHub tarafı Gelen, Giden-CI ve agent PR'larını aynı GraphQL sorgusunda alias'larla toplar.

### Gelen

GHBar'ın beş araması değişmeden taşınır (başkalarının PR/issue'ları, review bekleyenler, changes requested, kendi PR'ların). Tek fark: GHBar bot PR'larını atar, biz agent bot'larını atmayıp **Agentlar** şeridine yönlendiririz. Dependabot gibi bot'lar yine filtrelenir.

### Giden (Ship)

| Kaynak | Ne okunur | Sinyal | Önem |
| --- | --- | --- | --- |
| GitHub CI | Kendi PR'larının son commit'i ve izlenen repoların ana branch'i için `statusCheckRollup` | `ci-failed`, `ci-fixed` | Ana branch kırmızı = critical |
| Forge (API v2) | İzlenen sitelerin son deployment'ı ve durumu | `deploy-failed`, `deploy-ok` | Başarısız = critical; başarılı 30 dk görünür kalır |
| Sentry | Projelerin son 1 saatte ilk kez görülen, çözülmemiş issue'ları | `error-new`, `error-spike` | Spike = attention |

CI bilgisi mevcut GraphQL sorgusuna eklenir, ek istek doğurmaz. İzlenen repolar sorguya değişkenle (`$w0o`/`$w0n`) giren alias'lardır; repo adı sorgu metnine gömülmez. **Ölçüldü (14 Ekim 2026):** 3 izlenen repoyla sorgu maliyeti 1 puan; 5 dk aralıkla saatte 12 puan = %0.24.

Doğrulanan uç noktalar:
- Forge: `GET https://forge.laravel.com/api/orgs/{org-slug}/servers/{server}/deployments?sort=-created_at&include=site` (sunucu başına bir istek, dakikada 60 istek sınırı). Durumlar: `failed`, `failed-build`, `finished`, `deploying`, `queued`, `pending`, `cancelled`. Forge CORS'a izin vermez → `tauri-plugin-http`, scope yalnız `forge.laravel.com/api/*`.
- Sentry: `GET https://sentry.io/api/0/organizations/{org}/issues/?query=is:unresolved lastSeen:-1h&statsPeriod=24h&groupStatsPeriod=24h`. Spike = son saatteki olay ≥10 ve 24 saatlik saatlik ortalamanın 5 katından fazla.
- Forge satırı sitenin kendi adresini açar; Forge web sayfası M4 aksiyonlarına kalır.

### Agentlar

Claude Code `http` tipinde hook destekliyor: olayın JSON'unu doğrudan bir URL'e POST ediyor ve bağlantı hatası Claude Code'u bloklamıyor. Uygulama kapalıyken Claude Code etkilenmez.

| Hook olayı | Oturum durumu | Panelde |
| --- | --- | --- |
| `SessionStart` | Çalışıyor | Repo adı (`cwd`'den), başlangıç saati |
| `Notification` → `permission_prompt`, `agent_needs_input`, `idle_prompt` | **Seni bekliyor** | Yeşil satır + bildirim; kaç dakikadır beklediği |
| `Stop` / `Notification` → `agent_completed` | Tur bitti | Gri; tıklayınca terminale dön |
| `StopFailure` | Hata | Kırmızı satır |
| `SessionEnd` | Kapandı | Listeden düşer |

Kurulum: "Hook'ları kur" butonu `~/.claude/settings.json` dosyasına kendi bloğunu **birleştirerek** ekler, önce yedek alır ve tek tıkla geri kaldırır. Dinleyici yalnızca `127.0.0.1`'e bağlanır ve header'daki rastgele token'ı kontrol eder.

**Uygulandı (M3):**
- Dinleyici `tiny_http`, `127.0.0.1:47811/hook`. Token 32 bayt rastgele, Keychain'de (`hook-token`); hook'larda `Authorization: Bearer …` header'ı olarak `~/.claude/settings.json`'a yazılır (dosya kullanıcıya ait, yerel). Hook `timeout` 5 sn; Claude Code bağlantı hatasını bloklamaz.
- Abone olunan olaylar: `SessionStart`, `UserPromptSubmit`, `Notification`, `PostToolUse` (izin verildikten sonra "çalışıyor"a dönmek için), `Stop`, `StopFailure`, `SessionEnd`. Rust gelen JSON'dan yalnız kullanılan alanları alır; prompt metni ve tool girdileri webview'a hiç ulaşmaz.
- Birleştirme/geri alma saf TS'te (`core/claude-settings.ts`): Hither'in hook'ları URL'leriyle tanınır, kullanıcının diğer hook'ları dokunulmadan kalır, kaldırma dosyayı birebir eski haline döndürür. Geçersiz JSON'lu dosyaya hiç yazılmaz. Her yazımdan önce `settings.json.hither-backup-<unix>` yedeği alınır; yazım geçici dosya + rename ile atomiktir.
- Oturumlar `agents.json`'da tutulur; 12 saat olay gelmeyen oturum düşer.
- Agent PR varsayılanları gerçek PR'lardan doğrulandı (14 Ekim 2026): GraphQL login'leri `claude`, `copilot-swe-agent`, `chatgpt-codex-connector`, `devin-ai-integration`, `google-labs-jules`, `cursor`; branch önekleri `claude/`, `copilot/`, `codex/`.
- GraphQL maliyeti agent PR'ların check durumu eklenince 2 puana çıktı (son commit yalnız `prs` ve `myPullRequests` aramalarında okunur); 5 dk aralıkla saatte 24 puan = %0.48.

Agent PR'ları: yazarı bilinen agent hesaplarından biri olan ya da `claude/` gibi agent branch önekiyle açılmış PR'lar bu şeride taşınır. Hesap listesi ayarlardan düzenlenir; varsayılan login adları M3'te gerçek PR'lardan doğrulanacak. Checks yeşil ve draft değilse durum "review'e hazır" olur.

## Claude Code öneri katmanı

Öneriyi Claude üretmez, **deterministik kurallar** üretir; Claude yalnızca kullanıcı bir karta tıkladığında devreye girer.

| Tetikleyici (kural) | Öneri kartı | Aksiyon |
| --- | --- | --- |
| Deploy'dan sonraki 30 dk içinde aynı projede Sentry hatası | "Bu hatalar X deploy'undan sonra başladı" | Claude ile hatayı ve deploy diff'ini birlikte incele; Forge'da rollback sayfasını aç |
| Kendi PR'ında CI kırmızı | "#42 testleri kırık" | Claude, repoda başarısız job'un logunu okuyup düzeltme önerir; push etmez |
| Ana branch kırmızı | "main kırık, son commit: …" | Claude ile son commit'i incele |
| Forge deploy başarısız | "Ustad deploy'u düştü" | Deploy logunu Claude ile özetle; Forge'da aç |
| PR'ına changes requested | "Review yorumları bekliyor" | Claude yorumları okuyup madde madde ele alır |
| Agent PR'ı review'e hazır | "Agent PR'ı hazır: …" | Claude ile diff'i özetle ve riskleri listele |
| Claude oturumu 10 dk'dır bekliyor | Tek seferlik hatırlatma bildirimi | Terminali öne getir |
| Gelen PR 3 gündür yanıtsız | "Katkı bekliyor" | GitHub'da aç |

**Aksiyon nasıl çalışır**

1. Repo ↔ yerel klasör eşlemesi otomatik öğrenilir: hook `cwd` gönderir, uygulama `git remote`'u okuyup kaydeder. Eşleme yoksa klasör bir kez sorulur.
2. Prompt bir şablondan üretilir ve geçici dosyaya yazılır; şablonlar düzenlenebilir dosyalardır.
3. Seçilen terminalde `claude` o klasörde **interaktif** açılır. Hiçbir aksiyon arka planda kendiliğinden çalışmaz.
4. "Özetle" gibi kısa işler `claude -p` ile panel içinde yanıtlanır; buton verinin Claude'a gideceğini belirtir, sonuç öğe başına önbelleklenir.

**Güvenlik:** PR başlığı, log ve hata metni asla shell komutuna gömülmez. Prompt yalnızca kimlikleri (repo, PR numarası, Sentry issue id) taşır, içeriği Claude kendisi `gh` ve API ile okur. Şablonlar "push etme, önce planı göster" satırıyla başlar.

**Uygulandı (M4):**
- Kurallar saf TS'te (`core/suggestions.ts`); kartlar panelde zaten olan sinyallerden üretilir, ek API isteği yoktur. Deploy–hata korelasyonu Forge sitesi ↔ Sentry projesi eşlemesiyle yapılır (Settings → Sentry).
- Şablonlar `~/Library/Application Support/dev.hither.app/templates/*.md` dosyalarıdır; ilk açılışta varsayılanlar yazılır, sonra kullanıcının düzenlemesi korunur. `renderTemplate` yalnızca kimlik biçimli değerleri (`[\w./#:@,+-]+`) kabul eder; başlık ya da log gibi serbest metin prompt'a giremez.
- Başlatma: Rust prompt'u `0600` geçici dosyaya, başlatıcıyı `0700` `.command` dosyasına yazar ve `open -a iTerm` ile açar. Script klasöre `cd` eder, prompt'u dosyadan okur, iki dosyayı da siler ve `claude`'u (zsh fonksiyonları atlanarak `~/.local/bin/claude`) interaktif, varsayılan izin modunda başlatır. Testte `$(rm -rf ~)` içeren prompt'un kabukta çalışmadan harfi harfine iletildiği doğrulanır.
- Forge deploy logu Hither tarafından çekilir, ayrı bir `0600` dosyaya yazılır; prompt'a yalnızca dosya yolu girer.
- `claude -p` yalnız okuma araçlarıyla çalışır: `Read`, `Grep`, `Glob`, `Bash(gh pr view:*)`, `Bash(gh pr diff:*)`, `Bash(gh run view:*)`; 2 dakika zaman aşımı. Sonuç kart başına `suggestions.json`'da önbelleklenir.
- Repo ↔ klasör eşlemesi hook `cwd`'sinden `git rev-parse --show-toplevel` ve `git remote get-url origin` ile öğrenilir; elle girilen yol da aynı kontrolden geçer (remote repo ile eşleşmezse reddedilir).
- Kapı ölçümü: kart aksiyonları `suggestions.json`'da tarihleriyle tutulur; Suggestions sekmesinin altında son 7 günün sayısı görünür.

## Yol haritası

Toplam tahmini 5–7 hafta. Bir aşama bitmeden ve kapısı geçilmeden sonrakine geçilmez.

| Aşama | Kapsam | Tahmin | Kapı |
| --- | --- | --- | --- |
| M0 · İskelet | Tauri tray + popover, boş Vue panel, ayarlar, keychain, gh token | 1 hafta sonu | Popover odak kaybında kapanıyor, ikona hizalı, binary 15 MB altı |
| M1 · Gelen | Query, Filtering, SeenStore, RefreshGate, bildirimler; GHBar testleri Vitest'e çevrilmiş | 1 hafta | **1 hafta günlük kullanım; GHBar'ı kaldırabiliyorsan devam** |
| M2 · Giden | CI durumu aynı GraphQL sorgusunda, Forge ve Sentry adapter'ları | 1 hafta | Ustad ve Medvise bağlı, GitHub puanı saatte %1 altında |
| M3 · Agentlar | Hook dinleyici, hook kurulum/kaldırma, oturum durumları, agent PR'ları | 1 hafta | settings.json yedekle/birleştir/geri al testleri geçti |
| M4 · Öneriler | Kural motoru, prompt şablonları, terminal başlatma, `claude -p` özetleri, deploy-hata korelasyonu | 1–2 hafta | Bir haftada en az 3 öneri kartına gerçekten tıklandı |
| M5 · Dağıtım | Developer ID imza + notarization, Homebrew tap, Tauri updater, tanıtım sayfası | 2–3 gün | — |

**İlk sürümde olmayacaklar:** Windows/Linux paketleri, GitLab ve Bitbucket, Vercel ve Cloudflare deploy'ları, mobil bildirim, takım modu, sunucu tarafı her şey.

## Pre-mortem

| Risk | Belirti | Önlem |
| --- | --- | --- |
| Kapsam yayılması | M2 bitmeden M4'e geçmek | Kapı kriterleri; her aşama tek başına kullanılabilir sürüm |
| GHBar'ın sadeliğini kaybetmek | Panel kaydırma gerektiriyor | Şerit başına üst sınır; başarılı deploy 30 dk sonra düşer; boş şerit gizlenir |
| Tauri popover macOS'ta kusurlu | Odak kaybında kapanmama, yanlış konum, Dock ikonu | M0'ın ilk günü spike; gerekirse `tauri-nspopover-plugin` |
| `~/.claude/settings.json` bozulması | Kullanıcının hook'ları kaybolur | Birleştirme, önceden yedek, kaldırma komutu, testler |
| Prompt injection | Kötü niyetli PR başlığı shell'e ya da prompt'a sızar | Dış metin shell'e girmez; prompt yalnızca kimlik taşır; Claude interaktif açılır |
| API değişiklikleri | Forge v2 ya da hook şeması değişir | Her adapter kendi hata satırını gösterir; diğer şeritler çalışmaya devam eder |
| Token sızıntısı | Token diskte düz metin | Yalnızca Keychain; loglarda maskeleme |
| Hook dinleyicisine dışarıdan erişim | Yerel ağdan sahte olay | Yalnızca `127.0.0.1`, rastgele token header'ı |

## Kaynaklar

- GHBar: https://ghbar.cobanov.dev/ · https://github.com/cobanov/ghbar
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Laravel Forge changelog: https://laravel.com/forge/docs/changelog.md
- Tauri v2 system tray: https://v2.tauri.app/learn/system-tray/
- tauri-nspopover-plugin: https://github.com/freethinkel/tauri-nspopover-plugin
