<script setup lang="ts">
defineProps<{ title: string; count: number; unseen: number }>()
defineEmits<{ markSeen: [] }>()
</script>

<template>
  <h2 class="section-header">
    <span>{{ title }}</span>
    <span class="count num">{{ count }}</span>
    <button v-if="unseen > 0" class="mark-seen" @click="$emit('markSeen')">Mark seen</button>
  </h2>
</template>

<style scoped>
.section-header {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  padding: 10px 12px 3px;
  color: var(--fg-2);
  font-size: 11px;
  font-weight: 600;
}

.count {
  color: var(--fg-3);
  font-weight: 400;
}

.mark-seen {
  margin-left: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--blue);
  font-size: 11px;
  font-weight: 400;
}
</style>
