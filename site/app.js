const LANES = {
  incoming: [
    { title: 'Changes Requested', rows: [{ title: 'Move invoices to the queue', sub: 'acme/api #402 · @eren', who: 'eren', age: '5h', severity: 'attention', unseen: true }] },
    { title: 'Review Requested', rows: [{ title: 'Add rate limit to webhook deliveries', sub: 'acme/api #418 · @carol', who: 'carol', age: '2h', severity: 'attention', unseen: true }] },
    {
      title: 'Pull Requests',
      rows: [
        { title: 'Fix timezone in invoice export', sub: 'acme/billing #411 · @dave', who: 'dave', age: '1d', severity: 'info', unseen: true },
        { title: 'Translate onboarding emails', sub: 'acme/web #395 · @erin', who: 'erin', age: '5d', severity: 'info', unseen: false },
      ],
    },
    { title: 'Issues', rows: [{ title: 'Export to CSV drops the last row', sub: 'acme/billing #406 · @frank', who: 'frank', age: '3h', severity: 'info', unseen: true }] },
    { title: 'My Pull Requests', quiet: true, rows: [{ title: 'Cache feature flags per request', sub: 'acme/api #399 · @eren', who: 'eren', age: '7h', severity: 'info', unseen: false }] },
  ],
  outgoing: [
    { title: 'Main Branch Red', rows: [{ title: 'Bump vite to 8.3', sub: 'acme/web · main · @erin', who: 'erin', age: '6m', severity: 'critical', unseen: true }] },
    { title: 'Deploy Failed', rows: [{ title: 'Release 2.14: new checkout', sub: 'acme.app · e5d2a71 · main · Eren', age: '4m', severity: 'critical', unseen: true }] },
    { title: 'Error Spikes', rows: [{ title: 'QueryException: Deadlock found when trying to get lock', sub: 'shop-api · SHOP-API-64 · 58 in the last hour', age: '3m', severity: 'attention', unseen: true }] },
    { title: 'New Errors', rows: [{ title: "TypeError: Cannot read properties of undefined (reading 'price')", sub: 'shop-api · SHOP-API-81 · 37 in the last hour', age: '12m', severity: 'attention', unseen: true }] },
    { title: 'Checks Failing', rows: [{ title: 'Cache feature flags per request', sub: 'acme/api #399 · @eren', who: 'eren', age: '14m', severity: 'attention', unseen: true }] },
    { title: 'Deploying', quiet: true, rows: [{ title: 'Admin: export filters', sub: 'admin.acme.app · 9c41b0e · main · Eren', age: '1m', severity: 'info', unseen: true }] },
    { title: 'Checks Fixed', quiet: true, rows: [{ title: 'Retry failed card charges once', sub: 'acme/billing #388 · @eren', who: 'eren', age: '9m', severity: 'info', unseen: false }] },
    { title: 'Deployed', quiet: true, rows: [{ title: 'Shop: faster product pages', sub: 'shop.acme.app · 4f8a6d2 · main · Eren', age: '22m', severity: 'info', unseen: false }] },
  ],
  agents: [
    { title: 'Waiting for You', rows: [{ title: 'Claude needs your permission to use Bash', sub: 'api · Fix flaky checkout test', age: '12m', severity: 'attention', unseen: true }] },
    { title: 'Ready for Review', rows: [{ title: 'Add missing indexes to the orders table', sub: 'acme/api #421 · @claude · checks green', age: '40m', severity: 'attention', unseen: true }] },
    { title: 'Working', quiet: true, rows: [{ title: 'Working', sub: 'web · Migrate to Vite 8', age: '3m', severity: 'info', unseen: true }] },
    { title: 'Turn Finished', quiet: true, rows: [{ title: 'Turn finished', sub: 'billing · Invoice export timezone', age: '8m', severity: 'info', unseen: false }] },
  ],
}

const CARDS = [
  {
    title: 'Errors started after the shop.acme.app deploy',
    detail: '1 new Sentry issue within 30 minutes of 4f8a6d2',
    severity: 'critical',
    age: '10m',
    actions: ['Open in Claude', 'Open in Sentry'],
  },
  { title: 'main is red in acme/web', detail: 'Bump vite to 8.3', severity: 'critical', age: '6m', actions: ['Open in Claude', 'Open commit'] },
  { title: 'acme.app deploy failed', detail: 'Release 2.14: new checkout', severity: 'critical', age: '4m', actions: ['Open in Claude', 'Open site'] },
  { title: '#399 checks failing', detail: 'acme/api · Cache feature flags per request', severity: 'attention', age: '14m', actions: ['Open in Claude', 'Open checks'] },
  { title: 'Agent PR ready: #421', detail: 'acme/api · Add missing indexes to the orders table', severity: 'attention', age: '40m', actions: ['Summarize', 'Open on GitHub'] },
]

