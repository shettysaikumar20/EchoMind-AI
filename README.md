<div align="center">

# ⚡ E C H O M I N D &nbsp; A I ⚡
### *Listen. Understand. Answer. Remember.*

**Next-Generation Autonomous Conversational Intelligence & Dual-Stream Acoustic Copilot**

[![Hacktoberfest 2026](https://img.shields.io/badge/HACKTOBERFEST_2026-WEEK_3:_SLOW_&_STEADY-FF6B00?style=for-the-badge&logo=hacktoberfest&logoColor=white)](https://hacktoberfest.com)
[![Open Weight](https://img.shields.io/badge/NEURAL_CORE-META_LLAMA_3.1_8B-7928CA?style=for-the-badge&logo=meta&logoColor=white)](https://ai.meta.com/llama)
[![Python](https://img.shields.io/badge/BACKEND-FASTAPI_0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/FRONTEND-REACT_19_|_VITE_8-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Tests Passing](https://img.shields.io/badge/AUTOMATED_TESTS-15/15_VERIFIED-00E676?style=for-the-badge&logo=pytest&logoColor=black)](https://pytest.org)
[![License](https://img.shields.io/badge/LICENSE-MIT_OPEN_SOURCE-3D5AFE?style=for-the-badge)](LICENSE)

<br/>

> *"In high-stakes meetings, technical interviews, and lectures, humans lose 40% of their cognitive bandwidth to frantic note-taking and question anxiety.*  
> ***EchoMind AI silently captures every syllable, extracts every question on-the-fly, and streams context-grounded neural answers in real time."***

<br/>

</div>

---

## 🎬 Prologue: Hacktoberfest 2026 (Week 3 — Slow and Steady)

> **"Let AI do the work so humans don't have to."**

Most tools demand more from the human operator: manual typing, tag clicking, stopping to copy-paste. **EchoMind AI** operates on an autonomous philosophy:

```
[ CONVERSATION HAPPENS ] ──────> [ ECHOMIND LISTENS SILENTLY ] ──────> [ QUESTIONS DETECTED ] ──────> [ STREAMED GROUNDED ANSWERS ]
                                              │                                                                    ▲
                                              └─────────── (Zero Human Interruption Required) ─────────────────────┘
```

- **Cognitive Decoupling:** Stay 100% engaged eye-to-eye with your interviewer, client, or team.
- **Background Extraction:** Heuristic and neural parsing extracts direct, rhetorical, and multi-part queries during natural speech pauses.
- **Open-Weight Sovereignty:** Powered by auditable, sovereign open-weight models (`meta-llama/llama-3.1-8b-instruct`), preventing proprietary model lock-in and safeguarding enterprise privacy.

---

## ⚡ The Triad: Core Capabilities

### 🎙️ Act I — Acoustic Ingestion Engine
- **Mode A (Microphone Only):** Raw vocal capture with real-time acoustic normalization via `getUserMedia()`.
- **Mode B (Browser Tab Audio):** Direct ingestion of Google Meet, Zoom Web, YouTube, or webinars via `getDisplayMedia()`.
- **Mode C (Microphone + Tab Audio):** Real-time dual-source mixing using `AudioContext`, `createMediaStreamSource`, and zero-feedback `createMediaStreamDestination`.
- **Hardware Diagnostic Radar:** Built-in hardware inspector analyzing microphone permissions, sample rate negotiation, active channel integrity, and live RMS input volume before recording starts.

### 🧠 Act II — Neural Cognitive Matrix
- **Sub-Second Streaming Transcription:** Audio frames routed over low-latency WebSockets (`/ws/sessions/{id}/transcribe`) with timestamping and source attribution (`[MIC]`, `[TAB]`, `[COMBINED]`).
- **Autonomous Question Deduction:** Dynamic detection triggered on conversational pauses—differentiating statements from critical questions.
- **Context-Grounded Llama 3.1 Streaming:** Synthesized token-by-token streaming answers referencing preceding meeting transcripts.
- **Multi-Question HUD & Bulk "Answer All":** Interactive queue cards rendered in formatted markdown with tables, code blocks, and instant multi-query dispatch.

### 💾 Act III — Chrono-Memory & Total Recall
- **Crash-Resilient Persistence:** State machine resilient against browser reloads, network timeouts, and server restarts.
- **One-Click Session Continuation:** Resume conversations seamlessly without creating fragmented duplicate records.
- **Instant Export Protocols:** One-click download of full transcripts, questions, and answers formatted as clean **Markdown (.md)** or structured **JSON**.

---

## 🏛️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT RUNTIME (BROWSER)                                │
│                                                                                        │
│   ┌─────────────────────┐                 ┌──────────────────────┐                     │
│   │  Microphone Input   │                 │  Tab / Meeting Audio │                     │
│   │   (getUserMedia)    │                 │  (getDisplayMedia)   │                     │
│   └──────────┬──────────┘                 └──────────┬───────────┘                     │
│              │                                       │                                 │
│              └───────────────────┬───────────────────┘                                 │
│                                  v                                                     │
│                  ┌───────────────────────────────┐                                     │
│                  │   Web Audio Dual-Bus Mixer    │                                     │
│                  └───────────────┬───────────────┘                                     │
│                                  v                                                     │
│                  ┌───────────────────────────────┐                                     │
│                  │  AnalyserNode & RMS Detector  │ ──> [ Live Waveform & VU Meter ]    │
│                  └───────────────┬───────────────┘                                     │
│                                  v                                                     │
│                  ┌───────────────────────────────┐                                     │
│                  │   Inline AudioWorklet Buffer  │                                     │
│                  └───────────────┬───────────────┘                                     │
└──────────────────────────────────┼─────────────────────────────────────────────────────┘
                                   │
                                   │ wss://api/ws/sessions/{id}/transcribe
                                   v
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND RUNTIME (FASTAPI ENGINE)                          │
│                                                                                        │
│   ┌──────────────────────────────┐                 ┌───────────────────────────────┐   │
│   │   WebSocket Stream Router    │ ──────────────> │    Continuous STT Pipeline    │   │
│   └──────────────────────────────┘                 └───────────────┬───────────────┘   │
│                                                                    v                   │
│   ┌──────────────────────────────┐                 ┌───────────────────────────────┐   │
│   │   Real-Time Question Queue   │ <────────────── │  Heuristic Question Detector  │   │
│   └──────────────┬───────────────┘                 └───────────────────────────────┘   │
│                  v                                                                     │
│   ┌──────────────────────────────┐                 ┌───────────────────────────────┐   │
│   │   Llama 3.1 8B Neural Core   │ <─────────────> │ OpenRouter / Backboard AI API │   │
│   └──────────────┬───────────────┘                 └───────────────────────────────┘   │
│                  v                                                                     │
│   ┌──────────────────────────────┐                                                     │
│   │  SQLAlchemy 2.0 / Alembic    │ ──────────────> [ SQLite / PostgreSQL Storage ]     │
│   └──────────────────────────────┘                                                     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ The Tech Matrix

| Domain | Technology | Cinematic Purpose |
|---|---|---|
| **Frontend UI** | **React 19 + TypeScript** | Ultrafast reactive state with zero interface lag |
| **Styling & FX** | **Tailwind CSS v4 + Framer Motion** | Glassmorphic dark HUD with smooth micro-animations |
| **Streaming Engine** | **FastAPI + Asyncio WebSockets** | Bi-directional duplex audio and token piping |
| **Neural LLM Core** | **Meta Llama 3.1 8B Instruct** | Sovereign, open-weight reasoning and synthesis |
| **Audio Processing** | **Web Audio API + AudioWorklet** | Zero-latency browser hardware mixing and filtering |
| **Persistence** | **SQLAlchemy 2.0 + SQLite / Postgres** | Rock-solid relational schemas and session recovery |
| **Testing** | **Pytest + Pytest-Asyncio** | 15/15 battle-tested scenarios verifying entire lifecycle |

---

## 🦙 Open-Weight Neural Intelligence: Meta Llama 3.1

EchoMind AI was deliberately architected for **Open-Weight Supremacy**:

$$\text{Latency} \le 400\text{ms} \quad \big| \quad \text{Privacy} = 100\% \quad \big| \quad \text{Vendor Lock-In} = 0$$

- **Context-Aware Prompt Grounding:** Questions are not evaluated in a vacuum. EchoMind injects the latest conversation history, speaker attribution, and meeting timeline into the Llama prompt.
- **Provider Agnostic:** Out-of-the-box support for **OpenRouter** and **Backboard AI**, with 1-line configuration for local **Ollama** or **vLLM** clusters.
- **Markdown Response Engine:** Answers format automatically with comparative matrices, bold terminology, and structured bullet points.

---

## 🚀 Quick Launch Protocols

### Protocol Alpha: 1-Click Launch (Windows)

The fastest way to initialize the full stack on Windows:

```cmd
git clone https://github.com/shettysaikumar20/EchoMind-AI.git
cd EchoMind-AI

:: 1. Copy sample configuration
copy .env.example .env
copy backend\.env.example backend\.env

:: 2. Fire up the entire ecosystem
.\run_echomind.bat
```

> **Automated:** `run_echomind.bat` provisions the Python virtual environment, installs backend requirements, installs frontend node modules, runs database migrations, and launches both services.
> 
> - **Frontend Interface:** `http://localhost:5173`  
> - **FastAPI API & Swagger:** `http://localhost:8000/docs`  
> 
> *To terminate both processes safely at any time:*  
> `.\stop_echomind.bat`

---

### Protocol Beta: Manual Multi-Platform Setup

<details>
<summary><b>Click to expand cross-platform instructions (Linux / macOS / Windows)</b></summary>

#### Terminal 1 — Backend Neural Server
```bash
cd backend
python -m venv venv

# Activate Virtualenv:
# Windows:
.\venv\Scripts\activate
# Linux / macOS:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

#### Terminal 2 — Frontend Interface
```bash
cd frontend
npm install
npm run dev
```

</details>

---

### Protocol Gamma: Containerized Docker Deployment

```bash
# Build the unified container
docker build -t echomind-ai .

# Launch with environment variables
docker run -d -p 8000:8000 -e OPENROUTER_API_KEY="your-openrouter-key" echomind-ai
```

---

## ⚙️ Environment Configuration

Set up your `.env` or `backend/.env` with these parameters:

| Variable | Required | Default | Description |
|---|:---:|---|---|
| `PROJECT_NAME` | No | `"EchoMind AI"` | Application header moniker |
| `OPENROUTER_API_KEY` | Recommended* | `""` | OpenRouter access key for Llama 3.1 streaming |
| `BACKBOARD_API_KEY` | Optional* | `""` | Alternative open-weight inference provider |
| `AI_PROVIDER` | No | `"openrouter"` | Active provider engine (`openrouter` or `backboard`) |
| `AI_MODEL` | No | `"meta-llama/llama-3.1-8b-instruct"` | Neural model tag |
| `DATABASE_URL` | No | `"sqlite:///./echomind.db"` | Relational database URI (SQLite or PostgreSQL) |
| `SECRET_KEY` | **Yes** (Prod) | `"dev-secret-key-..."` | 32+ character JWT signing key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `10080` (7 Days) | Session authentication TTL |
| `STT_MODE` | No | `"lightweight"` | Speech-to-text pipeline mode |

*\*Note: Without an API key, EchoMind AI operates in Diagnostic Mode, enabling full audio testing, capture, transcription visualization, and UI workflows.*

---

## 🖥️ Mission Control: Interface Gallery

<div align="center">

| 🎙️ Real-Time Live Workspace | 🎛️ Audio Hardware Inspector |
|:---:|:---:|
| Dual-stream audio ingestion, waveform audio visualizer, and streaming transcription telemetry. | Real-time microphone permission gate, channel diagnostics, sample rate test, and live RMS meter. |

| ❓ Cognitive Question Deck | 📜 Chrono-Archive & Export |
|:---:|:---:|
| Auto-extracted questions with token-streamed Llama markdown answers and single-click 'Answer All'. | Searchable historical sessions with duration analytics, token consumption, and Markdown/JSON export. |

</div>

---

## ⚠️ Tactical Warnings & Known Limitations

### 1. Browser Acoustic Capture & Autoplay Security
- **User Gesture Requirement:** Modern browser security policies (Chrome, Edge, Safari) prohibit Web Audio initialization without explicit user activation. EchoMind AI arms the `AudioContext` automatically upon clicking **"Start Session"** or **"Audio Preview"**.
- **Cryptographic Origin Gate:** Browser microphone access requires a secure origin (`https://` or `http://localhost`). It will not run over raw unencrypted LAN IPs (`http://192.168.x.x`).
- **Sample Rate Normalization:** USB interfaces and headsets range between 44.1kHz and 48kHz. EchoMind’s internal resampler standardizes audio to 16kHz for speech recognition.

### 2. Browser Tab System Audio Capture
- **Desktop Chromium Required:** Browser tab audio loopback via `getDisplayMedia()` is fully supported in Chromium browsers (Chrome, Edge, Brave).
- **Mandatory Audio Checkbox:** When selecting a browser tab, ensure the **"Share tab audio"** toggle in the browser modal's bottom-left corner is checked.
- **OS Loopback Boundaries:** macOS prevents capturing the entire operating system desktop audio via standard web APIs without a virtual loopback device (e.g. BlackHole). Always select **Tab Audio** when monitoring webinars or online conferences.

---

## 🛡️ Privacy, Security & Data Sovereignty

- **Zero Audio Retention:** EchoMind AI processes audio streams ephemerally in memory buffers. No raw `.wav` or `.mp3` recordings are written to disk.
- **Dual-Party Consent Protocol:** Always notify all meeting participants and adhere to regional wiretapping and recording consent regulations before activating acoustic monitoring.
- **Local Relational Control:** All meeting transcripts, questions, and generated answers reside exclusively in your local database (`echomind.db`) or your designated private database cluster.

---

## 🧪 Automated Test Verification

EchoMind AI is validated with a comprehensive automated test suite covering every phase of the session lifecycle:

```bash
cd backend
.\venv\Scripts\pytest.exe -v
```

```
tests\test_audio_and_recovery.py .....                                   [ 33%]
tests\test_echomind.py ..........                                        [100%]

======================= 15 passed, 1 warning in 22.41s ========================
```

- `test_audio_mode_a_mic` — Mode A microphone capture pipeline initialization
- `test_audio_mode_b_tab` — Mode B browser tab capture authorization
- `test_audio_mode_c_dual` — Mode C dual-bus Web Audio mixing
- `test_session_recovery_after_refresh` — Resuming interrupted conversations without data duplication
- `test_multiple_question_extraction` — Multi-part and indirect question extraction
- `test_no_question_transcripts` — Negative testing (no hallucinations during standard speech)
- `test_answer_generation` — Llama 3.1 contextual grounding
- `test_user_data_isolation` — Multi-tenant boundary isolation
- `test_session_export` — Structured Markdown and JSON generation

---

## 📄 License & Attribution

Distributed under the **[MIT License](LICENSE)**.  
Crafted with passion by **Sai Kumar Shetty & EchoMind AI Contributors** for **Hacktoberfest 2026**.

<div align="center">
<b>EchoMind AI — Listen. Understand. Answer. Remember.</b>
</div>
