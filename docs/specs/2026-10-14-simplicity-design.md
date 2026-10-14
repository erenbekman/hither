# Sadelik: GHBar görünümü, kapatılabilir şeritler, üç sekmeli ayarlar

Durum: onaylandı (14 Ekim 2026), uygulanıyor. Tanıtım sayfası bu belgenin dışında; uygulama yeni görünüme geçince ayrı tasarlanır.

## Amaç

Hither, GHBar'ın üstüne yeni özellikler koyar; görünümü de GHBar kadar sade ve anlaşılır olmalı. Kullanıcının karmaşık bulduğu dört şey: panelin iki seviyeli yapısı (şerit → 5-10 bölüm başlığı), sık ve küçük satırlar, altı sekmeli ayarlar, ilk kurulumda ne yapacağını bilememek. Ayrıca her şerit (Incoming, Outgoing, Agents, Suggestions) kapatılabilmeli.

## 1. Panel (A düzeni: dört şerit, düz liste)

- **Üst kısım:** 30 pt avatar, kalın ad + gri `@login`, altında "N stars · N followers". Ad/avatar GitHub profilini açar. Sağda ↻ ve "⋯" (yerel menü: Open GitHub ⌘O, Settings… ⌘,, Mark All as Seen ⇧⌘A, ayraç, Quit Hither ⌘Q). Dişli kalkar. Organizasyon hapı yalnız Incoming'de ve organizasyon varken.
- **Sekmeler:** düz metin; seçili olanın altı çizili, yazısı beyaz ve kalın. Sayı: görülmemiş ve "loud" öğe varsa yeşil, yoksa gri toplam. Kapalı şerit görünmez; tek şerit açıksa sekme çubuğu gizlenir. Kutulu `Segmented` kalkar.
- **Liste:** şerit başına tek düz liste, bölüm başlığı yok. Sıra: bugünkü bölüm sırası (önem), içinde en yeni. Önemli öğeler (severity `attention`/`critical`) hep tek satır; yalnız `info` öğeler aynı repodan eşiği (varsayılan 3) aşınca GHBar gibi klasör satırına katlanır ve grubun ilk öğesinin yerinde durur.
- **Satır:** solda GitHub öğesinde 26 pt avatar, öbürlerinde tonuna göre renkli simge dairesi (CI ✕/✓, deploy ↑, hata !, Claude ✳, Codex ◎). Ortada en çok 2 satır başlık, altında etiket + "repo #N by kişi" (taslakta ", draft"). Sağda yaş ve görülmemişse yeşil nokta. Görülmüş satırın başlığı soluk. Gecikmiş review'da yaş turuncu kalır.
- **Etiketler (tür → yazı, ton):**
  - Incoming: changes-requested Changes (turuncu), conflicting Conflicts (kırmızı), review-requested Review (turuncu), activity → Comment / Mention / Activity / Updated (mavi, nedene göre), ready-to-merge Ready (yeşil), assigned Assigned (gri), mentioned Mentioned (mavi), issue Issue (gri), my-pr Yours (gri), pr etiketsiz.
  - Outgoing: ci-main-failed "<branch> is red" (kırmızı), deploy-failed Deploy failed (kırmızı), error-spike Error spike (turuncu), error-new New error (turuncu), ci-failed Checks failed (turuncu), deploy-running Deploying (mavi), ci-fixed Checks fixed (yeşil), deploy-ok Deployed (yeşil).
  - Agents: agent-waiting Waiting (turuncu), agent-failed Error (kırmızı), agent-pr-ready PR ready (yeşil), agent-running Working (gri), agent-done Done (gri), agent-pr Agent PR (gri).
- **Alt bilgi:** solda "Mark these as seen" (şeritte görülmemiş varsa). Sağda öncelik sırasıyla: kota görünür ayarındaysa "N API calls left", yenilenirken "Refreshing", yoksa "Updated HH:mm". Ayrı kota satırı kalkar.
- **Aynı kalanlar:** arama (yazınca süzme), hata/güncelleme/hook şeritleri, sağ tık menüsü, klavye. Suggestions kartları butonlu kalır, kart görünümü sadeleşir; alt bilgide "N used this week".

## 2. Şeridi kapatmak

- Ayar `lanes`: `('incoming' | 'outgoing' | 'agents' | 'suggestions')[]`, varsayılan dördü. Boş ya da geçersizse dördü; Settings'te son açık şerit kapatılamaz.
- Kaynaklar: GitHub sorgusu Incoming, Outgoing ya da Agents'tan biri açıksa; New Activity yalnız Incoming açıkken; Claude Code/Codex oturumları yalnız Agents açıkken; Forge ve Sentry yalnız Outgoing açık ve bağlıyken sorulur.
- Board kapalı şeridin sinyallerini liste, rozet ve bildirimden çıkarır. Suggestions kapalıysa kart ve hatırlatma yok. Agents kapalıysa hook şeridi görünmez. Açık sekme kapanırsa panel ilk açık şeride geçer.

## 3. Settings (üç sekme)

- **General:** Lanes (dört anahtar + tek satır açıklama), Refresh every, Notifications, Open at login, Updates. Advanced: şerit başına bildirim, sessiz saatler, bölümler.
- **GitHub:** Account, Organizations, Repositories (Watch only checked + liste + ekleme). Advanced: izlenen hesaplar, main branch'i izlenen repolar, botlar, taslaklar, katlama eşiği, gecikmiş review saati, API kotası.
- **Connections:** Claude Code ve Codex hook'ları, terminal; Forge ve Sentry "Not connected · Connect…" → aynı yerde token, organizasyon, sunucu/proje alanları; bağlıyken "Connected · … · Edit · Disconnect" (Disconnect token'ı siler, servisi kapatır). Outgoing kapalıysa üstte not. Advanced: ajan hesapları ve branch önekleri, site başına Sentry projesi, prompt şablonları.
- Advanced her sekmenin altında kapalı açılır bölümdür.

## 4. İlk açılış

Tek sayfa: GitHub hesabı → "What do you want to see?" (dört şerit anahtarı) → Agents açıksa Claude Code ve Codex için Install → Open at login → "Start Using Hither". Forge ve Sentry sonra Connections'tan.

## 5. Kapsam ve test

- Ayar dosyası geriye uyumlu; yalnız `lanes` eklenir. Sinyal ve kaynak modelleri değişmez.
- Saf fonksiyonlar ve testleri: `flattenLane` (katlama kuralı dahil), `chipFor` (tür → etiket, ton), board'un kapalı şeritleri elemesi, `normalizeSettings` için `lanes`.
- Demo verisi güncellenir; görsel kontrol demo modunda kullanıcıda.
