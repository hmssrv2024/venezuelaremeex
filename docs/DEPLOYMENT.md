# Guía de Despliegue - Mega Chat

Esta guía te ayudará a desplegar la mega app de chatbot multimodal paso a paso.

## 📦 Prerrequisitos

### Herramientas Necesarias
- [Node.js](https://nodejs.org/) v18 o superior
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Git](https://git-scm.com/)

### Cuentas de Servicio
- Cuenta de [Supabase](https://supabase.com) (gratuita)
- API Key de [Gemini](https://aistudio.google.com) (gratuita)
- API Key de [MiniMax](https://api.minimax.ai) (opcional)

## 🚀 Despliegue Paso a Paso

### 1. Configuración del Proyecto

```bash
# Clonar el repositorio
git clone <tu-repo-url>
cd mega-chat

# Instalar dependencias globales
npm install -g @supabase/cli

# Configurar variables de entorno
cp .env.example .env
```

Edita el archivo `.env` con tus credenciales:

```env
# MiniMax (opcional)
MINIMAX_API_KEY=tu_clave_minimax
MINIMAX_BASE_URL=https://api.minimax.ai

# Gemini (requerido)
GEMINI_API_KEY=AIzaSyDKwwSZvdpcehlV2jpBkLjBdC-XcclVPJY

# Supabase (se configurará después)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### 2. Configuración de Supabase

```bash
# Inicializar Supabase
supabase login
supabase init

# Crear nuevo proyecto (o vincular existente)
supabase projects create mega-chat --org-id <tu-org-id>

# O vincular a proyecto existente
supabase link --project-ref <tu-project-ref>

# Aplicar migraciones
supabase db reset

# Verificar que las tablas se crearon
supabase db diff
```

### 3. Configurar Variables de Entorno

Obtener credenciales de Supabase:

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **Settings > API**
3. Copia las siguientes claves:
   - **URL**: `https://tu-proyecto.supabase.co`
   - **anon key**: Para el frontend
   - **service_role key**: Para las edge functions

Actualiza tu `.env`:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

### 4. Configurar Storage

```bash
# Crear bucket para uploads
supabase storage create uploads --public

# O ejecutar SQL manualmente
echo "INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', true);" | supabase db sql
```

### 5. Desplegar Edge Functions

```bash
# Desplegar todas las funciones
supabase functions deploy

# O desplegar individualmente
supabase functions deploy chat
supabase functions deploy transcribe
supabase functions deploy vision
supabase functions deploy enhance
supabase functions deploy takeover
supabase functions deploy upload
supabase functions deploy rag-search

# Verificar despliegue
supabase functions list
```

### 6. Configurar Secrets

```bash
# Configurar secrets para las edge functions
supabase secrets set MINIMAX_API_KEY=tu_clave_minimax
supabase secrets set GEMINI_API_KEY=AIzaSyDKwwSZvdpcehlV2jpBkLjBdC-XcclVPJY
supabase secrets set CORS_ALLOWED_ORIGINS="https://tu-dominio.com,http://localhost:3000"

# Verificar secrets
supabase secrets list
```

### 7. Build y Desplegar Frontend

#### Widget Embebible

```bash
cd apps/web
npm install
npm run build

# Los archivos estarán en apps/web/dist/
# Sube embed.js a tu CDN o servidor web
```

#### Consola Admin

```bash
cd apps/web-admin
npm install
npm run build

# Los archivos estarán en apps/web-admin/dist/
# Despliega en Vercel, Netlify o tu servidor
```

### 8. Configuración Inicial

#### Crear Usuario Admin

1. Registrarse en tu aplicación
2. Ejecutar SQL para promover a admin:

```sql
-- Reemplaza con tu email real
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'tu-email@ejemplo.com';
```

#### Datos de Prueba

```bash
# Cargar datos iniciales
supabase db seed
```

### 9. Verificación del Despliegue

#### Probar Edge Functions

```bash
# Test básico de conexión
curl -X POST https://tu-proyecto.supabase.co/functions/v1/chat \
  -H "Authorization: Bearer tu-anon-key" \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "test", "message": "Hola"}'
```

#### Probar Widget

Crea un archivo `test.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Test Mega Chat</title>
</head>
<body>
    <h1>Test de Mega Chat</h1>
    
    <script src="/ruta/a/embed.js"></script>
    <script>
        MegaChat.init({
            supabaseUrl: 'https://tu-proyecto.supabase.co',
            supabaseKey: 'tu-anon-key',
            defaultModel: 'auto'
        });
    </script>
</body>
</html>
```

## 🌐 Despliegue en Producción

### Opciones de Hosting

#### Frontend (Vercel - Recomendado)

```bash
# Instalar Vercel CLI
npm i -g vercel

# Desplegar widget
cd apps/web
vercel --prod

# Desplegar admin
cd apps/web-admin
vercel --prod
```

#### Frontend (Netlify)

```bash
# Build
npm run build

# Drag & drop a Netlify o usar CLI
npm i -g netlify-cli
netlify deploy --prod --dir=dist
```

#### CDN para Widget

```bash
# Subir embed.js a tu CDN preferido
# AWS S3 + CloudFront
# Google Cloud Storage
# Azure Blob Storage
# o cualquier CDN
```

### Variables de Entorno para Producción

```bash
# Actualizar CORS en Supabase
supabase secrets set CORS_ALLOWED_ORIGINS="https://tu-dominio.com,https://admin.tu-dominio.com"

# Rate limiting más estricto
supabase secrets set RATE_LIMIT_MAX_REQUESTS=50
supabase secrets set RATE_LIMIT_WINDOW_MINUTES=15

# Habilitar moderación
supabase secrets set ENABLE_MODERATION=true
```

## 🔧 Mantenimiento

### Monitoreo

```bash
# Ver logs de edge functions
supabase functions logs --follow

# Ver logs específicos
supabase functions logs chat --follow

# Ver logs de base de datos
supabase db logs --follow
```

### Actualizaciones

```bash
# Actualizar migraciones
supabase db diff --schema public > migraciones/nueva_migracion.sql
supabase db push

# Actualizar edge functions
supabase functions deploy

# Actualizar frontend
npm run build
# Subir nuevos archivos
```

### Backup

```bash
# Backup de base de datos
supabase db dump > backup_$(date +%Y%m%d).sql

# Backup de storage
# Usar herramientas de tu proveedor de CDN
```

## 🐛 Troubleshooting

### Problemas Comunes

#### Edge Functions no responden

```bash
# Verificar logs
supabase functions logs chat

# Redesplegar
supabase functions deploy chat

# Verificar secrets
supabase secrets list
```

#### Error de CORS

```bash
# Actualizar dominios permitidos
supabase secrets set CORS_ALLOWED_ORIGINS="https://tu-dominio.com"
```

#### Rate Limit

```bash
# Limpiar rate limits antiguos
echo "DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour';" | supabase db sql
```

#### Problemas de Audio

- Verificar permisos de micrófono en el navegador
- Comprobar que el sitio usa HTTPS (requerido para getUserMedia)
- Verificar configuración de MediaRecorder

### Logs Útiles

```bash
# Ver todos los eventos
echo "SELECT * FROM events ORDER BY created_at DESC LIMIT 50;" | supabase db sql

# Ver errores recientes
echo "SELECT * FROM events WHERE name LIKE '%error%' ORDER BY created_at DESC;" | supabase db sql

# Ver métricas de modelos
echo "SELECT * FROM get_model_metrics(7);" | supabase db sql
```

## 📈 Optimización

### Performance

1. **CDN**: Usa un CDN para servir el widget
2. **Caching**: Configura caching apropiado
3. **Compresión**: Habilita gzip/brotli
4. **Images**: Optimiza imágenes antes de subir

### Costos

1. **Supabase**: Monitorea uso de base de datos y edge functions
2. **APIs**: Controla usage de Gemini/MiniMax
3. **Storage**: Limpia archivos antiguos regularmente

### Seguridad

1. **RLS**: Verifica que todas las políticas estén activas
2. **Rate Limiting**: Ajusta límites según tu tráfico
3. **Moderation**: Habilita filtros de contenido
4. **Secrets**: Rota claves regularmente

---

¡Felicidades! 🎉 Tu mega app de chatbot multimodal está lista para usar.

Para soporte adicional, consulta la documentación técnica o crea un issue en el repositorio.