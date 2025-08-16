import { ChatConfig, ChatMessage, ChatState } from '../types/config';
import { formatFileSize } from '../utils/file';

export class ChatUI {
  private config: ChatConfig;
  private state: ChatState;
  private container: HTMLElement | null = null;
  private messagesContainer: HTMLElement | null = null;
  private inputElement: HTMLTextAreaElement | null = null;
  private callbacks: any = {};

  constructor(config: ChatConfig, state: ChatState) {
    this.config = config;
    this.state = state;
  }

  render(): void {
    this.createContainer();
    this.createWidget();
    this.applyStyles();
  }

  private createContainer(): void {
    // Crear contenedor principal
    this.container = document.createElement('div');
    this.container.id = 'mega-chat-widget';
    this.container.className = `mega-chat-widget ${this.config.theme} ${this.config.position}`;
    
    document.body.appendChild(this.container);
  }

  private createWidget(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="chat-fab" id="chat-fab">
        <svg class="fab-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
        </svg>
        <span class="fab-notification" id="fab-notification" style="display: none;">1</span>
      </div>
      
      <div class="chat-panel" id="chat-panel" style="display: none;">
        <div class="chat-header">
          <div class="chat-title">
            <h3>Asistente IA</h3>
            <div class="chat-status">
              <span class="status-indicator" id="status-indicator"></span>
              <span class="status-text" id="status-text">En línea</span>
            </div>
          </div>
          <div class="chat-controls">
            <select class="model-selector" id="model-selector">
              <option value="auto">Auto</option>
              <option value="gemini">Gemini</option>
              <option value="minimax">MiniMax</option>
              <option value="hybrid">Híbrido</option>
            </select>
            <button class="close-btn" id="close-btn">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="chat-messages" id="chat-messages">
          <div class="welcome-message">
            <p>¡Hola! Soy tu asistente de IA. Puedo ayudarte con:</p>
            <ul>
              <li>💬 Conversaciones de texto</li>
              <li>🎤 Transcripción de audio</li>
              <li>🖼️ Análisis de imágenes</li>
              <li>📄 Procesamiento de documentos</li>
            </ul>
          </div>
        </div>
        
        <div class="typing-indicator" id="typing-indicator" style="display: none;">
          <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span class="typing-text">Escribiendo...</span>
        </div>
        
        <div class="chat-input-container">
          <div class="input-actions">
            <button class="action-btn" id="attach-btn" title="Adjuntar archivo">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
              </svg>
            </button>
            <button class="action-btn record-btn" id="record-btn" title="Grabar audio">
              <svg class="mic-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
              </svg>
              <svg class="stop-icon" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
                <path d="M6 6h12v12H6z"/>
              </svg>
            </button>
          </div>
          
          <div class="input-wrapper">
            <textarea 
              id="chat-input" 
              placeholder="Escribe tu mensaje..."
              rows="1"
              maxlength="4000"
            ></textarea>
            <div class="input-counter" id="input-counter">0/4000</div>
          </div>
          
          <button class="send-btn" id="send-btn" disabled title="Enviar mensaje">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
        
        <div class="file-preview" id="file-preview" style="display: none;"></div>
        
        <input type="file" id="file-input" style="display: none;" multiple 
               accept="image/*,audio/*,.pdf,.txt,.md,.doc,.docx">
      </div>
      
      <div class="drag-overlay" id="drag-overlay" style="display: none;">
        <div class="drag-content">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
          <p>Suelta tus archivos aquí</p>
          <small>Imágenes, audio, documentos (máx. ${this.config.maxFileSize}MB)</small>
        </div>
      </div>
    `;

    this.messagesContainer = this.container.querySelector('#chat-messages');
    this.inputElement = this.container.querySelector('#chat-input');

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.container) return;

    // Toggle widget
    const fab = this.container.querySelector('#chat-fab');
    const closeBtn = this.container.querySelector('#close-btn');
    const panel = this.container.querySelector('#chat-panel');

    fab?.addEventListener('click', () => {
      this.callbacks.onToggle?.();
      if (panel) {
        panel.style.display = this.state.isOpen ? 'none' : 'flex';
      }
    });

    closeBtn?.addEventListener('click', () => {
      this.callbacks.onToggle?.();
      if (panel) {
        panel.style.display = 'none';
      }
    });

    // Input handling
    const input = this.inputElement;
    const sendBtn = this.container.querySelector('#send-btn');
    const counter = this.container.querySelector('#input-counter');

    input?.addEventListener('input', () => {
      const length = input.value.length;
      if (counter) counter.textContent = `${length}/4000`;
      
      if (sendBtn) {
        sendBtn.disabled = length === 0 || this.state.isThinking;
      }
      
      // Auto-resize
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    sendBtn?.addEventListener('click', () => {
      this.sendMessage();
    });

    // File upload
    const attachBtn = this.container.querySelector('#attach-btn');
    const fileInput = this.container.querySelector('#file-input') as HTMLInputElement;

    attachBtn?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        this.callbacks.onFileUpload?.(files);
      }
    });

    // Audio recording
    const recordBtn = this.container.querySelector('#record-btn');
    recordBtn?.addEventListener('click', () => {
      if (this.state.isRecording) {
        this.callbacks.onStopRecording?.();
      } else {
        this.callbacks.onStartRecording?.();
      }
    });

    // Model selector
    const modelSelector = this.container.querySelector('#model-selector') as HTMLSelectElement;
    modelSelector?.addEventListener('change', (e) => {
      this.callbacks.onModelChange?.((e.target as HTMLSelectElement).value);
    });

    // Drag & Drop
    this.setupDragDrop();
  }

  private setupDragDrop(): void {
    if (!this.container) return;

    const dragOverlay = this.container.querySelector('#drag-overlay');
    const panel = this.container.querySelector('#chat-panel');

    let dragCounter = 0;

    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (dragOverlay && this.state.isOpen) {
        dragOverlay.style.display = 'flex';
      }
    });

    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0 && dragOverlay) {
        dragOverlay.style.display = 'none';
      }
    });

    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      
      if (dragOverlay) {
        dragOverlay.style.display = 'none';
      }

      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0 && this.state.isOpen) {
        this.callbacks.onDragDrop?.(files);
      }
    });
  }

  private sendMessage(): void {
    const input = this.inputElement;
    if (!input || !input.value.trim() || this.state.isThinking) return;

    const message = input.value.trim();
    input.value = '';
    input.style.height = 'auto';
    
    const counter = this.container?.querySelector('#input-counter');
    if (counter) counter.textContent = '0/4000';
    
    const sendBtn = this.container?.querySelector('#send-btn');
    if (sendBtn) sendBtn.disabled = true;

    this.callbacks.onSendMessage?.(message);
  }

  private applyStyles(): void {
    const styles = `
      #mega-chat-widget {
        position: fixed;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        font-size: 14px;
        color: #333;
        --primary-color: #2563eb;
        --primary-hover: #1d4ed8;
        --success-color: #16a34a;
        --error-color: #dc2626;
        --warning-color: #d97706;
        --gray-50: #f9fafb;
        --gray-100: #f3f4f6;
        --gray-200: #e5e7eb;
        --gray-300: #d1d5db;
        --gray-500: #6b7280;
        --gray-700: #374151;
        --gray-900: #111827;
      }
      
