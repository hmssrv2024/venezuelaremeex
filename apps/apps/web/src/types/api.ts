export interface ApiResponse<T = any> {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface TranscriptionResponse {
  text: string;
  duration?: number;
  model_used: string;
  latency_ms: number;
}

export interface VisionResponse {
  analysis: string;
  labels: string[];
  model_used: string;
  latency_ms: number;
}

export interface UploadResponse {
  uploadUrl: string;
  publicUrl: string;
  storagePath: string;
  fileName: string;
  expiresIn: number;
}

export interface ChatStreamData {
  delta?: string;
  done?: boolean;
  messageId?: string;
  error?: string;
}

export interface RAGSearchResponse {
  query: string;
  results: RAGResult[];
  total_found: number;
  latency_ms: number;
  search_type: 'semantic' | 'text';
}

export interface RAGResult {
  id: string;
  title: string;
  fragment: string;
  similarity: number;
  metadata: any;
  rank: number;
}