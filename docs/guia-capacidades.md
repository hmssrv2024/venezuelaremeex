# Guía de Capacidades del Chatbot

Este documento describe las funcionalidades principales del sistema de chatbot multimodal.

## Capacidades de Texto

El chatbot puede mantener conversaciones naturales en español, proporcionando respuestas contextualmente relevantes y coherentes. Soporta múltiples tipos de consultas:

- Preguntas generales de conocimiento
- Asistencia con tareas específicas
- Resolución de problemas
- Explicaciones detalladas de conceptos

## Capacidades Multimodales

### Análisis de Imágenes

El sistema puede procesar y analizar imágenes, describiendo:
- Objetos y elementos visibles
- Personas y expresiones
- Texto presente en la imagen
- Colores y composición
- Contexto y escenario

### Transcripción de Audio

Capacidad de convertir audio a texto con alta precisión:
- Soporte para múltiples formatos de audio
- Reconocimiento de voz en español
- Procesamiento en tiempo real
- Integración con el flujo de conversación

### Procesamiento de Documentos

El chatbot puede trabajar con documentos:
- PDFs con extracción de texto
- Archivos de texto plano
- Documentos Markdown
- Búsqueda semántica en la base de conocimiento

## Sistema RAG (Retrieval-Augmented Generation)

Capacidad de búsqueda y recuperación de información:
- Índice vectorial de documentos
- Búsqueda semántica inteligente
- Integración contextual de información
- Respuestas enriquecidas con datos específicos

## Integración Dual LLM

El sistema utiliza dos proveedores de IA:

### MiniMax
- Optimizado para conversaciones en español
- Excelente comprensión contextual
- Respuestas naturales y fluidas

### Google Gemini
- Capacidades avanzadas multimodales
- Procesamiento robusto de imágenes
- Análisis de contenido complejo

## Modos de Operación

- **Auto**: Selección automática del mejor modelo
- **MiniMax**: Uso exclusivo de MiniMax
- **Gemini**: Uso exclusivo de Gemini
- **Híbrido**: Combinación inteligente de ambos

## Funcionalidades de Administración

Para administradores, el sistema incluye:
- Supervisión de conversaciones en tiempo real
- Capacidad de tomar control (takeover)
- Herramientas de mejora de redacción
- Análisis y métricas de rendimiento
- Gestión de la base de conocimiento