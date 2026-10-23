# agentwire · Hither'ın ajan olaylarını herkesin dinleyebileceği tek bir yerel akışa çevirmek — uygulama planı

> **For agentic workers:** Implement this plan task-by-task — a fresh subagent per task where tasks are independent, otherwise inline with a review checkpoint per batch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hither'ın bugün kendi içinde yaptığı işi (Claude Code, Codex, Copilot CLI ve opencode olaylarını yakalayıp `running / waiting / done / failed` durumuna çevirmek) ayrı, küçük, açık kaynak bir araca çıkarmak: `agentwire`. Her ajan için bir kez yazılan adaptörler olayları ortak bir şemaya çevirip yerel bir JSONL dosyasına yazar; Hither ve başka araçlar (coucou, harp, durum ışıkları, Harbor) aynı akışı dinler. Hither bu akışın ilk kullanıcısı olur.

**Neden:** Ajanları izleyen her araç aynı hook kodunu yeniden yazıyor ve her yeni ajan için ayrı issue açılıyor: omnigent-ai/omnigent "oh-my-pi harness" (8 tepki), "Copilot Enterprise" (5); Louis-CFM/coucou "oh-my-pi desteği" (6); vercel-labs/deepsec "GitHub Copilot" (7), "Cursor CLI" (4). Toplam 38 tepki. Reddit'te "Claude Code beni bekliyor mu diye bakmaktan yoruldum, fiziksel durum ışığı yaptım" 1889 upvote. Kaynak: Idea Radar, fikir #19 (23 Ekim).

**Rakip:** Pasif izleme için ortak bir olay akışı yok. agentclientprotocol/agent-client-protocol (★4488) ve coder/agentapi (★1496) ajanı kendileri başlatıp yönetiyor; kullanıcının terminalde açtığı oturumu izlemiyor. Durum ışığı projeleri (en büyüğü ★262) her biri kendi hook kodunu yazıyor. "coding agent status events hooks normalize", "agent hooks unified claude codex copilot opencode" aramaları boş.

