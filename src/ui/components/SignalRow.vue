<script setup lang="ts">
import type { Signal } from '../../core/types'

defineProps<{
  title: string
  subtitle: string
  age: string
  severity: Signal['severity']
  unseen: boolean
  group?: boolean
  expanded?: boolean
  nested?: boolean
}>()
defineEmits<{ activate: [] }>()
</script>

<template>
  <button class="row" :class="[severity, { unseen, nested }]" @click="$emit('activate')">
    <span class="status" />
    <span class="text">
      <span class="title">{{ title }}</span>
      <span class="subtitle">{{ subtitle }}</span>
    </span>
    <span v-if="group" class="chevron" :class="{ expanded }">▸</span>
    <span v-else class="age num">{{ age }}</span>
  </button>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: calc(100% - 8px);
  margin: 0 4px;
  padding: 5px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
}

.row:hover {
  background: var(--fill-hover);
}

.row.nested {
  padding-left: 24px;
}

.status {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--fg-3);
}

.unseen .status {
  box-shadow: none;
  background: var(--blue);
}

.unseen.attention .status {
  background: var(--orange);
}

.unseen.critical .status {
  background: var(--red);
}

.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.title,
.subtitle {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.title {
  color: var(--fg-2);
  font-size: 12.5px;
}

.unseen .title {
  color: var(--fg);
  font-weight: 500;
}

.critical .title {
  color: var(--red);
}

.subtitle,
.age,
.chevron {
  color: var(--fg-3);
  font-size: 11px;
}

.age,
.chevron {
  flex: none;
}

.chevron {
  transition: transform 120ms ease;
}

.chevron.expanded {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
}
</style>
