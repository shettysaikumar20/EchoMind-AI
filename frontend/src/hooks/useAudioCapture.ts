import { useState, useRef, useCallback, useEffect } from 'react';
import { CaptureMode, RecordingState } from '../types';

export interface AudioDiagnostics {
  permissionStatus: string;
  availableDevices: Array<{ deviceId: string; label: string }>;
  selectedDeviceId: string;
  trackReadyState: string;
  trackEnabled: boolean;
  trackMuted: boolean;
  audioContextState: string;
  audioContextSampleRate: number;
  liveRms: number;
  peakLevel: number;
  capturedSampleCount: number;
  processingEngine: 'AudioWorklet' | 'ScriptProcessor' | 'None';
  lastError: string | null;
}

interface UseAudioCaptureProps {
  onAudioData?: (data: ArrayBuffer, rms: number) => void;
  onTabEnded?: () => void;
  onError?: (errorMsg: string) => void;
}

// Inline AudioWorklet code to bypass Vite bundling/path issues
const WORKLET_PROCESSOR_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const inputData = input[0];

    // Compute Peak and RMS
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < inputData.length; i++) {
      const abs = Math.abs(inputData[i]);
      if (abs > peak) peak = abs;
      sum += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sum / inputData.length);

    // Send raw Float32 data + telemetry to main thread for 16kHz downsampling
    this.port.postMessage({
      audioData: inputData,
      rms: rms,
      peak: peak,
      sampleCount: inputData.length
    });

    return true;
  }
}
registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
`;

// Linear downsampler from inputRate to 16,000 Hz 16-bit linear PCM
function downsampleTo16k(input: Float32Array, inputRate: number): ArrayBuffer {
  if (inputRate === 16000) {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  const ratio = inputRate / 16000;
  const newLength = Math.round(input.length / ratio);
  const buffer = new ArrayBuffer(newLength * 2);
  const view = new DataView(buffer);
  let offsetResult = 0;
  let offsetInput = 0;

  while (offsetResult < newLength) {
    const nextOffsetInput = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetInput; i < nextOffsetInput && i < input.length; i++) {
      accum += input[i];
      count++;
    }
    const sample = count > 0 ? accum / count : input[Math.floor(offsetInput)] || 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offsetResult * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offsetResult++;
    offsetInput = nextOffsetInput;
  }
  return buffer;
}

export function useAudioCapture({ onAudioData, onTabEnded, onError }: UseAudioCaptureProps = {}) {
  const [recordingState, setRecordingState] = useState<RecordingState>('IDLE');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('mic');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(32));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTabAudioAvailable, setIsTabAudioAvailable] = useState<boolean>(true);
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [isPreviewActive, setIsPreviewActive] = useState<boolean>(false);
  const [testClipUrl, setTestClipUrl] = useState<string | null>(null);
  const [isRecordingTestClip, setIsRecordingTestClip] = useState<boolean>(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Diagnostics State
  const [diagnostics, setDiagnostics] = useState<AudioDiagnostics>({
    permissionStatus: 'unknown',
    availableDevices: [],
    selectedDeviceId: '',
    trackReadyState: 'none',
    trackEnabled: false,
    trackMuted: false,
    audioContextState: 'none',
    audioContextSampleRate: 0,
    liveRms: 0,
    peakLevel: 0,
    capturedSampleCount: 0,
    processingEngine: 'None',
    lastError: null,
  });

  // CRITICAL: Persistent refs to prevent Chromium V8 garbage collection of audio nodes
  const sourceNodesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const tabStreamRef = useRef<MediaStream | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const isMonitoringRef = useRef<boolean>(false);
  const isRecordingRef = useRef<boolean>(false);
  const sampleCountRef = useRef<number>(0);
  const onAudioDataRef = useRef(onAudioData);

  useEffect(() => {
    isRecordingRef.current = recordingState === 'RECORDING';
  }, [recordingState]);

  useEffect(() => {
    onAudioDataRef.current = onAudioData;
  }, [onAudioData]);

  // Query microphone permission state
  const checkPermissionStatus = useCallback(async () => {
    try {
      if (navigator.permissions && (navigator.permissions as any).query) {
        const status = await (navigator.permissions as any).query({ name: 'microphone' });
        setDiagnostics((prev) => ({ ...prev, permissionStatus: status.state }));
        status.onchange = () => {
          setDiagnostics((prev) => ({ ...prev, permissionStatus: status.state }));
        };
      }
    } catch {
      // Browser does not support querying microphone permission directly
    }
  }, []);

  // Helper to enumerate and refresh microphone devices
  const refreshAudioDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      setAudioDevices(inputs);
      setDiagnostics((prev) => ({
        ...prev,
        availableDevices: inputs.map((d) => ({ deviceId: d.deviceId, label: d.label || 'Microphone' })),
      }));
      if (inputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(inputs[0].deviceId);
      }
    } catch (e: any) {
      console.warn('Could not enumerate audio devices:', e);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    checkPermissionStatus();
    refreshAudioDevices();
  }, [checkPermissionStatus, refreshAudioDevices]);

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

    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.disconnect();
      } catch {}
      workletNodeRef.current = null;
    }

    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {}
      scriptProcessorRef.current = null;
    }

    // Disconnect all persistent source nodes
    sourceNodesRef.current.forEach((node) => {
      try {
        node.disconnect();
      } catch {}
    });
    sourceNodesRef.current = [];

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {}
      analyserRef.current = null;
    }

    if (monitorGainRef.current) {
      try {
        monitorGainRef.current.disconnect();
      } catch {}
      monitorGainRef.current = null;
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
    setIsPreviewActive(false);

    setDiagnostics((prev) => ({
      ...prev,
      audioContextState: 'closed',
      trackReadyState: 'ended',
      trackEnabled: false,
      trackMuted: true,
      liveRms: 0,
      peakLevel: 0,
      processingEngine: 'None',
    }));
  }, []);

  // Animation frame loop for real-time waveform visualizer
  const startVisualizerLoop = (analyser: AnalyserNode) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(dataArray);
      setFrequencyData(new Uint8Array(dataArray.slice(0, 32)));

      // Compute simple visual energy
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

  // Toggle live audible monitoring (hear yourself in headphones/speakers)
  const toggleAudioMonitoring = useCallback((forceVal?: boolean) => {
    setIsMonitoring((prev) => {
      const next = typeof forceVal === 'boolean' ? forceVal : !prev;
      isMonitoringRef.current = next;
      if (monitorGainRef.current && audioContextRef.current) {
        monitorGainRef.current.gain.setValueAtTime(
          next ? 1.0 : 0.0,
          audioContextRef.current.currentTime
        );
      }
      return next;
    });
  }, []);

  // Setup Web Audio graph with AudioWorklet and persistent references
  const setupAudioGraph = async (sources: MediaStream[]) => {
    // Clean up any previously orphaned audio contexts
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        await audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioContextRef.current = ctx;

    // Await resume to satisfy browser autoplay requirements
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err: any) {
        console.warn('AudioContext.resume() note:', err);
      }
    }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyserRef.current = analyser;

    // Monitor Gain node for Hear Yourself feature (0 by default to prevent speaker feedback)
    const monitorGain = ctx.createGain();
    monitorGain.gain.setValueAtTime(isMonitoringRef.current ? 1.0 : 0.0, ctx.currentTime);
    monitorGainRef.current = monitorGain;
    analyser.connect(monitorGain);
    monitorGain.connect(ctx.destination);

    const destination = ctx.createMediaStreamDestination();
    sourceNodesRef.current = [];

    // Connect all input streams directly (WITHOUT creating temporary MediaStream wrappers)
    sources.forEach((stream) => {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const sourceNode = ctx.createMediaStreamSource(stream);
        // CRITICAL: Hold permanent reference so V8 cannot garbage-collect the node
        sourceNodesRef.current.push(sourceNode);
        sourceNode.connect(analyser);
        sourceNode.connect(destination);

        const track = audioTracks[0];
        setDiagnostics((prev) => ({
          ...prev,
          trackReadyState: track.readyState,
          trackEnabled: track.enabled,
          trackMuted: track.muted,
          audioContextState: ctx.state,
          audioContextSampleRate: ctx.sampleRate,
        }));
      }
    });

    combinedStreamRef.current = destination.stream;

    // Attempt to load AudioWorklet (Modern & Immune to background throttling)
    let workletLoaded = false;
    if (ctx.audioWorklet) {
      try {
        const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        const workletNode = new AudioWorkletNode(ctx, 'pcm-capture-processor');
        workletNodeRef.current = workletNode;
        analyser.connect(workletNode);

        workletNode.port.onmessage = (event) => {
          const { audioData, rms, peak, sampleCount } = event.data;
          sampleCountRef.current += sampleCount;

          setDiagnostics((prev) => ({
            ...prev,
            liveRms: Math.round(rms * 10000) / 10000,
            peakLevel: Math.round(peak * 1000) / 1000,
            capturedSampleCount: sampleCountRef.current,
            processingEngine: 'AudioWorklet',
            audioContextState: ctx.state,
          }));

          // Send downsampled 16kHz PCM if actively recording
          if (isRecordingRef.current) {
            const pcm16k = downsampleTo16k(audioData, ctx.sampleRate);
            onAudioDataRef.current?.(pcm16k, rms);
          }
        };

        workletLoaded = true;
      } catch (err: any) {
        console.warn('AudioWorklet initialization fallback to ScriptProcessor:', err);
      }
    }

    // Fallback to ScriptProcessorNode if AudioWorklet unavailable
    if (!workletLoaded) {
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      scriptProcessorRef.current = processor;
      analyser.connect(processor);
      processor.connect(ctx.destination);

      processor.onaudioprocess = (e) => {
        // Zero output buffer to prevent speaker feedback while keeping node active in Chromium
        const out = e.outputBuffer.getChannelData(0);
        out.fill(0);

        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < inputData.length; i++) {
          const abs = Math.abs(inputData[i]);
          if (abs > peak) peak = abs;
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        sampleCountRef.current += inputData.length;

        setDiagnostics((prev) => ({
          ...prev,
          liveRms: Math.round(rms * 10000) / 10000,
          peakLevel: Math.round(peak * 1000) / 1000,
          capturedSampleCount: sampleCountRef.current,
          processingEngine: 'ScriptProcessor',
          audioContextState: ctx.state,
        }));

        if (isRecordingRef.current) {
          const pcm16k = downsampleTo16k(inputData, ctx.sampleRate);
          onAudioDataRef.current?.(pcm16k, rms);
        }
      };
    }

    startVisualizerLoop(analyser);
  };

  // Helper to acquire microphone with robust fallback
  const acquireMicrophone = async (): Promise<MediaStream> => {
    const audioConstraints: any = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (selectedDeviceId) {
      audioConstraints.deviceId = { exact: selectedDeviceId };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      refreshAudioDevices();
      setDiagnostics((prev) => ({
        ...prev,
        permissionStatus: 'granted',
        selectedDeviceId: selectedDeviceId || stream.getAudioTracks()[0]?.getSettings()?.deviceId || 'default',
        lastError: null,
      }));
      return stream;
    } catch {
      // Fallback to simple audio constraints if advanced DSP fails on user's sound card
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      });
      refreshAudioDevices();
      setDiagnostics((prev) => ({
        ...prev,
        permissionStatus: 'granted',
        selectedDeviceId: selectedDeviceId || 'default',
        lastError: null,
      }));
      return stream;
    }
  };

  // Start live audio preview (test microphone before starting session)
  const startAudioPreview = useCallback(
    async (mode: CaptureMode = captureMode) => {
      setErrorMessage(null);
      sampleCountRef.current = 0;
      try {
        cleanupAudioPipeline();
        const activeStreams: MediaStream[] = [];

        if (mode === 'mic' || mode === 'dual') {
          const micStream = await acquireMicrophone();
          micStreamRef.current = micStream;
          activeStreams.push(micStream);
        }

        if (mode === 'tab' || mode === 'dual') {
          const tabStream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: 'browser' },
            audio: true,
          });
          tabStreamRef.current = tabStream;
          activeStreams.push(tabStream);
        }

        await setupAudioGraph(activeStreams);
        setIsPreviewActive(true);
        return true;
      } catch (err: any) {
        const msg = `Audio Preview Error: ${err.message || 'Permission denied'}`;
        setErrorMessage(msg);
        setDiagnostics((prev) => ({ ...prev, lastError: msg }));
        onError?.(msg);
        setIsPreviewActive(false);
        return false;
      }
    },
    [captureMode, cleanupAudioPipeline, onError]
  );

  // Independent 5-second Microphone Capture Test (Step 3)
  const recordTestClip = useCallback(async () => {
    setTestClipUrl(null);
    let stream = micStreamRef.current;
    if (!stream) {
      try {
        stream = await acquireMicrophone();
        micStreamRef.current = stream;
      } catch (err: any) {
        const msg = `Cannot access microphone for test: ${err.message}`;
        setErrorMessage(msg);
        setDiagnostics((prev) => ({ ...prev, lastError: msg }));
        return;
      }
    }

    try {
      setIsRecordingTestClip(true);
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setTestClipUrl(url);
        setIsRecordingTestClip(false);
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 5000);
    } catch (err: any) {
      console.warn('Failed to record independent test clip:', err);
      setDiagnostics((prev) => ({ ...prev, lastError: err.message }));
      setIsRecordingTestClip(false);
    }
  }, []);

  // Start recording
  const startRecording = useCallback(
    async (mode: CaptureMode = captureMode) => {
      setErrorMessage(null);
      setRecordingState('REQUESTING_PERMISSION');
      setCaptureMode(mode);
      sampleCountRef.current = 0;

      try {
        const activeStreams: MediaStream[] = [];

        // Mode A or Mode C: Request Microphone
        if (mode === 'mic' || mode === 'dual') {
          try {
            const micStream = await acquireMicrophone();
            micStreamRef.current = micStream;
            activeStreams.push(micStream);
          } catch (err: any) {
            const msg = `Microphone permission denied: ${err.message || 'Access blocked'}`;
            setErrorMessage(msg);
            setDiagnostics((prev) => ({ ...prev, permissionStatus: 'denied', lastError: msg }));
            onError?.(msg);
            setRecordingState('IDLE');
            cleanupAudioPipeline();
            return false;
          }
        }

        // Mode B or Mode C: Request Tab / Computer Audio
        if (mode === 'tab' || mode === 'dual') {
          try {
            const tabStream = await navigator.mediaDevices.getDisplayMedia({
              video: { displaySurface: 'browser' },
              audio: true,
            });

            tabStreamRef.current = tabStream;

            const tabAudioTracks = tabStream.getAudioTracks();
            if (tabAudioTracks.length === 0) {
              setIsTabAudioAvailable(false);
              const warningMsg =
                'Notice: No audio track was found on the shared screen/tab. Did you check "Share tab audio" in the browser prompt?';
              if (mode === 'tab') {
                setErrorMessage(warningMsg);
                setDiagnostics((prev) => ({ ...prev, lastError: warningMsg }));
                onError?.(warningMsg);
                cleanupAudioPipeline();
                setRecordingState('IDLE');
                return false;
              }
            } else {
              setIsTabAudioAvailable(true);
            }

            tabStream.getVideoTracks().forEach((track) => {
              track.onended = () => {
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
              setDiagnostics((prev) => ({ ...prev, lastError: msg }));
              onError?.(msg);
              setRecordingState('IDLE');
              cleanupAudioPipeline();
              return false;
            }
          }
        }

        if (activeStreams.length === 0) {
          throw new Error('No audio sources could be established.');
        }

        await setupAudioGraph(activeStreams);
        setRecordingState('RECORDING');
        setIsPreviewActive(false);
        return true;
      } catch (err: any) {
        const msg = err.message || 'Failed to initialize audio capture.';
        setErrorMessage(msg);
        setDiagnostics((prev) => ({ ...prev, lastError: msg }));
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
    setDiagnostics((prev) => ({ ...prev, audioContextState: 'suspended' }));
  }, []);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    setRecordingState('RECORDING');
    setDiagnostics((prev) => ({ ...prev, audioContextState: 'running' }));
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
    isMonitoring,
    isPreviewActive,
    testClipUrl,
    isRecordingTestClip,
    audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    diagnostics,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetToIdle,
    setCaptureMode,
    toggleAudioMonitoring,
    startAudioPreview,
    recordTestClip,
  };
}
