// Configuración de Supabase - estas deben ser configuradas por el usuario
const SUPABASE_CONFIG = {
    url: 'https://your-project.supabase.co',
    anonKey: 'your-anon-key'
};

// Clase principal del widget de chat
class ChatbotWidget {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
        this.currentConversation = null;
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.attachments = [];
        this.isRAGEnabled = false;
        this.isStreaming = false;
        
        this.initializeSupabase();
        this.bindEvents();
        this.loadConversation();
    }

    initializeSupabase() {
        try {
            this.supabase = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
            console.log('Supabase initialized');
        } catch (error) {
            console.error('Error initializing Supabase:', error);
        }
    }

    bindEvents() {
        // FAB y panel
        document.getElementById('chatFab').addEventListener('click', () => this.togglePanel());
        document.getElementById('closeBtn').addEventListener('click', () => this.closePanel());

        // Input y envío
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        messageInput.addEventListener('input', () => this.autoResizeTextarea());
        sendBtn.addEventListener('click', () => this.sendMessage());

        // Botones de acción
        document.getElementById('audioBtn').addEventListener('click', () => this.toggleRecording());
        document.getElementById('imageBtn').addEventListener('click', () => this.selectImage());
        document.getElementById('fileBtn').addEventListener('click', () => this.selectFile());
        document.getElementById('ragBtn').addEventListener('click', () => this.toggleRAG());

        // File inputs
        document.getElementById('imageInput').addEventListener('change', (e) => this.handleImageUpload(e));
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileUpload(e));

        // Selector LLM
        document.getElementById('llmSelector').addEventListener('change', (e) => {
            this.updateConversationPreference(e.target.value);
        });
    }

    togglePanel() {
        const panel = document.getElementById('chatPanel');
        const fab = document.getElementById('chatFab');
        
        if (panel.classList.contains('active')) {
            this.closePanel();
        } else {
            panel.classList.add('active');
            fab.classList.add('active');
            document.getElementById('messageInput').focus();
        }
    }

    closePanel() {
        const panel = document.getElementById('chatPanel');
        const fab = document.getElementById('chatFab');
        
        panel.classList.remove('active');
        fab.classList.remove('active');
    }

    async loadConversation() {
        try {
            // Crear conversación anónima o cargar existente
            const conversationId = localStorage.getItem('chatbot_conversation_id');
            
            if (conversationId) {
                // Verificar si la conversación existe
                const { data } = await this.supabase
                    .from('conversations')
                    .select('*')
                    .eq('id', conversationId)
                    .maybeSingle();
                
                if (data) {
                    this.currentConversation = data;
                    await this.loadMessages();
                    return;
                }
            }
            
            // Crear nueva conversación
            await this.createConversation();
        } catch (error) {
            console.error('Error loading conversation:', error);
        }
    }

    async createConversation() {
        try {
            const { data, error } = await this.supabase
                .from('conversations')
                .insert({
                    title: 'Nueva conversación',
                    status: 'active',
                    user_id: null // Conversación anónima
                })
                .select()
                .single();

            if (error) throw error;

            this.currentConversation = data;
            localStorage.setItem('chatbot_conversation_id', data.id);
        } catch (error) {
            console.error('Error creating conversation:', error);
        }
    }

    async loadMessages() {
        if (!this.currentConversation) return;

        try {
            const { data, error } = await this.supabase
                .from('messages')
                .select(`
                    *,
                    attachments(*)
                `)
                .eq('conversation_id', this.currentConversation.id)
                .order('created_at', { ascending: true });

            if (error) throw error;

            const messagesContainer = document.getElementById('chatMessages');
            // Limpiar mensajes existentes excepto el mensaje de bienvenida
            const welcomeMessage = messagesContainer.querySelector('.message.bot');
            messagesContainer.innerHTML = '';
            if (welcomeMessage) {
                messagesContainer.appendChild(welcomeMessage);
            }

            data.forEach(message => {
                this.displayMessage(message);
            });

            this.scrollToBottom();
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        
        if (!message && this.attachments.length === 0) return;
        if (this.isStreaming) return;

        try {
            // Limpiar input
            input.value = '';
            this.autoResizeTextarea();

            // Mostrar mensaje del usuario
            this.displayUserMessage(message, this.attachments);

            // Preparar datos para envío
            const llmProvider = document.getElementById('llmSelector').value;
            const requestData = {
                message: message || 'Archivo adjunto',
                conversationId: this.currentConversation?.id,
                llmProvider: llmProvider,
                useRag: this.isRAGEnabled,
                attachments: this.attachments,
                stream: true
            };

            // Limpiar attachments
            this.attachments = [];
            this.updateAttachmentPreview();

            // Mostrar indicador de escritura
            this.showThinkingIndicator();

            // Enviar a la función de chat
            await this.sendToChatAPI(requestData);

        } catch (error) {
            console.error('Error sending message:', error);
            this.showErrorMessage('Error al enviar mensaje: ' + error.message);
        }
    }

    async sendToChatAPI(requestData) {
        try {
            this.isStreaming = true;
            
            const { data, error } = await this.supabase.functions.invoke('chat', {
                body: requestData
            });

            if (error) throw error;

            // Si es streaming, manejar SSE
            if (requestData.stream) {
                // Para streaming, necesitaríamos implementar SSE con fetch directo
                // Por simplicidad, usaremos respuesta directa
                this.handleStreamingResponse(data);
            } else {
                this.handleDirectResponse(data);
            }

        } catch (error) {
            throw error;
        } finally {
            this.isStreaming = false;
            this.hideThinkingIndicator();
        }
    }

    handleDirectResponse(data) {
        this.hideThinkingIndicator();
        
        if (data.data && data.data.response) {
            this.displayBotMessage(data.data.response, {
                provider: data.data.provider,
                processing_time: data.data.processing_time
            });
        }
    }

    handleStreamingResponse(data) {
        // Simulación de streaming para demo
        this.hideThinkingIndicator();
        
        if (data.data && data.data.response) {
            this.displayBotMessage(data.data.response, {
                provider: data.data.provider,
                processing_time: data.data.processing_time
            });
        }
    }

    displayUserMessage(text, attachments = []) {
        const messageEl = this.createMessageElement('user', text, attachments);
        document.getElementById('chatMessages').appendChild(messageEl);
        this.scrollToBottom();
    }

    displayBotMessage(text, metadata = {}) {
        const messageEl = this.createMessageElement('bot', text, [], metadata);
        document.getElementById('chatMessages').appendChild(messageEl);
        this.scrollToBottom();
    }

    displayMessage(messageData) {
        const messageEl = this.createMessageElement(
            messageData.sender,
            messageData.content,
            messageData.attachments || [],
            {
                provider: messageData.llm_provider,
                processing_time: messageData.processing_time_ms,
                created_at: messageData.created_at
            }
        );
        document.getElementById('chatMessages').appendChild(messageEl);
    }

    createMessageElement(sender, text, attachments = [], metadata = {}) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = sender === 'bot' ? 'AI' : 'Tú';

        const content = document.createElement('div');
        content.className = 'message-content';

        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = text;

        // Mostrar attachments
        if (attachments.length > 0) {
            const attachmentsDiv = document.createElement('div');
            attachmentsDiv.className = 'message-attachments';
            
            attachments.forEach(attachment => {
                const attachmentEl = this.createAttachmentDisplay(attachment);
                attachmentsDiv.appendChild(attachmentEl);
            });
            
            content.appendChild(attachmentsDiv);
        }

        content.appendChild(textDiv);

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        
        let timeText = metadata.created_at ? 
            new Date(metadata.created_at).toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit' 
            }) : 
            new Date().toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        
        if (metadata.provider) {
            timeText += ` • ${metadata.provider}`;
        }
        
        if (metadata.processing_time) {
            timeText += ` • ${metadata.processing_time}ms`;
        }
        
        timeDiv.textContent = timeText;
        content.appendChild(timeDiv);

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);

        return messageDiv;
    }

    createAttachmentDisplay(attachment) {
        const attachmentDiv = document.createElement('div');
        attachmentDiv.className = 'attachment-display';
        
        if (attachment.kind === 'image' && attachment.public_url) {
            const img = document.createElement('img');
            img.src = attachment.public_url;
            img.style.maxWidth = '200px';
            img.style.borderRadius = '8px';
            attachmentDiv.appendChild(img);
        } else {
            const icon = document.createElement('span');
            icon.textContent = this.getFileIcon(attachment.mime_type);
            const name = document.createElement('span');
            name.textContent = attachment.storage_path?.split('/').pop() || 'Archivo';
            attachmentDiv.appendChild(icon);
            attachmentDiv.appendChild(name);
        }
        
        return attachmentDiv;
    }

    getFileIcon(mimeType) {
        if (mimeType?.startsWith('image/')) return '🖼️';
        if (mimeType?.startsWith('audio/')) return '🎵';
        if (mimeType === 'application/pdf') return '📄';
        return '📎';
    }

    showThinkingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'status-message thinking';
        indicator.id = 'thinkingIndicator';
        indicator.textContent = 'El asistente está pensando...';
        
        document.getElementById('chatMessages').appendChild(indicator);
        this.scrollToBottom();
    }

    hideThinkingIndicator() {
        const indicator = document.getElementById('thinkingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    showErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'status-message error';
        errorDiv.textContent = message;
        
        document.getElementById('chatMessages').appendChild(errorDiv);
        this.scrollToBottom();
    }

    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.processRecording();
            };
            
            this.mediaRecorder.start();
            this.isRecording = true;
            
            document.getElementById('audioBtn').classList.add('active');
            document.getElementById('recordingIndicator').classList.add('active');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            alert('Error al acceder al micrófono');
        }
    }

    async stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            
            this.isRecording = false;
            document.getElementById('audioBtn').classList.remove('active');
            document.getElementById('recordingIndicator').classList.remove('active');
        }
    }

    async processRecording() {
        try {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            
            // Convertir a base64
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Audio = reader.result;
                
                // Transcribir audio
                await this.transcribeAudio(base64Audio);
            };
            reader.readAsDataURL(audioBlob);
            
        } catch (error) {
            console.error('Error processing recording:', error);
            this.showErrorMessage('Error al procesar grabación');
        }
    }

    async transcribeAudio(audioData) {
        try {
            const { data, error } = await this.supabase.functions.invoke('transcribe', {
                body: {
                    audioData: audioData,
                    provider: document.getElementById('llmSelector').value,
                    conversationId: this.currentConversation?.id
                }
            });

            if (error) throw error;

            if (data.data && data.data.transcription) {
                const input = document.getElementById('messageInput');
                input.value = data.data.transcription;
                this.autoResizeTextarea();
                input.focus();
            }

        } catch (error) {
            console.error('Error transcribing audio:', error);
            this.showErrorMessage('Error al transcribir audio');
        }
    }

    selectImage() {
        document.getElementById('imageInput').click();
    }

    selectFile() {
        document.getElementById('fileInput').click();
    }

    async handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const base64Data = await this.fileToBase64(file);
            
            const attachment = {
                kind: 'image',
                storage_path: file.name,
                mime_type: file.type,
                size_bytes: file.size,
                data: base64Data
            };
            
            this.attachments.push(attachment);
            this.updateAttachmentPreview();
            
        } catch (error) {
            console.error('Error handling image upload:', error);
            this.showErrorMessage('Error al procesar imagen');
        }
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const base64Data = await this.fileToBase64(file);
            
            const attachment = {
                kind: 'file',
                storage_path: file.name,
                mime_type: file.type,
                size_bytes: file.size,
                data: base64Data
            };
            
            this.attachments.push(attachment);
            this.updateAttachmentPreview();
            
        } catch (error) {
            console.error('Error handling file upload:', error);
            this.showErrorMessage('Error al procesar archivo');
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    updateAttachmentPreview() {
        const preview = document.getElementById('attachmentPreview');
        preview.innerHTML = '';
        
        this.attachments.forEach((attachment, index) => {
            const item = document.createElement('div');
            item.className = 'attachment-item';
            
            const icon = document.createElement('span');
            icon.textContent = this.getFileIcon(attachment.mime_type);
            
            const name = document.createElement('span');
            name.textContent = attachment.storage_path;
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'attachment-remove';
            removeBtn.textContent = '×';
            removeBtn.onclick = () => this.removeAttachment(index);
            
            item.appendChild(icon);
            item.appendChild(name);
            item.appendChild(removeBtn);
            
            preview.appendChild(item);
        });
    }

    removeAttachment(index) {
        this.attachments.splice(index, 1);
        this.updateAttachmentPreview();
    }

    toggleRAG() {
        this.isRAGEnabled = !this.isRAGEnabled;
        const btn = document.getElementById('ragBtn');
        btn.classList.toggle('active', this.isRAGEnabled);
        btn.title = this.isRAGEnabled ? 'RAG activado' : 'Buscar en documentos';
    }

    async updateConversationPreference(llmProvider) {
        if (!this.currentConversation) return;

        try {
            const { error } = await this.supabase
                .from('conversations')
                .update({ llm_preference: llmProvider })
                .eq('id', this.currentConversation.id);

            if (error) throw error;
            
            this.currentConversation.llm_preference = llmProvider;
        } catch (error) {
            console.error('Error updating LLM preference:', error);
        }
    }

    autoResizeTextarea() {
        const textarea = document.getElementById('messageInput');
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    scrollToBottom() {
        const messages = document.getElementById('chatMessages');
        messages.scrollTop = messages.scrollHeight;
    }
}

// Inicializar widget cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    window.chatbotWidget = new ChatbotWidget();
});