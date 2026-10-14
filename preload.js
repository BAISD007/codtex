const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectImage: () => ipcRenderer.invoke('select-image'),
  pasteImage: () => ipcRenderer.invoke('paste-image'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  deleteHistory: (path) => ipcRenderer.invoke('delete-history', path),
  getModelPath: () => ipcRenderer.invoke('get-model-path'),

  // 识别公式（调用 Python 后端或本地推理）
  recognize: (imageBase64) => ipcRenderer.invoke('recognize', imageBase64),
});
