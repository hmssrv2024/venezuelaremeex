export interface ChatConfig {
  supabaseUrl: string;
  supabaseKey: string;
  defaultModel?: 'auto' | 'minimax' | 'gemini' | 'hybrid';
  theme?: 'light' | 'dark';
  language?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  welcomeMessage?: string;
  maxFileSize?: number; // MB
  enabledFeatures?: {
    text?: boolean;
    audio?: boolean;
    image?: boolean;
    files?: boolean;
    rag?: boolean;
  };
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  sender: 'user' | 'bot' | 'admin' | 'system';
  content: string;
  type: 'text' | 'image' | 'audio' | 'file' | 'system';
  timestamp: Date;
  status: 'pending' | 'sent' | 'error';
  metadata?: any;
  attachments?: ChatAttachment[];
}

export interface ChatAttachment {
  id: string;
  type: 'image' | 'audio' | 'file';
  url: string;
  name: string;
  size: number;
  mimeType: string;
  metadata?: any;
}

export interface ChatState {
  isOpen: boolean;
  isConnected: boolean;
  isTyping: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  isThinking: boolean;
  currentModel: string;
  error?: string;
}

export interface ConversationInfo {
  id: string;
  title: string;
  status: 'active' | 'closed' | 'archived';
  botPaused: boolean;
  lastActivity: Date;
  messageCount: number;
}