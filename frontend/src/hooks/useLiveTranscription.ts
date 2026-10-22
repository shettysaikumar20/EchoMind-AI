import { useState, useRef, useEffect, useCallback } from 'react';
import { TranscriptSegment, CaptureMode } from '../types';
import { api, getWebSocketUrl } from '../services/api';

export interface NetworkDiagnostics {
  wsState: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
  wsUrl: string;
  bytesTransmitted: number;
  bytesReceivedByBackend: number;
  backendRms: number;
  bufferSeconds: number;
  sttProvider: 'elevenlabs' | 'whisper';
  sttReady: boolean;
  whisperReady: boolean;
  speechDetected: boolean;
  attemptCount: number;
  successCount: number;
  partialTranscription: string;
  lastTranscription: string;
  reconnectAttempts: number;
  lastError: string | null;
}

interface UseLiveTranscriptionProps {
  sessionId: string | null;
  captureMode: CaptureMode;
  isRecording: boolean;
  onNewFinalSegment?: (segment: TranscriptSegment) => void;
}

export function useLiveTranscription({
  sessionId,
  captureMode,
  isRecording,
  onNewFinalSegment,
}: UseLiveTranscriptionProps) {
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [networkDiagnostics, setNetworkDiagnostics] = useState<NetworkDiagnostics>({
    wsState: 'CLOSED',
    wsUrl: '',
    bytesTransmitted: 0,
    bytesReceivedByBackend: 0,
    backendRms: 0,
    bufferSeconds: 0,
    sttProvider: 'elevenlabs',
    sttReady: false,
    whisperReady: false,
    speechDetected: false,
    attemptCount: 0,
    successCount: 0,
    partialTranscription: '',
    lastTranscription: '',
    reconnectAttempts: 0,
    lastError: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(sessionId);
  const isRecordingRef = useRef<boolean>(isRecording);
  const onNewFinalSegmentRef = useRef(onNewFinalSegment);
  const pendingChunksRef = useRef<ArrayBuffer[]>([]);
  const bytesTransmittedRef = useRef<number>(0);
  const isIntentionalCloseRef = useRef<boolean>(false);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimerRef = useRef<any>(null);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    onNewFinalSegmentRef.current = onNewFinalSegment;
  }, [onNewFinalSegment]);

  // Connect WebSocket when sessionId is valid
  const connectWebSocket = useCallback(() => {
    if (!sessionId) {
      if (wsRef.current) {
        isIntentionalCloseRef.current = true;
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      setNetworkDiagnostics((prev) => ({ ...prev, wsState: 'CLOSED' }));
      return;
    }

    const wsUrl = getWebSocketUrl(sessionId);

    setNetworkDiagnostics((prev) => ({
      ...prev,
      wsUrl,
      wsState: 'CONNECTING',
      lastError: null,
    }));

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        setNetworkDiagnostics((prev) => ({
          ...prev,
          wsState: 'OPEN',
          reconnectAttempts: 0,
          lastError: null,
        }));

        // Flush any queued audio chunks
        while (pendingChunksRef.current.length > 0) {
          const chunk = pendingChunksRef.current.shift();
          if (chunk && ws.readyState === WebSocket.OPEN) {
            ws.send(chunk);
          }
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        const wasIntentional = isIntentionalCloseRef.current;

        setNetworkDiagnostics((prev) => ({
          ...prev,
          wsState: 'CLOSED',
          lastError: wasIntentional
            ? null
            : (event.reason || (event.wasClean ? null : 'STT connection closed unexpectedly')),
        }));

        // Safe auto-reconnect if closure was unexpected while actively recording
        if (!wasIntentional && isRecordingRef.current && sessionIdRef.current) {
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 5000);
            reconnectAttemptsRef.current += 1;
            setNetworkDiagnostics((prev) => ({
              ...prev,
              reconnectAttempts: reconnectAttemptsRef.current,
              lastError: `Reconnecting to STT stream (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`,
            }));

            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = setTimeout(() => {
              if (isRecordingRef.current && sessionIdRef.current) {
                connectWebSocket();
              }
            }, delay);
          } else {
            setNetworkDiagnostics((prev) => ({
              ...prev,
              lastError: 'STT connection lost after maximum retry attempts. Click Resume to retry.',
            }));
          }
        }
      };

      ws.onerror = () => {
        setNetworkDiagnostics((prev) => ({
          ...prev,
          lastError: 'STT network error. Backend connection refused or unavailable.',
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'partial_transcript') {
            const text = data.text || '';
            setInterimText(text);
            setNetworkDiagnostics((prev) => ({
              ...prev,
              partialTranscription: text,
            }));
          } else if (data.type === 'transcript_saved') {
            const newSeg: TranscriptSegment = {
              id: data.id,
              session_id: sessionId,
              source: data.source,
              text: data.text,
              is_final: data.is_final,
              start_time: data.start_time,
              end_time: data.end_time,
              created_at: data.created_at,
            };

            setInterimText('');
            setTranscripts((prev) => {
              if (prev.some((p) => p.id === newSeg.id)) return prev;
              const last = prev[prev.length - 1];
              if (last && last.text.trim().toLowerCase() === newSeg.text.trim().toLowerCase()) {
                return prev;
              }
              return [...prev, newSeg];
            });

            setNetworkDiagnostics((prev) => ({
              ...prev,
              partialTranscription: '',
              lastTranscription: data.text || prev.lastTranscription,
              successCount: prev.successCount + 1,
            }));

            onNewFinalSegmentRef.current?.(newSeg);
          } else if (data.type === 'audio_telemetry') {
            setNetworkDiagnostics((prev) => ({
              ...prev,
              backendRms: data.rms ?? 0,
              bytesReceivedByBackend: data.bytes_received ?? prev.bytesReceivedByBackend,
              bufferSeconds: data.buffer_seconds ?? prev.bufferSeconds,
              sttProvider: data.provider || prev.sttProvider,
              sttReady: typeof data.stt_ready === 'boolean' ? data.stt_ready : prev.sttReady,
              whisperReady: typeof data.whisper_ready === 'boolean' ? data.whisper_ready : prev.whisperReady,
              speechDetected: typeof data.speech_detected === 'boolean' ? data.speech_detected : prev.speechDetected,
              attemptCount: data.attempt_count ?? prev.attemptCount,
              successCount: data.success_count ?? prev.successCount,
              lastTranscription: data.last_transcription || prev.lastTranscription,
            }));
          } else if (data.type === 'connection_established') {
            setNetworkDiagnostics((prev) => ({
              ...prev,
              sttProvider: data.provider || prev.sttProvider,
              sttReady: typeof data.stt_ready === 'boolean' ? data.stt_ready : prev.sttReady,
              whisperReady: typeof data.whisper_ready === 'boolean' ? data.whisper_ready : prev.whisperReady,
              lastError: data.error || null,
            }));
          } else if (data.type === 'error') {
            setNetworkDiagnostics((prev) => ({
              ...prev,
              lastError: data.message || 'Backend transcription error',
            }));
          }
        } catch (e: any) {
          console.warn('Error parsing WS message:', e);
        }
      };
    } catch (err: any) {
      setNetworkDiagnostics((prev) => ({
        ...prev,
        lastError: `Failed to open STT WebSocket: ${err.message}`,
      }));
    }
  }, [sessionId]);

  useEffect(() => {
    isIntentionalCloseRef.current = false;
    connectWebSocket();

    return () => {
      isIntentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId, connectWebSocket]);

  // Manual correction of transcript segment
  const updateSegmentText = useCallback((id: string, newText: string) => {
    setTranscripts((prev) =>
      prev.map((seg) => (seg.id === id ? { ...seg, text: newText } : seg))
    );
  }, []);

  // Send audio chunk to backend via WebSocket for ElevenLabs Scribe STT
  const sendAudioChunk = useCallback((buffer: ArrayBuffer) => {
    bytesTransmittedRef.current += buffer.byteLength;
    setNetworkDiagnostics((prev) => ({
      ...prev,
      bytesTransmitted: bytesTransmittedRef.current,
      attemptCount: prev.attemptCount + 1,
    }));

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(buffer);
      } catch (e: any) {
        setNetworkDiagnostics((prev) => ({ ...prev, lastError: e.message }));
      }
    } else if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      if (pendingChunksRef.current.length < 50) {
        pendingChunksRef.current.push(buffer);
      }
    }
  }, []);

  const flushAudio = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'flush' }));
      } catch (e: any) {
        setNetworkDiagnostics((prev) => ({ ...prev, lastError: e.message }));
      }
    }
  }, []);

  // Filtered transcripts by search query
  const filteredTranscripts = transcripts.filter((t) =>
    t.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return {
    transcripts: filteredTranscripts,
    allTranscripts: transcripts,
    interimText,
    isConnected,
    searchQuery,
    setSearchQuery,
    setTranscripts,
    updateSegmentText,
    sendAudioChunk,
    flushAudio,
    networkDiagnostics,
  };
}
