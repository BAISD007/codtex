// codtex 前端逻辑

let currentImage = null;
let currentLatex = '';

// ============ DOM 元素 ============
const preview = document.getElementById('preview');
const source = document.getElementById('source');
const dropzone = document.getElementById('dropzone');
const imagePreview = document.getElementById('image-preview');
const historyBar = document.getElementById('history-bar');
const copyBtn = document.getElementById('copy-btn');
const saveBtn = document.getElementById('save-btn');
const pasteBtn = document.getElementById('paste-btn');
const selectBtn = document.getElementById('select-btn');
const recognizeBtn = document.getElementById('recognize-btn');

// ============ 图片加载 ============
function loadImage(base64, name) {
  currentImage = base64;
  imagePreview.src = `data:image/png;base64,${base64}`;
  imagePreview.style.display = 'block';
  dropzone.querySelector('.placeholder').style.display = 'none';
}

// ============ 渲染 LaTeX ============
function renderLatex(latex) {
  currentLatex = latex;
  source.value = latex;

  if (!latex) {
    preview.innerHTML = '<div class="placeholder">识别结果将在这里显示</div>';
    return;
  }

  try {
    // 用 auto-render 处理混合文本（中文+LaTeX）
    preview.innerHTML = latex;
    renderMathInElement(preview, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
  } catch (e) {
    preview.innerHTML = `<div style="color: #ff6b6b;">渲染错误: ${e.message}</div>`;
  }
}

// ============ 识别公式 ============
async function recognize() {
  if (!currentImage) {
    alert('请先选择或粘贴图片');
    return;
  }

  recognizeBtn.textContent = '识别中...';
  recognizeBtn.disabled = true;

  try {
    // 调用主进程的识别功能
    const result = await window.api.recognize(currentImage);
    if (result && result.latex) {
      renderLatex(result.latex);
    } else {
      alert('识别失败');
    }
  } catch (e) {
    alert('识别出错: ' + e.message);
  } finally {
    recognizeBtn.textContent = '识别';
    recognizeBtn.disabled = false;
  }
}

// ============ 历史记录 ============
async function loadHistory() {
  try {
    const history = await window.api.getHistory();
    historyBar.innerHTML = '';

    for (const item of history) {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <img src="data:image/png;base64,${item.base64}" alt="${item.name}">
        <button class="delete-btn" data-path="${item.path}">×</button>
      `;

      div.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) return;
        loadImage(item.base64, item.name);
        // 高亮当前选中
        document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
      });

      div.querySelector('.delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('确定删除这张图片？')) {
          await window.api.deleteHistory(item.path);
          loadHistory();
        }
      });

      historyBar.appendChild(div);
    }
  } catch (e) {
    console.error('加载历史失败:', e);
  }
}

// ============ 事件绑定 ============

// 选择图片
selectBtn.addEventListener('click', async () => {
  const result = await window.api.selectImage();
  if (result) {
    loadImage(result.base64, result.name);
    loadHistory();
  }
});

// 粘贴图片
pasteBtn.addEventListener('click', async () => {
  const result = await window.api.pasteImage();
  if (result) {
    loadImage(result.base64, result.name);
    loadHistory();
  } else {
    alert('剪贴板中没有图片');
  }
});

// 识别
recognizeBtn.addEventListener('click', recognize);

// 复制 LaTeX
copyBtn.addEventListener('click', () => {
  if (currentLatex) {
    navigator.clipboard.writeText(currentLatex);
    copyBtn.textContent = '已复制';
    setTimeout(() => copyBtn.textContent = '复制 LaTeX', 1500);
  }
});

// 保存
saveBtn.addEventListener('click', () => {
  if (currentLatex) {
    const blob = new Blob([currentLatex], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'formula.tex';
    a.click();
    URL.revokeObjectURL(url);
  }
});

// 拖拽上传
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');

  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      loadImage(base64, file.name);
    };
    reader.readAsDataURL(file);
  }
});

// Ctrl+V 粘贴
document.addEventListener('paste', (e) => {
  const items = e.clipboardData.items;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1];
        loadImage(base64, 'pasted.png');
      };
      reader.readAsDataURL(file);
      break;
    }
  }
});

// 初始化
loadHistory();
