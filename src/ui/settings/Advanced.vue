<script setup lang="ts">
defineProps<{ summary: string }>()
</script>

<template>
  <details class="advanced">
    <summary>
      <span class="title">Advanced</span>
      <span class="summary">{{ summary }}</span>
    </summary>
    <div class="body"><slot /></div>
  </details>
</template>

<style scoped>
.advanced {
  margin: 4px 0 14px;
}

summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 2px;
  cursor: default;
  list-style: none;
}

summary::-webkit-details-marker {
  display: none;
}

summary::before {
  content: '▸';
  color: var(--fg-3);
  font-size: 10px;
  transition: transform 120ms ease;
}

.advanced[open] summary::before {
  transform: rotate(90deg);
}

.title {
  color: var(--fg-2);
  font-size: 12px;
  font-weight: 600;
}

.summary {
  overflow: hidden;
  color: var(--fg-3);
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.body {
  padding-top: 8px;
}

@media (prefers-reduced-motion: reduce) {
  summary::before {
    transition: none;
  }
}
</style>
