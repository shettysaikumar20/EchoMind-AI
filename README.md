# EchoMind AI 🎙️🧠

> **Listen. Understand. Answer. Remember.**  
> *Real-time conversational intelligence with multi-source audio capture, sub-second transcription, automated question extraction, and open-weight Llama model answers.*

[![Hacktoberfest 2026](https://img.shields.io/badge/Hacktoberfest-2026%20Week%203-FF7843?logo=hacktoberfest&logoColor=white)](https://hacktoberfest.com)
[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.13-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Tests](https://img.shields.io/badge/Tests-15%20Passing-10B981?logo=pytest&logoColor=white)](https://pytest.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🎃 Hacktoberfest 2026: Week 3 — Slow and Steady

**Challenge Ethos:** *"Let AI do the work so humans don't have to."*

EchoMind AI was built specifically to tackle cognitive fatigue in high-stress meetings, lectures, interviews, and webinars:
- **Zero Cognitive Overhead:** While you focus on the conversation, EchoMind listens in the background, extracts questions on-the-fly, and prepares synthesized, grounded answers before you even finish formulating your thoughts.
- **Autonomous Workflow:** No manual note-taking, no transcribing recordings afterward, and no juggling multiple windows.
- **Open-Weight Autonomy:** Powered by accessible, auditable, open-weight models (`meta-llama/llama-3.1-8b-instruct`), freeing users from proprietary vendor lock-in.

---

## 🌟 Core Features

- **Multi-Source Audio Capture (Web Audio API):**
  - **Mode A (Microphone Only):** Direct input via `navigator.mediaDevices.getUserMedia()`.
  - **Mode B (Browser Tab Audio):** In-meeting audio capture from Google Meet, Zoom Web, YouTube, or webinars via `getDisplayMedia()`.
  - **Mode C (Microphone + Tab Audio):** Real-time dual-source mixing using `AudioContext`, `createMediaStreamSource`, and `createMediaStreamDestination` without feedback loops.
- **Real-Time Audio Diagnostics & Preview:**
  - Built-in hardware inspector testing permissions, sample rates, active audio channels, and live RMS input volume before recording starts.
- **Continuous Live Transcription:**
  - Streaming audio sent over WebSockets (`/ws/sessions/{id}/transcribe`) with clean, timestamped speaker attribution (`[MIC]`, `[TAB]`, `[COMBINED]`).
- **Autonomous Question Detection:**
  - Intelligent background parsing for direct, rhetorical, and multi-part questions triggered naturally during conversational pauses.
- **Context-Aware Streaming Answers:**
  - Answers are dynamically grounded in previous transcript history and streamed token-by-token directly to markdown cards.
- **Multi-Question Management & "Answer All":**
  - Grouped questions with individual action triggers, inline manual questions, and one-click bulk generation.
- **Rich Markdown Formatting:**
  - Clean rendering for tables, lists, comparisons, and technical answers without unparsed syntax clutter.
- **Persistent Memory & Session History:**
  - Survives browser refreshes, disconnects, and server reboots. Sessions can be resumed seamlessly or exported to structured **Markdown** or **JSON**.

---

## 🏗️ Architecture & Technology Stack

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT (BROWSER)                                 |
|                                                                                   |
|  [ Microphone (getUserMedia) ]         [ Tab Audio (getDisplayMedia) ]            |
|               \                                       /                           |
|                +------> [ Web Audio API Mixer ] <----+                            |
|                                   |                                               |
|                    [ AudioWorklet / ScriptProcessor ]                             |
|                                   |                                               |
|               +-------------------+-------------------+                           |
|               | (PCM / Audio Chunks)                  | (Live Diagnostics)        |
|               v                                       v                           |
|       [ WebSocket Client ]                [ Waveform & RMS Visualizer ]           |
+---------------+---------------------------------------+---------------------------+
                |
                | ws://localhost:8000/ws/sessions/{id}/transcribe
                v
+---------------+-------------------------------------------------------------------+
|                             BACKEND (FASTAPI / PYTHON)                            |
|                                                                                   |
|      [ WebSocket Router ] <-------------------+                                   |
|               |                               |                                   |
|               v                               | (Continuous Transcripts)          |
|      [ Audio Ingestion & STT ]                |                                   |
|      (Lightweight / Faster-Whisper)           |                                   |
|               |                               |                                   |
|               v                               |                                   |
|      [ Question Detector ] -------------------+                                   |
|               |                                                                   |
|               | (Extracted Questions)                                             |
|               v                                                                   |
|      [ Open-Weight AI Provider ] <-----> [ OpenRouter / Backboard AI API ]        |
|      (Meta Llama 3.1 8B Instruct)                                                 |
|               |                                                                   |
|               v                                                                   |
|      [ SQLAlchemy 2.0 ORM ] ----------> [ SQLite / PostgreSQL Database ]          |
+-----------------------------------------------------------------------------------+
```

### Technology Matrix

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons, React Markdown |
| **Backend** | Python 3.11+, FastAPI, WebSockets, Pydantic v2, SQLAlchemy 2.0, Alembic |
| **Database** | SQLite (development), PostgreSQL / Supabase (production) |
| **Audio Processing** | Web Audio API, MediaStreams, AnalyserNode, AudioWorklet, VAD RMS detection |
| **Inference Models** | Meta Llama 3.1 8B Instruct (`meta-llama/llama-3.1-8b-instruct`), Gemma 2, Mistral |
| **Providers** | OpenRouter API, Backboard AI |

---

## 🦙 Open-Weight Llama Model Integration

EchoMind AI is engineered around open-weight architectures, prioritizing **Meta Llama 3.1 8B Instruct**:

1. **Prompt Grounding with Conversation Memory:**  
   When a question is flagged, the backend compiles the surrounding transcript lines, session metadata, and conversation history into a structured prompt, providing high-fidelity contextual answers.
2. **Deterministic & Fast Token Streaming:**  
   Responses stream via server-sent chunks directly into the UI, ensuring users see the first token in under 400ms.
3. **Flexible Inference Providers:**  
   Easily toggle between **OpenRouter** and **Backboard AI** or point the base URL to a local **Ollama** / **vLLM** endpoint without changing frontend code.

---

## 🚀 Local Installation & Setup

### Option A — 1-Click Launch (Windows)

The easiest way to start EchoMind AI on Windows:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/shettysaikumar20/EchoMind-AI.git
   cd EchoMind-AI
   ```
2. **Configure your environment:**
   ```bash
   copy .env.example .env
   copy backend\.env.example backend\.env
   ```
   *Edit `backend/.env` with your API keys (e.g. OpenRouter).*
3. **Launch the application:**
   Double-click `run_echomind.bat` (or execute it from PowerShell/CMD):
   ```cmd
   .\run_echomind.bat
   ```
   *This script sets up Python virtual environments, installs requirements, installs npm modules, runs migrations, and launches both backend (`http://localhost:8000`) and frontend (`http://localhost:5173`).*
4. **To stop both services:**
   ```cmd
   .\stop_echomind.bat
   ```

---

### Option B — Manual Cross-Platform Setup

#### 1. Backend Setup (FastAPI)

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
.\venv\Scripts\activate
# Linux / macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy configuration
cp .env.example .env

# Run database migrations
alembic upgrade head

# Start FastAPI server
uvicorn app.main:app --reload --port 8000
```
*Backend runs at `http://localhost:8000` with interactive API docs at `http://localhost:8000/docs`.*

#### 2. Frontend Setup (React + Vite)

```bash
# In a new terminal window, navigate to frontend
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```
*Frontend runs at `http://localhost:5173` with automatic API and WebSocket proxying.*

---

### Option C — Docker Unified Deployment

```bash
# Build the Docker image
docker build -t echomind-ai .

# Run container with your API key
docker run -p 8000:8000 -e OPENROUTER_API_KEY="your-key-here" echomind-ai
```

---

## ⚙️ Environment Variable Configuration

Configure these variables in your root `.env` or `backend/.env`:

| Variable | Required | Default | Description |
|---|:---:|---|---|
| `PROJECT_NAME` | No | `"EchoMind AI"` | Application title |
| `OPENROUTER_API_KEY` | Optional* | `""` | OpenRouter API Key for Llama 3.1 streaming |
| `BACKBOARD_API_KEY` | Optional* | `""` | Backboard AI API Key (alternative provider) |
| `AI_PROVIDER` | No | `"openrouter"` | Active provider: `openrouter` or `backboard` |
| `AI_MODEL` | No | `"meta-llama/llama-3.1-8b-instruct"` | Model identifier |
| `DATABASE_URL` | No | `"sqlite:///./echomind.db"` | Database connection string (SQLite or PostgreSQL) |
| `SECRET_KEY` | **Yes** (Prod) | `"dev-secret-key-..."` | 32+ character key for JWT token signing |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `10080` (7 days) | JWT session expiration in minutes |
| `STT_MODE` | No | `"lightweight"` | STT pipeline: `lightweight`, `demo`, or `faster-whisper` |

*\*Note: Either `OPENROUTER_API_KEY` or `BACKBOARD_API_KEY` is required for live AI responses. If omitted, the application runs in diagnostic mode and provides guidance on configuring keys.*

---

## 📸 Screenshots & UI Showcase

| Live Workspace & Real-Time Transcripts | Audio Diagnostic & Preview Panel |
|:---:|:---:|
| Dual-source audio mixing with live RMS waveform and instant transcription feed. | Hardware inspector checking mic permissions, sample rate, and active levels. |

| Detected Questions & Streaming AI Answers | Session History & Markdown Export |
|:---:|:---:|
| Grouped question cards with markdown tables, bullet points, and single-click answer generation. | Chronological searchable archives with duration analytics and export options. |

*(Screenshots can be added to `frontend/src/assets/` and linked directly in the documentation).*

---

## ⚠️ Known Limitations & Troubleshooting

### 1. Browser Microphone & Audio Capture Considerations
- **Autoplay / AudioContext Policies:** Modern browsers (Chrome, Edge, Safari) prohibit audio processing until the user performs an explicit gesture on the page. EchoMind AI activates the `AudioContext` on user interaction (e.g., clicking "Start Session" or "Audio Preview").
- **HTTPS / Localhost Requirement:** Web Audio API and `navigator.mediaDevices.getUserMedia()` are strictly restricted to secure contexts (`https://` or `http://localhost`). Access will be denied over unencrypted LAN IP addresses (`http://192.168.x.x`).
- **Sample Rate Mismatches:** Certain USB microphones or Bluetooth headsets default to 48kHz or 44.1kHz. EchoMind AI's internal resampler normalizes audio to 16kHz for speech processing, but Bluetooth headsets in "Hands-Free AG Audio" mode may reduce microphone fidelity.

### 2. Browser Tab Audio Sharing Restrictions
- **Tab Sharing Support:** Capture of tab audio via `getDisplayMedia()` is fully supported in Chromium browsers (Google Chrome, Microsoft Edge, Brave).
- **"Share tab audio" Checkbox:** When selecting a browser tab, you **must check the "Share tab audio" checkbox** in the bottom-left corner of the browser's screen picker modal.
- **Platform Limitations:** macOS and Linux do not permit capturing entire desktop system audio directly via standard Web APIs without third-party virtual audio loopback cables; always choose **Tab Audio** instead of "Entire Screen" for webinar capture.

---

## 🔒 Privacy & Consent Considerations

- **Ephemeral Audio Ingestion:** EchoMind AI does not save raw `.wav` or `.mp3` audio files to disk. Audio chunks are converted into spectrograms and text in memory, then discarded immediately after transcription.
- **Two-Party Consent Compliance:** When recording or transcribing conversations, webinars, or interviews, always ensure you have informed consent from all participants in accordance with local wiretapping and privacy regulations.
- **Local Data Sovereignty:** All transcript records, extracted questions, and answer histories are stored in your own local database (`echomind.db`) or private cloud database. No meeting logs are shared with external parties.

---

## 🧪 Running Automated Tests

EchoMind AI includes an automated test suite validating the entire state machine and API surface:

```bash
cd backend
.\venv\Scripts\pytest.exe -v
```

All 15 test suites cover:
- Audio capture modes (A, B, C)
- Multi-question extraction & noise rejection
- Session recovery after browser refresh
- Cascading session deletion
- Multi-tenant data isolation
- Markdown & JSON session exports

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).  
Created with ❤️ for **Hacktoberfest 2026**.
