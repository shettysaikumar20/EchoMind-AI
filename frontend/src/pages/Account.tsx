import React, { useState } from 'react';
import { ShieldCheck, User as UserIcon, Lock, Cpu, Sparkles, AlertTriangle, Trash2 } from 'lucide-react';

export const Account: React.FC = () => {
  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleClearLocal = () => {
    if (window.confirm('Clear local authentication token and reset session cache?')) {
      localStorage.removeItem('echomind_token');
      showToast('Local cache cleared.');
      window.location.reload();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Toast */}
      {notification && (
        <div className="fixed top-20 right-6 z-50 px-4 py-2 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-300 text-xs shadow-2xl">
          {notification}
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-white font-['Outfit'] flex items-center gap-2">
          <UserIcon className="w-6 h-6 text-emerald-400" />
          Account & Privacy Governance
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Manage your profile, data privacy compliance, and open-weight AI configuration.
        </p>
      </div>

      {/* User Card */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-slate-950 font-bold text-lg font-mono">
            EM
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-['Outfit']">EchoMind Explorer</h3>
            <p className="text-xs text-slate-400 font-mono">demo@echomind.ai</p>
            <span className="inline-block mt-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Active Session • Local SQLite & Supabase Sync
            </span>
          </div>
        </div>

        <button
          onClick={handleClearLocal}
          className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
        >
          Reset Session Token
        </button>
      </div>

      {/* Hacktoberfest Theme Card */}
      <div className="p-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 to-cyan-950/20 backdrop-blur-md space-y-3">
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="w-4 h-4" /> Hacktoberfest 2026 Week 3: Slow and Steady
        </div>
        <h4 className="text-lg font-bold text-white font-['Outfit']">
          "Let AI do the work so humans don't have to."
        </h4>
        <p className="text-xs text-slate-300 leading-relaxed">
          EchoMind AI eliminates the cognitive tax of manual meeting notes and interrupted workflows.
          By combining browser tab audio mixing with continuous transcription, automated question
          detection, and open-weight LLMs (Meta Llama 3.1 & Google Gemma), EchoMind ensures you never
          miss a question or lose crucial context.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1">
            <span className="font-semibold text-white">Open-Weight AI</span>
            <p className="text-slate-400 text-[11px]">Unshackled from proprietary walled gardens.</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1">
            <span className="font-semibold text-white">Permanent Memory</span>
            <p className="text-slate-400 text-[11px]">Persisted across browser refresh & restarts.</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1">
            <span className="font-semibold text-white">Dual Audio Capture</span>
            <p className="text-slate-400 text-[11px]">Mic and tab audio combined with Web Audio API.</p>
          </div>
        </div>
      </div>

      {/* Privacy & Consent Messaging */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Privacy & Audio Data Consent
        </h3>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            • <strong>No Raw Audio Retention:</strong> EchoMind AI processes audio in ephemeral buffers for
            immediate speech recognition. Raw microphone and tab audio recordings are never stored
            permanently on the server by default.
          </p>
          <p>
            • <strong>Explicit Permissions:</strong> Recording starts only after you explicitly click Start
            and grant browser microphone and/or display media sharing permissions.
          </p>
          <p>
            • <strong>User Isolation:</strong> Every conversation transcript, detected question, and answer
            is strictly partitioned by authenticated user IDs.
          </p>
        </div>
      </div>
    </div>
  );
};
