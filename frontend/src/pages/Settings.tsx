import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { UserSettings, ModelOption, ProvidersResponse } from '../types';
import {
  Settings as SettingsIcon,
  Cpu,
  Key,
  Sliders,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  Sparkles,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [providersData, setProvidersData] = useState<ProvidersResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('openrouter');
  const [selectedModel, setSelectedModel] = useState<string>('meta-llama/llama-3.1-8b-instruct');
  const [answerLength, setAnswerLength] = useState<'concise' | 'detailed' | 'bullet_points'>('concise');
  const [sttMode, setSttMode] = useState<string>('lightweight');
  const [openrouterKey, setOpenrouterKey] = useState<string>('');
  const [backboardKey, setBackboardKey] = useState<string>('');
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getSettings(), api.getProviders()])
      .then(([set, prov]) => {
        setSettings(set);
        setProvidersData(prov);
        setSelectedProvider(set.ai_provider);
        setSelectedModel(set.ai_model);
        setAnswerLength(set.answer_length);
        setSttMode(set.stt_mode);
        setRetentionDays(set.retention_days);
      })
      .catch((err) => console.error('Failed to load settings:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        ai_provider: selectedProvider,
        ai_model: selectedModel,
        answer_length: answerLength,
        stt_mode: sttMode,
        retention_days: retentionDays,
      };
      if (openrouterKey.trim()) payload.openrouter_api_key = openrouterKey.trim();
      if (backboardKey.trim()) payload.backboard_api_key = backboardKey.trim();

      const updated = await api.updateSettings(payload);
      setSettings(updated);
      setOpenrouterKey('');
      setBackboardKey('');
      setNotification('Settings saved successfully!');
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const currentModels = providersData?.models.filter(
    (m) => m.provider.toLowerCase() === selectedProvider.toLowerCase()
  ) || [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Toast */}
      {notification && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-300 text-xs shadow-2xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-white font-['Outfit'] flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-emerald-400" />
          AI & Provider Settings
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure open-weight AI providers, inference models, and conversation reasoning preferences.
        </p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">Loading settings...</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Provider Selector Card */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              1. Select Primary AI Provider
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* OpenRouter */}
              <div
                onClick={() => setSelectedProvider('openrouter')}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedProvider === 'openrouter'
                    ? 'bg-slate-800 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-semibold text-white">OpenRouter</h4>
                  {selectedProvider === 'openrouter' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Access flagship open-weight models: Llama 3.1 8B/70B, Gemma 2, Mistral with fast token streaming.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      settings?.has_openrouter_key
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {settings?.has_openrouter_key ? '✓ API Key Configured' : '⚠ Missing API Key'}
                  </span>
                </div>
              </div>

              {/* Backboard AI */}
              <div
                onClick={() => setSelectedProvider('backboard')}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedProvider === 'backboard'
                    ? 'bg-slate-800 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-semibold text-white">Backboard AI</h4>
                  {selectedProvider === 'backboard' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Dedicated high-throughput hosted open-weight instances with specialized enterprise compliance.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      settings?.has_backboard_key
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {settings?.has_backboard_key ? '✓ API Key Configured' : '⚠ Missing API Key'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Model Selector Card */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              2. Open-Weight Model Selection
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentModels.map((m) => {
                const isSelected = selectedModel === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedModel(m.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800 border-cyan-500/60 shadow-md shadow-cyan-500/10'
                        : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white font-['Outfit']">{m.name}</span>
                      {m.recommended && (
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{m.description}</p>
                    <div className="mt-2 text-[10px] font-mono text-slate-400">
                      Context: {m.context_length.toLocaleString()} tokens
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* API Keys Configuration Card */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              3. API Credentials
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  OpenRouter API Key
                </label>
                <input
                  type="password"
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                  placeholder={
                    settings?.has_openrouter_key
                      ? '•••••••••••••••••••••••••••••••• (Saved in backend)'
                      : 'sk-or-v1-...'
                  }
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Backboard AI API Key
                </label>
                <input
                  type="password"
                  value={backboardKey}
                  onChange={(e) => setBackboardKey(e.target.value)}
                  placeholder={
                    settings?.has_backboard_key
                      ? '•••••••••••••••••••••••••••••••• (Saved in backend)'
                      : 'bb-api-key-...'
                  }
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Preferences: Answer Length & STT */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-400" />
              4. Answer Formulation & Memory
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Default Answer Style
                </label>
                <select
                  value={answerLength}
                  onChange={(e: any) => setAnswerLength(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="concise">Concise (2-4 sentences max, high impact)</option>
                  <option value="detailed">Detailed (Comprehensive in-depth explanation)</option>
                  <option value="bullet_points">Bullet Points (Structured with keywords)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Transcript Retention
                </label>
                <select
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value={7}>7 Days</option>
                  <option value={30}>30 Days (Recommended)</option>
                  <option value={90}>90 Days</option>
                  <option value={365}>1 Year</option>
                </select>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
