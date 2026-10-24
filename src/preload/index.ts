import { contextBridge, ipcRenderer } from 'electron'
import type { SnapFireApi } from '../shared/types'

const api: SnapFireApi = {
  storage: {
    loadProfile: () => ipcRenderer.invoke('storage:load-profile'),
    saveProfile: (profile) => ipcRenderer.invoke('storage:save-profile', profile),
    loadSettings: () => ipcRenderer.invoke('storage:load-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('storage:save-settings', settings),
    loadAppearance: () => ipcRenderer.invoke('storage:load-appearance'),
    saveAppearance: (appearance) => ipcRenderer.invoke('storage:save-appearance', appearance),
    loadHistory: () => ipcRenderer.invoke('storage:load-history'),
    addHistory: (result) => ipcRenderer.invoke('storage:add-history', result),
    clearHistory: () => ipcRenderer.invoke('storage:clear-history'),
    resetAll: () => ipcRenderer.invoke('storage:reset-all'),
    consumeWarnings: () => ipcRenderer.invoke('storage:consume-warnings')
  },
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: () => ipcRenderer.invoke('backup:import')
  },
  host: {
    start: () => ipcRenderer.invoke('host:start'),
    stop: () => ipcRenderer.invoke('host:stop'),
    status: () => ipcRenderer.invoke('host:status'),
    openCertFolder: () => ipcRenderer.invoke('host:open-cert-folder')
  },
  app: {
    info: () => ipcRenderer.invoke('app:info')
  },
  fieldLog: {
    append: (entry) => ipcRenderer.invoke('field-log:append', entry),
    info: () => ipcRenderer.invoke('field-log:info'),
    openDirectory: () => ipcRenderer.invoke('field-log:open')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('snapfire', api)
  } catch (error) {
    console.error('Failed to expose SnapFire API', error)
  }
} else {
  // Fallback for unusual launch configurations.
  ;(globalThis as unknown as { snapfire: SnapFireApi }).snapfire = api
}
