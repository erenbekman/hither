<script setup lang="ts">
defineProps<{ modelValue: boolean; disabled?: boolean; label?: string }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    class="toggle"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :class="{ on: modelValue }"
    :disabled="disabled"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="knob" />
  </button>
</template>

<style scoped>
.toggle {
  position: relative;
  flex: none;
  width: 30px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: var(--fill-selected);
  transition: background 150ms ease;
}

.toggle.on {
  background: var(--green);
}

.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition: transform 150ms ease;
}

.on .knob {
  transform: translateX(12px);
}

.toggle:disabled {
  opacity: 0.5;
}

@media (prefers-reduced-motion: reduce) {
  .toggle,
  .knob {
    transition: none;
  }
}
</style>
