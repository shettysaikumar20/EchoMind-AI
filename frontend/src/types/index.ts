export type CaptureMode = 'mic' | 'tab' | 'dual';

export type RecordingState = 
  | 'IDLE'
  | 'REQUESTING_PERMISSION'
  | 'RECORDING'
  | 'PAUSED'
  | 'STOPPED';

export interface TranscriptSegment {
  id: string;
  session_id: string;
  source: 'mic' | 'tab' | 'combined' | 'user';
  text: string;
  is_final: boolean;
  start_time: number;
  end_time: number;
  created_at: string;
}

export interface AIAnswer {
  id: string;
  session_id: string;
  question_id?: string;
  provider: string;
  model: string;
  answer_text: string;
  latency_ms: number;
  token_count?: number;
  created_at: string;
}

export interface DetectedQuestion {
  id: string;
  session_id: string;
  question_text: string;
  context_snippet?: string;
  question_index: number;
  detected_at: string;
  answers: AIAnswer[];
}

export interface Session {
  id: string;
  user_id: string;
  title: string;
  capture_mode: CaptureMode;
  status: 'idle' | 'recording' | 'paused' | 'stopped';
  duration_seconds: number;
  summary?: string;
  created_at: string;
  updated_at: string;
  question_count: number;
  answer_count: number;
  transcripts?: TranscriptSegment[];
  questions?: DetectedQuestion[];
}

export interface UserSettings {
  ai_provider: string;
  ai_model: string;
  has_backboard_key: boolean;
  has_openrouter_key: boolean;
  answer_length: 'concise' | 'detailed' | 'bullet_points';
  stt_mode: string;
  retention_days: number;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
  is_open_weight: boolean;
  context_length: number;
  recommended: boolean;
}

export interface ProvidersResponse {
  providers: string[];
  default_provider: string;
  models: ModelOption[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  created_at: string;
}
