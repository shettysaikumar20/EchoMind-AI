import { useState, useRef, useEffect, useCallback } from 'react';
import { TranscriptSegment, CaptureMode } from '../types';
import { api, getWebSocketUrl } from '../services/api';

export interface NetworkDiagnostics {
  wsState: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
  wsUrl: string;
  bytesTransmitted: number;
  bytesReceivedByBackend: number;
  backendRms: number;
  lastTranscription: string;
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
    lastTranscription: '',
    lastError: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const segmentStartTimeRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(sessionId);
  const isRecordingRef = useRef<boolean>(isRecording);
  const onNewFinalSegmentRef = useRef(onNewFinalSegment);
  const pendingChunksRef = useRef<ArrayBuffer[]>([]);
  const bytesTransmittedRef = useRef<number>(0);

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
  useEffect(() => {
    if (!sessionId) {
      if (wsRef.current) {
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

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setNetworkDiagnostics((prev) => ({
        ...prev,
        wsState: 'OPEN',
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
      setNetworkDiagnostics((prev) => ({
        ...prev,
        wsState: 'CLOSED',
        lastError: event.reason || (event.wasClean ? null : 'WebSocket connection closed unexpectedly'),
      }));
    };

    ws.onerror = (err) => {
      setNetworkDiagnostics((prev) => ({
        ...prev,
        lastError: 'WebSocket network error. Check backend server on port 8000.',
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'transcript_saved') {
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
            lastTranscription: data.text || prev.lastTranscription,
          }));
          onNewFinalSegmentRef.current?.(newSeg);
        } else if (data.type === 'audio_telemetry') {
          setNetworkDiagnostics((prev) => ({
            ...prev,
            backendRms: data.rms ?? 0,
            bytesReceivedByBackend: data.bytes_received ?? prev.bytesReceivedByBackend,
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

    return () => {
      ws.close();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [sessionId]);

  // Setup Web Speech API continuous recognition (client-side speech assist)
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const finalText = transcriptPart.trim();
          const targetSessionId = sessionIdRef.current;
          if (finalText && targetSessionId) {
            const start = segmentStartTimeRef.current;
            const end = start + 2.5;
            segmentStartTimeRef.current = end;

            const tempId = `seg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const segmentPayload: TranscriptSegment = {
              id: tempId,
              session_id: targetSessionId,
              source: captureMode === 'dual' ? 'combined' : captureMode,
              text: finalText,
              is_final: true,
              start_time: start,
              end_time: end,
              created_at: new Date().toISOString(),
            };

            setTranscripts((prev) => {
              if (prev.some((p) => p.text.trim().toLowerCase() === finalText.toLowerCase())) {
                return prev;
              }
              return [...prev, segmentPayload];
            });
            onNewFinalSegmentRef.current?.(segmentPayload);

            setNetworkDiagnostics((prev) => ({
              ...prev,
              lastTranscription: finalText,
            }));

            // Persist to backend via WebSocket or REST
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  type: 'transcript_segment',
                  ...segmentPayload,
                })
              );
            } else {
              api.appendTranscript(targetSessionId, segmentPayload).then((saved) => {
                setTranscripts((prev) =>
                  prev.map((s) => (s.id === tempId ? saved : s))
                );
              }).catch(console.warn);
            }
          }
        } else {
          currentInterim += transcriptPart;
        }
      }

      setInterimText(currentInterim);
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('Speech recognition status:', event.error);
      }
    };

    recognition.onend = () => {
      if (isRecordingRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {}
      }
    };

    recognitionRef.current = recognition;

    if (isRecordingRef.current) {
      try {
        recognition.start();
      } catch {}
    }

    return () => {
      try {
        recognition.stop();
      } catch {}
      recognitionRef.current = null;
    };
  }, [captureMode]);

  // Start / Stop speech recognition based on isRecording
  useEffect(() => {
    if (!recognitionRef.current) return;

    if (isRecording) {
      try {
        recognitionRef.current.start();
      } catch {}
    } else {
      try {
        recognitionRef.current.stop();
      } catch {}
      setInterimText('');
    }
  }, [isRecording]);

  // Manual correction of transcript segment
  const updateSegmentText = useCallback((id: string, newText: string) => {
    setTranscripts((prev) =>
      prev.map((seg) => (seg.id === id ? { ...seg, text: newText } : seg))
    );
  }, []);

  // Send audio chunk to backend via WebSocket for real faster-whisper STT
  const sendAudioChunk = useCallback((buffer: ArrayBuffer) => {
    bytesTransmittedRef.current += buffer.byteLength;
    setNetworkDiagnostics((prev) => ({
      ...prev,
      bytesTransmitted: bytesTransmittedRef.current,
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
