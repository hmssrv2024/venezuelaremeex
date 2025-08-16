import { ChatConfig, ChatMessage, ChatState, ConversationInfo } from '../types/config';
import { initSupabase, ensureAuth } from '../utils/supabase';
import { ApiService } from '../services/ApiService';
import { AudioRecorder, blobToBase64 } from '../utils/audio';
import { validateFile, fileToBase64, resizeImage } from '../utils/file';
import { ChatUI } from './ChatUI';
import { RealtimeService } from '../services/RealtimeService';

export class ChatWidget {
  private config: ChatConfig;
  private ui: ChatUI;
  private apiService: ApiService;
  private realtimeService: RealtimeService;
  private audioRecorder: AudioRecorder;
  private state: ChatState;
  private currentConversation: ConversationInfo | null = null;
  private messages: ChatMessage[] = [];
  private userId: string | null = null;

  constructor(config: ChatConfig) {
    this.config = {
      defaultModel: 'auto',
      theme: 'light',
      language: 'es-ES',
      position: 'bottom-right',
      maxFileSize: 15,
      enabledFeatures: {
        text: true,
        audio: true,
        image: true,
        files: true,
        rag: true
      },
      ...config
    };

    this.state = {
      isOpen: false,
      isConnected: false,
      isTyping: false,
      isRecording: false,
      isTranscribing: false,
      isThinking: false,
      currentModel: this.config.defaultModel!
    };

    this.ui = new ChatUI(this.config, this.state);
    this.audioRecorder = new AudioRecorder();
  }

  async init(): Promise<void> {
    try {
      // Inicializar Supabase
      initSupabase(this.config);
      this.apiService = new ApiService();
      this.realtimeService = new RealtimeService();

      // Autenticar usuario
      this.userId = await ensureAuth();
      this.state.isConnected = true;

      // Crear UI
      this.ui.render();
      this.setupEventListeners();

      // Cargar conversación activa o crear nueva
      await this.loadOrCreateConversation();

      // Conectar a Realtime
      if (this.currentConversation) {
        await this.realtimeService.connect(this.currentConversation.id, {
          onTyping: this.handleTypingIndicator.bind(this),
          onPresence: this.handlePresenceChange.bind(this),
          onTakeover: this.handleTakeoverChange.bind(this)
        });
      }

      console.log('ChatWidget inicializado correctamente');
    } catch (error) {
      console.error('Error inicializando ChatWidget:', error);
      this.state.error = error.message;
      this.ui.showError(error.message);
    }
  }

  private setupEventListeners(): void {
    // Toggle widget
    this.ui.onToggle(() => {
      this.state.isOpen = !this.state.isOpen;
      this.ui.updateState(this.state);
    });

    // Enviar mensaje
    this.ui.onSendMessage(async (content: string) => {
      await this.sendMessage(content);
    });

    // Grabación de audio
    this.ui.onStartRecording(async () => {
      await this.startAudioRecording();
    });

    this.ui.onStopRecording(async () => {
      await this.stopAudioRecording();
    });

    // Subida de archivos
    this.ui.onFileUpload(async (files: FileList) => {
      await this.handleFileUpload(files);
    });

    // Cambio de modelo
    this.ui.onModelChange((model: string) => {
      this.state.currentModel = model;
      this.ui.updateState(this.state);
    });

    // Drag & Drop
    this.ui.onDragDrop(async (files: File[]) => {
      const fileList = {
        length: files.length,
        item: (index: number) => files[index],
        [Symbol.iterator]: function* () {
          for (let i = 0; i < this.length; i++) {
            yield this.item(i);
          }
        }
      } as FileList;
      
      await this.handleFileUpload(fileList);
    });
  }

  private async loadOrCreateConversation(): Promise<void> {
    try {
      // Buscar conversación activa
      const conversations = await this.apiService.getConversations(1);
      
      if (conversations.length > 0) {
        const conv = conversations[0];
        this.currentConversation = {
          id: conv.id,
          title: conv.title,
          status: conv.status,
          botPaused: conv.bot_paused,
          lastActivity: new Date(conv.updated_at),
          messageCount: 0
        };

        // Cargar mensajes
        await this.loadMessages();
      } else {
        // Crear nueva conversación
        await this.createNewConversation();
      }
    } catch (error) {
      console.error('Error cargando conversación:', error);
      await this.createNewConversation();
    }
  }