      .mega-chat-widget.bottom-right {
        bottom: 20px;
        right: 20px;
      }
      
      .mega-chat-widget.bottom-left {
        bottom: 20px;
        left: 20px;
      }
      
      .chat-fab {
        width: 56px;
        height: 56px;
        background: var(--primary-color);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        transition: all 0.3s ease;
        position: relative;
      }
      
      .chat-fab:hover {
        background: var(--primary-hover);
        transform: scale(1.05);
      }
      
      .fab-icon {
        width: 24px;
        height: 24px;
        color: white;
      }
      
      .fab-notification {
        position: absolute;
        top: -4px;
        right: -4px;
        background: var(--error-color);
        color: white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 600;
      }
      
      .chat-panel {
        position: absolute;
        bottom: 70px;
        right: 0;
        width: 380px;
        max-width: calc(100vw - 40px);
        height: 600px;
        max-height: calc(100vh - 120px);
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      .chat-header {
        background: var(--gray-50);
        padding: 16px;
        border-bottom: 1px solid var(--gray-200);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .chat-title h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--gray-900);
      }
      
      .chat-status {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
      }
      
      .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--success-color);
      }
      
      .status-text {
        font-size: 12px;
        color: var(--gray-500);
      }
      
      .chat-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .model-selector {
        padding: 4px 8px;
        border: 1px solid var(--gray-300);
        border-radius: 6px;
        font-size: 12px;
        background: white;
      }
      
      .close-btn {
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .close-btn:hover {
        background: var(--gray-200);
      }
      
      .close-btn svg {
        width: 20px;
        height: 20px;
        color: var(--gray-500);
      }
      
      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      
      .welcome-message {
        background: var(--gray-50);
        border: 1px solid var(--gray-200);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 16px;
      }
      
      .welcome-message p {
        margin: 0 0 12px 0;
        font-weight: 500;
        color: var(--gray-700);
      }
      
      .welcome-message ul {
        margin: 0;
        padding-left: 16px;
        color: var(--gray-600);
      }
      
      .welcome-message li {
        margin-bottom: 4px;
      }
      
      .message {
        display: flex;
        flex-direction: column;
        max-width: 85%;
      }
      
      .message.user {
        align-self: flex-end;
      }
      
      .message.bot, .message.admin {
        align-self: flex-start;
      }
      
      .message-content {
        padding: 12px 16px;
        border-radius: 18px;
        word-wrap: break-word;
        line-height: 1.4;
      }
      
      .message.user .message-content {
        background: var(--primary-color);
        color: white;
      }
      
      .message.bot .message-content, .message.admin .message-content {
        background: var(--gray-100);
        color: var(--gray-900);
      }
      
      .message-meta {
        font-size: 11px;
        color: var(--gray-500);
        margin-top: 4px;
        text-align: right;
      }
      
      .message.bot .message-meta, .message.admin .message-meta {
        text-align: left;
      }
      
      .typing-indicator {
        padding: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--gray-500);
        border-top: 1px solid var(--gray-200);
      }
      
      .typing-dots {
        display: flex;
        gap: 4px;
      }
      
      .typing-dots span {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--gray-400);
        animation: typing 1.4s infinite ease-in-out;
      }
      
      .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
      .typing-dots span:nth-child(2) { animation-delay: -0.16s; }
      
      @keyframes typing {
        0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
        40% { transform: scale(1); opacity: 1; }
      }
      
      .chat-input-container {
        padding: 16px;
        border-top: 1px solid var(--gray-200);
        display: flex;
        gap: 8px;
        align-items: flex-end;
      }
      
      .input-actions {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .action-btn {
        width: 36px;
        height: 36px;
        border: 1px solid var(--gray-300);
        background: white;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .action-btn:hover {
        background: var(--gray-50);
        border-color: var(--gray-400);
      }
      
      .action-btn.active {
        background: var(--error-color);
        border-color: var(--error-color);
        color: white;
      }
      
      .action-btn svg {
        width: 18px;
        height: 18px;
        color: var(--gray-600);
      }
      
      .action-btn.active svg {
        color: white;
      }
      
      .input-wrapper {
        flex: 1;
        position: relative;
      }
      
      .input-wrapper textarea {
        width: 100%;
        min-height: 36px;
        max-height: 120px;
        padding: 8px 12px;
        border: 1px solid var(--gray-300);
        border-radius: 8px;
        resize: none;
        font-family: inherit;
        font-size: 14px;
        line-height: 1.4;
        outline: none;
      }
      
      .input-wrapper textarea:focus {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
      }
      
      .input-counter {
        position: absolute;
        bottom: 4px;
        right: 8px;
        font-size: 10px;
        color: var(--gray-400);
        background: white;
        padding: 0 4px;
      }
      
      .send-btn {
        width: 36px;
        height: 36px;
        background: var(--primary-color);
        border: none;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .send-btn:hover:not(:disabled) {
        background: var(--primary-hover);
      }
      
      .send-btn:disabled {
        background: var(--gray-300);
        cursor: not-allowed;
      }
      
      .send-btn svg {
        width: 18px;
        height: 18px;
        color: white;
      }
      
      .drag-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(37, 99, 235, 0.1);
        border: 2px dashed var(--primary-color);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(2px);
      }
      
      .drag-content {
        text-align: center;
        color: var(--primary-color);
      }
      
      .drag-content svg {
        width: 48px;
        height: 48px;
        margin-bottom: 8px;
      }
      
      .drag-content p {
        margin: 0;
        font-weight: 600;
        font-size: 16px;
      }
      
      .drag-content small {
        display: block;
        margin-top: 4px;
        opacity: 0.8;
      }
      
      @media (max-width: 480px) {
        .chat-panel {
          width: calc(100vw - 20px);
          height: calc(100vh - 90px);
          bottom: 70px;
          right: 10px;
        }
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  // Callbacks
  onToggle(callback: () => void): void {
    this.callbacks.onToggle = callback;
  }

  onSendMessage(callback: (message: string) => void): void {
    this.callbacks.onSendMessage = callback;
  }

  onStartRecording(callback: () => void): void {
    this.callbacks.onStartRecording = callback;
  }

  onStopRecording(callback: () => void): void {
    this.callbacks.onStopRecording = callback;
  }

  onFileUpload(callback: (files: FileList) => void): void {
    this.callbacks.onFileUpload = callback;
  }

  onModelChange(callback: (model: string) => void): void {
    this.callbacks.onModelChange = callback;
  }

  onDragDrop(callback: (files: File[]) => void): void {
    this.callbacks.onDragDrop = callback;
  }

  // Update methods
  updateState(state: ChatState): void {
    this.state = { ...this.state, ...state };
    
    const recordBtn = this.container?.querySelector('#record-btn');
    const micIcon = recordBtn?.querySelector('.mic-icon');
    const stopIcon = recordBtn?.querySelector('.stop-icon');
    const statusIndicator = this.container?.querySelector('#status-indicator');
    const statusText = this.container?.querySelector('#status-text');
    const typingIndicator = this.container?.querySelector('#typing-indicator');
    
    // Recording state
    if (recordBtn) {
      recordBtn.classList.toggle('active', this.state.isRecording);
    }
    if (micIcon && stopIcon) {
      micIcon.style.display = this.state.isRecording ? 'none' : 'block';
      stopIcon.style.display = this.state.isRecording ? 'block' : 'none';
    }
    
    // Connection status
    if (statusIndicator && statusText) {
      if (this.state.isConnected) {
        statusIndicator.style.background = 'var(--success-color)';
        statusText.textContent = this.state.isTranscribing ? 'Transcribiendo...' : 
                                 this.state.isThinking ? 'Pensando...' : 'En línea';
      } else {
        statusIndicator.style.background = 'var(--error-color)';
        statusText.textContent = 'Desconectado';
      }
    }
    
    // Typing indicator
    if (typingIndicator) {
      typingIndicator.style.display = this.state.isTyping ? 'flex' : 'none';
    }
  }

  displayMessages(messages: ChatMessage[]): void {
    if (!this.messagesContainer) return;
    
    // Limpiar mensajes existentes (excepto welcome)
    const welcomeMsg = this.messagesContainer.querySelector('.welcome-message');
    this.messagesContainer.innerHTML = '';
    if (welcomeMsg) {
      this.messagesContainer.appendChild(welcomeMsg);
    }
    
    messages.forEach(message => this.addMessage(message));
  }

  addMessage(message: ChatMessage): void {
    if (!this.messagesContainer) return;
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${message.sender}`;
    messageEl.id = `message-${message.id}`;
    
    const time = message.timestamp.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    messageEl.innerHTML = `
      <div class="message-content">${this.formatMessageContent(message)}</div>
      <div class="message-meta">
        ${time}
        ${message.status === 'pending' ? ' • Enviando...' : ''}
        ${message.status === 'error' ? ' • Error' : ''}
      </div>
    `;
    
    this.messagesContainer.appendChild(messageEl);
    this.scrollToBottom();
  }

  updateMessage(messageId: string, updates: Partial<ChatMessage>): void {
    const messageEl = this.container?.querySelector(`#message-${messageId}`);
    if (!messageEl) return;
    
    const contentEl = messageEl.querySelector('.message-content');
    const metaEl = messageEl.querySelector('.message-meta');
    
    if (updates.content && contentEl) {
      contentEl.innerHTML = this.formatMessageContent({ content: updates.content } as ChatMessage);
    }
    
    if (updates.status && metaEl) {
      const time = (updates.timestamp || new Date()).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      metaEl.innerHTML = `
        ${time}
        ${updates.status === 'pending' ? ' • Enviando...' : ''}
        ${updates.status === 'error' ? ' • Error' : ''}
      `;
    }
    
    this.scrollToBottom();
  }

  private formatMessageContent(message: ChatMessage): string {
    let content = message.content.replace(/\n/g, '<br>');
    
    // Procesar attachments si existen
    if (message.attachments?.length) {
      const attachmentHtml = message.attachments.map(att => {
        if (att.type === 'image') {
          return `<div class="attachment image"><img src="${att.url}" alt="${att.name}" style="max-width: 200px; border-radius: 8px; margin-top: 8px;"></div>`;
        }
        return `<div class="attachment"><strong>${att.name}</strong> (${formatFileSize(att.size)})</div>`;
      }).join('');
      
      content += attachmentHtml;
    }
    
    return content;
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  showError(message: string): void {
    // Mostrar toast de error
    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--error-color);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      z-index: 10001;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  showTakeoverNotification(data: any): void {
    const message = data.action === 'start' 
      ? `${data.admin_name || 'Un administrador'} se ha hecho cargo de la conversación`
      : 'El administrador ha devuelto el control al bot';
    
    this.addMessage({
      id: `takeover-${Date.now()}`,
      conversationId: '',
      sender: 'system',
      content: message,
      type: 'system',
      timestamp: new Date(),
      status: 'sent'
    });
  }

  updatePresence(data: any): void {
    // Actualizar indicadores de presencia si es necesario
    console.log('Presence update:', data);
  }

  destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}