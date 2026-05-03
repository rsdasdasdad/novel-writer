# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Novel Writer — a Chinese web novel writing assistant with DeepSeek AI integration. Users write chapters, manage characters/outlines, and generate content via AI.

## Tech Stack

- **Backend**: Python + Flask (single `app.py`)
- **Frontend**: Vanilla JS + CSS (single-page app in `templates/index.html` + `static/script.js` + `static/style.css`)
- **AI**: DeepSeek API (`api.deepseek.com`) via streaming SSE
- **Storage**: Local JSON files in `novels/` directory (one file per novel)

## Setup & Run

```bash
pip install -r requirements.txt
python app.py
```

Opens on `http://localhost:5000`. Configure a DeepSeek API key in the Settings panel to use AI features.

## Architecture

### Backend (`app.py`)
- **Static files + templates**: Flask serves from `static/` and `templates/`
- **Novel CRUD routes**: `GET /api/novels` (list), `GET /api/novel/<title>` (load), `POST /api/novel/save` (save), `DELETE /api/novel/delete/<title>` (delete)
- **AI routes**: `POST /api/ai/write` (generation with context) and `POST /api/ai/chat` (freeform chat) — both stream SSE from DeepSeek API
- **Novel data model** (JSON): `{ title, genre, description, chapters[], characters[], outlines[], writingStats, appSettings }`

### Frontend (`static/script.js`)
- **State**: Single global `novel` object, `currentChapterIndex`, `isStreaming`, `readingMode`
- **Auto-save**: 2s debounce timer on content changes, saves via `POST /api/novel/save`
- **AI modes**: continue, expand, rewrite, free, brainstorm, outline — each has a Chinese system prompt
- **Context building**: AI requests can optionally include character profiles, outline, and chapter summaries in the system prompt

## Key Patterns

- **Streaming SSE**: AI responses use `ReadableStream` on frontend, Flask generator with `requests` streaming on backend — both sides yield `data: {json}\n\n` chunks
- **No database**: All persistence is file-based JSON, loaded/saved by title
- **Kanji character counting**: Word count uses Chinese character length (`String.length`)
