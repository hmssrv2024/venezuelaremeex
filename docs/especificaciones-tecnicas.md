# Especificaciones Técnicas - Chatbot Multimodal

## Arquitectura del Sistema

### Stack Tecnológico
- **Frontend**: Vanilla JavaScript/TypeScript, HTML5, CSS3
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **LLM Providers**: MiniMax API + Google Gemini API
- **Vector Database**: pgvector para RAG
- **Storage**: Supabase Storage
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime

### Componentes Principales

#### 1. Widget Embebible (`/apps/web`)
- **Tecnología**: Vanilla JS/TS para máxima compatibilidad
- **Diseño**: Mobile-first, responsive
- **Funcionalidades**:
  - Chat en tiempo real
  - Grabación de audio (MediaRecorder API)
  - Subida de archivos (drag & drop)
  - Selección de proveedor LLM
  - Activación de RAG

#### 2. Consola de Administración (`/apps/web-admin`)
- **Tecnología**: Vanilla JS/TS con interfaz completa
- **Funcionalidades**:
  - Dashboard con métricas
  - Gestión de conversaciones
  - Takeover de chats
  - Mejorador de redacción
  - Gestión de documentos RAG
  - Análisis comparativo de LLMs

#### 3. Edge Functions (`/supabase/functions`)

##### `chat/index.ts`
- **Propósito**: Procesamiento principal de conversaciones
- **Características**:
  - Streaming SSE
  - Integración dual MiniMax + Gemini
  - Soporte RAG opcional
  - Manejo de attachments
  - Logging de métricas

##### `transcribe/index.ts`
- **Propósito**: Transcripción de audio a texto
- **Proveedores**: MiniMax STT + Gemini Audio
- **Formatos**: WebM, WAV, MP3
- **Optimización**: 16kHz para mejor calidad/velocidad

##### `vision/index.ts`
- **Propósito**: Análisis de imágenes
- **Proveedores**: MiniMax Vision + Gemini Vision
- **Formatos**: JPEG, PNG, WebP
- **Capacidades**: OCR, descripción, análisis contextual

##### `enhance/index.ts`
- **Propósito**: Mejora de redacción para admins
- **Estilos**: Formal, conciso, amable, vendedor, neutro
- **Intensidad**: Configurable 0-100%
- **Output**: Texto mejorado + métricas + diff

##### `takeover/index.ts`
- **Propósito**: Control administrativo de conversaciones
- **Acciones**: start, end, pause_bot, resume_bot, status
- **Seguridad**: Solo admins autenticados

##### `upload/index.ts`
- **Propósito**: Subida segura de archivos
- **Validaciones**: Tipo MIME, tamaño, malware
- **Storage**: Organización por usuario y timestamp

##### `rag-search/index.ts`
- **Propósito**: Búsqueda semántica en documentos
- **Tecnología**: OpenAI embeddings + pgvector
- **Parámetros**: threshold, limit, filters

##### `upload-document/index.ts`
- **Propósito**: Procesamiento de documentos para RAG
- **Funcionalidades**:
  - Extracción de texto de PDFs
  - Chunking inteligente
  - Generación de embeddings
  - Almacenamiento vectorial

##### `manage-documents/index.ts`
- **Propósito**: CRUD completo de documentos
- **Operaciones**: list, get, update, delete, reindex
- **Filtros**: Por tipo, tags, visibilidad
- **Paginación**: Optimizada para grandes conjuntos

## Base de Datos

### Esquema Principal

```sql
-- Usuarios y perfiles
profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text NOT NULL,
  full_name text,
  role user_role DEFAULT 'user',
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

-- Conversaciones
conversations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  title text DEFAULT 'Nueva conversación',
  status conversation_status DEFAULT 'active',
  bot_paused boolean DEFAULT false,
  llm_preference text DEFAULT 'auto',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Mensajes
messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid REFERENCES conversations(id),
  sender message_sender NOT NULL,
  sender_id uuid REFERENCES auth.users(id),
  type message_type DEFAULT 'text',
  content text NOT NULL,
  tokens_estimated int DEFAULT 0,
  status message_status DEFAULT 'sent',
  llm_provider text,
  processing_time_ms int,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Documentos RAG
documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  content text NOT NULL,
  mime_type text NOT NULL,
  embedding vector(1536),
  metadata jsonb DEFAULT '{}',
  tags text[] DEFAULT '{}',
  is_public boolean DEFAULT false,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
```

### Índices Optimizados
- **Vectoriales**: `idx_documents_embedding` usando ivfflat
- **Temporales**: Índices en `created_at` para todas las tablas
- **Funcionales**: Índices GIN para arrays y JSONB
- **Compuestos**: Para consultas frecuentes multi-columna

### Row Level Security (RLS)
- **Políticas granulares** por tabla y operación
- **Verificación de roles** con función `is_admin()`
- **Aislamiento de datos** entre usuarios
- **Acceso de solo lectura** para documentos públicos

## APIs y Integraciones

### MiniMax API
```javascript
// Configuración
const MINIMAX_CONFIG = {
  baseURL: 'https://api.minimax.ai',
  models: {
    text: 'abab6.5s-chat',
    vision: 'abab6.5s-chat',
    audio: 'speech-01'
  }
};

// Endpoints utilizados
- POST /v1/text/chatcompletion_v2 (texto y visión)
- POST /v1/audio/transcriptions (audio)
```

### Google Gemini API
```javascript
// Configuración
const GEMINI_CONFIG = {
  baseURL: 'https://generativelanguage.googleapis.com',
  models: {
    text: 'gemini-1.5-pro',
    vision: 'gemini-1.5-pro',
    audio: 'gemini-1.5-pro'
  }
};

// Endpoints utilizados
- POST /v1beta/models/gemini-1.5-pro:generateContent
- POST /v1beta/models/gemini-1.5-pro:streamGenerateContent
```

### OpenAI API (Solo para embeddings)
```javascript
// Solo para generación de vectores RAG
- POST /v1/embeddings (modelo: text-embedding-ada-002)
```

## Configuración de Desarrollo

### Variables de Entorno
```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# MiniMax
MINIMAX_API_KEY=your_minimax_api_key
MINIMAX_BASE_URL=https://api.minimax.ai
MINIMAX_TEXT_MODEL=abab6.5s-chat
MINIMAX_VISION_MODEL=abab6.5s-chat
MINIMAX_STT_MODEL=speech-01

# Gemini
GEMINI_API_KEY=your_gemini_api_key

# OpenAI (para embeddings)
OPENAI_API_KEY=your_openai_api_key
```