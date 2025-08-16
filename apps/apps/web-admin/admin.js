// Configuración de Supabase - debe ser configurada por el usuario
const SUPABASE_CONFIG = {
    url: 'https://your-project.supabase.co',
    anonKey: 'your-anon-key'
};

// Clase principal de la consola de administración
class AdminConsole {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
        this.currentSection = 'dashboard';
        this.conversations = [];
        this.documents = [];
        this.currentEnhancement = null;
        
        this.initializeSupabase();
        this.checkAuth();
        this.bindEvents();
    }

    initializeSupabase() {
        try {
            this.supabase = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
            console.log('Supabase initialized');
        } catch (error) {
            console.error('Error initializing Supabase:', error);
            this.showAlert('Error de configuración: Verifica las credenciales de Supabase', 'error');
        }
    }

    async checkAuth() {
        try {
            const { data: { user }, error } = await this.supabase.auth.getUser();
            
            if (error || !user) {
                this.redirectToLogin();
                return;
            }

            // Verificar que el usuario es admin
            const { data: profile } = await this.supabase
                .from('profiles')
                .select('role, full_name')
                .eq('id', user.id)
                .maybeSingle();

            if (!profile || profile.role !== 'admin') {
                this.showAlert('Acceso denegado: Se requieren permisos de administrador', 'error');
                this.redirectToLogin();
                return;
            }

            this.currentUser = { ...user, ...profile };
            this.updateUserInfo();
            this.loadDashboard();
            
        } catch (error) {
            console.error('Error checking auth:', error);
            this.redirectToLogin();
        }
    }

    redirectToLogin() {
        // En un entorno real, redirigiría a una página de login
        // Por ahora, mostrar mensaje
        document.body.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; gap: 20px;">
                <h2>Acceso Restringido</h2>
                <p>Esta consola requiere autenticación de administrador.</p>
                <p>En un entorno de producción, serías redirigido a la página de login.</p>
                <button onclick="window.location.reload()" style="padding: 10px 20px; border: none; background: #6366f1; color: white; border-radius: 8px; cursor: pointer;">Reintentar</button>
            </div>
        `;
    }

    updateUserInfo() {
        const userInfo = document.getElementById('userInfo');
        if (userInfo && this.currentUser) {
            userInfo.textContent = this.currentUser.full_name || this.currentUser.email;
        }
    }

    bindEvents() {
        // Navegación
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.currentTarget.dataset.section;
                this.switchSection(section);
            });
        });

        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());

        // Conversaciones
        document.getElementById('refreshConversations')?.addEventListener('click', () => this.loadConversations());
        document.getElementById('conversationSearch')?.addEventListener('input', (e) => this.filterConversations(e.target.value));
        document.getElementById('conversationFilter')?.addEventListener('change', (e) => this.filterConversations(null, e.target.value));

        // Documentos
        document.getElementById('uploadDocumentBtn')?.addEventListener('click', () => this.showUploadModal());
        document.getElementById('refreshDocuments')?.addEventListener('click', () => this.loadDocuments());
        document.getElementById('documentSearch')?.addEventListener('input', (e) => this.filterDocuments(e.target.value));
        document.getElementById('documentFilter')?.addEventListener('change', (e) => this.filterDocuments(null, e.target.value));

        // Modal de subida
        document.getElementById('closeUploadModal')?.addEventListener('click', () => this.hideUploadModal());
        document.getElementById('cancelUpload')?.addEventListener('click', () => this.hideUploadModal());
        document.getElementById('confirmUpload')?.addEventListener('click', () => this.uploadDocument());

        // Mejorador
        document.getElementById('enhanceBtn')?.addEventListener('click', () => this.enhanceText());
        document.getElementById('intensitySlider')?.addEventListener('input', (e) => this.updateIntensityValue(e.target.value));
        document.getElementById('approveEnhancement')?.addEventListener('click', () => this.approveEnhancement());
        document.getElementById('resetEnhancement')?.addEventListener('click', () => this.resetEnhancement());

        // Configuración
        document.getElementById('saveSettings')?.addEventListener('click', () => this.saveSettings());
    }

    switchSection(sectionId) {
        // Actualizar navegación
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.section === sectionId);
        });

        // Actualizar secciones
        document.querySelectorAll('.section').forEach(section => {
            section.classList.toggle('active', section.id === sectionId);
        });

        // Actualizar título
        const titles = {
            dashboard: 'Dashboard',
            conversations: 'Conversaciones',
            documents: 'Documentos',
            enhancement: 'Mejorador de Redacción',
            analytics: 'Análisis',
            settings: 'Configuración'
        };

        document.getElementById('pageTitle').textContent = titles[sectionId] || 'Dashboard';
        this.currentSection = sectionId;

        // Cargar datos según la sección
        switch (sectionId) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'conversations':
                this.loadConversations();
                break;
            case 'documents':
                this.loadDocuments();
                break;
            case 'analytics':
                this.loadAnalytics();
                break;
        }
    }

    async loadDashboard() {
        try {
            // Cargar estadísticas
            const [conversations, messages, documents, takeovers, events] = await Promise.all([
                this.supabase.from('conversations').select('count', { count: 'exact', head: true }),
                this.supabase.from('messages').select('count', { count: 'exact', head: true }),
                this.supabase.from('documents').select('count', { count: 'exact', head: true }),
                this.supabase.from('takeovers').select('count', { count: 'exact', head: true }).eq('active', true),
                this.supabase.from('events').select('*').order('created_at', { ascending: false }).limit(10)
            ]);

            // Actualizar estadísticas
            document.getElementById('totalConversations').textContent = conversations.count || 0;
            document.getElementById('totalMessages').textContent = messages.count || 0;
            document.getElementById('totalDocuments').textContent = documents.count || 0;
            document.getElementById('activeTakeovers').textContent = takeovers.count || 0;

            // Actualizar eventos recientes
            this.updateRecentEvents(events.data || []);

        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.showAlert('Error al cargar dashboard', 'error');
        }
    }

    updateRecentEvents(events) {
        const tbody = document.getElementById('recentEvents');
        if (!tbody) return;

        if (events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-light);">No hay eventos recientes</td></tr>';
            return;
        }

        tbody.innerHTML = events.map(event => `
            <tr>
                <td>
                    <span class="badge badge-info">${event.event_type}</span>
                </td>
                <td>${event.conversation_id ? event.conversation_id.substring(0, 8) + '...' : '-'}</td>
                <td>${event.user_id ? event.user_id.substring(0, 8) + '...' : '-'}</td>
                <td>${new Date(event.created_at).toLocaleString('es-ES')}</td>
            </tr>
        `).join('');
    }

    async loadConversations() {
        try {
            const { data, error } = await this.supabase
                .from('conversations')
                .select(`
                    *,
                    messages(count)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.conversations = data || [];
            this.updateConversationsTable(this.conversations);

        } catch (error) {
            console.error('Error loading conversations:', error);
            this.showAlert('Error al cargar conversaciones', 'error');
        }
    }

    updateConversationsTable(conversations) {
        const tbody = document.getElementById('conversationsTable');
        if (!tbody) return;

        if (conversations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-light);">No hay conversaciones</td></tr>';
            return;
        }

        tbody.innerHTML = conversations.map(conv => `
            <tr>
                <td><code>${conv.id.substring(0, 8)}...</code></td>
                <td>${conv.title}</td>
                <td>
                    <span class="badge badge-${conv.status === 'active' ? 'success' : 'warning'}">
                        ${conv.status}
                    </span>
                </td>
                <td>
                    <span class="badge badge-${conv.bot_paused ? 'error' : 'success'}">
                        ${conv.bot_paused ? 'Pausado' : 'Activo'}
                    </span>
                </td>
                <td>${conv.messages?.[0]?.count || 0}</td>
                <td>${new Date(conv.created_at).toLocaleDateString('es-ES')}</td>
                <td>
                    <button class="btn btn-sm" onclick="adminConsole.viewConversation('${conv.id}')" title="Ver conversación">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                        </svg>
                    </button>
                    <button class="btn btn-sm btn-${conv.bot_paused ? 'success' : 'warning'}" onclick="adminConsole.toggleBot('${conv.id}', ${!conv.bot_paused})" title="${conv.bot_paused ? 'Reanudar' : 'Pausar'} bot">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M${conv.bot_paused ? '14.828 14.828a4 4 0 01-5.656 0M9 9a3 3 0 115.656 5.656M9 9l5.656 5.656M9 9v11m0-11l5.656 5.656' : '10 9v6m0 0l4-4m-4 4L6 11'}"></path>
                        </svg>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    filterConversations(search = null, status = null) {
        let filtered = [...this.conversations];

        const searchTerm = search || document.getElementById('conversationSearch')?.value || '';
        const statusFilter = status || document.getElementById('conversationFilter')?.value || '';

        if (searchTerm) {
            filtered = filtered.filter(conv => 
                conv.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                conv.id.includes(searchTerm)
            );
        }

        if (statusFilter) {
            if (statusFilter === 'paused') {
                filtered = filtered.filter(conv => conv.bot_paused);
            } else {
                filtered = filtered.filter(conv => conv.status === statusFilter);
            }
        }

        this.updateConversationsTable(filtered);
    }

    async loadDocuments() {
        try {
            const { data, error } = await this.supabase
                .from('documents')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.documents = data || [];
            this.updateDocumentsTable(this.documents);

        } catch (error) {
            console.error('Error loading documents:', error);
            this.showAlert('Error al cargar documentos', 'error');
        }
    }

    updateDocumentsTable(documents) {
        const tbody = document.getElementById('documentsTable');
        if (!tbody) return;

        if (documents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-light);">No hay documentos</td></tr>';
            return;
        }

        tbody.innerHTML = documents.map(doc => `
            <tr>
                <td>
                    <strong>${doc.title}</strong>
                    ${doc.tags?.length ? `<br><small>Tags: ${doc.tags.join(', ')}</small>` : ''}
                </td>
                <td>
                    <span class="badge badge-info">${this.getFileTypeLabel(doc.mime_type)}</span>
                </td>
                <td>${this.formatFileSize(doc.file_size)}</td>
                <td>
                    <span class="badge badge-${doc.is_public ? 'success' : 'warning'}">
                        ${doc.is_public ? 'Público' : 'Privado'}
                    </span>
                </td>
                <td>${doc.chunk_index + 1}/${doc.total_chunks}</td>
                <td>${new Date(doc.created_at).toLocaleDateString('es-ES')}</td>
                <td>
                    <button class="btn btn-sm" onclick="adminConsole.viewDocument('${doc.id}')" title="Ver documento">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                        </svg>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="adminConsole.reindexDocument('${doc.id}')" title="Reindexar">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="adminConsole.deleteDocument('${doc.id}')" title="Eliminar">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    filterDocuments(search = null, mimeType = null) {
        let filtered = [...this.documents];

        const searchTerm = search || document.getElementById('documentSearch')?.value || '';
        const typeFilter = mimeType || document.getElementById('documentFilter')?.value || '';

        if (searchTerm) {
            filtered = filtered.filter(doc => 
                doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                doc.content.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (typeFilter) {
            filtered = filtered.filter(doc => doc.mime_type === typeFilter);
        }

        this.updateDocumentsTable(filtered);
    }

    getFileTypeLabel(mimeType) {
        const types = {
            'application/pdf': 'PDF',
            'text/plain': 'Texto',
            'text/markdown': 'Markdown'
        };
        return types[mimeType] || 'Otro';
    }

    formatFileSize(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showUploadModal() {
        document.getElementById('uploadModal').classList.add('active');
    }

    hideUploadModal() {
        document.getElementById('uploadModal').classList.remove('active');
        this.resetUploadForm();
    }

    resetUploadForm() {
        document.getElementById('documentFile').value = '';
        document.getElementById('documentTitle').value = '';
        document.getElementById('documentTags').value = '';
        document.getElementById('documentVisibility').value = 'true';
    }

    async uploadDocument() {
        const fileInput = document.getElementById('documentFile');
        const title = document.getElementById('documentTitle').value.trim();
        const tags = document.getElementById('documentTags').value.split(',').map(t => t.trim()).filter(t => t);
        const isPublic = document.getElementById('documentVisibility').value === 'true';

        if (!fileInput.files[0] || !title) {
            this.showAlert('Por favor selecciona un archivo y proporciona un título', 'error');
            return;
        }

        const loadingEl = document.getElementById('uploadLoading');
        const confirmBtn = document.getElementById('confirmUpload');
        
        try {
            loadingEl.style.display = 'inline-block';
            confirmBtn.disabled = true;

            const file = fileInput.files[0];
            const base64Data = await this.fileToBase64(file);

            const { data, error } = await this.supabase.functions.invoke('upload-document', {
                body: {
                    fileData: base64Data,
                    fileName: file.name,
                    title: title,
                    mimeType: file.type,
                    tags: tags,
                    isPublic: isPublic,
                    metadata: {
                        uploaded_via: 'admin_console',
                        original_name: file.name
                    }
                }
            });

            if (error) throw error;

            this.showAlert(`Documento subido exitosamente. ${data.data.chunks_created} chunks creados.`, 'success');
            this.hideUploadModal();
            this.loadDocuments();

        } catch (error) {
            console.error('Error uploading document:', error);
            this.showAlert('Error al subir documento: ' + error.message, 'error');
        } finally {
            loadingEl.style.display = 'none';
            confirmBtn.disabled = false;
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

    async enhanceText() {
        const originalText = document.getElementById('originalText').value.trim();
        const style = document.getElementById('enhancementStyle').value;
        const intensity = parseInt(document.getElementById('intensitySlider').value);

        if (!originalText) {
            this.showAlert('Por favor ingresa un texto para mejorar', 'error');
            return;
        }

        const enhanceBtn = document.getElementById('enhanceBtn');
        const originalBtnText = enhanceBtn.innerHTML;
        
        try {
            enhanceBtn.disabled = true;
            enhanceBtn.innerHTML = '<span class="loading"></span> Procesando...';

            const { data, error } = await this.supabase.functions.invoke('enhance', {
                body: {
                    originalText: originalText,
                    style: style,
                    intensity: intensity,
                    conversationId: null // Enhancement standalone
                }
            });

            if (error) throw error;

            this.currentEnhancement = data.data;
            this.displayEnhancementResult(data.data);

        } catch (error) {
            console.error('Error enhancing text:', error);
            this.showAlert('Error al mejorar texto: ' + error.message, 'error');
        } finally {
            enhanceBtn.disabled = false;
            enhanceBtn.innerHTML = originalBtnText;
        }
    }

    displayEnhancementResult(result) {
        document.getElementById('enhancedText').value = result.enhanced_text;
        document.getElementById('enhancementResult').style.display = 'block';

        // Mostrar métricas
        const metricsEl = document.getElementById('enhancementMetrics');
        metricsEl.innerHTML = `
            <p><strong>Proveedor:</strong> ${result.provider}</p>
            <p><strong>Tiempo de procesamiento:</strong> ${result.processing_time}ms</p>
            <p><strong>Palabras:</strong> ${result.diff_data.word_changes.original_count} → ${result.diff_data.word_changes.enhanced_count} (${result.diff_data.word_changes.added >= 0 ? '+' : ''}${result.diff_data.word_changes.added})</p>
            <p><strong>Caracteres:</strong> ${result.diff_data.char_changes.original_count} → ${result.diff_data.char_changes.enhanced_count} (${result.diff_data.char_changes.added >= 0 ? '+' : ''}${result.diff_data.char_changes.added})</p>
        `;

        // Mostrar diferencias (simplificado)
        const diffEl = document.getElementById('enhancementDiff');
        diffEl.innerHTML = `
            <p><small>Cambios aplicados al texto original según el estilo seleccionado.</small></p>
        `;
    }

    updateIntensityValue(value) {
        document.getElementById('intensityValue').textContent = value;
    }

    approveEnhancement() {
        if (!this.currentEnhancement) return;

        // Copiar texto mejorado al original para poder seguir iterando
        document.getElementById('originalText').value = this.currentEnhancement.enhanced_text;
        this.showAlert('Texto mejorado aprobado. Puedes seguir editando.', 'success');
        this.resetEnhancement();
    }

    resetEnhancement() {
        document.getElementById('enhancementResult').style.display = 'none';
        document.getElementById('enhancedText').value = '';
        this.currentEnhancement = null;
    }

    async loadAnalytics() {
        try {
            // Obtener métricas de uso de LLMs
            const { data: messages } = await this.supabase
                .from('messages')
                .select('llm_provider, tokens_estimated, processing_time_ms')
                .eq('sender', 'bot')
                .not('llm_provider', 'is', null);

            if (messages && messages.length > 0) {
                const minimaxCount = messages.filter(m => m.llm_provider === 'minimax').length;
                const geminiCount = messages.filter(m => m.llm_provider === 'gemini').length;
                const total = minimaxCount + geminiCount;

                const minimaxPercentage = total > 0 ? Math.round((minimaxCount / total) * 100) : 0;
                const geminiPercentage = total > 0 ? Math.round((geminiCount / total) * 100) : 0;

                document.getElementById('minimaxUsage').textContent = minimaxPercentage + '%';
                document.getElementById('geminiUsage').textContent = geminiPercentage + '%';

                const avgTime = messages.reduce((sum, m) => sum + (m.processing_time_ms || 0), 0) / messages.length;
                document.getElementById('avgResponseTime').textContent = Math.round(avgTime);

                const totalTokens = messages.reduce((sum, m) => sum + (m.tokens_estimated || 0), 0);
                document.getElementById('totalTokens').textContent = this.formatNumber(totalTokens);
            }

        } catch (error) {
            console.error('Error loading analytics:', error);
        }
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    async saveSettings() {
        const settings = {
            maxTokens: parseInt(document.getElementById('maxTokens').value),
            temperature: parseFloat(document.getElementById('temperature').value),
            ragThreshold: parseFloat(document.getElementById('ragThreshold').value),
            ragMaxResults: parseInt(document.getElementById('ragMaxResults').value)
        };

        try {
            // En un entorno real, guardaríamos estos ajustes en la base de datos
            localStorage.setItem('adminSettings', JSON.stringify(settings));
            this.showAlert('Configuración guardada exitosamente', 'success');
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showAlert('Error al guardar configuración', 'error');
        }
    }

    // Métodos de acción para conversaciones y documentos
    async viewConversation(conversationId) {
        // Implementar visualización de conversación
        this.showAlert('Funcionalidad de visualización en desarrollo', 'info');
    }

    async toggleBot(conversationId, pauseBot) {
        try {
            const { error } = await this.supabase.functions.invoke('takeover', {
                body: {
                    action: pauseBot ? 'pause_bot' : 'resume_bot',
                    conversationId: conversationId
                }
            });

            if (error) throw error;

            this.showAlert(`Bot ${pauseBot ? 'pausado' : 'reanudado'} exitosamente`, 'success');
            this.loadConversations();

        } catch (error) {
            console.error('Error toggling bot:', error);
            this.showAlert('Error al controlar bot: ' + error.message, 'error');
        }
    }

    async viewDocument(documentId) {
        // Implementar visualización de documento
        this.showAlert('Funcionalidad de visualización en desarrollo', 'info');
    }

    async reindexDocument(documentId) {
        if (!confirm('¿Estás seguro de que deseas reindexar este documento?')) return;

        try {
            const { error } = await this.supabase.functions.invoke('manage-documents', {
                body: { action: 'reindex', id: documentId }
            });

            if (error) throw error;

            this.showAlert('Documento reindexado exitosamente', 'success');

        } catch (error) {
            console.error('Error reindexing document:', error);
            this.showAlert('Error al reindexar documento: ' + error.message, 'error');
        }
    }

    async deleteDocument(documentId) {
        if (!confirm('¿Estás seguro de que deseas eliminar este documento? Esta acción no se puede deshacer.')) return;

        try {
            const { error } = await this.supabase.functions.invoke('manage-documents', {
                body: { action: 'delete', id: documentId }
            });

            if (error) throw error;

            this.showAlert('Documento eliminado exitosamente', 'success');
            this.loadDocuments();

        } catch (error) {
            console.error('Error deleting document:', error);
            this.showAlert('Error al eliminar documento: ' + error.message, 'error');
        }
    }

    async logout() {
        try {
            const { error } = await this.supabase.auth.signOut();
            if (error) throw error;
            window.location.reload();
        } catch (error) {
            console.error('Error signing out:', error);
            this.showAlert('Error al cerrar sesión', 'error');
        }
    }

    showAlert(message, type = 'info') {
        const alert = document.getElementById('alert');
        alert.className = `alert alert-${type} show`;
        alert.textContent = message;
        
        setTimeout(() => {
            alert.classList.remove('show');
        }, 5000);
    }
}

// Inicializar consola cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    window.adminConsole = new AdminConsole();
});