const SAFE_VALUE = /^[\w./#:@,+-]+$/

export const DEFAULT_TEMPLATES: Record<string, string> = {
  'ci-failed': `Push etme, önce planı göster.

{{repo}} reposundaki #{{number}} numaralı PR'ın check'leri başarısız.
\`gh pr checks {{number}} --repo {{repo}}\` ve \`gh run view <run-id> --repo {{repo}} --log-failed\` ile başarısız job'un logunu oku.
Nedeni bul, düzeltmeyi öner ve uygulamadan önce bana göster.
`,
  'main-failed': `Push etme, önce planı göster.

{{repo}} reposunun {{branch}} branch'i kırmızı.
Son commit'i ve başarısız check'leri \`gh run list --repo {{repo}} --branch {{branch}}\` ile bul, \`gh run view <run-id> --log-failed\` ile oku.
Kırılmanın hangi değişiklikten geldiğini açıkla ve düzeltme öner.
`,
  'deploy-failed': `Push etme, önce planı göster.

Forge'daki {{site}} sitesinin {{sha}} commit'ine yaptığı deploy başarısız oldu.
Deploy çıktısı şu dosyada: {{attachment}}
Dosyayı oku, hatanın nedenini özetle ve depodaki düzeltmeyi öner. Sunucuya bağlanma, deploy tetikleme.
`,
  'deploy-errors': `Push etme, önce planı göster.

{{site}} sitesine {{sha}} commit'i deploy edildikten sonraki 30 dakikada Sentry'de yeni hatalar başladı: {{issues}} (Sentry org: {{org}}).
Sentry MCP sunucun varsa hataları onunla oku; yoksa ayrıntıları bana sor.
Deploy edilen değişiklikleri git ile incele ve hatalarla ilişkisini açıkla. Gerekirse geri alma seçeneğini de değerlendir.
`,
  'changes-requested': `Push etme, önce planı göster.

{{repo}} reposundaki #{{number}} numaralı PR'ıma değişiklik istendi.
\`gh pr view {{number}} --repo {{repo}} --comments\` ve \`gh api repos/{{repo}}/pulls/{{number}}/comments\` ile review yorumlarını oku.
Her yorumu madde madde ele alan bir plan çıkar.
`,
  'merge-conflicts': `Push etme, önce planı göster.

{{repo}} reposundaki #{{number}} numaralı PR'ım base branch ile çakışıyor.
\`gh pr view {{number}} --repo {{repo}} --json headRefName,baseRefName\` ile branch'leri bul, \`gh pr checkout {{number}}\` ile PR'a geç ve base branch'i merge et.
Çakışmaları dosya dosya açıkla, her biri için çözümü öner ve uygulamadan önce bana göster.
`,
  'agent-pr-summary': `{{repo}} reposundaki #{{number}} numaralı PR'ı \`gh pr view {{number}} --repo {{repo}}\` ve \`gh pr diff {{number}} --repo {{repo}}\` ile oku.
En fazla 5 maddede ne değiştiğini özetle, ardından "Riskler" başlığıyla dikkat edilmesi gerekenleri listele. Kısa tut, Türkçe yaz.
`,
}

export function renderTemplate(text: string, vars: Record<string, string>): string {
  for (const [key, value] of Object.entries(vars)) {
    if (!SAFE_VALUE.test(value)) throw new Error(`template value for ${key} is not an identifier`)
  }
  return text.replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) =>
    key === 'attachment' ? placeholder : (vars[key] ?? placeholder),
  )
}
