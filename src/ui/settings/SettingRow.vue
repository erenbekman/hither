<script setup lang="ts">
defineProps<{ label: string; hint?: string; stacked?: boolean }>()
</script>

<template>
  <div class="setting-row" :class="{ stacked }">
    <div class="text">
      <span class="label">{{ label }}</span>
      <span v-if="hint" class="hint">{{ hint }}</span>
    </div>
    <div class="control"><slot /></div>
  </div>
</template>

<style scoped>
.setting-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 34px;
  padding: 6px 10px;
}

.setting-row.stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.label {
  font-size: 13px;
}

.hint {
  color: var(--fg-3);
  font-size: 11px;
}

.control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stacked .control {
  flex-direction: column;
  align-items: stretch;
}

.control :deep(select),
.control :deep(input[type='number']),
.control :deep(input[type='time']) {
  padding: 3px 6px;
  border: 0;
  border-radius: 6px;
  background: var(--control);
  box-shadow: inset 0 0 0 0.5px var(--separator), var(--shadow);
}

.control :deep(input[type='number']) {
  width: 64px;
}

.control :deep(input:disabled) {
  opacity: 0.5;
}

.control :deep(textarea) {
  resize: vertical;
  min-height: 56px;
  font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
}

.control :deep(input[type='checkbox']) {
  accent-color: var(--blue);
}
</style>
