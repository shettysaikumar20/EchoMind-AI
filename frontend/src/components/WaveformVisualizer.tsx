import React, { useMemo } from 'react';
import { RecordingState } from '../types';

interface WaveformVisualizerProps {
  frequencyData: Uint8Array;
  recordingState: RecordingState;
  audioLevel: number;
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  frequencyData,
  recordingState,
  audioLevel,
}) => {
  const isRecording = recordingState === 'RECORDING';
  const isPaused = recordingState === 'PAUSED';

  // Compute 32 bar heights
  const bars = useMemo(() => {
    const totalBars = 36;
    const result: number[] = [];

    if (!isRecording && !isPaused) {
      // Idle wave
      for (let i = 0; i < totalBars; i++) {
        const h = 8 + Math.sin(i * 0.4) * 4;
        result.push(h);
      }
      return result;
    }

    if (isPaused) {
      // Frozen static low bars
      for (let i = 0; i < totalBars; i++) {
        result.push(12 + (i % 5) * 3);
      }
      return result;
    }

    // Active recording: map frequencyData with dynamic boost
    const step = Math.max(1, Math.floor(frequencyData.length / totalBars));
    for (let i = 0; i < totalBars; i++) {
      const val = frequencyData[i * step] || 0;
      // Scale 0-255 to min 8px, max 64px
      const normalized = val / 255;
      const height = Math.max(8, Math.min(72, normalized * 68 + audioLevel * 20));
      result.push(height);
    }
    return result;
  }, [frequencyData, isRecording, isPaused, audioLevel]);

  return (
    <div className="relative w-full h-24 flex items-center justify-center gap-1.5 px-4 bg-slate-900/60 rounded-2xl border border-slate-800/80 backdrop-blur-md overflow-hidden">
      {/* Background glow when recording */}
      {isRecording && (
        <div
          className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-cyan-500/15 to-emerald-500/10 pointer-events-none transition-opacity duration-300"
          style={{ opacity: Math.min(1, 0.3 + audioLevel * 1.5) }}
        />
      )}

      {/* Waveform Bars */}
      <div className="relative z-10 flex items-center justify-center gap-1 sm:gap-1.5 h-full w-full">
        {bars.map((height, idx) => {
          // Dynamic color gradient across bars
          const isCenter = idx >= 10 && idx <= 26;
          return (
            <div
              key={idx}
              className={`w-1.5 rounded-full transition-all duration-75 ${
                isRecording
                  ? isCenter
                    ? 'bg-gradient-to-t from-emerald-500 via-teal-400 to-cyan-300 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                    : 'bg-gradient-to-t from-emerald-600/80 to-teal-500/80'
                  : isPaused
                  ? 'bg-amber-400/40'
                  : 'bg-slate-700/50'
              }`}
              style={{
                height: `${height}px`,
                transform: isRecording ? `scaleY(${1 + audioLevel * 0.4})` : 'scaleY(1)',
              }}
            />
          );
        })}
      </div>

      {/* Status Overlay Tag */}
      <div className="absolute bottom-2 right-3 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950/80 border border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-400">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isRecording
              ? 'bg-emerald-400 animate-pulse'
              : isPaused
              ? 'bg-amber-400'
              : 'bg-slate-500'
          }`}
        />
        {recordingState === 'RECORDING' && `Active Audio (${Math.round(audioLevel * 100)}%)`}
        {recordingState === 'PAUSED' && 'Paused (Ready)'}
        {recordingState === 'IDLE' && 'Standby'}
        {recordingState === 'REQUESTING_PERMISSION' && 'Requesting Device...'}
        {recordingState === 'STOPPED' && 'Stopped'}
      </div>
    </div>
  );
};
