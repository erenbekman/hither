<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { ago } from '../core/format'
import type { Section } from '../core/filtering'
import type { IncomingState } from '../core/incoming'
import type { Signal } from '../core/types'
import { KIND_TITLES, type GitHubKind } from '../sources/github'
import ErrorRow from './ErrorRow.vue'

const props = defineProps<{
  state: IncomingState
  open: (url: string) => void
  refresh: () => void
  markSeen: (ids: string[]) => void
}>()

const now = ref(new Date())
const expanded = reactive<Record<string, boolean>>({})
let ticker: ReturnType<typeof setInterval> | undefined

onMounted(() => (ticker = setInterval(() => (now.value = new Date()), 30_000)))
onUnmounted(() => clearInterval(ticker))

const title = (section: Section) => KIND_TITLES[section.kind as GitHubKind] ?? section.kind
const unseenIn = (signals: Signal[]) => signals.filter((signal) => props.state.unseen[signal.id])
const groupKey = (section: Section, project: string) => `${section.kind}:${project}`
</script>

<template>
  <div class="lane">
    <header class="bar">
      <span v-if="state.account" class="account"><span class="dot" />{{ state.account }}</span>
      <span v-else class="muted">Connecting to GitHub…</span>
      <span class="spacer" />
      <span v-if="state.refreshing" class="muted">Refreshing…</span>
      <span v-else-if="state.lastRefresh" class="muted">Updated {{ ago(state.lastRefresh, now) }}</span>
      <button class="icon" title="Refresh" :disabled="state.refreshing" @click="refresh()">↻</button>
    </header>

    <ErrorRow v-for="(error, i) in state.errors" :key="`e${i}`" :error="error" />
    <div v-for="notice in state.notices" :key="notice" class="notice">{{ notice }}</div>

    <div class="list">
      <section v-for="section in state.sections" :key="section.kind">
        <h2>
          <span>{{ title(section) }}</span>
          <span class="count">{{ section.signals.length }}</span>
          <span class="spacer" />
          <button
            v-if="unseenIn(section.signals).length > 0"
            class="link"
            @click="markSeen(unseenIn(section.signals).map((s) => s.id))"
          >
            Mark seen
          </button>
        </h2>

        <template v-for="row in section.rows" :key="row.type === 'item' ? row.signal.id : groupKey(section, row.project)">
          <button v-if="row.type === 'item'" class="row" :class="{ unseen: state.unseen[row.signal.id] }" @click="open(row.signal.url!)">
            <span class="mark" />
            <span class="text">
              <span class="title">{{ row.signal.title }}</span>
              <span class="sub">
                {{ row.signal.project }} #{{ row.signal.meta?.number }} · @{{ row.signal.actor }}
                <template v-if="row.signal.meta?.isDraft"> · draft</template>
              </span>
            </span>
            <span class="age">{{ ago(row.signal.at, now) }}</span>
          </button>

          <template v-else>
            <button
              class="row group"
              :class="{ unseen: unseenIn(row.signals).length > 0 }"
              @click="expanded[groupKey(section, row.project)] = !expanded[groupKey(section, row.project)]"
            >
              <span class="mark" />
              <span class="text">
                <span class="title">{{ row.project }}</span>
                <span class="sub">{{ row.signals.length }} items · {{ unseenIn(row.signals).length }} new</span>
              </span>
              <span class="age">{{ expanded[groupKey(section, row.project)] ? '▾' : '▸' }}</span>
            </button>
            <template v-if="expanded[groupKey(section, row.project)]">
              <button
                v-for="signal in row.signals"
                :key="signal.id"
                class="row nested"
                :class="{ unseen: state.unseen[signal.id] }"
                @click="open(signal.url!)"
              >
                <span class="mark" />
                <span class="text">
                  <span class="title">{{ signal.title }}</span>
                  <span class="sub">#{{ signal.meta?.number }} · @{{ signal.actor }}</span>
                </span>
                <span class="age">{{ ago(signal.at, now) }}</span>
              </button>
            </template>
          </template>
        </template>
      </section>

      <div v-if="state.sections.length === 0 && state.lastRefresh && state.errors.length === 0" class="empty">
        Nothing waiting on you.
      </div>
    </div>
  </div>
</template>

<style scoped>
.lane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--line);
}

.account {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ok);
}

.spacer {
  flex: 1;
}

.muted,
.count,
.sub,
.age {
  color: var(--muted);
}

button {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 0;
}

.icon {
  padding: 0 4px;
  font-size: 15px;
  color: var(--muted);
}

.icon:disabled {
  opacity: 0.4;
}

.link {
  padding: 0;
  color: var(--accent);
  font-size: 11px;
}

.notice {
  padding: 6px 12px;
  background: var(--notice-bg);
  color: var(--notice-fg);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 8px;
}

h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 10px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 12px;
  text-align: left;
}

.row:hover {
  background: var(--hover);
}

.row.nested {
  padding-left: 28px;
}

.mark {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.row.unseen .mark {
  background: var(--accent);
}

.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.title,
.sub {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.row:not(.unseen) .title {
  color: var(--muted);
}

.sub {
  font-size: 11px;
}

.age {
  flex: none;
  font-size: 11px;
}

.empty {
  padding: 24px 12px;
  color: var(--muted);
  text-align: center;
}
</style>
