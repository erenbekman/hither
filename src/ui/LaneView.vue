<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { BoardState } from '../core/board'
import type { Section } from '../core/filtering'
import { ago } from '../core/format'
import type { Lane, Signal } from '../core/types'
import { SECTION_TITLES, subtitle } from '../lanes'
import Banner from './components/Banner.vue'
import Mark from './components/Mark.vue'
import SectionHeader from './components/SectionHeader.vue'
import SignalRow from './components/SignalRow.vue'

const props = defineProps<{
  lane: Lane
  state: BoardState
  now: Date
  open: (id: string, url: string | undefined) => void
  markSeen: (ids: string[]) => void
  empty: string
}>()

const expanded = reactive<Record<string, boolean>>({})

const sections = computed(() => props.state.lanes[props.lane])
const problems = computed(() => props.state.problems.filter((problem) => problem.lanes.includes(props.lane)))
const notices = computed(() => props.state.notices.filter((notice) => notice.lanes.includes(props.lane)))

const unseenIn = (signals: Signal[]) => signals.filter((signal) => props.state.unseen[signal.id])
const groupKey = (section: Section, project: string) => `${section.kind}:${project}`
const strongest = (signals: Signal[]): Signal['severity'] =>
  signals.some((s) => s.severity === 'critical') ? 'critical' : signals.some((s) => s.severity === 'attention') ? 'attention' : 'info'
</script>

<template>
  <div class="lane">
    <Banner v-for="(problem, i) in problems" :key="`p${i}`" tone="error" :error="problem.error" />
    <Banner v-for="notice in notices" :key="notice.source + notice.text" tone="warning" :text="notice.text" />

    <div class="list">
      <section v-for="section in sections" :key="section.kind">
        <SectionHeader
          :title="SECTION_TITLES[section.kind] ?? section.kind"
          :count="section.signals.length"
          :unseen="unseenIn(section.signals).length"
          @mark-seen="markSeen(unseenIn(section.signals).map((s) => s.id))"
        />

        <template v-for="row in section.rows" :key="row.type === 'item' ? row.signal.id : groupKey(section, row.project)">
          <SignalRow
            v-if="row.type === 'item'"
            :title="row.signal.title"
            :subtitle="subtitle(row.signal)"
            :age="ago(row.signal.at, now)"
            :severity="row.signal.severity"
            :unseen="!!state.unseen[row.signal.id]"
            @activate="open(row.signal.id, row.signal.url)"
          />
          <template v-else>
            <SignalRow
              group
              :expanded="!!expanded[groupKey(section, row.project)]"
              :title="row.project"
              :subtitle="`${row.signals.length} items · ${unseenIn(row.signals).length} new`"
              age=""
              :severity="strongest(unseenIn(row.signals))"
              :unseen="unseenIn(row.signals).length > 0"
              @activate="expanded[groupKey(section, row.project)] = !expanded[groupKey(section, row.project)]"
            />
            <template v-if="expanded[groupKey(section, row.project)]">
              <SignalRow
                v-for="signal in row.signals"
                :key="signal.id"
                nested
                :title="signal.title"
                :subtitle="subtitle(signal)"
                :age="ago(signal.at, now)"
                :severity="signal.severity"
                :unseen="!!state.unseen[signal.id]"
                @activate="open(signal.id, signal.url)"
              />
            </template>
          </template>
        </template>
      </section>

      <div v-if="sections.length === 0 && state.lastRefresh && problems.length === 0" class="empty">
        <Mark :size="32" tone="muted" />
        <span>{{ empty }}</span>
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
  padding-bottom: 8px;
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
</style>
