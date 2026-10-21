import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Session } from '../types';
import { Mic, Sparkles, MessageSquare, Clock, ArrowRight, ShieldCheck, Cpu, Play } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    api
      .listSessions()
      .then((data) => setSessions(data))
      .catch((err) => console.error('Failed to load dashboard sessions:', err))
      .finally(() => setLoading(false));
  }, []);

  const totalQuestions = sessions.reduce((acc, s) => acc + (s.question_count || 0), 0);
  const totalAnswers = sessions.reduce((acc, s) => acc + (s.answer_count || 0), 0);
  const totalDurationMin = Math.round(
    sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0) / 60
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl p-8 sm:p-10 border border-emerald-500/20 bg-gradient-to-br from-slate-900/90 via-[#0B132B] to-[#0A192F] backdrop-blur-2xl shadow-2xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-10 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Hacktoberfest 2026 • Slow & Steady
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white font-['Outfit'] leading-tight">
            Listen. Understand.{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Answer. Remember.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
            Continuous real-time AI conversation assistant. Capture microphone and browser audio,
            extract questions effortlessly on pause, and generate instant open-weight model answers
            backed by persistent long-term memory.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate('/workspace')}
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-emerald-500/25 transition-all duration-200 hover:scale-[1.02] cursor-pointer"
            >
              <Mic className="w-4 h-4" />
              Start Live Listening
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>

            <button
              onClick={() => navigate('/history')}
              className="flex items-center gap-2 px-5 py-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-white font-semibold text-sm border border-slate-700 transition-colors cursor-pointer"
            >
              Browse History ({sessions.length})
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-md space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Saved Sessions</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white">{sessions.length}</div>
          <p className="text-xs text-slate-400">Persisted across browser refreshes</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-md space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Questions Detected</span>
            <MessageSquare className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white">{totalQuestions}</div>
          <p className="text-xs text-slate-400">Auto-extracted from speech</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-md space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">AI Answers Generated</span>
            <Cpu className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white">{totalAnswers}</div>
          <p className="text-xs text-slate-400">Open-weight streaming answers</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-md space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Audio Listened</span>
            <Mic className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white">{totalDurationMin} min</div>
          <p className="text-xs text-slate-400">Mic & shared tab audio</p>
        </div>
      </div>

      {/* Recent Sessions Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white font-['Outfit']">Recent Conversations</h3>
            <p className="text-xs text-slate-400">Continue or review prior transcripts and answers</p>
          </div>
          <button
            onClick={() => navigate('/history')}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-slate-400">No conversations recorded yet.</p>
            <button
              onClick={() => navigate('/workspace')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
            >
              <Play className="w-3.5 h-3.5" /> Create Your First Session
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {sessions.slice(0, 5).map((s) => (
              <div
                key={s.id}
                onClick={() => navigate(`/workspace?sessionId=${s.id}`)}
                className="py-3.5 flex items-center justify-between gap-4 hover:bg-slate-800/30 px-3 rounded-xl transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-800 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors">
                      {s.title}
                    </h4>
                    <p className="text-xs text-slate-400">
                      Mode: <span className="uppercase text-slate-400">{s.capture_mode}</span> •{' '}
                      {new Date(s.created_at).toLocaleDateString()} at{' '}
                      {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                  <span className="hidden sm:inline-block px-2.5 py-1 rounded-md bg-slate-800/80 text-emerald-400 border border-slate-700/60">
                    {s.question_count} Qs • {s.answer_count} As
                  </span>
                  <span className="text-slate-400 group-hover:text-white transition-colors">
                    Continue →
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
