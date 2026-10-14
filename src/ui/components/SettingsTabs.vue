<script setup lang="ts">
export type SettingsTab = 'general' | 'github' | 'forge' | 'sentry' | 'agents' | 'suggestions'

defineProps<{ modelValue: SettingsTab }>()
defineEmits<{ 'update:modelValue': [tab: SettingsTab] }>()

const tabs: { id: SettingsTab; label: string; path: string }[] = [
  {
    id: 'general',
    label: 'General',
    path: 'M9 6.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM9 1.8v2M9 14.2v2M1.8 9h2M14.2 9h2M3.9 3.9l1.4 1.4M12.7 12.7l1.4 1.4M3.9 14.1l1.4-1.4M12.7 5.3l1.4-1.4',
  },
  {
    id: 'github',
    label: 'GitHub',
    path: 'M5 3.5v11M5 6.5a6 6 0 0 0 6 6h1M5 3.5m-1.6 0a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0M13.6 12.5m-1.6 0a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0',
  },
  { id: 'forge', label: 'Forge', path: 'M3 3.5h12v4H3zM3 10.5h12v4H3zM5.5 5.5h.01M5.5 12.5h.01' },
  { id: 'sentry', label: 'Sentry', path: 'M9 2.5l7 12.5H2L9 2.5zM9 7.5v3.5M9 13h.01' },
  { id: 'agents', label: 'Agents', path: 'M2.5 3.5h13v11h-13zM5.5 7.5l2 1.5-2 1.5M9.5 10.5h3' },
  { id: 'suggestions', label: 'Suggestions', path: 'M9 2.5a4.5 4.5 0 0 0-2.5 8.2v1.8h5v-1.8A4.5 4.5 0 0 0 9 2.5zM7 15h4' },
]
</script>

<template>
  <nav class="settings-tabs" data-tauri-drag-region>
    <button
      v-for="tab in tabs"
      :key="tab.id"
      :class="{ on: tab.id === modelValue }"
      :aria-pressed="tab.id === modelValue"
      @click="$emit('update:modelValue', tab.id)"
    >
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path :d="tab.path" />
      </svg>
      <span>{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.settings-tabs {
  display: flex;
  justify-content: center;
  gap: 2px;
  padding: 30px 12px 8px;
  border-bottom: 0.5px solid var(--separator);
}

button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 72px;
  padding: 5px 0 4px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--fg-2);
  font-size: 10.5px;
}

button:hover {
  background: var(--fill-hover);
}

button.on {
  background: var(--fill-selected);
  color: var(--fg);
}

svg {
  width: 20px;
  height: 20px;
}
</style>
