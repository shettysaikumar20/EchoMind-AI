import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Session } from '../types';
import {
  Search,
  Calendar,
  Clock,
  MessageSquare,
  Trash2,
  Download,
  Play,
  ArrowRight,
  Bot,
  Mic,
  MonitorUp,
  Layers,
  ChevronRight,
} from 'lucide-react';

export const History: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [notification, setNotification] = useState<string | null>(null);

  const fetchSessions = (query?: string) => {
    setLoading(true);
    api
      .listSessions(query)
      .then((data) => {
        setSessions(data);
        if (data.length > 0 && !selectedSession) {
          loadSessionDetails(data[0].id);
        }
      })
      .catch((err) => console.error('Error fetching sessions:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const loadSessionDetails = async (id: string) => {
    try {
      const details = await api.getSession(id);
      setSelectedSession(details);
    } catch (err: any) {
      showToast(`Failed to load details: ${err.message}`);
    }
  };

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this conversation session?')) return;
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (selectedSession?.id === id) {
        setSelectedSession(null);
      }
      showToast('Session deleted.');
    } catch (err: any) {
      showToast(`Delete failed: ${err.message}`);
    }
  };

  const handleExport = async (id: string, format: 'markdown' | 'json') => {
    try {
      const blob = await api.exportSession(id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `echomind_session_${id.slice(0, 8)}.${format === 'markdown' ? 'md' : 'json'}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported as ${format.toUpperCase()}`);
    } catch (err: any) {
      showToast(`Export failed: ${err.message}`);
    }
  };

  const filteredSessions = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.summary && s.summary.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Toast */}
      {notification && (
        <div className="fixed top-20 right-6 z-50 px-4 py-2 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-300 text-xs shadow-2xl">
          {notification}
        </div>
      )}

      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white font-['Outfit']">Conversation History</h2>
          <p className="text-xs text-slate-400">
            Review past transcripts, detected questions, AI answers, or resume earlier sessions.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved conversations..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Two Column Layout: List on left, details on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[550px]">
        {/* Sessions List */}
        <div className="lg:col-span-5 space-y-2.5 overflow-y-auto max-h-[680px] pr-1">
          {loading ? (
            <div className="py-16 text-center text-xs text-slate-400">Loading conversation history...</div>
          ) : filteredSessions.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">
              No conversations matching your criteria.
            </div>
          ) : (
            filteredSessions.map((s) => {
              const isSelected = selectedSession?.id === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => loadSessionDetails(s.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800/90 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                      : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-white line-clamp-1">{s.title}</h4>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                      {s.capture_mode}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {Math.round(s.duration_seconds || 0)}s
                    </span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {s.question_count} Qs
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Session Details Panel */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 flex flex-col justify-between overflow-hidden">
          {selectedSession ? (
            <div className="space-y-6 overflow-y-auto max-h-[640px] pr-2">
              {/* Header Info & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-xl font-bold text-white font-['Outfit']">
                    {selectedSession.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Recorded {new Date(selectedSession.created_at).toLocaleString()} • Duration:{' '}
                    {Math.round(selectedSession.duration_seconds)}s
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/workspace?sessionId=${selectedSession.id}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-slate-950" />
                    Continue
                  </button>
                  <button
                    onClick={() => handleExport(selectedSession.id, 'markdown')}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Export as Markdown (.md)"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(selectedSession.id)}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Delete session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Questions & Answers Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  Detected Questions & Answers ({selectedSession.questions?.length || 0})
                </h4>

                {(!selectedSession.questions || selectedSession.questions.length === 0) ? (
                  <p className="text-xs text-slate-400 italic">No questions detected in this session.</p>
                ) : (
                  selectedSession.questions.map((q) => (
                    <div
                      key={q.id}
                      className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 shrink-0">
                          Q{q.question_index}
                        </span>
                        <div className="text-sm font-semibold text-white">{q.question_text}</div>
                      </div>

                      {q.answers && q.answers.length > 0 ? (
                        <div className="text-xs text-slate-300 bg-slate-900/80 p-3 rounded-lg border border-slate-800/60 leading-relaxed whitespace-pre-wrap">
                          {q.answers[0].answer_text}
                          <div className="mt-2 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                            <span>
                              Model: {q.answers[0].provider} / {q.answers[0].model.split('/').pop()}
                            </span>
                            <span>{q.answers[0].latency_ms}ms</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">Unanswered</p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Full Transcript Section */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-cyan-400" />
                  Full Transcript ({selectedSession.transcripts?.length || 0} segments)
                </h4>

                {(!selectedSession.transcripts || selectedSession.transcripts.length === 0) ? (
                  <p className="text-xs text-slate-400 italic">No transcript recorded for this session.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {selectedSession.transcripts.map((t) => (
                      <div
                        key={t.id}
                        className="text-xs text-slate-300 p-2 rounded-lg bg-slate-950/40 border border-slate-800/60 flex items-start gap-2"
                      >
                        <span className="text-[10px] font-mono text-slate-400 uppercase shrink-0">
                          [{t.source} {Math.round(t.start_time)}s]:
                        </span>
                        <span>{t.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-24 text-center text-slate-400">
              <Bot className="w-12 h-12 text-slate-600 mb-2" />
              <p className="text-sm">Select a conversation from the list to preview details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
