import { Session, UserSettings, ProvidersResponse, User, TranscriptSegment, DetectedQuestion, CaptureMode } from '../types';

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    const trimmed = envUrl.trim().replace(/\/+$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }

  // In production on Render static site, connect to the production backend
  if (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com')) {
    return 'https://echomind-ai-backend-d20k.onrender.com/api';
  }

  // Local development fallback: proxied by Vite to http://127.0.0.1:8000
  return '/api';
}

export function getWebSocketUrl(sessionId: string): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    const raw = envUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    const wsProto = raw.startsWith('https:') ? 'wss:' : 'ws:';
    const hostPart = raw.replace(/^https?:\/\//, '');
    return `${wsProto}//${hostPart}/ws/sessions/${sessionId}/transcribe`;
  }

  if (typeof window !== 'undefined') {
    if (window.location.hostname.includes('onrender.com')) {
      return `wss://echomind-ai-backend-d20k.onrender.com/ws/sessions/${sessionId}/transcribe`;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (window.location.port === '5173') {
      return `${protocol}//${window.location.hostname}:8000/ws/sessions/${sessionId}/transcribe`;
    }
    return `${protocol}//${window.location.host}/ws/sessions/${sessionId}/transcribe`;
  }

  return `ws://127.0.0.1:8000/ws/sessions/${sessionId}/transcribe`;
}

export function getAuthToken(): string | null {
  return localStorage.getItem('echomind_token');
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem('echomind_token', token);
  } else {
    localStorage.removeItem('echomind_token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const base = getApiBaseUrl();
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${base}${path}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const responseText = await response.text();

  if (!response.ok) {
    let errorDetail = `Request failed (HTTP ${response.status})`;
    if (responseText) {
      try {
        const err = JSON.parse(responseText);
        errorDetail = err.detail || (typeof err === 'string' ? err : JSON.stringify(err));
      } catch {
        // Non-JSON response (e.g. HTML proxy errors)
        errorDetail = responseText.length > 200 ? response.statusText || errorDetail : responseText;
      }
    } else if (response.statusText) {
      errorDetail = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204 || !responseText || responseText.trim() === '') {
    return {} as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(`Invalid JSON response from server (${url}): ${responseText.slice(0, 100)}`);
  }
}

export const api = {
  // --- Sessions ---
  async createSession(title?: string, capture_mode: CaptureMode = 'mic'): Promise<Session> {
    return request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        title: title || 'Live Conversation',
        capture_mode: capture_mode || 'mic',
      }),
    });
  },

  async listSessions(q?: string): Promise<Session[]> {
    const query = q ? `?q=${encodeURIComponent(q)}` : '';
    return request<Session[]>(`/sessions${query}`);
  },

  async getSession(id: string): Promise<Session> {
    return request<Session>(`/sessions/${id}`);
  },

  async updateSession(
    id: string,
    data: { title?: string; status?: string; duration_seconds?: number; summary?: string }
  ): Promise<Session> {
    return request<Session>(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteSession(id: string): Promise<void> {
    return request<void>(`/sessions/${id}`, {
      method: 'DELETE',
    });
  },

  async appendTranscript(
    sessionId: string,
    segment: { source: string; text: string; is_final: boolean; start_time: number; end_time: number }
  ): Promise<TranscriptSegment> {
    return request<TranscriptSegment>(`/sessions/${sessionId}/transcript`, {
      method: 'POST',
      body: JSON.stringify(segment),
    });
  },

  async detectQuestions(sessionId: string): Promise<{ questions: DetectedQuestion[]; processed_segment_count: number; message?: string }> {
    return request<{ questions: DetectedQuestion[]; processed_segment_count: number; message?: string }>(
      `/sessions/${sessionId}/questions/detect`,
      { method: 'POST' }
    );
  },

  async addQuestion(sessionId: string, payload: { question_text: string; context_snippet?: string }): Promise<DetectedQuestion> {
    return request<DetectedQuestion>(`/sessions/${sessionId}/questions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async continueSession(sessionId: string): Promise<Session> {
    return request<Session>(`/sessions/${sessionId}/continue`, {
      method: 'POST',
    });
  },

  async exportSession(sessionId: string, format: 'markdown' | 'json' = 'markdown'): Promise<Blob> {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = `${getApiBaseUrl()}/sessions/${sessionId}/export?format=${format}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(errText || `Failed to export session (HTTP ${res.status})`);
    }
    return res.blob();
  },

  // --- Answers Streaming ---
  async generateAnswerStream(
    sessionId: string,
    payload: {
      question_id?: string;
      question_text: string;
      context?: string;
      provider?: string;
      model?: string;
      answer_length?: string;
    },
    callbacks: {
      onToken: (token: string) => void;
      onComplete: (metadata: { answer_id?: string; latency_ms?: number }) => void;
      onError: (err: string) => void;
    }
  ): Promise<void> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const url = `${getApiBaseUrl()}/sessions/${sessionId}/answers?stream=true`;
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session_id: sessionId,
          ...payload,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(errText || `HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable response stream available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            if (data.type === 'token') {
              callbacks.onToken(data.content);
            } else if (data.type === 'done') {
              callbacks.onComplete({ answer_id: data.answer_id, latency_ms: data.latency_ms });
            } else if (data.type === 'error') {
              callbacks.onError(data.message);
            }
          } catch {
            // ignore non-json SSE lines
          }
        }
      }
    } catch (e: any) {
      callbacks.onError(e.message || 'Stream connection error');
    }
  },

  async streamAnswer(
    sessionId: string,
    payload: {
      session_id?: string;
      question_id?: string;
      question_text: string;
      context?: string;
      provider?: string;
      model?: string;
      answer_length?: string;
    },
    callbacks: {
      onToken: (token: string) => void;
      onComplete: (metadata: { answer_id?: string; latency_ms?: number }) => void;
      onError: (err: string) => void;
    }
  ): Promise<void> {
    return api.generateAnswerStream(sessionId, payload, callbacks);
  },

  // --- Settings ---
  async getSettings(): Promise<UserSettings> {
    return request<UserSettings>('/settings');
  },

  async updateSettings(settings: Partial<UserSettings> & { backboard_api_key?: string; openrouter_api_key?: string }): Promise<UserSettings> {
    return request<UserSettings>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  },

  async getProviders(): Promise<ProvidersResponse> {
    return request<ProvidersResponse>('/providers');
  },

  // --- Auth ---
  async login(email: string, password: string): Promise<{ access_token: string; user: User }> {
    return request<{ access_token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async register(email: string, password: string, name?: string): Promise<{ access_token: string; user: User }> {
    return request<{ access_token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  },

  async getMe(): Promise<User> {
    return request<User>('/auth/me');
  },
};
