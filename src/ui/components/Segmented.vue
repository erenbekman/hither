<script setup lang="ts">
export interface SegmentItem {
  id: string
  label: string
  badge?: number
  critical?: boolean
}

defineProps<{ items: SegmentItem[]; modelValue: string }>()
defineEmits<{ 'update:modelValue': [id: string] }>()
</script>

<template>
  <div class="segmented" role="tablist">
    <button
      v-for="item in items"
      :key="item.id"
      role="tab"
      :aria-selected="item.id === modelValue"
      :class="{ on: item.id === modelValue }"
      @click="$emit('update:modelValue', item.id)"
    >
      {{ item.label }}
      <span v-if="item.badge" class="badge num" :class="{ critical: item.critical }">{{ item.badge }}</span>
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: flex;
  padding: 2px;
  border-radius: 8px;
  background: var(--fill);
}

button {
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 3px 8px;
  white-space: nowrap;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--fg-2);
  font-size: 11.5px;
  font-weight: 500;
}

button.on {
  background: var(--fill-selected);
  box-shadow: var(--shadow);
  color: var(--fg);
}

.badge {
  min-width: 15px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--blue);
  color: #fff;
  font-size: 9.5px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
}

.badge.critical {
  background: var(--red);
}
</style>
