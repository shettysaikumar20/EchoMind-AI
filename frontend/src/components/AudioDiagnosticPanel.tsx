import React from 'react';
import { Activity, Radio, Cpu, Network, Volume2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AudioDiagnostics } from '../hooks/useAudioCapture';
import { NetworkDiagnostics } from '../hooks/useLiveTranscription';

interface AudioDiagnosticPanelProps {
  audioDiagnostics: AudioDiagnostics;
  networkDiagnostics: NetworkDiagnostics;
}

export const AudioDiagnosticPanel: React.FC<AudioDiagnosticPanelProps> = ({
  audioDiagnostics,
  networkDiagnostics,
}) => {
  const isAudioActive = audioDiagnostics.liveRms > 0.008;

  return (
    <div className="rounded-2xl bg-slate-950/90 border border-slate-800 p-4 space-y-4 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-white font-['Outfit']">
            Real-Time Microphone & Network Diagnostics
          </h4>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            isAudioActive
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
              : 'bg-slate-800 text-slate-400'
          }`}
        >
          {isAudioActive ? 'VOICE DETECTED' : 'AWAITING SPEECH'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
        {/* Stage 1: Hardware & Permissions */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
          <div className="flex items-center gap-1.5 text-slate-400 font-sans font-semibold">
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>1. Hardware & Track</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Permission:</span>
            <span
              className={
                audioDiagnostics.permissionStatus === 'granted'
                  ? 'text-emerald-400 font-bold'
                  : audioDiagnostics.permissionStatus === 'denied'
                  ? 'text-rose-400 font-bold'
                  : 'text-amber-400'
              }
            >
              {audioDiagnostics.permissionStatus}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Track State:</span>
            <span className={audioDiagnostics.trackReadyState === 'live' ? 'text-emerald-400' : 'text-slate-400'}>
              {audioDiagnostics.trackReadyState}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Track Enabled:</span>
            <span className={audioDiagnostics.trackEnabled ? 'text-emerald-400' : 'text-rose-400'}>
              {audioDiagnostics.trackEnabled ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Track Muted:</span>
            <span className={audioDiagnostics.trackMuted ? 'text-rose-400' : 'text-emerald-400'}>
              {audioDiagnostics.trackMuted ? 'MUTED' : 'Active'}
            </span>
          </div>
          <div className="truncate text-[10px] text-slate-400 pt-1" title={audioDiagnostics.selectedDeviceId}>
            Device ID: {audioDiagnostics.selectedDeviceId ? `${audioDiagnostics.selectedDeviceId.slice(0, 14)}...` : 'Default'}
          </div>
        </div>

        {/* Stage 2: Web Audio API */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
          <div className="flex items-center gap-1.5 text-slate-400 font-sans font-semibold">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>2. Audio Processing</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Context State:</span>
            <span className={audioDiagnostics.audioContextState === 'running' ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
              {audioDiagnostics.audioContextState}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Sample Rate:</span>
            <span className="text-slate-300">
              {audioDiagnostics.audioContextSampleRate ? `${audioDiagnostics.audioContextSampleRate} Hz` : '0 Hz'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Engine:</span>
            <span className="text-cyan-300 font-bold">{audioDiagnostics.processingEngine}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Captured PCM:</span>
            <span className="text-emerald-400 font-bold">
              {audioDiagnostics.capturedSampleCount.toLocaleString()} samples
            </span>
          </div>
        </div>

        {/* Stage 3: Live Input Levels */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
          <div className="flex items-center gap-1.5 text-slate-400 font-sans font-semibold">
            <Volume2 className="w-3.5 h-3.5 text-amber-400" />
            <span>3. Audio Meter</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Live RMS:</span>
            <span className={`font-bold ${isAudioActive ? 'text-emerald-400' : 'text-slate-400'}`}>
              {audioDiagnostics.liveRms.toFixed(4)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Peak Level:</span>
            <span className="text-amber-300 font-bold">{audioDiagnostics.peakLevel.toFixed(3)}</span>
          </div>
          {/* Mini Level Gauge */}
          <div className="pt-2">
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden flex">
              <div
                className={`h-full transition-all duration-75 ${
                  audioDiagnostics.liveRms > 0.05
                    ? 'bg-rose-500'
                    : audioDiagnostics.liveRms > 0.01
                    ? 'bg-emerald-400'
                    : 'bg-teal-500'
                }`}
                style={{ width: `${Math.min(100, Math.round(audioDiagnostics.liveRms * 400))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Stage 4: WebSocket Transmission */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
          <div className="flex items-center gap-1.5 text-slate-400 font-sans font-semibold">
            <Network className="w-3.5 h-3.5 text-purple-400" />
            <span>4. WebSocket & STT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">WS Connection:</span>
            <span
              className={
                networkDiagnostics.wsState === 'OPEN'
                  ? 'text-emerald-400 font-bold'
                  : networkDiagnostics.wsState === 'CONNECTING'
                  ? 'text-amber-400'
                  : 'text-slate-500'
              }
            >
              {networkDiagnostics.wsState}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Bytes Sent:</span>
            <span className="text-purple-300 font-bold">
              {(networkDiagnostics.bytesTransmitted / 1024).toFixed(1)} KB
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Backend Rcvd:</span>
            <span className="text-emerald-400 font-bold">
              {(networkDiagnostics.bytesReceivedByBackend / 1024).toFixed(1)} KB
            </span>
          </div>
        </div>
      </div>

      {/* Last Transcription & Error Output Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-slate-800 text-xs">
        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5 font-sans">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Last Transcription Output:</span>
          </div>
          <p className="font-mono text-emerald-300 italic truncate">
            {networkDiagnostics.lastTranscription ? `"${networkDiagnostics.lastTranscription}"` : 'None yet (speak to transcribe)'}
          </p>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
          <div className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5 font-sans">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Last Diagnostic Error / Warning:</span>
          </div>
          <p className={`font-mono text-[11px] truncate ${audioDiagnostics.lastError || networkDiagnostics.lastError ? 'text-rose-400' : 'text-slate-500'}`}>
            {audioDiagnostics.lastError || networkDiagnostics.lastError || 'No errors reported. Pipeline healthy.'}
          </p>
        </div>
      </div>
    </div>
  );
};
