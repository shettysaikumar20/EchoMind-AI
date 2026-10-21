# EchoMind AI 🎙️🧠

> **Tagline:** Listen. Understand. Answer. Remember.  
> **Hacktoberfest 2026 Week 3 Challenge:** *Slow and Steady — Let AI do the work so humans don't have to.*

[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.13-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Tests](https://img.shields.io/badge/Tests-15%20Passing-10B981?logo=pytest&logoColor=white)](https://pytest.org)

EchoMind AI is a production-oriented real-time AI conversation assistant. It captures microphone and browser-tab audio simultaneously, transcribes speech continuously with sub-second latency, automatically detects asked questions, and generates immediate context-grounded AI answers powered by open-weight language models with permanent conversation memory.

---

## 🌟 Core Features

- **Multi-Source Audio Capture (Web Audio API):**
  - **Mode A (Microphone Only):** Direct input via `getUserMedia()`.
  - **Mode B (Browser Tab / Media Audio):** Capture system webinars, video calls, or videos via `getDisplayMedia()`.
  - **Mode C (Microphone + Tab Audio):** Real-time dual-source mixing using `AudioContext`, `createMediaStreamSource`, and `createMediaStreamDestination` without acoustic feedback.
- **Continuous Live Transcription:** Real-time speech stream synchronized over WebSockets (`/ws/sessions/{id}/transcribe`) with timestamps and source labeling (`[MIC]`, `[TAB]`, `[COMBINED]`).
- **Intelligent Question Detection:** Automatic identification of direct, indirect, and multi-part questions triggered on **Pause** using open-weight models or local heuristic deduction.
- **Context-Aware Streaming Answers:** Immediate token-streamed answers utilizing full conversation history and transcript memory.
- **Provider Flexibility:**
  - **OpenRouter:** Fast streaming across Meta Llama 3.1 (8B & 70B), Google Gemma 2 (9B), and Mistral 7B.
  - **Backboard AI:** Enterprise-grade hosted open-weight instances.
- **Permanent Conversation Memory:**
  - Conversations survive page refreshes, browser restarts, and server reboots.
  - One-click session continuation without creating duplicate records.
  - Export full sessions to clean **Markdown (.md)** or structured **JSON**.
- **Data Privacy & Governance:** Ephemeral audio processing without storing raw audio recordings indefinitely; user data strictly isolated.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, Framer Motion, TanStack Query, React Router |
| **Backend** | Python 3.11+, FastAPI, WebSockets, Pydantic v2, SQLAlchemy 2.0, Alembic, HTTPX |
| **Database** | SQLite (development fallback), PostgreSQL / Supabase (production) |
| **AI Providers** | OpenRouter API & Backboard AI API (Meta Llama 3.1, Google Gemma 2, Mistral) |
| **Audio Processing** | Web Audio API, MediaStreams, AnalyserNode, ScriptProcessor, VAD RMS computation |
| **Deployment** | Render (`render.yaml`), Multi-Stage Dockerfile |

---

## 📐 Audio Capture Pipeline

```
[ Microphone (getUserMedia) ] ----\
                                  +--> [ Web Audio API Mixer ] ---> [ AnalyserNode & RMS VAD ] ---> [ WebSocket Stream ]
[ Browser Tab (getDisplayMedia) ] -/                                                                          |
                                                                                                              v
[ Live UI Waveform & Transcripts ] <--- [ Saved DB Segments ] <--- [ Continuous Speech Recognition ] <--------+
```

### Browser Tab Audio Sharing Guidance
When selecting **Mode B** or **Mode C** in Chrome or Microsoft Edge:
1. When prompted by the browser sharing dialog, select the **Chrome/Edge Tab** tab.
2. Ensure the checkbox labeled **"Share tab audio"** in the lower left corner is checked.
3. EchoMind AI will automatically capture and mix the audio. If tab sharing is stopped by the user, the app gracefully pauses and releases hardware resources.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm

### 1. Clone & Set Up Backend

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env from template
cp .env.example .env

# Run FastAPI backend server (Port 8000)
uvicorn app.main:app --reload --port 8000
```
Backend will be live at `http://localhost:8000` with interactive Swagger docs at `http://localhost:8000/docs`.

### 2. Set Up Frontend

```bash
# In another terminal window:
cd frontend

# Install packages
npm install

# Start Vite development server with proxy to backend
npm run dev
```
Frontend will be live at `http://localhost:5173`.

---

## 🧪 Automated Testing

### Backend Unit & Integration Tests (15 Passing Tests)
Run the full test suite covering audio modes, question extraction, state machines, isolation, and session recovery:

```bash
cd backend
.\venv\Scripts\pytest.exe -v
```

Test suite validates:
1. `test_audio_mode_a_mic` — Mode A microphone capture session setup.
2. `test_audio_mode_b_tab` — Mode B browser tab audio permissions and state.
3. `test_audio_mode_c_dual` — Mode C dual-source Web Audio mixing.
4. `test_session_recovery_after_refresh` — Resuming interrupted sessions without duplicates.
5. `test_delete_session_cascading` — Clean deletion of transcripts, questions, and answers.
6. `test_health_endpoint` — Health check and database connectivity.
7. `test_session_lifecycle` — Complete IDLE -> RECORDING -> PAUSED -> RESUME -> STOPPED state machine.
8. `test_multiple_question_extraction` — Extraction of multiple and indirect questions from transcripts.
9. `test_no_question_transcripts` — Verifying no questions are hallucinated in normal conversations.
10. `test_openrouter_missing_credentials` & `test_backboard_missing_credentials` — Graceful error reporting for missing API keys.
11. `test_answer_generation` — AI answers with contextual grounding.
12. `test_user_data_isolation` — Strict multi-tenant session boundary enforcement.
13. `test_session_export` — Markdown and JSON export endpoints.

### Frontend Production Build
```bash
cd frontend
npm run build
```

---

## 🌐 Deploy to Render

EchoMind AI includes a ready-to-deploy `render.yaml` blueprint:

1. Push your repository to GitHub.
2. In [Render Dashboard](https://dashboard.render.com), click **New +** -> **Blueprint**.
3. Select your repository. Render will automatically detect `render.yaml` and configure:
   - Python Web Service with WebSocket support for the FastAPI backend.
   - Static Web Service with single-page app rewrite rules for the React frontend.
4. Add your `OPENROUTER_API_KEY` or `BACKBOARD_API_KEY` and `DATABASE_URL` in the Render environment settings.

---

## 🐳 Docker Deployment

Build and run the entire unified stack via Docker:

```bash
docker build -t echomind-ai .
docker run -p 8000:8000 -e OPENROUTER_API_KEY="your-key" echomind-ai
```

---

## 💡 Hacktoberfest 2026: Why Open-Weight AI?

In adherence to the **Week 3 "Slow and Steady"** ethos:
- **No Vendor Lock-in:** Open-weight models like Meta's Llama 3.1 and Google's Gemma 2 can be audited, fine-tuned, and hosted locally or in hybrid multi-cloud environments.
- **Privacy Assurance:** Critical enterprise conversations and meeting audio should not be used to train external proprietary models without explicit consent.
- **Deterministic Latency:** Open-weight architectures provide reproducible inference latency, essential for real-time question detection while audio is actively streaming.

---

## 📜 License
MIT License. Created for Hacktoberfest 2026.
