<script setup lang="ts">
import { computed } from 'vue'
import { ago, spokenAge } from '../../core/format'
import { agentName } from '../../core/sessions'
import type { WaitingAgent } from '../../core/waiting'

const SHOWN = 3

const props = defineProps<{ queue: WaitingAgent[]; now: Date }>()
defineEmits<{ open: [id: string]; more: [] }>()

const shown = computed(() => props.queue.slice(0, SHOWN))

function detail(agent: WaitingAgent) {
  const name = `${agentName(agent.agent)} `
  return agent.message.startsWith(name) ? agent.message.slice(name.length) : agent.message
}
</script>

<template>
  <section v-if="queue.length > 0" class="needs-you" aria-label="Agents waiting on you">
    <h2 class="heading">Needs you <span class="count num">{{ queue.length }}</span></h2>
    <button
      v-for="agent in shown"
      :key="agent.id"
      class="row"
      data-row
      :aria-label="`${agentName(agent.agent)} in ${agent.project} ${detail(agent)}, started waiting ${spokenAge(agent.since, now)}`"
      @click="$emit('open', agent.id)"
    >
      <span class="dot" aria-hidden="true" />
      <span class="text">
        <span class="who">{{ agentName(agent.agent) }} · {{ agent.project }}</span>
        <span class="message">{{ detail(agent) }}</span>
      </span>
      <span class="age num">{{ ago(agent.since, now) }}</span>
    </button>
    <button v-if="queue.length > SHOWN" class="more" @click="$emit('more')">+{{ queue.length - SHOWN }} more</button>
  </section>
</template>

<style scoped>
.needs-you {
  display: flex;
  flex-direction: column;
  margin: 0 0 6px;
  padding: 0 0 6px;
  border-bottom: 1px solid var(--separator);
}

.heading {
  margin: 0;
  padding: 4px 16px 2px;
  color: var(--fg-3);
  font-size: 11.5px;
  font-weight: 600;
}

.count {
  color: var(--orange);
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: calc(100% - 12px);
  margin: 0 6px;
  padding: 6px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
}

.row:hover {
  background: var(--fill-hover);
}

.row:focus-visible {
  outline: none;
  background: var(--fill-selected);
}

.dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--orange);
}

.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.who {
  color: var(--fg);
  font-size: 13px;
  font-weight: 500;
}

.message {
  overflow: hidden;
  color: var(--fg-2);
  font-size: 11.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.age {
  flex: none;
  color: var(--orange);
  font-size: 11.5px;
}

.more {
  align-self: flex-start;
  margin: 2px 16px 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--fg-3);
  font-size: 11.5px;
}

.more:hover {
  color: var(--fg);
}
</style>
