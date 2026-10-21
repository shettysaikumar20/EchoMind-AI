import { Session, UserSettings, ProvidersResponse, User, TranscriptSegment, DetectedQuestion, CaptureMode } from '../types';

const API_BASE = '/api';

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

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = 'An unexpected error occurred';
    try {
      const err = await response.json();
      errorDetail = err.detail || JSON.stringify(err);
    } catch {
      errorDetail = response.statusText;
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  // --- Sessions ---
  async createSession(title?: string, capture_mode: CaptureMode = 'mic'): Promise<Session> {
    return request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ title, capture_mode }),
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

  async continueSession(sessionId: string): Promise<Session> {
    return request<Session>(`/sessions/${sessionId}/continue`, {
      method: 'POST',
    });
  },

  async exportSession(sessionId: string, format: 'markdown' | 'json' = 'markdown'): Promise<Blob> {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/sessions/${sessionId}/export?format=${format}`, {
      headers,
    });
    if (!res.ok) throw new Error('Failed to export session');
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
      const response = await fetch(`${API_BASE}/sessions/${sessionId}/answers?stream=true`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session_id: sessionId,
          ...payload,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
