<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import type { BoardState } from '../core/board'
import type { Section } from '../core/filtering'
import { ago } from '../core/format'
import type { Lane, Signal } from '../core/types'
import { SECTION_TITLES, subtitle } from '../lanes'
import ErrorRow from './ErrorRow.vue'

const props = defineProps<{
  lane: Lane
  state: BoardState
  open: (id: string, url: string | undefined) => void
  markSeen: (ids: string[]) => void
  empty: string
}>()

const now = ref(new Date())
const expanded = reactive<Record<string, boolean>>({})
let ticker: ReturnType<typeof setInterval> | undefined
onMounted(() => (ticker = setInterval(() => (now.value = new Date()), 30_000)))
onUnmounted(() => clearInterval(ticker))

const sections = computed(() => props.state.lanes[props.lane])
const problems = computed(() => props.state.problems.filter((problem) => problem.lanes.includes(props.lane)))
const notices = computed(() => props.state.notices.filter((notice) => notice.lanes.includes(props.lane)))

const unseenIn = (signals: Signal[]) => signals.filter((signal) => props.state.unseen[signal.id])
const groupKey = (section: Section, project: string) => `${section.kind}:${project}`
const toggle = (key: string) => (expanded[key] = !expanded[key])
</script>

<template>
  <div class="lane">
    <ErrorRow v-for="(problem, i) in problems" :key="`p${i}`" :error="problem.error" />
    <div v-for="notice in notices" :key="notice.source + notice.text" class="notice">{{ notice.text }}</div>

    <div class="list">
      <section v-for="section in sections" :key="section.kind">
        <h2>
          <span>{{ SECTION_TITLES[section.kind] ?? section.kind }}</span>
          <span class="muted">{{ section.signals.length }}</span>
          <span class="spacer" />
          <button v-if="unseenIn(section.signals).length > 0" class="link" @click="markSeen(unseenIn(section.signals).map((s) => s.id))">
            Mark seen
          </button>
        </h2>

        <template v-for="row in section.rows" :key="row.type === 'item' ? row.signal.id : groupKey(section, row.project)">
          <button
            v-if="row.type === 'item'"
            class="row"
            :class="[row.signal.severity, { unseen: state.unseen[row.signal.id] }]"
            @click="open(row.signal.id, row.signal.url)"
          >
            <span class="mark" />
            <span class="text">
              <span class="title">{{ row.signal.title }}</span>
              <span class="sub">{{ subtitle(row.signal) }}</span>
            </span>
            <span class="age">{{ ago(row.signal.at, now) }}</span>
          </button>

          <template v-else>
            <button class="row group" :class="{ unseen: unseenIn(row.signals).length > 0 }" @click="toggle(groupKey(section, row.project))">
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
                :class="[signal.severity, { unseen: state.unseen[signal.id] }]"
                @click="open(signal.id, signal.url)"
              >
                <span class="mark" />
                <span class="text">
                  <span class="title">{{ signal.title }}</span>
                  <span class="sub">{{ subtitle(signal) }}</span>
                </span>
                <span class="age">{{ ago(signal.at, now) }}</span>
              </button>
            </template>
          </template>
        </template>
      </section>

      <div v-if="sections.length === 0 && state.lastRefresh && problems.length === 0" class="empty">{{ empty }}</div>
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

.spacer {
  flex: 1;
}

.muted,
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

.row.unseen.attention .mark {
  background: var(--warn);
}

.row.unseen.critical .mark {
  background: var(--error-fg);
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

.row.critical .title {
  color: var(--error-fg);
}

.sub,
.age {
  font-size: 11px;
}

.age {
  flex: none;
}

.empty {
  padding: 24px 12px;
  color: var(--muted);
  text-align: center;
}
</style>
