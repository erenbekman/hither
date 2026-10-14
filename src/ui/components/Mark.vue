<script setup lang="ts">
withDefaults(defineProps<{ size?: number; tone?: 'color' | 'muted' }>(), { size: 15, tone: 'color' })
</script>

<template>
  <svg class="mark" :class="tone" :width="size" :height="(size * 10) / 18" viewBox="0 4 18 10" aria-hidden="true">
    <circle class="dot" cx="4.5" cy="9" r="2.6" />
    <circle class="ring" cx="13.5" cy="9" r="2.6" fill="none" stroke-width="1.6" />
    <path class="line" d="M7.4 9h3.2" stroke-width="1.6" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.mark {
  flex: none;
  overflow: visible;
}

.color .dot {
  fill: var(--blue);
}

.color .ring,
.color .line {
  stroke: var(--fg);
}

.muted {
  opacity: 0.5;
}

.muted .dot {
  fill: var(--fg-3);
}

.muted .ring,
.muted .line {
  stroke: var(--fg-3);
}
</style>
