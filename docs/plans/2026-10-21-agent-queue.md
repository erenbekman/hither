# Hither 0.2 · Seni bekleyen ajanlar — uygulama planı

> **For agentic workers:** Implement this plan task-by-task — a fresh subagent per task where tasks are independent, otherwise inline with a review checkpoint per batch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onay ya da cevap bekleyen her kodlama ajanını menü çubuğunun en önüne almak: panelin üstünde "Needs you" kuyruğu, ajan sayan menü çubuğu sayacı, bir sonraki bekleyen ajanın terminalini öne getiren global kısayol, uzun bekleyen için tek hatırlatma ve hook'u olan yeni ajanlar. Ardından Hither'ı bu özellikle yeniden tanıtmak.

**Neden şimdi:** dominikmartn/harp tek günde 431★ ("which one needs you"), Louis-CFM/coucou 3 haftada 5,5K★, yetone/magpie 25 günde 16K★. coucou'da "başka ajanları destekle" isteği 6 tepki aldı. Hither'ın farkı: terminal değiştirmeden (iTerm, Terminal, Ghostty, Warp) çalışır, PR'lar, CI ve deploy'lar aynı panelde. Kaynak: Idea Radar, fikir #4.

**Architecture:** Bekleme mantığı `src/core`'da saf fonksiyonlar (oturumlardan sıralı kuyruk, hatırlatma kararı); arayüz `src/ui/components/NeedsYou.vue`; sayaç ve hatırlatma `board-runtime.ts` üzerinden; global kısayol Rust tarafında `lib.rs`. Hook dinleyicisi (`hooks.rs`, port 47811) ve oturum durum makinesi (`sessions.ts`) yerinde kalır; yalnız ajan listesi genişler.

**Tech Stack:** Tauri 2, Vue 3 `<script setup>`, TypeScript, Rust, Vitest.

## Bugün olan (koddan doğrulandı)

- Claude Code ve Codex hook'ları yerel dinleyiciye olay gönderiyor; `X-Hither-Agent: codex` başlığı Codex'i ayırıyor (`hooks.rs` yalnız `codex` değerini kabul ediyor).
- Durumlar `running / waiting / done / failed`; `waiting`: `PermissionRequest`, `permission_prompt`, `idle_prompt`, `agent_needs_input`, `elicitation_*` (`sessions.ts`).
- `Session.since` durum değişince sıfırlanıyor, yani `waiting` iken `now - since` bekleme süresi.
- Oturumlar `agents` lane'inde sinyal; `waiting` = `attention`, `failed` = `critical` (`sessionSignals`).
- Menü çubuğu sayacı ve uyarı ikonu var (`set_tray(count, state)`); sayaç bugün tüm lane'lerin görülmemiş toplamı (`state.badge`).
- Terminal odaklama var (`focus_terminal`, `launch.rs`: iTerm oturum kimliğiyle, Ghostty klasörle).
- Bildirim altyapısı var (`notifications.ts`, sessiz saatler, `notificationLanes`).

## Global Constraints

- Kod yorumu yok; tanımlayıcılar İngilizce; kullanıcıya dönük metinler İngilizce (uygulama dili).
- Yeni bağımlılık yalnız `tauri-plugin-global-shortcut` (Görev 5); Eren 21 Ekim'de onayladı (Rust crate + `@tauri-apps/plugin-global-shortcut`).
- `npm test`, `cargo test`, `vue-tsc --noEmit` her görev sonunda temiz.
- Mevcut davranış bozulmaz: sayaç modu varsayılanı bugünkü davranıştır (açık soru 1).
- Commit ve sürüm yayını kullanıcı isteyince (global kural); görev sonlarında yalnız doğrulama.

## Dosya yapısı

