import { createApp } from 'vue'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import Panel from './ui/Panel.vue'
import Settings from './ui/Settings.vue'
import './ui/base.css'

const root = getCurrentWebviewWindow().label === 'settings' ? Settings : Panel
createApp(root).mount('#app')
