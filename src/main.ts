import { createApp } from 'vue'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import Panel from './ui/Panel.vue'
import Settings from './ui/Settings.vue'
import './ui/base.css'

const isSettings = getCurrentWebviewWindow().label === 'settings'
if (isSettings) {
  document.documentElement.classList.add('window')
  document.body.classList.add('window')
}
const root = isSettings ? Settings : Panel
createApp(root).mount('#app')
