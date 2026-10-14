<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { BoardState } from '../core/board'
import { filterSections, flattenLane } from '../core/filtering'
import { ago, spokenAge } from '../core/format'
import type { Lane, Signal } from '../core/types'
import { chipFor, isOverdue, subtitle, type ChipTone } from '../lanes'
import { openSettings } from '../native'
import Banner from './components/Banner.vue'
import Mark from './components/Mark.vue'
import SignalRow from './components/SignalRow.vue'

const props = defineProps<{
  lane: Lane
  state: BoardState
  now: Date
  open: (id: string, url: string | undefined) => void
  showMenu: (signals: Signal[]) => void
  overdueHours: number
  groupThreshold: number
  empty: string
  emptyHint?: string
  query?: string
}>()

const expanded = reactive<Record<string, boolean>>({})

const rows = computed(() => {
  const query = props.query?.trim() ?? ''
  return flattenLane(filterSections(props.state.lanes[props.lane], query), query ? 0 : props.groupThreshold)
})
const problems = computed(() => {
  const shown = new Set<string>()
  return props.state.problems.filter((problem) => {
    const key = JSON.stringify(problem.error)
    if (!problem.lanes.includes(props.lane) || shown.has(key)) return false
    shown.add(key)
    return true
  })
})
const notices = computed(() => props.state.notices.filter((notice) => notice.lanes.includes(props.lane)))

const isUnseen = (signal: Signal) => !!props.state.unseen[signal.id]
const avatarOf = (signal: Signal) =>
  signal.source === 'github' && signal.actor && !signal.kind.startsWith('ci-')
    ? { login: signal.actor, url: typeof signal.meta?.avatar === 'string' ? signal.meta.avatar : undefined }
    : undefined

function symbolOf(signal: Signal): { glyph: string; tone: ChipTone | 'claude' } {
  if (signal.source === 'claude-code') return signal.meta?.agent === 'codex' ? { glyph: '◎', tone: 'gray' } : { glyph: '✳', tone: 'claude' }
  if (signal.source === 'forge') return { glyph: '↑', tone: chipFor(signal)?.tone ?? 'gray' }
  if (signal.source === 'sentry') return { glyph: '!', tone: 'orange' }
  if (signal.kind === 'ci-fixed') return { glyph: '✓', tone: 'green' }
  if (signal.kind.startsWith('ci-')) return { glyph: '✕', tone: signal.kind === 'ci-main-failed' ? 'red' : 'orange' }
  return { glyph: '•', tone: 'gray' }
}

const staleAge = (at: string) => {
  const age = ago(at, props.now)
  return age === 'now' ? 'a moment ago' : `${age} ago`
}
</script>

<template>
  <div class="lane">
    <Banner
      v-for="(problem, i) in problems"
      :key="`p${i}`"
      tone="error"
      :error="problem.error"
      :detail="problem.staleSince ? `Showing what was there ${staleAge(problem.staleSince)}` : undefined"
    />
    <Banner v-for="notice in notices" :key="notice.source + notice.text" tone="warning" :text="notice.text" />

    <div class="list">
      <template v-for="row in rows" :key="row.type === 'item' ? row.signal.id : `group:${row.project}`">
        <SignalRow
          v-if="row.type === 'item'"
          :title="row.signal.title"
          :subtitle="subtitle(row.signal)"
          :chip="chipFor(row.signal)"
          :age="ago(row.signal.at, now)"
          :spoken-age="spokenAge(row.signal.at, now)"
          :severity="row.signal.severity"
          :unseen="isUnseen(row.signal)"
          :avatar="avatarOf(row.signal)"
          :symbol="symbolOf(row.signal)"
          :overdue="isOverdue(row.signal, now, overdueHours)"
          @activate="open(row.signal.id, row.signal.url)"
          @menu="showMenu([row.signal])"
        />
        <template v-else>
          <SignalRow
            group
            :title="row.project.split('/').pop() ?? row.project"
            :count="row.signals.length"
            :expanded="!!expanded[row.project]"
            severity="info"
            :unseen="row.signals.some(isUnseen)"
            @activate="expanded[row.project] = !expanded[row.project]"
            @menu="showMenu(row.signals)"
          />
          <template v-if="expanded[row.project]">
            <SignalRow
              v-for="signal in row.signals"
              :key="signal.id"
              nested
              :title="signal.title"
              :subtitle="subtitle(signal)"
              :chip="chipFor(signal)"
              :age="ago(signal.at, now)"
              :spoken-age="spokenAge(signal.at, now)"
              :severity="signal.severity"
              :unseen="isUnseen(signal)"
              :avatar="avatarOf(signal)"
              :symbol="symbolOf(signal)"
              @activate="open(signal.id, signal.url)"
              @menu="showMenu([signal])"
            />
          </template>
        </template>
      </template>

      <div v-if="rows.length === 0 && query?.trim()" class="empty">
        <span>No matches for “{{ query.trim() }}”.</span>
      </div>
      <div v-else-if="rows.length === 0 && state.lastRefresh && problems.length === 0" class="empty">
        <Mark :size="32" tone="muted" />
        <span>{{ empty }}</span>
        <template v-if="emptyHint">
          <span class="hint">{{ emptyHint }}</span>
          <button class="button" @click="openSettings()">Open Settings</button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lane {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0 8px;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 12px;
  color: var(--fg-3);
  font-size: 12px;
}

.hint {
  max-width: 260px;
  font-size: 11px;
  text-align: center;
}
</style>
