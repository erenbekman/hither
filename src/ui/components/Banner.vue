<script setup lang="ts">
import { computed } from 'vue'
import { errorHint, errorText, type AppError } from '../../core/errors'

const props = defineProps<{ tone: 'error' | 'warning' | 'action'; error?: AppError; text?: string; detail?: string }>()

const message = computed(() => props.text ?? (props.error ? errorText(props.error) : ''))
const hint = computed(() => (props.error ? errorHint(props.error) : undefined))
</script>

<template>
  <div class="banner" :class="tone" :role="tone === 'error' ? 'alert' : 'status'">
    <div class="body">
      <span class="message">{{ message }}</span>
      <span v-if="detail" class="detail">{{ detail }}</span>
      <span v-if="hint && 'command' in hint" class="detail">Run <code class="selectable">{{ hint.command }}</code> in a terminal</span>
      <span v-else-if="hint" class="detail">{{ hint.text }}</span>
    </div>
    <slot name="action" />
  </div>
</template>

<style scoped>
.banner {
  --tone: var(--blue);
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 8px 0;
  padding: 7px 9px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--tone) 12%, transparent);
}

.error {
  --tone: var(--red);
}

.warning {
  --tone: var(--orange);
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.message {
  color: var(--tone);
  font-size: 12px;
  font-weight: 500;
}

.detail {
  color: var(--fg-2);
  font-size: 11px;
}
</style>
