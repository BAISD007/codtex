# codtex - 公式识别工具

> 拍照/截图 → 识别公式 → 输出 LaTeX

## 项目状态

**⚠️ 开发暂停** — 由于设备性能限制（4GB 显存），独立推理方案暂未解决。当前识别功能依赖 LM Studio API。

---

## 功能

| 功能 | 状态 |
|------|------|
| 三栏界面（渲染预览 / LaTeX 源码 / 原图） | ✅ 完成 |
| 图片上传（拖拽 / 点击选择 / Ctrl+V 粘贴） | ✅ 完成 |
| KaTeX 渲染 LaTeX | ✅ 完成 |
| 历史记录（点击切换 / 删除） | ✅ 完成 |
| 复制 / 保存 LaTeX | ✅ 完成 |
| 独立推理（不依赖 LM Studio） | ❌ 暂停 |

---

## 技术路线

### 架构

```
codtex 应用 (Electron)
    ↓ HTTP
Python 后端 (FastAPI)
    ↓
GLM-OCR 模型 (zai-org/GLM-OCR)
```

### 技术栈

| 组件 | 技术 |
|------|------|
| 桌面框架 | Electron |
| 后端 | Python + FastAPI |
| 模型推理 | Transformers / vLLM |
| LaTeX 渲染 | KaTeX |
| 图片处理 | Pillow |

### 模型

- **GLM-OCR** (zai-org/GLM-OCR)
  - 1B 参数，BF16
  - 多模态 OCR 模型
  - 支持公式识别、文档解析

---

## 独立推理方案探索

| 方案 | 问题 | 状态 |
|------|------|------|
| llama.cpp | 版本不支持 GLM OCR 架构 | ❌ |
| llama-cpp-python | Windows 路径限制 | ❌ |
| glmocr SDK | 不支持本地模型加载 | ❌ |
| transformers | API 复杂，手写推理困难 | ❌ |
| vLLM | 安装超时 | ⏳ |

### 设备限制

- **显存**: 4GB
- **模型大小**: ~2GB (BF16)
- **推理速度**: CPU 模式较慢

---

## 快速开始

### 安装依赖

```bash
npm install
pip install fastapi uvicorn pillow torch torchvision transformers
```

### 下载模型

```bash
# 使用 huggingface-hub
pip install huggingface-hub
python -c "
from huggingface_hub import snapshot_download
snapshot_download(repo_id='zai-org/GLM-OCR', local_dir='./glm-ocr-model')
"
```

### 运行

```bash
# 启动后端
python backend.py

# 启动前端
npm start
```

---

## 目录结构

```
codtex/
├── main.js              # Electron 主进程
├── preload.js           # 预加载脚本
├── backend.py           # Python 后端服务
├── src/
│   ├── index.html       # 前端页面
│   ├── style.css        # 样式
│   └── renderer.js      # 前端逻辑
├── glm-ocr-model/       # 模型文件（需下载）
└── models/              # GGUF 模型（可选）
```

---

## 许可证

MIT
