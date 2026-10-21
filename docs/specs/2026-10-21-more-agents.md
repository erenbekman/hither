# Daha fazla ajan: hangi kodlama ajanlarının hook'u var

Durum: araştırıldı (21 Ekim 2026). 0.2'ye girenler: GitHub Copilot CLI ve opencode. Kaynaklar resmi doküman ve kaynak kod; tahmin yok, bulunamayan "yok" yazıldı.

Kural: bir ajan ancak "bekliyor" anında (izin isteği ya da cevap bekleme) komut ya da HTTP çalıştırabilen resmi bir hook, eklenti veya olay sistemi varsa desteklenir.

## Özet

| Ajan | Hook | Ayar yeri | Çalışıyor | Bekliyor | Bitti | Hata | Oturum | Mekanizma | Oturum id / cwd | Karar |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GitHub Copilot CLI | var | `~/.copilot/hooks/*.json` ya da `~/.copilot/settings.json` → `hooks`; repo `.github/hooks/*.json`; `.claude/settings.json`'u da okur | `userPromptSubmitted`, `preToolUse`, `postToolUse` | `notification` (`permission_prompt`, `elicitation_dialog`); `permissionRequest` istemden önce | `agentStop` (`stopReason: "end_turn"`) | `errorOccurred`, `postToolUseFailure`, `sessionEnd` (reason `error`) | `sessionStart`, `sessionEnd` | `command` (bash), `http` (POST), `prompt` | var. camelCase olaylar `sessionId`, `cwd`, `timestamp`; PascalCase olaylar `session_id`, `cwd`, `hook_event_name` | **0.2** |
| opencode | var | `~/.config/opencode/plugins/` (eski tekil `plugin/` da çalışır), proje `.opencode/plugins/`, `~/.config/opencode/opencode.json` → `"plugin"` | `session.status` = `busy`, `tool.execute.before/after` | `permission.asked` (ardından `permission.replied`) | `session.status` = `idle` (`session.idle` kaynakta deprecated) | `session.error`, `session.status` = `retry` | `session.created`, `session.deleted` | JS/TS eklentisi; bağlamda `$` (Bun shell), `client`, `directory`, `worktree` | olayda `sessionID`; cwd eklenti bağlamından | **0.2** |
| Gemini CLI | var | `~/.gemini/settings.json`, proje `.gemini/settings.json`, `/etc/gemini-cli/settings.json` | `BeforeAgent`, `BeforeTool`, `AfterTool` | `Notification` (`notification_type: "ToolPermission"`) | `AfterAgent` | bulunamadı | `SessionStart`, `SessionEnd` | komut, stdin JSON | her payload'da `session_id`, `cwd`, `hook_event_name` | dışarıda: resmi dokümana göre 18 Haziran 2026'da Antigravity CLI ile değiştirildi |
| oh-my-pi (`omp`) | var | `~/.omp/agent/extensions/`, `~/.omp/agent/hooks/{pre,post}/`, `~/.omp/agent/config.yml` → `extensions` | `input`, `agent_start`, `tool_execution_start` | `tool_approval_requested` (ardından `tool_approval_resolved`) | `agent_end`, `turn_end`, `session_stop` | bulunamadı (yalnız `auto_retry_start`) | `session_start`, `session_shutdown` | TS/JS modülü, `pi.on(...)`, `pi.exec` | `ctx.cwd` var; `sessionId` yalnız onay olaylarında ve `session_stop`'ta | dışarıda: niş; üst proje pi'de onay olayı yok |
| Cursor CLI | kısmen | `~/.cursor/hooks.json`, proje `.cursor/hooks.json` | `preToolUse`, `postToolUse`, `beforeShellExecution` (`beforeSubmitPrompt` CLI'da gelmiyor) | **yok** (`beforeShellExecution` yalnız `ask` döndürebilir) | `stop` | `stop` (`status: "error"`), `postToolUseFailure` | `sessionStart`, `sessionEnd` | komut, stdin JSON | `conversation_id`, `workspace_roots`; `cwd` yalnız bazı olaylarda | dışarıda: bekliyor olayı yok |

## Hither için sonuçlar

- **Copilot CLI:** `http://127.0.0.1` HTTP hook'u `COPILOT_HOOK_ALLOW_LOCALHOST=1` olmadan reddediliyor. Codex'teki gibi `curl` çalıştıran `command` hook'u kullanılır; dosya `~/.copilot/hooks/hither.json` (dizin desteği 0.0.422'den beri). Copilot `.claude/settings.json`'u da okuduğu için o env değişkeni açık olan kullanıcıda Claude'un HTTP hook'u da tetiklenebilir; iki olay aynı `session_id` ile tek oturumda birleşir, `X-Hither-Agent: copilot` başlıklı olay ajanı belirler. PascalCase olay adları Claude biçiminde payload verdiği için önce bu yol denenir.
- **opencode:** eklenti `~/.config/opencode/plugins/hither.js`. Dokümanda `fetch()` geçmiyor; `$` (Bun shell) ile `curl` güvenli yol. Olaylar Claude biçimine çevrilip mevcut durum makinesine (`src/core/sessions.ts`) verilir: `busy` → `UserPromptSubmit`, `permission.asked` → `PermissionRequest`, `tool.execute.after` → `PostToolUse`, `idle` → `Stop`, `session.error` → `StopFailure`, `session.deleted` → `SessionEnd`. Depo `sst/opencode`'dan `anomalyco/opencode`'a taşındı.
- **Test:** ikisi de bu Mac'te kurulu değil. 0.2 dokümandaki örnek payload'larla birim testi yapılarak yayınlanır, ayar satırlarında "Beta" etiketi olur; canlı oturumla deneme yayından sonra.

## En düşük sürümler

- Copilot CLI: ilk hook kaydı 0.0.396 (27 Ocak 2026); `agentStop` 0.0.401; `~/.copilot/hooks` 0.0.422; 1.0 serisinde `permissionRequest` 1.0.16, `notification` 1.0.18, HTTP hook 1.0.35.
- Gemini CLI: Google'ın geliştirici blog yazısına göre hook'lar v0.26.0'dan beri varsayılan açık; doküman sayfası hâlâ "deneysel" diyor.
- Cursor CLI: 8 Ocak 2026 sürüm notu hook'lardan bahsediyor, sürüm numarası yok.
- opencode ve omp: bulunamadı.

## Kaynaklar

- Copilot CLI: https://docs.github.com/en/copilot/reference/hooks-configuration, https://github.com/github/copilot-cli/blob/main/changelog.md
- opencode: https://opencode.ai/docs/plugins/, https://opencode.ai/docs/config/, https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/permission.ts, https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/session-status-event.ts
- Gemini CLI: https://geminicli.com/docs/hooks/, https://geminicli.com/docs/hooks/reference/, https://developers.googleblog.com/tailor-gemini-cli-to-your-workflow-with-hooks/
- oh-my-pi ve pi: https://github.com/can1357/oh-my-pi, https://omp.sh/docs/hooks, https://omp.sh/docs/extension-authoring, https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
- Cursor: https://cursor.com/docs/agent/hooks, https://forum.cursor.com/t/cursor-cli-doesnt-send-all-events-defined-in-hooks/148316, https://forum.cursor.com/t/cursor-cli-jan-8-2026/148374, https://forum.cursor.com/t/cursor-cli-omits-beforesubmitprompt-afteragentresponse-and-stop-hooks-loses-token-usage-and-emits-inconsistent-generation-id-values/169059
