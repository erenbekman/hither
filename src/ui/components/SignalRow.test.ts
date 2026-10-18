import { expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import SignalRow from './SignalRow.vue'

const payload = '<img src=x onerror=alert(1)>'

it('shows titles, names and labels from GitHub as text, never as markup', async () => {
  const row = () =>
    h(SignalRow, {
      title: payload,
      subtitle: payload,
      severity: 'attention',
      unseen: true,
      avatar: { login: payload },
      chip: { label: payload, tone: 'gray' },
    })
  const html = await renderToString(createSSRApp({ render: row }))
  expect(html).not.toContain('<img src=x')
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
})
