<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { hueFor } from '../../core/format'

const props = withDefaults(defineProps<{ login: string; url?: string; size?: number }>(), { size: 22 })

const failed = ref(false)
watch(
  () => props.url,
  () => (failed.value = false),
)

const initial = computed(() => props.login.replace(/\[bot\]$/, '').charAt(0).toUpperCase() || '?')
const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.round(props.size * 0.46)}px`,
  '--hue': hueFor(props.login),
}))
</script>

<template>
  <span class="avatar" :style="style" aria-hidden="true">
    <img v-if="url && !failed" :src="url" alt="" loading="lazy" referrerpolicy="no-referrer" @error="failed = true" />
    <span v-else>{{ initial }}</span>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-grid;
  flex: none;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: hsl(var(--hue) 32% 46%);
  color: #fff;
  font-weight: 600;
  line-height: 1;
}

img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
