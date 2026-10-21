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

  // Audio capture hook
  const {
    recordingState,
    captureMode,
    audioLevel,
    frequencyData,
    errorMessage,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetToIdle,
    setCaptureMode,
  } = useAudioCapture({
    onError: (err) => showToast(`Audio Error: ${err}`),
    onTabEnded: () => showToast('Tab screen-sharing stopped by user.'),
  });

  // Live transcription hook
  const {
    transcripts,
    interimText,
    searchQuery,
    setSearchQuery,
    setTranscripts,
    updateSegmentText,
  } = useLiveTranscription({
    sessionId: activeSession?.id || null,
    captureMode,
    isRecording: recordingState === 'RECORDING',
  });

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
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
    api.getSettings().then((set) => {
      setActiveModelName(
        `${set.ai_model.split('/').pop()} (${set.ai_provider === 'backboard' ? 'Backboard' : 'OpenRouter'})`
      );
    }).catch(() => {});
  }, []);

  // --- Handlers: Start / Pause / Resume / Stop ---

  // 1. START
  const handleStart = async () => {
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

    const ok = await startRecording(captureMode);
    if (ok) {
      await api.updateSession(session.id, { status: 'recording' });
      showToast('Listening started. Speak or play tab audio.');
    }
  };

  // 2. PAUSE & QUESTION DETECTION
  const handlePause = async () => {
    pauseRecording();
    if (!activeSession) return;

    await api.updateSession(activeSession.id, { status: 'paused' });
    showToast('Paused recording. Analyzing transcript for questions...');

    setIsDetectingQuestions(true);
    try {
      const result = await api.detectQuestions(activeSession.id);
      if (result.questions && result.questions.length > 0) {
        setDetectedQuestions((prev) => {
          const existingIds = new Set(prev.map((q) => q.question_text.toLowerCase()));
          const newUnique = result.questions.filter(
            (q) => !existingIds.has(q.question_text.toLowerCase())
          );
          return [...prev, ...newUnique];
        });
        showToast(`Detected ${result.questions.length} question(s)! Generating answers...`);

        // Automatically trigger answer generation for first detected question
        const firstQ = result.questions[0];
        handleGenerateAnswer(firstQ);
      } else {
        showToast('No new questions detected in the recent audio.');
      }
    } catch (err: any) {
      showToast(`Question detection failed: ${err.message}`);
    } finally {
      setIsDetectingQuestions(false);
    }
  };

  // 3. RESUME
  const handleResume = async () => {
    if (!activeSession) return;
    try {
      await api.continueSession(activeSession.id);
      resumeRecording();
      showToast('Resumed conversation session.');
    } catch (err: any) {
      showToast(`Failed to resume session: ${err.message}`);
    }
  };

  // 4. STOP
  const handleStop = async () => {
    stopRecording();
    if (!activeSession) return;

    await api.updateSession(activeSession.id, { status: 'stopped' });
    showToast('Conversation session saved permanently.');
  };

  // 5. GENERATE ANSWER STREAM
  const handleGenerateAnswer = async (q: DetectedQuestion) => {
    if (!activeSession) return;
    setActiveGeneratingQId(q.id);
    setStreamingAnswerText('');
    setStreamingLatency(undefined);

    await api.generateAnswerStream(
      activeSession.id,
      {
        question_id: q.id,
        question_text: q.question_text,
        context: q.context_snippet,
      },
      {
        onToken: (tok) => {
          setStreamingAnswerText((prev) => prev + tok);
        },
        onComplete: (meta) => {
          setActiveGeneratingQId(null);
          setStreamingLatency(meta.latency_ms);
          // Refresh session to get updated persisted answers
          api.getSession(activeSession.id).then((fresh) => {
            if (fresh.questions) setDetectedQuestions(fresh.questions);
          });
        },
        onError: (err) => {
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
    showToast('Sample discussion injected into transcript. Click Pause to detect questions!');
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
            Workflow: <strong>Start → Listen → Pause → Detect Questions → Answer → Resume</strong>
          </p>
        </div>

        {/* Primary Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          <Timer recordingState={recordingState} initialSeconds={activeSession?.duration_seconds || 0} />

          {/* START / PAUSE / RESUME */}
          {!isRecording && !isPaused ? (
            <button
              onClick={handleStart}
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
          />

          {/* Quick Demo Mode Sample Injector button */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400">
            <span>Testing without mic or tab audio?</span>
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

            {isDetectingQuestions && (
              <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse font-mono">
                <Sparkles className="w-3.5 h-3.5" /> Detecting...
              </span>
            )}
          </div>

          {detectedQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 rounded-2xl border border-slate-800/80 bg-slate-900/40 text-center space-y-3">
              <Bot className="w-10 h-10 text-slate-600 animate-pulse" />
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-300">No questions detected yet</h4>
                <p className="text-xs text-slate-400 max-w-sm">
                  Click <strong>"Pause & Detect Questions"</strong> during conversation, or use the sample injector to test instant open-weight reasoning.
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
