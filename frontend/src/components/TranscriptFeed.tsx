import React, { useRef, useEffect, useState } from 'react';
import { TranscriptSegment } from '../types';
import { Search, Edit2, Check, X, Mic, MonitorUp, Layers, Sparkles } from 'lucide-react';

interface TranscriptFeedProps {
  transcripts: TranscriptSegment[];
  interimText?: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onUpdateSegment?: (id: string, text: string) => void;
  onAskAiFromSegment?: (text: string) => void;
}

export const TranscriptFeed: React.FC<TranscriptFeedProps> = ({
  transcripts,
  interimText,
  searchQuery,
  onSearchChange,
  onUpdateSegment,
  onAskAiFromSegment,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isAutoScrollEnabledRef = useRef<boolean>(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');

  // Auto-scroll ONLY inside the transcript box, NEVER scroll the window or page!
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Check if user is near bottom
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcripts, interimText]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isAutoScrollEnabledRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const handleStartEdit = (seg: TranscriptSegment) => {
    setEditingId(seg.id);
    setEditText(seg.text);
  };

  const handleSaveEdit = (id: string) => {
    if (editText.trim() && onUpdateSegment) {
      onUpdateSegment(id, editText.trim());
    }
    setEditingId(null);
  };

  const formatSec = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
    if (seconds > 100000) {
      const d = new Date(seconds > 1e11 ? seconds : seconds * 1000);
      return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getSourceIcon = (src: string) => {
    if (src === 'mic') return <Mic className="w-3 h-3 text-emerald-400" />;
    if (src === 'tab') return <MonitorUp className="w-3 h-3 text-cyan-400" />;
    return <Layers className="w-3 h-3 text-purple-400" />;
  };

  return (
    <div className="flex flex-col h-full rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md overflow-hidden">
      {/* Top Header & Search */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-900/80">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Live Conversation Transcript
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-emerald-400 border border-slate-700">
            {transcripts.length} segments
          </span>
        </div>

        <div className="relative w-48 sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search transcript..."
            className="w-full pl-8 pr-3 py-1 text-xs rounded-lg bg-slate-950/80 border border-slate-800 focus:outline-none focus:border-emerald-500 text-slate-200 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Transcript Segments List */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[220px] max-h-[380px]"
      >
        {transcripts.length === 0 && !interimText ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400">
            <Mic className="w-8 h-8 text-slate-600 mb-2 animate-bounce" />
            <p className="text-sm font-medium text-slate-400">Listening for conversation...</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Speak into your microphone or play shared tab audio to view live real-time transcription.
            </p>
          </div>
        ) : (
          transcripts.map((seg) => {
            const isEditing = editingId === seg.id;
            return (
              <div
                key={seg.id}
                className="group relative flex items-start gap-3 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 hover:border-slate-700/80 transition-colors"
              >
                {/* Source & Timestamp Tag */}
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
                  {getSourceIcon(seg.source)}
                  <span className="uppercase">{seg.source}</span>
                  <span className="text-slate-400">{formatSec(seg.start_time)}</span>
                </div>

                {/* Content / Edit Box */}
                <div className="flex-1 text-sm text-slate-200 leading-relaxed font-sans">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="flex-1 px-2 py-1 text-xs rounded bg-slate-900 border border-emerald-500 text-white focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveEdit(seg.id)}
                        className="p-1 rounded bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span>{seg.text}</span>
                  )}
                </div>

                {/* Actions: Inline Edit & Ask AI */}
                {!isEditing && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onAskAiFromSegment && (
                      <button
                        onClick={() => onAskAiFromSegment(seg.text)}
                        className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded cursor-pointer transition-colors"
                        title="Turn this spoken sentence into a question and get an AI answer"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Ask AI</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleStartEdit(seg)}
                      className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
                      title="Correct transcript segment"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Interim / Partial recognition speech bubble */}
        {interimText && (
          <div className="flex items-start gap-3 p-2.5 rounded-xl bg-emerald-950/10 border border-emerald-500/20 text-emerald-300/80 text-sm italic animate-pulse">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-400 shrink-0">
              LIVE...
            </span>
            <span>{interimText}</span>
          </div>
        )}
      </div>
    </div>
  );
};
