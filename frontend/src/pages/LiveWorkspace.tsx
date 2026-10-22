import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useLiveTranscription } from '../hooks/useLiveTranscription';
import { api } from '../services/api';
import { Session, DetectedQuestion, CaptureMode } from '../types';
import { WaveformVisualizer } from '../components/WaveformVisualizer';
import { Timer } from '../components/Timer';
import { AudioSourceSelector } from '../components/AudioSourceSelector';
import { TranscriptFeed } from '../components/TranscriptFeed';
import { QuestionCard } from '../components/QuestionCard';
import { AudioPreviewModal } from '../components/AudioPreviewModal';
import { AudioDiagnosticPanel } from '../components/AudioDiagnosticPanel';
import {
  Play,
  Pause,
  Square,
  Sparkles,
  Bot,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  FileText,
  Download,
  Headphones,
  Sliders,
  Volume2,
  Activity,
} from 'lucide-react';

export const LiveWorkspace: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlSessionId = searchParams.get('sessionId');

  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [detectedQuestions, setDetectedQuestions] = useState<DetectedQuestion[]>([]);
  const [isDetectingQuestions, setIsDetectingQuestions] = useState<boolean>(false);
  const [activeGeneratingQId, setActiveGeneratingQId] = useState<string | null>(null);
  const [streamingAnswerText, setStreamingAnswerText] = useState<string>('');
  const [streamingLatency, setStreamingLatency] = useState<number | undefined>(undefined);
  const [notification, setNotification] = useState<string | null>(null);
  const [activeModelName, setActiveModelName] = useState<string>('Llama 3.1 8B (OpenRouter)');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);

  const audioDataHandlerRef = useRef<((buf: ArrayBuffer) => void) | null>(null);

  // Audio capture hook
  const {
    recordingState,
    captureMode,
    audioLevel,
    frequencyData,
    errorMessage,
    isMonitoring,
    testClipUrl,
    isRecordingTestClip,
    audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    diagnostics,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetToIdle,
    setCaptureMode,
    toggleAudioMonitoring,
    startAudioPreview,
    recordTestClip,
    resumeAudioContext,
  } = useAudioCapture({
    onAudioData: (buffer) => audioDataHandlerRef.current?.(buffer),
    onError: (err) => showToast(`Audio Error: ${err}`),
    onTabEnded: () => showToast('Tab screen-sharing stopped by user.'),
  });

  const [manualQuestionText, setManualQuestionText] = useState<string>('');
  const [showLiveDiagnostics, setShowLiveDiagnostics] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Live transcription hook
  const {
    transcripts,
    interimText,
    searchQuery,
    setSearchQuery,
    setTranscripts,
    updateSegmentText,
    sendAudioChunk,
    flushAudio,
    networkDiagnostics,
  } = useLiveTranscription({
    sessionId: activeSession?.id || null,
    captureMode,
    isRecording: recordingState === 'RECORDING',
  });

  audioDataHandlerRef.current = sendAudioChunk;

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4500);
  };

  // Recover or load existing session from URL query
  useEffect(() => {
    if (urlSessionId) {
      api
        .getSession(urlSessionId)
        .then((s) => {
          setActiveSession(s);
          if (s.transcripts) setTranscripts(s.transcripts);
          if (s.questions) setDetectedQuestions(s.questions);
          if (s.capture_mode) setCaptureMode(s.capture_mode);
          showToast(`Resumed session: ${s.title}`);
        })
        .catch((err) => {
          console.error('Failed to load session:', err);
        });
    }
  }, [urlSessionId, setTranscripts, setCaptureMode]);

  // Load active model setting
  useEffect(() => {
    api
      .getSettings()
      .then((set) => {
        setActiveModelName(
          `${set.ai_model.split('/').pop()} (${set.ai_provider === 'backboard' ? 'Backboard' : 'OpenRouter'})`
        );
      })
      .catch(() => {});
  }, []);

  // Safe merge helper to prevent questions from ever disappearing
  const mergeFreshQuestions = (freshQuestions: DetectedQuestion[]) => {
    setDetectedQuestions((prev) => {
      const freshMap = new Map(freshQuestions.map((item) => [item.id, item]));
      const freshTextMap = new Map(
        freshQuestions.map((item) => [item.question_text.toLowerCase().trim(), item])
      );

      // 1. Update existing items in-place with freshly saved answers
      const merged = prev.map((oldQ) => {
        const match = freshMap.get(oldQ.id) || freshTextMap.get(oldQ.question_text.toLowerCase().trim());
        return match || oldQ;
      });

      // 2. Append any newly saved DB questions that weren't in state
      for (const dbQ of freshQuestions) {
        const exists = prev.some(
          (p) =>
            p.id === dbQ.id ||
            p.question_text.toLowerCase().trim() === dbQ.question_text.toLowerCase().trim()
        );
        if (!exists) {
          merged.push(dbQ);
        }
      }
      return merged;
    });
  };

  // Question detection runner
  const triggerQuestionDetection = async (targetSessionId?: string) => {
    const sId = targetSessionId || activeSession?.id;
    if (!sId) {
      showToast('Please start listening or select a session first.');
      return;
    }

    flushAudio();
    setIsDetectingQuestions(true);
    showToast('Analyzing conversation transcript for questions...');

    try {
      const result = await api.detectQuestions(sId);
      if (result.questions && result.questions.length > 0) {
        setDetectedQuestions((prev) => {
          const existing = new Set(prev.map((q) => q.question_text.toLowerCase().trim()));
          const newItems = result.questions.filter(
            (q) => !existing.has(q.question_text.toLowerCase().trim())
          );
          return [...prev, ...newItems];
        });
        showToast(`Detected ${result.questions.length} question(s)! Formulating answers...`);

        // Automatically trigger answers sequentially for all newly detected questions
        for (const q of result.questions) {
          await new Promise<void>((resolve) => {
            setActiveGeneratingQId(q.id);
            setStreamingAnswerText('');
            setStreamingLatency(undefined);

            api.streamAnswer(
              sId,
              {
                session_id: sId,
                question_id: q.id,
                question_text: q.question_text,
                context: q.context_snippet,
              },
              {
                onToken: (tok: string) => {
                  setStreamingAnswerText((prev) => prev + tok);
                },
                onComplete: (meta: { answer_id?: string; latency_ms?: number }) => {
                  setActiveGeneratingQId(null);
                  setStreamingLatency(meta.latency_ms);
                  api.getSession(sId).then((fresh) => {
                    if (fresh.questions) mergeFreshQuestions(fresh.questions);
                    resolve();
                  }).catch(() => resolve());
                },
                onError: () => {
                  setActiveGeneratingQId(null);
                  resolve();
                },
              }
            );
          });
        }
      } else {
        if (transcripts.length === 0) {
          showToast('No speech detected yet. Speak into your microphone or play tab audio.');
        } else {
          showToast('No questions detected in current transcript. Try asking a question like "What is...?"');
        }
      }
    } catch (err: any) {
      showToast(`Question detection error: ${err.message}`);
    } finally {
      setIsDetectingQuestions(false);
    }
  };

  // Answer all pending or detected questions
  const handleAnswerAllQuestions = async () => {
    if (!activeSession) return;
    const unanswered = detectedQuestions.filter((q) => !q.answers || q.answers.length === 0);
    const targetQuestions = unanswered.length > 0 ? unanswered : detectedQuestions;

    if (targetQuestions.length === 0) {
      showToast('No questions available to answer.');
      return;
    }

    showToast(`Generating answers for ${targetQuestions.length} question(s)...`);
    for (const q of targetQuestions) {
      await new Promise<void>((resolve) => {
        setActiveGeneratingQId(q.id);
        setStreamingAnswerText('');
        setStreamingLatency(undefined);

        api.streamAnswer(
          activeSession.id,
          {
            session_id: activeSession.id,
            question_id: q.id,
            question_text: q.question_text,
            context: q.context_snippet,
          },
          {
            onToken: (tok: string) => {
              setStreamingAnswerText((prev) => prev + tok);
            },
            onComplete: (meta: { answer_id?: string; latency_ms?: number }) => {
              setActiveGeneratingQId(null);
              setStreamingLatency(meta.latency_ms);
              api.getSession(activeSession.id).then((fresh) => {
                if (fresh.questions) mergeFreshQuestions(fresh.questions);
                resolve();
              }).catch(() => resolve());
            },
            onError: (err: string) => {
              setActiveGeneratingQId(null);
              showToast(`Answer Error: ${err}`);
              resolve();
            },
          }
        );
      });
    }
  };

  // --- Handlers: Start / Pause / Resume / Stop ---

  // 1. START
  const handleStart = async (modeToUse: CaptureMode = captureMode) => {
    resumeAudioContext();
    let session = activeSession;
    if (!session) {
      try {
        session = await api.createSession('Live Conversation', modeToUse);
        setActiveSession(session);
      } catch (err: any) {
        showToast(`Failed to create session: ${err.message}`);
        return;
      }
    }

    const ok = await startRecording(modeToUse);
    if (ok) {
      await api.updateSession(session.id, { status: 'recording' });
      showToast('Listening active! Speak clearly into your microphone.');
    }
  };

  // 2. PAUSE & QUESTION DETECTION
  const handlePause = async () => {
    pauseRecording();
    flushAudio();
    if (!activeSession) return;

    await api.updateSession(activeSession.id, { status: 'paused', duration_seconds: elapsedSeconds });
    showToast('Paused recording. Analyzing transcript...');

    setTimeout(() => {
      triggerQuestionDetection(activeSession.id);
    }, 500);
  };

  // 3. RESUME
  const handleResume = async () => {
    resumeRecording();
    if (activeSession) {
      await api.updateSession(activeSession.id, { status: 'recording' });
      showToast('Resumed listening.');
    }
  };

  // 4. STOP & SAVE
  const handleStop = async () => {
    stopRecording();
    flushAudio();
    if (activeSession) {
      await api.updateSession(activeSession.id, { status: 'completed', duration_seconds: elapsedSeconds });
      showToast('Session stopped and saved to history.');
    }
  };

  // 5. GENERATE AI ANSWER
  const handleGenerateAnswer = async (q: DetectedQuestion) => {
    if (!activeSession) return;
    setActiveGeneratingQId(q.id);
    setStreamingAnswerText('');
    setStreamingLatency(undefined);

    await api.streamAnswer(
      activeSession.id,
      {
        session_id: activeSession.id,
        question_id: q.id,
        question_text: q.question_text,
        context: q.context_snippet,
      },
      {
        onToken: (tok: string) => {
          setStreamingAnswerText((prev) => prev + tok);
        },
        onComplete: (meta: { answer_id?: string; latency_ms?: number }) => {
          setActiveGeneratingQId(null);
          setStreamingLatency(meta.latency_ms);
          // Safely refresh session to get updated persisted answers without dropping questions
          api.getSession(activeSession.id).then((fresh) => {
            if (fresh.questions) mergeFreshQuestions(fresh.questions);
          });
        },
        onError: (err: string) => {
          setActiveGeneratingQId(null);
          showToast(`Answer Error: ${err}`);
        },
      }
    );
  };

  // 6. DEMO MODE SAMPLE INJECTOR
  const handleInjectSample = async () => {
    let session = activeSession;
    if (!session) {
      session = await api.createSession('Demo Technical Architecture Review', captureMode);
      setActiveSession(session);
    }

    const sample1 = {
      source: 'mic',
      text: 'Can you explain REST APIs? Also, what is the difference between authentication and authorization?',
      is_final: true,
      start_time: 0.0,
      end_time: 5.2,
    };

    const saved1 = await api.appendTranscript(session.id, sample1);
    setTranscripts((prev) => [...prev, saved1]);
    showToast('Sample discussion injected. Detecting questions now...');
    setTimeout(() => {
      triggerQuestionDetection(session!.id);
    }, 400);
  };

  // 6b. ADD MANUAL QUESTION OR NOTE
  const handleAddManualQuestion = async () => {
    const text = manualQuestionText.trim();
    if (!text) return;

    let session = activeSession;
    if (!session) {
      try {
        session = await api.createSession('Live Conversation', captureMode);
        setActiveSession(session);
      } catch (err: any) {
        showToast(`Failed to create session: ${err.message}`);
        return;
      }
    }

    const newSeg = {
      source: 'mic',
      text,
      is_final: true,
      start_time: 0.0,
      end_time: 2.0,
    };

    const saved = await api.appendTranscript(session.id, newSeg);
    setTranscripts((prev) => [...prev, saved]);
    setManualQuestionText('');
    showToast('Question added to transcript! Detecting and answering now...');

    setTimeout(() => {
      triggerQuestionDetection(session!.id);
    }, 300);
  };

  // 7. EXPORT MARKDOWN
  const handleExport = async () => {
    if (!activeSession) return;
    const blob = await api.exportSession(activeSession.id, 'markdown');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `echomind_${activeSession.title.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Session exported to Markdown!');
  };

  const isRecording = recordingState === 'RECORDING';
  const isPaused = recordingState === 'PAUSED';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast Notification Banner */}
      {notification && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-300 text-xs shadow-2xl animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* Audio Preview Modal */}
      <AudioPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        onStartSession={(mode) => {
          setIsPreviewModalOpen(false);
          handleStart(mode);
        }}
        captureMode={captureMode}
        setCaptureMode={setCaptureMode}
        audioLevel={audioLevel}
        frequencyData={frequencyData}
        isMonitoring={isMonitoring}
        toggleAudioMonitoring={toggleAudioMonitoring}
        startAudioPreview={startAudioPreview}
        recordTestClip={recordTestClip}
        testClipUrl={testClipUrl}
        isRecordingTestClip={isRecordingTestClip}
        audioDevices={audioDevices}
        selectedDeviceId={selectedDeviceId}
        setSelectedDeviceId={setSelectedDeviceId}
        diagnostics={diagnostics}
        networkDiagnostics={networkDiagnostics}
      />

      {/* Header & Controls Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-md">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-bold text-white font-['Outfit']">
              {activeSession?.title || 'Live Listening Workspace'}
            </h2>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Bot className="w-3.5 h-3.5" />
              {activeModelName}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Workflow: <strong>Preview Audio → Listen → Detect Questions → Instant Answers</strong>
          </p>
        </div>

        {/* Primary Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          <Timer
            recordingState={recordingState}
            initialSeconds={activeSession?.duration_seconds || 0}
            onTimeUpdate={setElapsedSeconds}
          />

          {/* AUDIO PREVIEW BUTTON */}
          <button
            onClick={() => setIsPreviewModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-all cursor-pointer"
            title="Preview and test microphone volume and clarity"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Preview Audio</span>
          </button>

          {/* LIVE DIAGNOSTICS TOGGLE */}
          <button
            onClick={() => setShowLiveDiagnostics((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              showLiveDiagnostics
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Toggle Live Audio & WebSocket Diagnostic Panel"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{showLiveDiagnostics ? 'Hide Diagnostics' : 'Diagnostics'}</span>
          </button>

          {/* START / PAUSE / RESUME */}
          {!isRecording && !isPaused ? (
            <button
              onClick={() => handleStart()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              Start Listening
            </button>
          ) : isRecording ? (
            <button
              onClick={handlePause}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
            >
              <Pause className="w-4 h-4 fill-slate-950" />
              Pause & Detect Questions
            </button>
          ) : (
            <button
              onClick={handleResume}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              Resume Listening
            </button>
          )}

          {/* DETECT QUESTIONS BUTTON (Can be pressed anytime!) */}
          {(isRecording || isPaused || transcripts.length > 0) && (
            <button
              onClick={() => triggerQuestionDetection()}
              disabled={isDetectingQuestions}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 font-semibold text-xs transition-colors cursor-pointer"
              title="Detect questions immediately from transcript"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isDetectingQuestions ? 'animate-spin' : ''}`} />
              <span>{isDetectingQuestions ? 'Detecting...' : 'Detect Questions'}</span>
            </button>
          )}

          {/* STOP */}
          {(isRecording || isPaused) && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-semibold text-xs transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-rose-300" />
              Stop & Save
            </button>
          )}

          {/* EXPORT */}
          {activeSession && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors cursor-pointer"
              title="Export session to Markdown"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Audio Error Banner */}
      {errorMessage && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Live Speaking Feedback Banner */}
      {isRecording && (
        <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-emerald-300 font-medium">
              {audioLevel > 0.04 ? 'Voice detected — transcribing speech...' : 'Microphone active — speak to ask questions.'}
            </span>
            {interimText && (
              <span className="italic text-emerald-200/90 bg-emerald-900/40 px-2 py-0.5 rounded-md">
                "{interimText}"
              </span>
            )}
          </div>

          {/* Quick Audio Monitor Toggle */}
          <button
            onClick={() => toggleAudioMonitoring()}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              isMonitoring ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Headphones className="w-3 h-3" />
            <span>{isMonitoring ? 'Monitoring ON' : 'Hear Myself'}</span>
          </button>
        </div>
      )}

      {/* Audio Source Selector */}
      <AudioSourceSelector
        selectedMode={captureMode}
        onSelectMode={setCaptureMode}
        recordingState={recordingState}
      />

      {/* Audio Waveform */}
      <WaveformVisualizer
        frequencyData={frequencyData}
        recordingState={recordingState}
        audioLevel={audioLevel}
      />

      {/* Live Audio & WebSocket Diagnostic Panel (toggleable from header) */}
      {showLiveDiagnostics && (
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-emerald-500/30">
          <AudioDiagnosticPanel
            audioDiagnostics={diagnostics}
            networkDiagnostics={networkDiagnostics}
          />
        </div>
      )}

      {/* Main Grid: Left = Live Transcript | Right = Detected Questions & Answers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Transcript Feed */}
        <div className="lg:col-span-6 space-y-3">
          <TranscriptFeed
            transcripts={transcripts}
            interimText={interimText}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onUpdateSegment={updateSegmentText}
            onAskAiFromSegment={async (text) => {
              let session = activeSession;
              if (!session) {
                try {
                  session = await api.createSession('Live Conversation', captureMode);
                  setActiveSession(session);
                } catch {
                  return;
                }
              }
              const cleanQ = text.trim().endsWith('?') ? text.trim() : text.trim() + '?';
              try {
                const savedQ = await api.addQuestion(session.id, {
                  question_text: cleanQ,
                  context_snippet: text,
                });
                mergeFreshQuestions([savedQ]);
                handleGenerateAnswer(savedQ);
                showToast('Question saved and generating AI answer...');
              } catch (err: any) {
                showToast(`Failed to add question: ${err.message}`);
              }
            }}
          />

          {/* Quick Manual Question / Note Input */}
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Ask Question / Direct Speech Input:
              </span>
              <span className="text-[11px] text-slate-500">Press Enter to ask</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ask anything, e.g. 'What is the difference between SQL and NoSQL?'"
                value={manualQuestionText}
                onChange={(e) => setManualQuestionText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddManualQuestion();
                }}
                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <button
                onClick={handleAddManualQuestion}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all cursor-pointer shrink-0 shadow-md shadow-emerald-500/20"
              >
                <span>Ask AI</span>
              </button>
            </div>
          </div>

          {/* Quick Demo Mode Sample Injector button */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400">
            <span>Testing without speaking?</span>
            <button
              onClick={handleInjectSample}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold text-xs border border-emerald-500/30 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Inject Sample Discussion
            </button>
          </div>
        </div>

        {/* Right Column: Detected Questions & AI Answers */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Detected Questions & Answers
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {detectedQuestions.length} questions
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isDetectingQuestions && (
                <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse font-mono">
                  <Sparkles className="w-3.5 h-3.5" /> Detecting...
                </span>
              )}

              {detectedQuestions.length > 0 && (
                <button
                  onClick={handleAnswerAllQuestions}
                  disabled={activeGeneratingQId !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                  title="Answer all detected questions with AI"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Answer All</span>
                </button>
              )}
            </div>
          </div>

          {detectedQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 rounded-2xl border border-slate-800/80 bg-slate-900/40 text-center space-y-3">
              <Bot className="w-10 h-10 text-slate-600 animate-pulse" />
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-300">No questions detected yet</h4>
                <p className="text-xs text-slate-400 max-w-sm">
                  Speak into your microphone or play tab audio. Click <strong>"Detect Questions"</strong> or <strong>"Pause"</strong> to extract questions and generate immediate AI answers.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
              {detectedQuestions.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  onGenerateAnswer={handleGenerateAnswer}
                  isGenerating={activeGeneratingQId === q.id}
                  streamingAnswerText={activeGeneratingQId === q.id ? streamingAnswerText : ''}
                  streamingLatency={activeGeneratingQId === q.id ? streamingLatency : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