| Dosya | Görev |
| --- | --- |
| `src/core/waiting.ts` (+ test) | `waitingQueue(sessions, now)` → en uzun bekleyen önce; `reminderDue(...)` |
| `src/core/sessions.ts` | `Session.agent` birleşimi genişler; `agentName` yeni ajanlar |
| `src/core/settings.ts` | `trayCount: 'all' \| 'agents'`, `waitingReminderMinutes`, `nextAgentShortcut` |
| `src/ui/components/NeedsYou.vue` | Panelin üstündeki kuyruk şeridi |
| `src/ui/Panel.vue` | Şeridi `LaneTabs`'ın üstüne yerleştirir |
| `src/ui/board-runtime.ts` | Sayaç modu, hatırlatma, kısayol olayı |
| `src/ui/settings/GeneralTab.vue` | Üç yeni ayar |
| `src-tauri/src/lib.rs` | Global kısayol kaydı, `next-waiting-agent` olayı |
| `src-tauri/src/hooks.rs` | `X-Hither-Agent` izin listesi (codex + yeni ajanlar) |
| `src/core/claude-settings.ts` | Yeni ajanların hook kurulumu (Codex örneğiyle) |
| `src/demo.ts` | Demo modunda 3 ajan, 2'si bekliyor (GIF için) |
| `README.md`, `site/` | Ajan kuyruğu önde, karşılaştırma tablosu, yeni GIF |

---

## Görev 0 · Araştırma: hangi ajanların hook ya da olay sistemi var?

Varsayım yapılmaz; her aday için resmi doküman ya da kaynak koddan doğrulanır.

- [ ] **opencode**: plugin sisteminde oturum boşta / izin istendi olayları var mı, komut çalıştırabiliyor mu, terminal bilgisi (`TERM_PROGRAM`, iTerm oturum kimliği) erişilebilir mi?
- [ ] **Gemini CLI**: hook desteği (ayar dosyası, olay adları).
- [ ] **GitHub Copilot CLI**: hook ya da bildirim desteği.
- [ ] **oh-my-pi (`omp`)**: hook ya da olay sistemi.
- [ ] **Cursor CLI**: hook desteği.
- [ ] Çıktı: `docs/specs/2026-10-xx-more-agents.md`. Her ajan için "var / yok / kısmen", olay → `waiting / running / done / failed` eşlemesi, kurulum yeri. Hook'u olmayan ajan bu sürüme girmez.

## Görev 1 · Bekleme kuyruğu (çekirdek)

- [ ] `src/core/waiting.ts`: `waitingQueue(sessions, now)` → `{ id, agent, project, cwd, message, waitedMs, terminal, terminalSession }[]`, yalnız `state === 'waiting'`, `waitedMs` azalan.
- [ ] Testler: boş, tek, sıralama, `done`/`running` dışarıda, bayat oturum (`STALE_SESSION_MS`) dışarıda.

## Görev 2 · "Needs you" şeridi (arayüz)

