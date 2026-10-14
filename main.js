const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

// 强制所有数据存 F 盘，不碰 C 盘
const DATA_DIR = path.join('F:', 'codmore.ai', 'codtex', 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const MODELS_DIR = path.join(__dirname, 'models');

// 确保目录存在
[HISTORY_DIR, MODELS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 重定向 Electron 的 userData 到 F 盘
app.setPath('userData', path.join(DATA_DIR, 'electron'));

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'src', 'icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // 开发时打开 DevTools
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  startBackend();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ============ IPC 处理 ============

// 选择图片
ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const destPath = path.join(HISTORY_DIR, fileName);

  // 复制到历史目录
  fs.copyFileSync(filePath, destPath);

  return {
    name: fileName,
    path: destPath,
    base64: fs.readFileSync(destPath).toString('base64')
  };
});

// 粘贴图片
ipcMain.handle('paste-image', async () => {
  const image = clipboard.readImage();
  if (image.isEmpty()) return null;

  const fileName = `paste_${Date.now()}.png`;
  const destPath = path.join(HISTORY_DIR, fileName);
  fs.writeFileSync(destPath, image.toPNG());

  return {
    name: fileName,
    path: destPath,
    base64: fs.readFileSync(destPath).toString('base64')
  };
});

// 获取历史记录
ipcMain.handle('get-history', async () => {
  if (!fs.existsSync(HISTORY_DIR)) return [];

  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => /\.(png|jpg|jpeg|bmp|webp)$/i.test(f))
    .map(f => {
      const filePath = path.join(HISTORY_DIR, f);
      const stat = fs.statSync(filePath);
      return {
        name: f,
        path: filePath,
        time: stat.mtime.getTime(),
        base64: fs.readFileSync(filePath).toString('base64')
      };
    })
    .sort((a, b) => b.time - a.time);

  return files;
});

// 删除历史记录
ipcMain.handle('delete-history', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 获取模型路径
ipcMain.handle('get-model-path', async () => {
  return {
    llm: path.join(MODELS_DIR, 'GLM-OCR-Q8_0.gguf'),
    mmproj: path.join(MODELS_DIR, 'mmproj-GLM-OCR-Q8_0.gguf'),
  };
});

// 识别公式（调用本地 Python 后端）
ipcMain.handle('recognize', async (event, imageBase64) => {
  try {
    const response = await fetch('http://127.0.0.1:8765/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 })
    });
    const result = await response.json();
    return result;
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
});

// 启动 Python 后端
async function startBackend() {
  const { spawn } = require('child_process');
  const path = require('path');
  const backend = path.join(__dirname, 'backend.py');
  const python = 'python';

  try {
    const proc = spawn(python, [backend], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (d) => console.log('[backend]', d.toString()));
    proc.stderr.on('data', (d) => console.error('[backend]', d.toString()));

    // 等待后端启动
    await new Promise(r => setTimeout(r, 3000));
    console.log('后端已启动');
  } catch (e) {
    console.error('后端启动失败:', e);
  }
}
