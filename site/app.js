const HUES = { carol: 262, eren: 24, heidi: 210, dave: 140, frank: 330, erin: 190, claude: 18 }

const avatar = (who) => ({ who })
const tile = (glyph, tone) => ({ glyph, tone })

const LANES = {
  incoming: {
    label: 'Incoming',
    rows: [
      { title: 'Add rate limit to webhook deliveries', chip: ['Review', 'orange'], detail: 'api #418 by carol', age: '2h', icon: avatar('carol'), unseen: true, loud: true },
      { title: 'Split the billing worker into two queues', chip: ['Conflicts', 'red'], detail: 'billing #421', age: '1h', icon: avatar('eren'), unseen: true, loud: true },
      { title: 'Pick a queue for invoice exports', chip: ['Comment', 'blue'], detail: 'billing #420 by heidi', age: '45m', icon: avatar('heidi'), unseen: true, loud: true },
      { title: 'Retry failed webhooks with backoff', chip: ['Ready', 'green'], detail: 'api #415', age: '3h', icon: avatar('eren'), unseen: false, loud: true },
      { title: 'Fix timezone in invoice export', detail: 'billing #411 by dave', age: '1d', icon: avatar('dave'), unseen: true, loud: true },
      { title: 'Export to CSV drops the last row', chip: ['Issue', 'gray'], detail: 'billing #406 by frank', age: '3h', icon: avatar('frank'), unseen: false, loud: true },
      { title: 'Translate onboarding emails', detail: 'web #395 by erin', age: '5d', icon: avatar('erin'), unseen: false, loud: true },
    ],
  },
  outgoing: {
    label: 'Outgoing',
    rows: [
      { title: 'Bump vite to 8.3', chip: ['main is red', 'red'], detail: 'web · main by erin', age: '6m', icon: tile('✕', 'red'), unseen: true, loud: true },
      { title: 'Release 2.14: new checkout', chip: ['Deploy failed', 'red'], detail: 'acme.app · e5d2a71 · main', age: '4m', icon: tile('↑', 'red'), unseen: true, loud: true },
      { title: "TypeError: Cannot read properties of undefined (reading 'price')", chip: ['New error', 'orange'], detail: 'shop-api · SHOP-81 · 37 in the last hour', age: '12m', icon: tile('!', 'orange'), unseen: false, loud: true },
      { title: 'Cache feature flags per request', chip: ['Checks failed', 'orange'], detail: 'api #399', age: '14m', icon: tile('✕', 'orange'), unseen: false, loud: true },
      { title: 'Retry failed card charges once', chip: ['Checks fixed', 'green'], detail: 'billing #388', age: '9m', icon: tile('✓', 'green'), unseen: false, loud: false },
      { title: 'Shop: faster product pages', chip: ['Deployed', 'green'], detail: 'shop.acme.app · 4f8a6d2 · main', age: '22m', icon: tile('↑', 'green'), unseen: false, loud: false },
    ],
  },
  agents: {
    label: 'Agents',
    rows: [
      { title: 'Claude needs your permission to use Bash', chip: ['Waiting', 'orange'], detail: 'api · Fix flaky checkout test · iTerm', age: '12m', icon: tile('✳', 'claude'), unseen: true, loud: true },
      { title: 'Codex needs your permission to use shell', chip: ['Waiting', 'orange'], detail: 'Codex · billing · Ghostty', age: '2m', icon: tile('◎', 'gray'), unseen: false, loud: true },
      { title: 'Add missing indexes to the orders table', chip: ['PR ready', 'green'], detail: 'api #430 by claude', age: '40m', icon: avatar('claude'), unseen: false, loud: true },
      { title: 'Migrate to Vite 8', chip: ['Working', 'gray'], detail: 'web · iTerm', age: '3m', icon: tile('✳', 'claude'), unseen: false, loud: false },
    ],
  },
  suggestions: {
    label: 'Suggestions',
    cards: [
      { title: 'main is red in acme/web', detail: 'Bump vite to 8.3', actions: ['Open in Claude', 'Open commit'] },
      { title: '#421 has merge conflicts', detail: 'acme/billing · Split the billing worker into two queues', actions: ['Open in Claude', 'Open on GitHub'] },
      { title: 'Agent PR ready: #430', detail: 'acme/api · Add missing indexes to the orders table', actions: ['Summarize', 'Open on GitHub'] },
    ],
  },
}

const tabs = document.querySelector('[data-tabs]')
const list = document.querySelector('[data-list]')
const tray = document.querySelector('[data-tray]')
const markSeen = document.querySelector('[data-mark-seen]')
const cards = [...document.querySelectorAll('[data-show]')]
const panel = document.querySelector('[data-panel]')
const closed = document.querySelector('[data-closed]')
const trayButton = document.querySelector('[data-tray-button]')
const refreshButton = document.querySelector('[data-refresh]')
const updated = document.querySelector('[data-updated]')
const moreButton = document.querySelector('[data-more]')
const menu = document.querySelector('[data-menu]')
let current = 'incoming'