- [ ] `NeedsYou.vue`: kuyruk boşsa görünmez. Her satır: ajan adı, proje, ne beklediği (mesaj), bekleme süresi ("4 min"), tıklanınca `focusTerminal`. En fazla 3 satır, fazlası "+2 more" (tıklanınca Agents lane'i).
- [ ] `Panel.vue`'da `LaneTabs`'ın üstüne; mevcut tasarım değerleri (`--orange` bekleme, `--fg-2` metin) dışında renk yok.
- [ ] Klavye: şerit satırları sekmeyle gezilir, Enter terminale gider.
- [ ] `SignalRow.test.ts` örneğiyle bileşen testi.

## Görev 3 · Menü çubuğu sayacı

- [ ] `settings.trayCount: 'all' | 'agents'`, varsayılan açık soru 1'e göre. `normalizeSettings` ve testleri.
- [ ] `board-runtime.ts`: `agents` modunda sayaç = bekleyen ajan sayısı; ikon bekleyen varsa `alert`.
- [ ] `GeneralTab.vue`: "Menu bar count: All unseen / Agents waiting on you".

## Görev 4 · Uzun bekleme hatırlatması

- [ ] `reminderDue(queue, alreadyReminded, minutes, now)` saf fonksiyon; her bekleme dönemi için en fazla bir hatırlatma (dönem = oturum id + `since`).
- [ ] `settings.waitingReminderMinutes` (0 = kapalı, varsayılan 2); sessiz saatlere ve `notificationLanes`'e uyar.
- [ ] Bildirim metni: "Claude has been waiting 3 min in billing: needs permission to use Bash".
- [ ] Testler: eşik, tek sefer, sessiz saat, kapalı.

## Görev 5 · Global kısayol (onay gerekiyor)

- [ ] `tauri-plugin-global-shortcut` ekle (onaylı): `Cargo.toml`, `package.json`, `capabilities/` izni.
- [ ] `lib.rs`: ayardaki kısayolu kaydet (varsayılan ⌥⌘J), basılınca `next-waiting-agent` olayı.
- [ ] Runtime: kuyruğun ilk elemanının terminalini öne getir; kuyruk boşsa paneli aç.
- [ ] Ayar: kısayolu değiştir / kapat; çakışmada hata şeridi (`Banner`).

## Görev 6 · Yeni ajanlar (Görev 0'ın sonucuna göre)

- [ ] Her desteklenen ajan için: hook kurulumu (`claude-settings.ts` içindeki `addCodexHooks` örneği), `X-Hither-Agent` değeri, `hooks.rs` izin listesi, `Session.agent` birleşimi, `agentName`.
- [ ] Settings → Connections'ta "Install hooks" satırı ve durum (`codexHookStatus` örneği).
- [ ] Testler: kurulum JSON'u, durum, olay → durum eşlemesi.

## Görev 7 · Demo ve tanıtım

- [ ] `demo.ts`: 3 ajan (Claude, Codex, + yeni ajan), 2'si bekliyor, farklı terminaller.
- [ ] Yeni GIF (`docs/demo.gif`): ajanlar çalışıyor → ikisi onay istiyor → sayaç "2" → kısayol → doğru terminal öne geliyor.
- [ ] README: başlık ve ilk paragraf ajan kuyruğu ("Every agent that needs you, in your menu bar"); PR'lar ikinci sırada; karşılaştırma tablosu:

  | | Hither | harp | coucou |
  |---|---|---|---|
  | Keeps your terminal | ✓ (iTerm, Terminal, Ghostty, Warp) | — (its own, Warp fork) | ✓ |
  | Jump to the waiting agent | ✓ | ✓ | — |
  | PRs, CI, deploys in the same place | ✓ | — | — |
  | Free and open source | ✓ | ✓ | ✓ |

  (Tablo yayın öncesi iki ürünün güncel README'sinden doğrulanır.)
- [ ] `site/index.html`: kahraman bölümü aynı mesaj, yeni GIF.
- [ ] Social preview görseli güncellenir.

## Görev 8 · Sürüm 0.2.0

- [ ] `package.json`, `src-tauri/Cargo.toml` → `0.2.0`.
- [ ] Eren: `scripts/release.sh "…"`; tag, GitHub release, Homebrew cask (`homebrew-tap`).
- [ ] Uygulama içi güncellemeyle 0.1.x → 0.2.0 geçişi denenir.
- [ ] Gönderiler (tanıtım oturumunda): Show HN ("Show HN: Hither – see which coding agent is waiting on you"), r/ClaudeCode, r/macapps, r/ClaudeAI; coucou ve omnigent'teki "başka ajan" issue'larına, eklenen ajan varsa, kısa bir not.

## Açık sorular

1. **Sayaç varsayılanı:** mevcut kullanıcılar için `all` (bugünkü davranış) mı kalsın, yeni kurulumlarda `agents` mı olsun? Öneri: yeni kurulum `agents`, mevcut kullanıcı `all` (ayar dosyasında alan yoksa ve `onboarded` ise `all`).
2. ~~Global kısayol bağımlılığı~~: onaylandı (21 Ekim).
3. **Kuyruk sırası:** en uzun bekleyen önce mi, yoksa `failed` en üstte mi? Öneri: `waiting` en uzun önce, `failed` şeritte değil, Agents lane'inde kalır.
4. **Yayın zamanı:** paper-ink'ten en az 3 gün sonra, Salı–Perşembe, ABD sabahı (TR 16:00–18:00).

## Ölçüm

Idea Radar'da `erenbekman` takipte. Hedef: yayından sonraki 1. hafta +50★, 2. hafta +200★. Altında kalırsa önce README ve GIF, sonra kanal değişir.