**Hither'a katkısı:** Yeni ajan desteği (oh-my-pi gibi) Hither'da değil agentwire'da yazılır. Başka araçlar agentwire kullandıkça her README'de "works with Hither's agentwire" bağlantısı olur. coucou'nun omp issue'suna (#9) gerçek bir çözümle cevap verilir (Idea Radar fikir #16).

**Tech Stack:** Rust (tek ikili, yalnız `serde` + `serde_json`), JSONL. Hither tarafı: Tauri 2, Vue 3, TypeScript, Vitest.

## Ön koşul: Hither 0.2

0.2 kodda büyük ölçüde hazır (`8b36ceb` Needs you şeridi, `938e9e9` sayaç, hatırlatma, ⌥⌘J). Copilot CLI ve opencode desteği 23 Ekim itibarıyla çalışma ağacında, commit'lenmemiş (16 dosya). Bu plan **0.2 yayınlandıktan sonra** başlar; 0.2'nin kalan işleri `2026-10-21-agent-queue.md` Görev 6–8'de.

## Bugün olan (koddan doğrulandı)

- Dinleyici `127.0.0.1:47811/hook`, `Authorization: Bearer <token>`; `X-Hither-Agent` (`codex`, `copilot`, `opencode`), `X-Hither-Terminal`, `X-Hither-Terminal-Session` başlıkları (`src-tauri/src/hooks.rs`). Hither kapalıyken olaylar kaybolur.
- Kurulum yerleri (`config_path`): Claude `~/.claude/settings.json` (HTTP hook), Codex `~/.codex/hooks.json` (`curl` komutu, `async`), Copilot `~/.copilot/hooks/hither.json` (`curl` komutu), opencode `~/.config/opencode/plugins/hither.js` (olayları Claude biçimine çeviren eklenti).
- Durum makinesi `src/core/sessions.ts` → `transition()`: Claude olay adlarından (`PermissionRequest`, `UserPromptSubmit`, `Notification` + `notification_type`, `Stop`, `StopFailure`, `SessionEnd`…) duruma.
- Ajan araştırması: `docs/specs/2026-10-21-more-agents.md`. oh-my-pi "niş" diye dışarıda kalmıştı; `tool_approval_requested` olayı var. Radar verisi talep gösteriyor: Homebrew'da 30 günde 34.205 kurulum, iki repoda toplam 14 tepkili istek.

## Global Constraints

- Ajanı asla yavaşlatma, asla bozma: `emit` her durumda `0` ile çıkar, 2 ms hedef, 50 ms üst sınır; dosya yazılamazsa sessizce bırakır.
- Gizlilik: istem metni, araç girdisi, dosya içeriği yazılmaz. Yalnız şemadaki alanlar; `message` 200 karakterle sınırlı.
- Dizin `~/.agentwire` `0700`, dosyalar `0600`. Ağ yok, port yok, token yok.
- Kod yorumu yok (global kural); tanımlayıcılar İngilizce.
- Yeni bağımlılık: agentwire'da `serde`, `serde_json`. Hither'a yeni bağımlılık yok (dosya izleme polling ile). Başka bir şey gerekirse önce Eren'e sorulur.
- Hither'ın mevcut davranışı bozulmaz: agentwire isteğe bağlı bir kaynak; varsayılan bugünkü HTTP hook'ları.
- Repo açma, commit, sürüm ve yayın Eren'de.

## Şema v1

Her satır bir olay:

```json
{"v":1,"ts":"2026-10-23T09:12:03.120Z","agent":"claude","session":"8f1c…","cwd":"/Users/eren/Documents/projects/hither","state":"waiting","reason":"permission","tool":"Bash","message":"Claude needs your permission to use Bash","terminal":{"program":"iTerm.app","session":"w0t1p0:4F2C…"},"raw_event":"PermissionRequest"}
```

- `agent`: `claude | codex | copilot | opencode | omp`
- `state`: `running | waiting | done | failed | ended`
- `reason` (isteğe bağlı): `permission | question | idle | error | …`
- `raw_event`: ajanın kendi olay adı; hata ayıklama ve ileride yeni durumlar için.
- Durum olay başına hesaplanır, önceki olaya bakmadan (tüketiciler basit kalır). Önceki duruma bağlı tek kural (`Stop` sonrası gelen `idle_prompt` bildirimi) `agentwire status`'ta katlanır.

## Dosya yapısı (yeni repo `erenbekman/agentwire`)

| Dosya | Görev |
| --- | --- |
| `src/main.rs` | `emit`, `tail`, `status`, `install`, `uninstall`, `doctor` alt komutları |
| `src/schema.rs` | `Event` (şema v1), sınırlama ve temizlik |
| `src/agents/{claude,codex,copilot,opencode,omp}.rs` | ajanın payload'ından `Event`'e; kurulum içeriği |
| `src/spool.rs` | `O_APPEND` ile tek `write`, kilitli rotasyon (5 MB → `events.1.jsonl`) |
| `src/fold.rs` | olaylardan oturum durumlarına (`sessions.ts`'teki `transition`'ın karşılığı) |
| `adapters/opencode.js`, `adapters/omp.ts` | ajan içi eklentiler; `agentwire emit <agent>`'e stdin ile JSON verir |
| `SCHEMA.md` | şema, sürüm kuralları, tüketici örnekleri (Node, Swift, Rust; her biri ~30 satır) |
| `tests/fixtures/` | her ajan için dokümandaki örnek payload'lar |

Hither tarafı:

| Dosya | Görev |
| --- | --- |
| `src-tauri/src/wire.rs` | `~/.agentwire/events.jsonl`'i ofsetle izler (500 ms polling), satırları `agent-event` olarak yayınlar |
| `src/core/sessions.ts` | `fromWire(event)`: şema v1 → `Session`; `AGENTS`'a `omp` |
| `src/core/settings.ts` | `agentSource: 'hither' \| 'agentwire'` |
| `src/ui/settings/…` | Connections'ta kaynak seçimi ve agentwire durumu (`agentwire doctor --json`) |

---

## Görev 0 · Doğrulama

- [x] macOS APFS'te `O_APPEND` ile 4 KB altı tek `write` çağrılarının eşzamanlı yazıcılarda karışmadığını test et (50 paralel `emit`, 1000 satır, her satır geçerli JSON).
- [x] Hook'lar stdin'i kapatıyor mu, `emit`'in stdin okuma süresi sınırı (Claude Code hook stdin'i, Copilot `bash` hook'u, Codex komutu).
- [x] omp: `~/.omp/agent/extensions/` eklenti biçimi ve `pi.exec` ile alt süreç çalıştırma; `tool_approval_requested` payload'ı (omp.sh/docs).
- [x] İsim: `agentwire` npm'de boş, GitHub'da yalnız küçük repolar (23 Ekim). Homebrew tap'te çakışma yok mu? (crates.io da boş; `erenbekman/homebrew-tap`'te yalnız `Casks` var)
- [x] Çıktı: plana "Doğrulama notları".

### Doğrulama notları (23 Ekim)

