import React, { useEffect, useState } from 'react';
import { RecordingState } from '../types';
import { Clock } from 'lucide-react';

interface TimerProps {
  recordingState: RecordingState;
  initialSeconds?: number;
  onTimeUpdate?: (seconds: number) => void;
}

export const Timer: React.FC<TimerProps> = ({
  recordingState,
  initialSeconds = 0,
  onTimeUpdate,
}) => {
  const [seconds, setSeconds] = useState<number>(initialSeconds);

  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    let interval: any = null;
    if (recordingState === 'RECORDING') {
      interval = setInterval(() => {
        setSeconds((prev) => {
          const next = prev + 1;
          onTimeUpdate?.(next);
          return next;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recordingState, onTimeUpdate]);

  const formatTime = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-200">
      <Clock
        className={`w-4 h-4 ${
          recordingState === 'RECORDING' ? 'text-emerald-400 animate-pulse' : 'text-slate-400'
        }`}
      />
      <span className="font-mono text-base font-semibold tracking-wider">
        {formatTime(seconds)}
      </span>
      {recordingState === 'RECORDING' && (
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
      )}
    </div>
  );
};
