import React from 'react';
import { CaptureMode, RecordingState } from '../types';
import { Mic, MonitorUp, Layers, Info } from 'lucide-react';

interface AudioSourceSelectorProps {
  selectedMode: CaptureMode;
  onSelectMode: (mode: CaptureMode) => void;
  recordingState: RecordingState;
}

export const AudioSourceSelector: React.FC<AudioSourceSelectorProps> = ({
  selectedMode,
  onSelectMode,
  recordingState,
}) => {
  const isLocked = recordingState === 'RECORDING' || recordingState === 'PAUSED';

  const modes: {
    id: CaptureMode;
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    tag: string;
  }[] = [
    {
      id: 'mic',
      label: 'Microphone Only',
      sublabel: 'Mode A: In-person speech & user mic input',
      icon: <Mic className="w-4 h-4" />,
      tag: 'getUserMedia()',
    },
    {
      id: 'tab',
      label: 'Browser Tab / Media',
      sublabel: 'Mode B: Video calls, YouTube, webinars & shared tabs',
      icon: <MonitorUp className="w-4 h-4" />,
      tag: 'getDisplayMedia()',
    },
    {
      id: 'dual',
      label: 'Mic + Tab Audio',
      sublabel: 'Mode C: Both sides mixed via Web Audio API',
      icon: <Layers className="w-4 h-4" />,
      tag: 'Web Audio Mixer',
    },
  ];

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
        <span>AUDIO CAPTURE SOURCE</span>
        {isLocked && (
          <span className="text-amber-400/90 flex items-center gap-1 text-[11px]">
            Locked during active session
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {modes.map((m) => {
          const isSelected = selectedMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={isLocked}
              onClick={() => onSelectMode(m.id)}
              className={`relative flex flex-col p-3 rounded-xl text-left border transition-all duration-200 ${
                isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
              } ${
                isSelected
                  ? 'bg-slate-800/90 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                  : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`p-1.5 rounded-lg ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {m.icon}
                  </div>
                  <span
                    className={`font-semibold text-sm ${
                      isSelected ? 'text-white' : 'text-slate-300'
                    }`}
                  >
                    {m.label}
                  </span>
                </div>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10B981]" />
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 line-clamp-1">{m.sublabel}</p>
              <span className="text-[10px] font-mono text-slate-400 mt-2">{m.tag}</span>
            </button>
          );
        })}
      </div>

      {/* Browser tab audio sharing compatibility helper banner */}
      {(selectedMode === 'tab' || selectedMode === 'dual') && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs text-cyan-300/90">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold text-cyan-200">Browser Audio Tip:</strong> When the
            browser prompt appears, select a <strong>Chrome/Edge Tab</strong> and ensure{' '}
            <em>"Share tab audio"</em> is checked at the bottom left of the modal to capture stream
            sound.
          </div>
        </div>
      )}
    </div>
  );
};