- **Eşzamanlı yazma:** APFS'te 50 paralel `emit`, 1000 satır; hepsi bütün ve geçerli JSON (`tests/emit.rs`). Satırlar 4 KB'ın altında: `message` 200 karakter, `cwd` 1024 karakterle sınırlı.
- **stdin:** `emit` stdin'i en fazla 1 MB okuyor. Stdin 1 saniye içinde kapanmazsa satır yazmadan `0` ile çıkıyor (test 1,8 sn sınırında geçiyor). Claude Code JSON'u stdin'den veriyor; komut hook'larında `async: true` var ve Claude'u bekletmiyor (kurulum bunu kullanıyor). Codex'te de `async: true` kullanılıyor. Copilot'un `notification` hook'ları zaten bekletmiyor. Diğer Copilot hook'larının zaman aşımı 5 sn, ama `emit` milisaniyeler içinde bitiyor.
- **Hız:** release derlemede 100 `emit` ortalaması 3,5 ms, süreç başlatma dahil (hedef < 5 ms).
- **Gerçek Claude Code:** `claude -p --settings` ile agentwire hook'larıyla bir tur: `SessionStart` → `UserPromptSubmit` → `Stop` → `SessionEnd`, doğru sırada ve doğru durumlarla.
- **omp:** eklenti `~/.omp/agent/extensions/*.js`, `export default (pi) => …`, olaylar `pi.on(...)`. Bekleme `tool_approval_requested`, çözülme `tool_approval_resolved` (ikisinde `sessionId`, `toolName`), bitiş `agent_end` (`willContinue` false). Oturum kimliği `ctx.sessionManager.getSessionId()`. `pi.exec(command, args)` stdin almıyor ama argv ile, kabuk olmadan çalıştırıyor → `emit` olayı `--payload` argümanıyla da kabul ediyor. Kaynak: `can1357/oh-my-pi` → `packages/coding-agent/src/extensibility/extensions/types.ts`, `shared-events.ts`, `exec/exec.ts`.
- **İsim:** `agentwire` crates.io, npm ve Homebrew'da (formula ve cask) boş. GitHub'da küçük repolar var; en yakını `dotdevdotdev/agentwire-dev` (★23, Claude Code filosu yönetimi). Karışıklık riski düşük ama README'de "event stream" vurgusu net olmalı.
- **Kararlar (Eren):** Görev 0–3 şimdi, Görev 4 Hither 0.2 yayınlandıktan sonra. Hither tarafında dosya izleme Rust'ta değil: Rust yalnız "şu ofsetten sonrasını oku" komutu verir, yoklama ve şema → oturum çevirisi TS'te (Rust ince kabuk ilkesi). `serde_json` `preserve_order` özelliğiyle (indexmap): ayar dosyalarının anahtar sırası korunur.
- **Şemaya eklenen:** `reason: progress` (araç çalıştı, izin cevaplandı). `status` bu olayla yalnız `waiting` → `running` geçişi yapar; arka plandaki geç bir hook bitmiş turu yeniden açmaz (Hither'daki `PostToolUse` kuralının karşılığı).

## Görev 1 · Şema ve `emit`

- [x] `agentwire emit <agent>`: stdin'den payload (en fazla 1 MB, 1 sn), ajan modülüyle `Event`'e, ortamdan `TERM_PROGRAM` ve `ITERM_SESSION_ID`, tek satır JSON, `spool` ile yaz. Her hata yutulur, çıkış `0`.
- [x] Ajan modülleri: Claude (Hither'daki HTTP payload'ı), Codex (Codex hook payload'ı), Copilot (camelCase ve PascalCase), opencode ve omp (eklentinin gönderdiği sade payload).
- [x] Testler: her fixture → beklenen `Event`; sınırlama (`message` 200), bilinmeyen olay → `raw_event` ile `state` yok sayılır, bozuk JSON → satır yazılmaz.
- [x] Kıyas: `emit` 100 kez döngüde çalıştırılır (`time`), ortalama < 5 ms.

## Görev 2 · `install` / `uninstall` / `doctor`

- [x] `agentwire install <agent|all>`: Hither'ın bugünkü kurulum mantığının karşılığı (`claude-settings.ts`): Claude ve Codex ayar dosyasına komut hook'u ekler, önce yedek alır, yalnız kendi girdilerini değiştirir; Copilot `~/.copilot/hooks/agentwire.json` ve opencode/omp eklenti dosyası agentwire'ındır.
- [x] `uninstall` yalnız kendi girdilerini kaldırır. `doctor`: her ajan için kurulu mu, sürüm uyumlu mu, son olay ne zaman (`--json` Hither için). (Hook'ların güncel ikiliye işaret edip etmediğine bakıyor; ajanların kendi sürümü kontrol edilmiyor, örneğin `~/.copilot/hooks` için Copilot ≥ 0.0.422 gerekiyor.)
- [x] Testler: mevcut başka hook'lar korunur, iki kez kurulum tek girdi bırakır, yedek dosya oluşur, izinler genişlemez (Hither'daki `never_widens_permissions` testi örnek).

## Görev 3 · `tail` ve `status`

- [x] `agentwire tail [--agent] [--json]`: akışı canlı izler; varsayılan çıktı okunabilir tek satır ("12:03 claude hither waiting · permission to use Bash").
- [x] `agentwire status --json`: son 12 saatin olaylarını `fold` ile katlayıp oturum listesi (Hither'ın `STALE_SESSION_MS`'i).
- [x] Rotasyon sırasında `tail` kopmaz (inode değişimini algılayıp yeni dosyaya geçer).

## Görev 4 · Hither tüketici olur

- [ ] `wire.rs`: dosya yoksa bekler; varsa sondan başlar, 500 ms'de bir boyut kontrolü, yeni satırları okur, rotasyonu algılar.
- [ ] `sessions.ts` → `fromWire`: şema v1'i mevcut `Session`'a çevirir; `transition` bugünkü HTTP yolu için kalır. Testler: dört ajanın fixture'ları iki yoldan aynı `Session`'ı üretir.
- [ ] Ayar: Connections → "Agent events: Hither hooks / agentwire". agentwire seçilince Hither kendi hook'larını kaldırmayı önerir (iki kaynaktan çift olay olmasın); `doctor --json` ile durum satırları.
- [ ] omp: agentwire üzerinden gelir; `AGENTS`'a `omp`, `agentName` "oh-my-pi".
- [ ] `npm test`, `cargo test`, `vue-tsc --noEmit` temiz.

## Görev 5 · Köprüler (benimsenmeyi beklemeden)

Risk "bir standart daha" olmak. Başkalarının agentwire'ı benimsemesini beklemek yerine, onların bugünkü girişlerine çeviren köprüler:

- [ ] `agentwire forward coucou`: coucou'nun `docs/AGENTS.md`'deki relay biçimine çevirip gönderir. coucou issue #9'a (omp) "omp desteği bununla bugün çalışıyor" notu ve gerekirse coucou'ya dokümantasyon PR'ı.
- [ ] harp ve omnigent'in dış olay girişi var mı, incelenir; varsa aynı köprü, yoksa issue'larına kısa öneri.
- [ ] Harbor (`docs/plans/2026-10-23-harbor-mcp.md`) ile bağ yok; ileride "ajan waiting iken Harbor servisi çöktü" gibi birleşik bildirimler için not.

## Görev 6 · Yayın

- [ ] README: tek cümle ("One local event stream for every coding agent"), 20 saniyelik GIF (üç terminalde Claude, Codex, omp; tek `agentwire tail`; bağlı bir USB/Hue ışığın renk değiştirmesi), kurulum (`brew install erenbekman/tap/agentwire`, `cargo install agentwire`), şema, tüketici örnekleri, "Used by Hither".
- [ ] Homebrew formülü (`homebrew-tap`), GitHub release (universal ikili).
- [ ] Hither sürümü (0.3.0): agentwire kaynağı ve omp.
- [ ] Gönderiler (tanıtım oturumunda): r/ClaudeCode, Show HN ("Show HN: agentwire – one event stream for Claude Code, Codex, Copilot, opencode"), ilgili issue'lara köprü notları. Harbor 1.1 ile aynı hafta değil.

## Açık sorular

1. **İsim:** `agent-pulse` dolu (barretlee/agent-pulse ★239, npm `agent-pulse`). `agentwire` npm'de boş. Öneri: `agentwire`.
2. **Dil:** Rust (hız, tek ikili, Hither ile ortak dil) mı, Node (npm ile `npx`, ama her hook'ta 30–50 ms açılış) mı? Öneri: Rust.
3. **Hither agentwire'ı paketlesin mi?** Tauri sidecar olarak gömülürse Hither kullanıcısı ayrıca kurmaz; ama Hither silinince hook'lar kırılır. Öneri: gömme; Hither "agentwire kurulu değil" diyip tek satır kurulum göstersin.
4. **Varsayılan kaynak:** agentwire olgunlaşınca Hither'ın kendi HTTP hook'ları kaldırılsın mı? Öneri: 0.3'te ikisi birlikte, 0.4'te karar.

## Ölçüm

Hedef: yayından sonraki 1. hafta 50★; asıl başarı ölçütü en az bir dış aracın agentwire'ı kullanması (birleşmiş bir PR ya da köprü). Idea Radar'da `erenbekman` takipte.