  private async createNewConversation(): Promise<void> {
    try {
      const conversation = await this.apiService.createConversation();
      
      this.currentConversation = {
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
        botPaused: conversation.bot_paused || false,
        lastActivity: new Date(conversation.created_at),
        messageCount: 0
      };

      // Mensaje de bienvenida
      if (this.config.welcomeMessage) {
        this.addMessage({
          id: 'welcome',
          conversationId: this.currentConversation.id,
          sender: 'bot',
          content: this.config.welcomeMessage,
          type: 'text',
          timestamp: new Date(),
          status: 'sent'
        });
      }
    } catch (error) {
      console.error('Error creando conversación:', error);
      throw error;
    }
  }

  private async loadMessages(): Promise<void> {
    if (!this.currentConversation) return;

    try {
      const messages = await this.apiService.getMessages(this.currentConversation.id);
      
      this.messages = messages.map(msg => ({
        id: msg.id,
        conversationId: msg.conversation_id,
        sender: msg.sender,
        content: msg.content,
        type: msg.type,
        timestamp: new Date(msg.created_at),
        status: msg.status,
        metadata: msg.metadata
      }));

      this.currentConversation.messageCount = this.messages.length;
      this.ui.displayMessages(this.messages);
    } catch (error) {
      console.error('Error cargando mensajes:', error);
    }
  }

  private async sendMessage(content: string, attachments: any[] = []): Promise<void> {
    if (!this.currentConversation || !content.trim()) return;

    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversationId: this.currentConversation.id,
      sender: 'user',
      content: content.trim(),
      type: 'text',
      timestamp: new Date(),
      status: 'pending',
      attachments
    };

    this.addMessage(userMessage);
    this.state.isThinking = true;
    this.ui.updateState(this.state);

    try {
      // Crear EventSource para streaming
      const eventSource = this.apiService.createChatStream(
        this.currentConversation.id,
        content,
        this.state.currentModel,
        attachments
      );

      let botMessageContent = '';
      let botMessageId = `bot-${Date.now()}`;
      
      const botMessage: ChatMessage = {
        id: botMessageId,
        conversationId: this.currentConversation.id,
        sender: 'bot',
        content: '',
        type: 'text',
        timestamp: new Date(),
        status: 'pending'
      };

      this.addMessage(botMessage);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.error) {
            console.error('Error en stream:', data.error);
            this.updateMessage(botMessageId, {
              content: 'Error: ' + data.error,
              status: 'error'
            });
            return;
          }

          if (data.delta) {
            botMessageContent += data.delta;
            this.updateMessage(botMessageId, {
              content: botMessageContent,
              status: 'pending'
            });
          }

