import { createApp } from 'vue'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import Panel from './ui/Panel.vue'
import Settings from './ui/Settings.vue'
import Welcome from './ui/Welcome.vue'
import './ui/base.css'

const label = getCurrentWebviewWindow().label
if (label !== 'panel') {
  document.documentElement.classList.add('window')
  document.body.classList.add('window')
}
const root = label === 'settings' ? Settings : label === 'welcome' ? Welcome : Panel
createApp(root).mount('#app')