const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const newIn = (lane) => (LANES[lane].rows ?? []).filter((row) => row.unseen && row.loud).length
const totalIn = (lane) => (LANES[lane].rows ?? LANES[lane].cards).length

function renderTabs() {
  tabs.replaceChildren(
    ...Object.entries(LANES).map(([id, lane]) => {
      const tab = el('button', 'tab', lane.label)
      tab.type = 'button'
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-selected', String(id === current))
      const fresh = newIn(id)
      const count = el('span', `count num${fresh ? ' new' : ''}`, String(fresh || totalIn(id)))
      tab.append(count)
      tab.addEventListener('click', () => show(id))
      return tab
    }),
  )
  tray.textContent = String(['incoming', 'outgoing', 'agents'].reduce((sum, id) => sum + newIn(id), 0))
}

function iconFor(icon) {
  if (icon.who) {
    const node = el('span', 'avatar', icon.who[0].toUpperCase())
    node.style.background = `hsl(${HUES[icon.who] ?? 220} 45% 48%)`
    return node
  }
  const node = el('span', `avatar tile ${icon.tone}`, icon.glyph)
  node.setAttribute('aria-hidden', 'true')
  return node
}

function renderRows(rows) {
  return rows.map((row) => {
    const button = el('button', `row${row.unseen ? ' unseen' : ''}`)
    button.type = 'button'
    const text = el('span', 'text')
    const detail = el('span', 'detail')
    if (row.chip) detail.append(el('span', `chip ${row.chip[1]}`, row.chip[0]))
    detail.append(el('span', '', row.detail))
    text.append(el('span', 'title', row.title), detail)
    button.append(iconFor(row.icon), text, el('span', 'age num', row.age), el('span', 'dot'))
    button.addEventListener('click', () => {
      row.unseen = false
      render()
    })
    return button
  })
}

function renderCards(items) {
  return items.map((item) => {
    const card = el('div', 'card')
    card.append(el('div', 'title', item.title), el('div', 'detail', item.detail))
    item.actions.forEach((action, i) => card.append(el('span', `mini${i === 0 ? ' primary' : ''}`, action)))
    return card
  })
}

function render() {
  renderTabs()
  const lane = LANES[current]
  list.replaceChildren(...(lane.rows ? renderRows(lane.rows) : renderCards(lane.cards)))
  markSeen.hidden = !(lane.rows ?? []).some((row) => row.unseen)
  cards.forEach((card) => card.setAttribute('aria-pressed', String(card.dataset.show === current)))
}

function show(lane) {
  current = lane
  render()
}

function setMenu(open) {
  menu.hidden = !open
  moreButton.setAttribute('aria-expanded', String(open))
}

function setPanel(open) {
  setMenu(false)
  panel.hidden = !open
  closed.hidden = open
  trayButton.classList.toggle('off', !open)
}

refreshButton.addEventListener('click', () => {
  refreshButton.classList.add('spinning')
  refreshButton.disabled = true
  setTimeout(() => {
    refreshButton.classList.remove('spinning')
    refreshButton.disabled = false
    updated.textContent = `Updated ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  }, 900)
})

moreButton.addEventListener('click', (event) => {
  event.stopPropagation()
  setMenu(menu.hidden)
})
menu.addEventListener('click', (event) => event.stopPropagation())
document.addEventListener('click', () => setMenu(false))
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenu(false)
})

menu.querySelector('[data-mark-all]').addEventListener('click', () => {
  Object.values(LANES).forEach((lane) => (lane.rows ?? []).forEach((row) => (row.unseen = false)))
  setMenu(false)
  render()
})
menu.querySelector('[data-quit]').addEventListener('click', () => setPanel(false))
trayButton.addEventListener('click', (event) => {
  event.stopPropagation()
  setPanel(panel.hidden)
})

markSeen.addEventListener('click', () => {
  ;(LANES[current].rows ?? []).forEach((row) => (row.unseen = false))
  render()
})

const narrow = window.matchMedia('(max-width: 900px)')
const calm = window.matchMedia('(prefers-reduced-motion: reduce)')
cards.forEach((card) =>
  card.addEventListener('click', () => {
    show(card.dataset.show)
    setPanel(true)
    if (narrow.matches) document.querySelector('.panel').scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'center' })
  }),
)

document.querySelectorAll('[data-copy]').forEach((button) =>
  button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(button.dataset.copy)
    const note = button.querySelector('.copied')
    if (!note) return
    note.textContent = 'Copied'
    setTimeout(() => (note.textContent = ''), 1600)
  }),
)

render()
