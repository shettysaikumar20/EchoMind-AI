import { useState, useRef, useEffect, useCallback } from 'react';
import { TranscriptSegment, CaptureMode } from '../types';
import { api } from '../services/api';

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

  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const segmentStartTimeRef = useRef<number>(0);
  const timerRef = useRef<number>(0);

  // Initialize or connect WebSocket
  useEffect(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/sessions/${sessionId}/transcribe`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected for transcription session:', sessionId);
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
    };

    ws.onerror = (err) => {
      console.warn('WebSocket error:', err);
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
            // Avoid duplicate by ID
            if (prev.some((p) => p.id === newSeg.id)) return prev;
            return [...prev, newSeg];
          });
          onNewFinalSegment?.(newSeg);
        }
      } catch (e) {
        console.warn('Error parsing WS message:', e);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId, onNewFinalSegment]);

  // Setup Web Speech API continuous recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.info('Web Speech API is not supported in this browser. Falling back to server-side audio ingestion.');
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
          if (finalText && sessionId) {
            const start = segmentStartTimeRef.current;
            const end = start + 2.5;
            segmentStartTimeRef.current = end;

            const segmentPayload = {
              source: captureMode === 'dual' ? 'combined' : captureMode,
              text: finalText,
              is_final: true,
              start_time: start,
              end_time: end,
            };

            // Send via WebSocket if connected
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  type: 'transcript_segment',
                  ...segmentPayload,
                })
              );
            } else {
              // Fallback to REST API
              api.appendTranscript(sessionId, segmentPayload).then((saved) => {
                setTranscripts((prev) => [...prev, saved]);
                onNewFinalSegment?.(saved);
              });
            }
          }
        } else {
          currentInterim += transcriptPart;
        }
      }

      setInterimText(currentInterim);
    };

    recognition.onerror = (event: any) => {
      // Ignore 'no-speech' or 'aborted' normal events
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('Speech recognition error:', event.error);
      }
    };

    recognition.onend = () => {
      // Auto-restart if we are still actively recording
      if (isRecording && recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          // already started
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
      recognitionRef.current = null;
    };
  }, [sessionId, captureMode, isRecording, onNewFinalSegment]);

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
  };
}