const tabs = [...document.querySelectorAll('[role="tab"]')]
const lane = document.querySelector('[data-lane]')
const tray = document.querySelector('[data-tray]')
let current = 'incoming'

const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const loudUnseen = (name) =>
  LANES[name].filter((section) => !section.quiet).flatMap((section) => section.rows).filter((row) => row.unseen)

function updateBadges() {
  let total = 0
  for (const name of Object.keys(LANES)) {
    const rows = loudUnseen(name)
    total += rows.length
    const badge = document.querySelector(`[data-badge="${name}"]`)
    badge.textContent = rows.length ? String(rows.length) : ''
    badge.classList.toggle('critical', rows.some((row) => row.severity === 'critical'))
  }
  tray.textContent = total ? String(total) : ''
  const cardBadge = document.querySelector('[data-badge="suggestions"]')
  cardBadge.textContent = String(CARDS.filter((card) => card.severity !== 'info').length)
}

function hueFor(text) {
  let hash = 0
  for (const char of text.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 360
}

function avatar(login) {
  const node = el('span', 'avatar', login.charAt(0).toUpperCase())
  node.style.setProperty('--hue', String(hueFor(login)))
  return node
}

function renderRow(row) {
  const node = el('div', `row ${row.severity}${row.unseen ? ' unseen' : ''}`)
  node.append(el('span', 'status'))
  if (row.who) node.append(avatar(row.who))
  const text = el('span', 'text')
  text.append(el('span', 'title', row.title), el('span', 'sub', row.sub))
  node.append(text, el('span', 'age', row.age))
  node.addEventListener('click', () => {
    row.unseen = false
    render()
  })
  return node
}

function renderLane(name) {
  const nodes = []
  for (const section of LANES[name]) {
    const header = el('h3', 'section', section.title)
    header.append(el('span', 'count', String(section.rows.length)))
    if (!section.quiet && section.rows.some((row) => row.unseen)) {
      const seen = el('button', 'mark-seen', 'Mark seen')
      seen.type = 'button'
      seen.addEventListener('click', () => {
        for (const row of section.rows) row.unseen = false
        render()
      })
      header.append(seen)
    }
    nodes.push(header, ...section.rows.map(renderRow))
  }
  return nodes
}

function renderCards() {
  const list = el('div', 'cards')
  for (const card of CARDS) {
    const node = el('div', 'suggestion')
    const head = el('div', 'suggestion-head')
    head.append(el('span', `status ${card.severity}`), el('span', 'title', card.title), el('span', 'age', card.age))
    const actions = el('div', 'actions')
    card.actions.forEach((label, i) => actions.append(el('span', i === 0 ? 'button primary' : 'button', label)))
    node.append(head, el('p', 'detail', card.detail), actions)
    list.append(node)
  }
  return [list, el('div', 'cards-footer', '3 suggestions acted on in the last 7 days')]
}

function render() {
  lane.replaceChildren(...(current === 'suggestions' ? renderCards() : renderLane(current)))
  updateBadges()
}

function select(name, { focus = false } = {}) {
  current = name
  for (const tab of tabs) {
    const on = tab.dataset.tab === name
    tab.setAttribute('aria-selected', String(on))
    tab.tabIndex = on ? 0 : -1
    if (on && focus) tab.focus()
  }
  lane.scrollTop = 0
  render()
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => select(tab.dataset.tab))
  tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    select(next.dataset.tab, { focus: true })
  })
})

for (const card of document.querySelectorAll('[data-show]')) {
  card.addEventListener('click', () => {
    select(card.dataset.show)
    document.getElementById('panel').scrollIntoView({ block: 'center' })
  })
}

const brew = document.querySelector('[data-copy]')
brew.addEventListener('click', async () => {
  const feedback = brew.querySelector('.copied')
  try {
    await navigator.clipboard.writeText(brew.dataset.copy)
    feedback.textContent = 'Copied'
  } catch {
    feedback.textContent = 'Select and copy the command'
  }
  feedback.classList.add('show')
  setTimeout(() => feedback.classList.remove('show'), 1400)
})

render()
