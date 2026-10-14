<script setup lang="ts">
export interface LaneTab {
  id: string
  label: string
  unseen: number
  total: number
}

defineProps<{ items: LaneTab[]; modelValue: string }>()
defineEmits<{ 'update:modelValue': [id: string] }>()
</script>

<template>
  <nav class="lane-tabs" role="tablist">
    <button
      v-for="item in items"
      :key="item.id"
      role="tab"
      :aria-selected="item.id === modelValue"
      :aria-label="item.unseen ? `${item.label}, ${item.unseen} new` : `${item.label}, ${item.total}`"
      :class="{ on: item.id === modelValue }"
      @click="$emit('update:modelValue', item.id)"
    >
      {{ item.label }}
      <span v-if="item.unseen" class="count new num">{{ item.unseen }}</span>
      <span v-else-if="item.total" class="count num">{{ item.total }}</span>
    </button>
  </nav>
</template>

<style scoped>
.lane-tabs {
  display: flex;
  gap: 18px;
  padding: 0 16px;
  border-bottom: 0.5px solid var(--separator);
  white-space: nowrap;
}

button {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 7px 0 8px;
  border: 0;
  background: transparent;
  color: var(--fg-2);
  font-size: 13px;
}

button.on {
  color: var(--fg);
  font-weight: 600;
  box-shadow: inset 0 -2px 0 var(--fg);
}

.count {
  color: var(--fg-3);
  font-weight: 500;
}

.count.new {
  color: var(--green);
}
</style>
