<script setup lang="ts">
import { computed } from 'vue'
import { errorHint, errorText, type AppError } from '../core/errors'

const props = defineProps<{ error: AppError }>()
const text = computed(() => errorText(props.error))
const hint = computed(() => errorHint(props.error))
</script>

<template>
  <div class="error-row" role="alert">
    <span>{{ text }}</span>
    <span v-if="hint && 'command' in hint" class="hint">Run <code>{{ hint.command }}</code> in a terminal</span>
    <span v-else-if="hint" class="hint">{{ hint.text }}</span>
  </div>
</template>

<style scoped>
.error-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  background: var(--error-bg);
  color: var(--error-fg);
}

.hint {
  color: var(--muted);
}
</style>
