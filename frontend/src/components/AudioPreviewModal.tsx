import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Mic, Play, Square, Headphones, CheckCircle2, AlertCircle, X, Settings2 } from 'lucide-react';
import { CaptureMode } from '../types';
import { AudioDiagnostics } from '../hooks/useAudioCapture';
import { NetworkDiagnostics } from '../hooks/useLiveTranscription';
import { AudioDiagnosticPanel } from './AudioDiagnosticPanel';

interface AudioPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartSession: (mode: CaptureMode) => void;
  captureMode: CaptureMode;
  setCaptureMode: (mode: CaptureMode) => void;
  audioLevel: number;
  frequencyData: Uint8Array;
  isMonitoring: boolean;
  toggleAudioMonitoring: (forceVal?: boolean) => void;
  startAudioPreview: (mode: CaptureMode) => Promise<boolean>;
  recordTestClip: () => Promise<void>;
  testClipUrl: string | null;
  isRecordingTestClip: boolean;
  audioDevices?: MediaDeviceInfo[];
  selectedDeviceId?: string;
  setSelectedDeviceId?: (id: string) => void;
  diagnostics?: AudioDiagnostics;
  networkDiagnostics?: NetworkDiagnostics;
}

export const AudioPreviewModal: React.FC<AudioPreviewModalProps> = ({
  isOpen,
  onClose,
  onStartSession,
  captureMode,
  setCaptureMode,
  audioLevel,
  frequencyData,
  isMonitoring,
  toggleAudioMonitoring,
  startAudioPreview,
  recordTestClip,
  testClipUrl,
  isRecordingTestClip,
  audioDevices = [],
  selectedDeviceId = '',
  setSelectedDeviceId,
  diagnostics,
  networkDiagnostics,
}) => {
  const [testCountdown, setTestCountdown] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      startAudioPreview(captureMode);
    } else {
      toggleAudioMonitoring(false);
    }
  }, [isOpen, captureMode, startAudioPreview, toggleAudioMonitoring]);

  useEffect(() => {
    let interval: any;
    if (isRecordingTestClip) {
      setTestCountdown(5);
      interval = setInterval(() => {
        setTestCountdown((prev) => (prev > 1 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecordingTestClip]);

  if (!isOpen) return null;

  const levelPercent = Math.min(100, Math.round(audioLevel * 300));
  const isGoodLevel = audioLevel > 0.008;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-3xl bg-slate-900 border border-slate-700/80 p-6 sm:p-7 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white font-['Outfit']">Microphone Preview & Diagnostics</h3>
              <p className="text-xs text-slate-400">Step 3: Test and verify microphone audio independently without backend dependencies</p>
            </div>
          </div>
        </div>

        {/* Capture Mode Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/70 border border-slate-800">
          <button
            onClick={() => {
              setCaptureMode('mic');
              startAudioPreview('mic');
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              captureMode === 'mic'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Microphone Only
          </button>
          <button
            onClick={() => {
              setCaptureMode('tab');
              startAudioPreview('tab');
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              captureMode === 'tab'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Browser Tab Audio
          </button>
          <button
            onClick={() => {
              setCaptureMode('dual');
              startAudioPreview('dual');
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              captureMode === 'dual'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dual (Mic + Tab)
          </button>
        </div>

        {/* Microphone Device Selector Dropdown */}
        {audioDevices.length > 0 && captureMode !== 'tab' && (
          <div className="space-y-1.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-emerald-400" />
                Select Hardware Microphone:
              </label>
              <span className="text-[11px] text-slate-500">{audioDevices.length} input device(s) found</span>
            </div>
            <select
              value={selectedDeviceId}
              onChange={(e) => {
                setSelectedDeviceId?.(e.target.value);
                setTimeout(() => startAudioPreview(captureMode), 50);
              }}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {audioDevices.map((dev, idx) => (
                <option key={dev.deviceId || idx} value={dev.deviceId}>
                  {dev.label || `Microphone ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Live Audio Level Meter & Frequency Visualizer */}
        <div className="space-y-2.5 p-4 rounded-2xl bg-slate-950 border border-slate-800">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-semibold flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              Live Microphone Energy Gauge
            </span>
            <span
              className={`font-mono font-bold ${
                isGoodLevel ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              {isGoodLevel ? 'Speech Detected (Nonzero PCM)' : 'Speak into microphone to test levels...'}
            </span>
          </div>

          {/* Level Progress Bar */}
          <div className="w-full h-3.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden flex p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                levelPercent > 70
                  ? 'bg-rose-500'
                  : levelPercent > 25
                  ? 'bg-emerald-400'
                  : 'bg-teal-500'
              }`}
              style={{ width: `${Math.max(4, levelPercent)}%` }}
            />
          </div>

          {/* 32-Band Visualizer Bars */}
          <div className="flex items-end justify-between h-10 pt-1 gap-1">
            {Array.from(frequencyData).map((val, idx) => (
              <div
                key={idx}
                className="flex-1 bg-emerald-500/40 rounded-t-sm transition-all duration-75"
                style={{
                  height: `${Math.max(8, Math.round((val / 255) * 100))}%`,
                  backgroundColor: val > 90 ? '#34d399' : '#059669',
                }}
              />
            ))}
          </div>
        </div>

        {/* Step 3: Independent Audio Capture & Playback Test */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Step 3 — Independent Microphone Test (Isolated from Backend)
              </h4>
              <p className="text-[11px] text-slate-400">
                Records 5 seconds of audio locally and plays it back to prove your microphone captures sound.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Record 5-second Test Clip */}
            <button
              onClick={recordTestClip}
              disabled={isRecordingTestClip}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                isRecordingTestClip
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
              }`}
            >
              {isRecordingTestClip ? (
                <>
                  <Square className="w-4 h-4 fill-rose-400 text-rose-400 animate-pulse" />
                  <span>Recording Microphone ({testCountdown}s)...</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 text-emerald-400" />
                  <span>Record 5-Second Test Clip</span>
                </>
              )}
            </button>

            {/* Hear Yourself Live Loopback Toggle */}
            <button
              onClick={() => toggleAudioMonitoring()}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                isMonitoring
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Headphones className={`w-4 h-4 ${isMonitoring ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
              <span>{isMonitoring ? 'Stop Monitoring (Headphones)' : 'Hear Yourself Live (Loopback)'}</span>
            </button>
          </div>

          {/* Audio Playback Player if test clip recorded */}
          {testClipUrl && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Independent Test Audio Captured! Click Play below to listen:
                </span>
                <span className="text-[11px] text-emerald-400/80">If you hear your voice, microphone works!</span>
              </div>
              <audio src={testClipUrl} controls autoPlay className="w-full h-8 outline-none" />
            </div>
          )}
        </div>

        {/* Step 2: Live Diagnostic Panel */}
        {diagnostics && networkDiagnostics && (
          <AudioDiagnosticPanel
            audioDiagnostics={diagnostics}
            networkDiagnostics={networkDiagnostics}
          />
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Close Diagnostics
          </button>
          <button
            onClick={() => {
              onClose();
              onStartSession(captureMode);
            }}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-slate-950" />
            <span>Start Live Session</span>
          </button>
        </div>
      </div>
    </div>
  );
};
