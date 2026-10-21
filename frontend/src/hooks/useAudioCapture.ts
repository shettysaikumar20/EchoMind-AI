import { useState, useRef, useCallback, useEffect } from 'react';
import { CaptureMode, RecordingState } from '../types';

interface UseAudioCaptureProps {
  onAudioData?: (data: ArrayBuffer, rms: number) => void;
  onTabEnded?: () => void;
  onError?: (errorMsg: string) => void;
}

export function useAudioCapture({ onAudioData, onTabEnded, onError }: UseAudioCaptureProps = {}) {
  const [recordingState, setRecordingState] = useState<RecordingState>('IDLE');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('mic');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(32));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTabAudioAvailable, setIsTabAudioAvailable] = useState<boolean>(true);

  // Media references
  const micStreamRef = useRef<MediaStream | null>(null);
  const tabStreamRef = useRef<MediaStream | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // Safely stop all tracks on a given stream
  const stopStreamTracks = (stream: MediaStream | null) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (e) {
        console.warn('Error stopping track:', e);
      }
    });
  };

  // Full audio pipeline cleanup
  const cleanupAudioPipeline = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    stopStreamTracks(micStreamRef.current);
    stopStreamTracks(tabStreamRef.current);
    stopStreamTracks(combinedStreamRef.current);

    micStreamRef.current = null;
    tabStreamRef.current = null;
    combinedStreamRef.current = null;

    setAudioLevel(0);
    setFrequencyData(new Uint8Array(32));
  }, []);

  // Animation frame loop for real-time waveform visualizer
  const startVisualizerLoop = (analyser: AnalyserNode) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(dataArray);
      setFrequencyData(new Uint8Array(dataArray.slice(0, 32)));

      // Compute simple RMS energy for level meter
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / (dataArray.length * 255);
      setAudioLevel(avg);

      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
  };

  // Setup Web Audio graph for mixing and analysis
  const setupAudioGraph = (sources: MediaStream[]) => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioContextRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyserRef.current = analyser;

    const destination = ctx.createMediaStreamDestination();

    sources.forEach((stream) => {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const sourceNode = ctx.createMediaStreamSource(new MediaStream(audioTracks));
        // Connect to analyser and to mixer destination (NOT to ctx.destination to prevent feedback!)
        sourceNode.connect(analyser);
        sourceNode.connect(destination);
      }
    });

    combinedStreamRef.current = destination.stream;

    // Ingest audio buffers via ScriptProcessor
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    processorRef.current = processor;
    analyser.connect(processor);
    processor.connect(ctx.destination); // Required for script processor to fire

    processor.onaudioprocess = (e) => {
      if (recordingState === 'PAUSED' || recordingState === 'STOPPED') return;
      const inputData = e.inputBuffer.getChannelData(0);

      // Convert float32 PCM to 16-bit PCM for low-latency transmission
      const buffer = new ArrayBuffer(inputData.length * 2);
      const view = new DataView(buffer);
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        sum += s * s;
      }
      const rms = Math.sqrt(sum / inputData.length);
      onAudioData?.(buffer, rms);
    };

    startVisualizerLoop(analyser);
  };

  // Start recording
  const startRecording = useCallback(
    async (mode: CaptureMode = captureMode) => {
      setErrorMessage(null);
      setRecordingState('REQUESTING_PERMISSION');
      setCaptureMode(mode);

      try {
        const activeStreams: MediaStream[] = [];

        // Mode A or Mode C: Request Microphone
        if (mode === 'mic' || mode === 'dual') {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
            micStreamRef.current = micStream;
            activeStreams.push(micStream);
          } catch (err: any) {
            const msg = `Microphone permission denied: ${err.message || 'Access blocked'}`;
            setErrorMessage(msg);
            onError?.(msg);
            setRecordingState('IDLE');
            cleanupAudioPipeline();
            return false;
          }
        }

        // Mode B or Mode C: Request Tab / Computer Audio
        if (mode === 'tab' || mode === 'dual') {
          try {
            // Note: getDisplayMedia requires video: true per browser specifications
            const tabStream = await navigator.mediaDevices.getDisplayMedia({
              video: {
                displaySurface: 'browser',
              },
              audio: true,
            });

            tabStreamRef.current = tabStream;

            // Check if user shared tab audio
            const tabAudioTracks = tabStream.getAudioTracks();
            if (tabAudioTracks.length === 0) {
              setIsTabAudioAvailable(false);
              const warningMsg =
                'Notice: No audio track was found on the shared screen/tab. Did you check "Share tab audio" in the Chrome/Edge prompt?';
              if (mode === 'tab') {
                // If tab only and no audio track, warn user
                setErrorMessage(warningMsg);
                onError?.(warningMsg);
                cleanupAudioPipeline();
                setRecordingState('IDLE');
                return false;
              } else {
                console.warn(warningMsg);
              }
            } else {
              setIsTabAudioAvailable(true);
            }

            // Listen for user clicking "Stop sharing" in browser banner
            tabStream.getVideoTracks().forEach((track) => {
              track.onended = () => {
                console.log('Tab sharing ended by user');
                onTabEnded?.();
                if (mode === 'tab') {
                  pauseRecording();
                }
              };
            });

            activeStreams.push(tabStream);
          } catch (err: any) {
            const msg = `Display/Tab audio permission denied: ${err.message || 'Cancelled'}`;
            if (mode === 'tab') {
              setErrorMessage(msg);
              onError?.(msg);
              setRecordingState('IDLE');
              cleanupAudioPipeline();
              return false;
            } else {
              console.warn(`Tab audio failed in dual mode: ${err.message}. Continuing with mic only.`);
            }
          }
        }

        if (activeStreams.length === 0) {
          throw new Error('No audio sources could be established.');
        }

        setupAudioGraph(activeStreams);
        setRecordingState('RECORDING');
        return true;
      } catch (err: any) {
        const msg = err.message || 'Failed to initialize audio capture.';
        setErrorMessage(msg);
        onError?.(msg);
        setRecordingState('IDLE');
        cleanupAudioPipeline();
        return false;
      }
    },
    [captureMode, onError, onTabEnded, cleanupAudioPipeline]
  );

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      audioContextRef.current.suspend();
    }
    setRecordingState('PAUSED');
  }, []);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    setRecordingState('RECORDING');
  }, []);

  // Stop recording
  const stopRecording = useCallback(() => {
    cleanupAudioPipeline();
    setRecordingState('STOPPED');
  }, [cleanupAudioPipeline]);

  // Reset to IDLE
  const resetToIdle = useCallback(() => {
    cleanupAudioPipeline();
    setRecordingState('IDLE');
  }, [cleanupAudioPipeline]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      cleanupAudioPipeline();
    };
  }, [cleanupAudioPipeline]);

  return {
    recordingState,
    captureMode,
    audioLevel,
    frequencyData,
    errorMessage,
    isTabAudioAvailable,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetToIdle,
    setCaptureMode,
  };
}
