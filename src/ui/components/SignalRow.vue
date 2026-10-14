<script setup lang="ts">
import type { Signal } from '../../core/types'
import Avatar from './Avatar.vue'

defineProps<{
  title: string
  subtitle: string
  age: string
  severity: Signal['severity']
  unseen: boolean
  group?: boolean
  expanded?: boolean
  nested?: boolean
  avatar?: { login: string; url?: string }
  overdue?: boolean
}>()
defineEmits<{ activate: []; menu: [] }>()
</script>

<template>
  <button class="row" data-row :class="[severity, { unseen, nested, overdue }]" @click="$emit('activate')" @contextmenu.prevent="$emit('menu')">
    <span class="status" />
    <Avatar v-if="avatar" :login="avatar.login" :url="avatar.url" />
    <span class="text">
      <span class="title">{{ title }}</span>
      <span class="subtitle">{{ subtitle }}</span>
    </span>
    <span v-if="group" class="chevron" :class="{ expanded }">▸</span>
    <span v-else class="age num" :title="overdue ? 'Waiting longer than you set in Settings' : undefined">{{ age }}</span>
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

.row:focus-visible {
  outline: none;
  background: var(--fill-selected);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--blue) 45%, transparent);
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

.overdue .status {
  box-shadow: inset 0 0 0 1.5px var(--orange);
}

.overdue .age {
  color: var(--orange);
  font-weight: 600;
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