          if (data.done) {
            this.updateMessage(botMessageId, {
              status: 'sent',
              id: data.messageId || botMessageId
            });
            eventSource.close();
          }
        } catch (error) {
          console.error('Error procesando stream:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('Error en EventSource:', error);
        this.updateMessage(botMessageId, {
          content: 'Error de conexión. Inténtalo de nuevo.',
          status: 'error'
        });
        eventSource.close();
      };

      // Marcar mensaje de usuario como enviado
      userMessage.status = 'sent';
      this.updateMessage(userMessage.id, { status: 'sent' });
      
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      userMessage.status = 'error';
      this.updateMessage(userMessage.id, { status: 'error' });
    } finally {
      this.state.isThinking = false;
      this.ui.updateState(this.state);
    }
  }

  private async startAudioRecording(): Promise<void> {
    try {
      this.state.isRecording = true;
      this.ui.updateState(this.state);
      
      await this.audioRecorder.startRecording();
    } catch (error) {
      console.error('Error iniciando grabación:', error);
      this.state.isRecording = false;
      this.ui.updateState(this.state);
      this.ui.showError('No se pudo acceder al micrófono');
    }
  }

  private async stopAudioRecording(): Promise<void> {
    try {
      this.state.isRecording = false;
      this.state.isTranscribing = true;
      this.ui.updateState(this.state);

      const audioBlob = await this.audioRecorder.stopRecording();
      const audioBase64 = await blobToBase64(audioBlob);

      // Transcribir audio
      const { data, error } = await this.apiService.transcribeAudio(
        audioBase64,
        this.state.currentModel,
        this.currentConversation?.id
      );

      if (error) {
        throw new Error(error.message);
      }

      if (data?.text) {
        // Enviar texto transcrito
        await this.sendMessage(data.text);
      }
    } catch (error) {
      console.error('Error procesando audio:', error);
      this.ui.showError('Error procesando el audio');
    } finally {
      this.state.isTranscribing = false;
      this.ui.updateState(this.state);
    }
  }

  private async handleFileUpload(files: FileList): Promise<void> {
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (!file) continue;

      const validation = validateFile(file, this.config.maxFileSize);
      if (!validation.valid) {
        this.ui.showError(validation.error!);
        continue;
      }

      try {
        await this.processFile(file);
      } catch (error) {
        console.error('Error procesando archivo:', error);
        this.ui.showError(`Error procesando ${file.name}`);
      }
    }
  }

  private async processFile(file: File): Promise<void> {
    const fileType = file.type.startsWith('image/') ? 'image' : 
                    file.type.startsWith('audio/') ? 'audio' : 'file';

    if (fileType === 'image') {
      await this.processImage(file);
    } else if (fileType === 'audio') {
      await this.processAudioFile(file);
    } else {
      await this.processDocument(file);
    }
  }

  private async processImage(file: File): Promise<void> {
    try {
      // Redimensionar imagen si es necesario
      const resizedBlob = await resizeImage(file);
      const imageBase64 = await fileToBase64(new File([resizedBlob], file.name, { type: 'image/jpeg' }));

      // Analizar imagen
      const { data, error } = await this.apiService.analyzeImage(
        imageBase64,
        this.state.currentModel,
        'Analiza esta imagen y descíbela en detalle',
        this.currentConversation?.id
      );

      if (error) {
        throw new Error(error.message);
      }

      // Mostrar imagen y análisis
      const previewUrl = URL.createObjectURL(file);
      const analysisText = `[Imagen subida: ${file.name}]\n\nAnálisis: ${data?.analysis || 'No se pudo analizar la imagen'}`;
      
      await this.sendMessage(analysisText, [{
        id: `img-${Date.now()}`,
        type: 'image',
        url: previewUrl,
        name: file.name,
        size: file.size,
        mimeType: file.type
      }]);
    } catch (error) {
      console.error('Error procesando imagen:', error);
      throw error;
    }
  }

  private async processAudioFile(file: File): Promise<void> {
    try {
      const audioBase64 = await fileToBase64(file);
      
      // Transcribir audio
      const { data, error } = await this.apiService.transcribeAudio(
        audioBase64,
        this.state.currentModel,
        this.currentConversation?.id
      );

      if (error) {
        throw new Error(error.message);
      }

      const transcriptionText = `[Audio subido: ${file.name}]\n\nTranscripción: ${data?.text || 'No se pudo transcribir el audio'}`;
      await this.sendMessage(transcriptionText);
    } catch (error) {
      console.error('Error procesando audio:', error);
      throw error;
    }
  }

  private async processDocument(file: File): Promise<void> {
    // Para documentos, simplemente notificar que se subió
    // El procesamiento RAG se haría en el backend
    const documentText = `[Documento subido: ${file.name}]\n\nEste documento está disponible para consultas.`;
    await this.sendMessage(documentText);
  }

  private addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.ui.addMessage(message);
  }

  private updateMessage(messageId: string, updates: Partial<ChatMessage>): void {
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      this.messages[index] = { ...this.messages[index], ...updates };
      this.ui.updateMessage(messageId, updates);
    }
  }

  // Handlers para Realtime
  private handleTypingIndicator(data: any): void {
    this.state.isTyping = data.typing;
    this.ui.updateState(this.state);
  }

  private handlePresenceChange(data: any): void {
    this.ui.updatePresence(data);
  }

  private handleTakeoverChange(data: any): void {
    if (this.currentConversation) {
      this.currentConversation.botPaused = data.action === 'start';
      this.ui.showTakeoverNotification(data);
    }
  }

  // Métodos públicos
  public open(): void {
    this.state.isOpen = true;
    this.ui.updateState(this.state);
  }

  public close(): void {
    this.state.isOpen = false;
    this.ui.updateState(this.state);
  }

  public destroy(): void {
    this.realtimeService?.disconnect();
    this.ui.destroy();
  }
}