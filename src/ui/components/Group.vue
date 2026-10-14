<script setup lang="ts">
defineProps<{ label?: string; hint?: string }>()
</script>

<template>
  <section class="group-wrap">
    <h3 v-if="label" class="label">{{ label }}<span v-if="hint" class="hint">{{ hint }}</span></h3>
    <div class="group"><slot /></div>
  </section>
</template>

<style scoped>
.group-wrap {
  margin: 0 0 14px;
}

.label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 5px;
  padding: 0 10px;
  color: var(--fg-2);
  font-size: 11px;
  font-weight: 600;
}

.hint {
  color: var(--fg-3);
  font-weight: 400;
}

.group {
  border-radius: 8px;
  background: var(--fill);
  box-shadow: inset 0 0 0 0.5px var(--separator);
}

.group > :deep(* + *) {
  border-top: 0.5px solid var(--separator);
}
</style>
