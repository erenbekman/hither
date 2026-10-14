<script setup lang="ts">
import { ref } from 'vue'
import SettingRow from './SettingRow.vue'
import { useSettings } from './context'

const props = defineProps<{ label: string; tokenKey: string; hint: string }>()

const { state, saveToken, forgetToken } = useSettings()
const editing = ref(false)
const value = ref('')

async function submit() {
  await saveToken(props.tokenKey, value.value)
  value.value = ''
  editing.value = false
}
</script>

<template>
  <SettingRow v-if="state.tokens[tokenKey] && !editing" :label="label" hint="Saved in Keychain">
    <button class="button" type="button" @click="editing = true">Change</button>
    <button class="button" type="button" @click="forgetToken(tokenKey)">Remove</button>
  </SettingRow>
  <SettingRow v-else :label="label" :hint="hint" stacked>
    <form class="token" @submit.prevent="submit">
      <input v-model="value" class="text-input" type="password" placeholder="Paste a token" autocomplete="off" />
      <button class="button primary" type="submit" :disabled="!value.trim()">Save token</button>
      <button v-if="editing" class="button" type="button" @click="editing = false">Cancel</button>
    </form>
  </SettingRow>
</template>

<style scoped>
.token {
  display: flex;
  gap: 6px;
}
</style>
