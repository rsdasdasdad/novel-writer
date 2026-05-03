# AI Novel Writer

AI 驱动的中文小说创作助手，支持多供应商 AI 续写、扩写、改写，专注模式，每日写作目标追踪等功能。

## 功能特色

**写作工具**
- 章节管理：新增、排序、拖拽重排章节
- 阅读模式：沉浸式阅读体验
- 专注模式：隐藏侧边栏，全屏写作（Ctrl+Shift+F）
- 字数统计：实时显示字数、段落数
- 章节概要：为每章添加备注，用于 AI 上下文
- 导入 TXT：将文本文件导入为新章节
- 导出 TXT：将整部小说导出为文本文件

**AI 写作助手**
- 续写、扩写、改写、自由创作、头脑风暴、规划大纲 6 种模式
- 支持多供应商：DeepSeek、OpenAI、FreeAI、Claude (Anthropic)
- 可自定义 Prompt 模板
- 上下文包含角色设定、故事大纲、章节概要
- Token 用量预估

**内容管理**
- 角色管理：姓名、定位、描述、背景故事
- 大纲管理：幕、剧情弧、章节大纲层级
- 写作统计：每日字数、总字数、历史记录
- 日写作目标：设定每日目标，实时进度条

## 快速开始

### 环境要求

- Python 3.8+
- pip

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/rsdasdasdad/novel-writer.git
cd novel-writer

# 安装依赖
pip install -r requirements.txt

# 启动
python app.py
```

打开浏览器访问 `http://localhost:5000`。

### 配置 AI

1. 点击右上角 **设置**
2. 选择 **AI 供应商**（DeepSeek / OpenAI / FreeAI / Claude）
3. 输入对应供应商的 **API Key**
4. 选择或输入要使用的 **模型名称**
5. 点击 **保存**

## 使用教程

### 基础写作

1. 启动后在左侧 **章节** 区域管理章节
2. 中间编辑区直接写作，自动保存（2秒防抖）
3. 底部状态栏显示字数、今日写作量、日目标进度

### AI 辅助写作

1. 右侧 **AI 写作助手** 面板选择模式（续写/扩写/改写等）
2. 输入创作提示，或点击预设模板快速填充
3. 点击 **开始创作** 生成内容
4. 生成后可用 **插入光标** / **替换选中** / **追加结尾** 放入正文

### 角色管理

点击左侧角色区域的 ✎ 按钮，添加角色的姓名、定位、描述和背景故事。开启设置中的"包含角色设定信息"后，AI 生成时会自动参考角色设定。

### 大纲管理

点击左侧大纲区域的 ✎ 按钮，可以添加幕、剧情弧、章节大纲等层级结构。AI 生成时会自动参考故事大纲。

### 专注模式

点击顶部 **专注** 按钮或按 `Ctrl+Shift+F`，隐藏全部侧边栏，获得沉浸式写作体验。

### 阅读模式

点击编辑区上方 **阅读** 按钮或按 `Ctrl+R`，进入阅读模式查看当前章节。

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+S | 保存 |
| Ctrl+Enter | AI 生成 |
| Ctrl+R | 切换阅读模式 |
| Ctrl+Shift+N | 新建章节 |
| Ctrl+Shift+F | 切换专注模式 |
| F1 | 快捷键帮助 |

## 部署

### 方式一：直接部署

```bash
pip install -r requirements.txt
python app.py
```

默认运行在 `0.0.0.0:5000`，生产环境建议使用 Gunicorn：

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### 方式二：Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["python", "app.py"]
```

```bash
docker build -t novel-writer .
docker run -p 5000:5000 novel-writer
```

### 方式三：Railway / Render / Fly.io 等云平台

1. Fork 或推送本仓库到 GitHub
2. 在云平台中连接仓库
3. 构建命令：`pip install -r requirements.txt`
4. 启动命令：`python app.py`
5. 端口：`5000`

## 技术栈

- **后端**: Python Flask
- **前端**: 原生 JavaScript + CSS
- **AI**: DeepSeek / OpenAI / Anthropic API（OpenAI 兼容格式）
- **存储**: 本地 JSON 文件
