import { getSupabase } from '../utils/supabase';
import {
  ApiResponse,
  TranscriptionResponse,
  VisionResponse,
  UploadResponse,
  ChatStreamData,
  RAGSearchResponse
} from '../types/api';

export class ApiService {
  private supabase = getSupabase();

  async transcribeAudio(
    audioData: string,
    model: string = 'minimax',
    conversationId?: string
  ): Promise<ApiResponse<TranscriptionResponse>> {
    const { data, error } = await this.supabase.functions.invoke('transcribe', {
      body: {
        audioData,
        model,
        conversationId
      }
    });

    if (error) {
      return { error: { code: 'TRANSCRIPTION_ERROR', message: error.message } };
    }

    return { data };
  }

  async analyzeImage(
    imageData: string,
    model: string = 'auto',
    prompt: string = 'Describe esta imagen en detalle',
    conversationId?: string
  ): Promise<ApiResponse<VisionResponse>> {
    const { data, error } = await this.supabase.functions.invoke('vision', {
      body: {
        imageData,
        model,
        prompt,
        conversationId
      }
    });

    if (error) {
      return { error: { code: 'VISION_ERROR', message: error.message } };
    }

    return { data };
  }

  async uploadFile(
    fileName: string,
    fileType: string,
    fileSize: number,
    conversationId?: string
  ): Promise<ApiResponse<UploadResponse>> {
    const { data, error } = await this.supabase.functions.invoke('upload', {
      body: {
        fileName,
        fileType,
        fileSize,
        conversationId
      }
    });

    if (error) {
      return { error: { code: 'UPLOAD_ERROR', message: error.message } };
    }

    return { data };
  }

  async searchRAG(
    query: string,
    topK: number = 5,
    conversationId?: string
  ): Promise<ApiResponse<RAGSearchResponse>> {
    const { data, error } = await this.supabase.functions.invoke('rag-search', {
      body: {
        query,
        topK,
        conversationId
      }
    });

    if (error) {
      return { error: { code: 'RAG_SEARCH_ERROR', message: error.message } };
    }

    return { data };
  }

  createChatStream(
    conversationId: string,
    message: string,
    model: string = 'auto',
    attachments: any[] = []
  ): EventSource {
    const payload = {
      conversationId,
      message,
      model,
      attachments
    };

    // Crear URL para EventSource
    const url = `${this.supabase.supabaseUrl}/functions/v1/chat`;
    
    const eventSource = new EventSource(url, {
      headers: {
        'Authorization': `Bearer ${this.supabase.supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    // Enviar payload inicial
    fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.supabase.supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).catch(error => {
      console.error('Error starting chat stream:', error);
    });

    return eventSource;
  }

  async getConversations(limit: number = 10) {
    const { data, error } = await this.supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async getMessages(conversationId: string, limit: number = 50) {
    const { data, error } = await this.supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async createConversation(title: string = 'Nueva Conversación') {
    const { data, error } = await this.supabase
      .from('conversations')
      .insert({
        title,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async saveMessage(
    conversationId: string,
    content: string,
    sender: string = 'user',
    type: string = 'text',
    metadata: any = {}
  ) {
    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender,
        content,
        type,
        metadata,
        status: 'sent'
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
}