<script setup lang="ts">
import { computed } from 'vue'
import type { Signal } from '../../core/types'
import type { ChipTone } from '../../lanes'
import Avatar from './Avatar.vue'

const props = defineProps<{
  title: string
  subtitle?: string
  age?: string
  spokenAge?: string
  severity: Signal['severity']
  unseen: boolean
  overdue?: boolean
  avatar?: { login: string; url?: string }
  symbol?: { glyph: string; tone: ChipTone | 'claude' }
  chip?: { label: string; tone: ChipTone }
  group?: boolean
  count?: number
  expanded?: boolean
  nested?: boolean
}>()
defineEmits<{ activate: []; menu: [] }>()

const label = computed(() =>
  props.group
    ? `${props.title}, ${props.count} items${props.unseen ? ', some new' : ''}`
    : [
        props.chip?.label,
        props.title,
        props.subtitle,
        props.spokenAge,
        props.unseen ? 'new' : 'seen',
        props.overdue ? 'waiting longer than your limit' : undefined,
      ]
        .filter(Boolean)
        .join(', '),
)
</script>

<template>
  <button
    class="row"
    data-row
    :class="[severity, { unseen, nested, overdue, group }]"
    :aria-label="label"
    :aria-expanded="group ? !!expanded : undefined"
    @click="$emit('activate')"
    @contextmenu.prevent="$emit('menu')"
  >
    <span v-if="group" class="tile folder" aria-hidden="true">
      <svg viewBox="0 0 16 16"><path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.4 1.5h6a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" /></svg>
    </span>
    <Avatar v-else-if="avatar" class="avatar" :login="avatar.login" :url="avatar.url" :size="26" />
    <span v-else class="tile" :class="symbol?.tone ?? 'gray'" aria-hidden="true">{{ symbol?.glyph ?? '•' }}</span>

    <span class="text">
      <span class="title">{{ title }}</span>
      <span v-if="!group && (chip || subtitle)" class="meta">
        <span v-if="chip" class="chip" :class="chip.tone">{{ chip.label }}</span>
        <span class="detail">{{ subtitle }}</span>
      </span>
    </span>

    <template v-if="group">
      <span class="count num" :class="{ new: unseen }">{{ count }}</span>
      <span class="chevron" :class="{ expanded }" aria-hidden="true">›</span>
    </template>
    <template v-else>
      <span class="age num">{{ age }}</span>
      <span class="dot" :class="{ on: unseen }" aria-hidden="true" />
    </template>
  </button>
</template>

<style scoped>
.row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: calc(100% - 12px);
  margin: 0 6px;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
}

.row.group {
  align-items: center;
}

.row:hover {
  background: var(--fill-hover);
}

.row:focus-visible {
  outline: none;
  background: var(--fill-selected);
}

.row.nested {
  padding-left: 30px;
}

.avatar,
.tile {
  flex: none;
}

.row:not(.unseen) .avatar {
  opacity: 0.6;
}

.tile {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  background: var(--fg-3);
}

.tile.red {
  background: var(--red);
}

.tile.orange {
  background: var(--orange);
}

.tile.blue {
  background: var(--blue);
}

.tile.green {
  background: var(--green);
}

.tile.claude {
  background: #d97757;
}

.tile.folder {
  border-radius: 7px;
  background: var(--fill-selected);
  color: var(--fg-2);
}

.tile.folder svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.3;
}

.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.title {
  display: -webkit-box;
  overflow: hidden;
  color: var(--fg-2);
  font-size: 13px;
  line-height: 1.3;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.unseen .title {
  color: var(--fg);
  font-weight: 500;
}

.meta {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  color: var(--fg-3);
  font-size: 11.5px;
}

.detail {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chip {
  flex: none;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 16px;
  --tone: var(--fg-3);
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 16%, transparent);
}

.chip.red {
  --tone: var(--red);
}

.chip.orange {
  --tone: var(--orange);
}

.chip.blue {
  --tone: var(--blue);
}

.chip.green {
  --tone: var(--green);
}

.age,
.count {
  flex: none;
  color: var(--fg-3);
  font-size: 11.5px;
}

.overdue .age {
  color: var(--orange);
  font-weight: 600;
}

.count.new {
  color: var(--green);
  font-weight: 600;
}

.dot {
  flex: none;
  width: 7px;
  height: 7px;
  margin-top: 4px;
  border-radius: 50%;
}

.dot.on {
  background: var(--green);
}

.chevron {
  flex: none;
  color: var(--fg-3);
  font-size: 15px;
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
