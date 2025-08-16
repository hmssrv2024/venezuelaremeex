# Políticas de Privacidad y Seguridad - Chatbot Multimodal

## Introducción

La privacidad y seguridad de nuestros usuarios es fundamental. Este documento describe cómo protegemos tu información y garantizamos un uso seguro del sistema.

## Recopilación de Datos

### Información que Recopilamos
- **Mensajes de chat**: Contenido de las conversaciones para proporcionar respuestas
- **Archivos subidos**: Imágenes, audio y documentos para procesamiento
- **Metadatos técnicos**: Timestamps, tamaños de archivo, tipos MIME
- **Métricas de uso**: Tiempos de respuesta, proveedores LLM utilizados

### Información que NO Recopilamos
- Datos personales identificables sin consentimiento explícito
- Información de otros sitios web o aplicaciones
- Datos de ubicación en tiempo real
- Información financiera o de pago

## Uso de la Información

### Propósitos Primarios
1. **Proporcionar respuestas**: Procesar consultas y generar respuestas relevantes
2. **Mejorar el servicio**: Optimizar algoritmos y capacidades del sistema
3. **Soporte técnico**: Resolver problemas y brindar asistencia
4. **Análisis de rendimiento**: Evaluar efectividad de diferentes modelos LLM

### Procesamientos Automatizados
- **Transcripción de audio**: Conversión de voz a texto
- **Análisis de imágenes**: Extracción de contenido visual
- **Indexación de documentos**: Creación de índices para búsqueda
- **Generación de embeddings**: Vectorización para búsqueda semántica

## Protección de Datos

### Cifrado
- **En tránsito**: Todas las comunicaciones usan HTTPS/TLS
- **En reposo**: Base de datos cifrada con AES-256
- **API Keys**: Almacenamiento seguro con rotación regular

### Control de Acceso
- **Autenticación**: Requerida para funciones administrativas
- **Autorización**: Permisos basados en roles (usuario/admin)
- **Row Level Security**: Políticas estrictas en base de datos

### Monitoreo
- **Logs de auditoria**: Registro de acciones administrativas
- **Detección de anomalías**: Identificación de patrones inusuales
- **Alertas de seguridad**: Notificaciones automáticas de eventos críticos

## Retención de Datos

### Períodos de Retención
- **Conversaciones activas**: Mantenidas mientras estén en uso
- **Conversaciones cerradas**: 90 días desde última actividad
- **Archivos temporales**: Eliminados después del procesamiento
- **Logs del sistema**: 30 días para eventos normales, 1 año para eventos de seguridad

### Eliminación Automática
- Proceso automatizado de limpieza ejecutado semanalmente
- Eliminación segura con sobrescritura de datos
- Confirmación de eliminación en logs de auditoria

## Compartición de Datos

### Con Terceros
- **Proveedores LLM**: MiniMax y Google Gemini procesan contenido para generar respuestas
- **Servicios de infraestructura**: Supabase para almacenamiento y procesamiento
- **NO compartimos**: Datos con fines publicitarios o comercialización

### Protección en Transferencias
- Acuerdos de procesamiento de datos con todos los proveedores
- Verificación de cumplimiento de estándares de seguridad
- Minimización de datos enviados a terceros

## Derechos del Usuario

### Acceso y Control
- **Ver conversaciones**: Acceso a historial personal
- **Eliminar datos**: Solicitud de eliminación de conversaciones
- **Exportar datos**: Descarga de información personal
- **Rectificación**: Corrección de datos incorrectos

### Ejercicio de Derechos
1. Contactar al equipo de privacidad
2. Verificación de identidad
3. Procesamiento de solicitud (máximo 30 días)
4. Confirmación de acción completada

## Seguridad del Sistema

### Medidas Técnicas
- **Rate limiting**: Prevención de abuso automatizado
- **Validación de entrada**: Sanitización de contenido malicioso
- **Firewall de aplicación**: Protección contra ataques web
- **Actualizaciones regulares**: Parches de seguridad aplicados prontamente

### Medidas Organizacionales
- **Capacitación en seguridad**: Personal formado en mejores prácticas
- **Principio de menor privilegio**: Acceso mínimo necesario
- **Revisión de código**: Auditorías de seguridad en desarrollo
- **Plan de respuesta a incidentes**: Protocolo establecido para brechas

## Cumplimiento Normativo

### Estándares Aplicables
- **GDPR**: Cumplimiento con regulación europea de protección de datos
- **LOPD**: Adaptación a normativa española de protección de datos
- **ISO 27001**: Implementación de mejores prácticas de seguridad

### Auditorías
- Evaluaciones regulares de seguridad
- Pruebas de penetración periódicas
- Certificaciones de terceros independientes

## Notificación de Incidentes

### En Caso de Brecha
1. **Detección**: Identificación inmediata del incidente
2. **Contención**: Medidas para limitar el impacto
3. **Evaluación**: Análisis del alcance y riesgo
4. **Notificación**: Comunicación a autoridades y usuarios afectados
5. **Remedición**: Acciones correctivas y preventivas

### Contacto de Emergencia
- Email: security@chatbot-company.com
- Teléfono: +34 XXX XXX XXX (24/7)
- Portal de reporte: security.chatbot-company.com

## Contacto

Para consultas sobre privacidad y seguridad:
- **Email**: privacy@chatbot-company.com
- **Dirección**: Calle Ejemplo 123, 28001 Madrid, España
- **Teléfono**: +34 XXX XXX XXX

## Actualizaciones

Esta política se revisa anualmente y se actualiza según sea necesario. Los cambios significativos serán notificados a los usuarios con al menos 30 días de antelación.

**Última actualización**: 16 de Agosto de 2025