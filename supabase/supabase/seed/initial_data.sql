-- Semillas de datos iniciales para Mega Chat

-- Crear usuario administrador por defecto (ajustar email)
-- NOTA: Este usuario debe crearse a través de Supabase Auth primero
-- Luego ejecutar este script para asignar rol de admin

-- Actualizar perfil a admin (cambiar el email por el tuyo)
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@ejemplo.com';

-- Datos de ejemplo para documentos RAG (Remeex Visa)
INSERT INTO documents (id, title, mime_type, storage_path, text_content, metadata, uploaded_by) 
VALUES 
(
  gen_random_uuid(),
  'Guía de Recargas Remeex Visa',
  'text/markdown',
  'docs/guia_recargas.md',
  'Guía Explicativa: Entendiendo los Dos Tipos de Recarga en Remeex Visa

La Clave para Activar tus Retiros sin Confusiones

¡Bienvenido a Remeex Visa! Entendemos que uno de los pasos más importantes (y que a veces genera dudas) es la activación de los retiros. Esta guía está diseñada para aclarar la diferencia fundamental entre dos acciones que, aunque ambas se llaman "recarga", tienen propósitos completamente distintos.

Paso 1: La Recarga para Añadir Fondos (Tu Dinero para Usar)

Esta es generalmente la primera acción que realizas después de crear tu cuenta.

¿Qué es?
Es la acción de añadir dinero a tu saldo de Remeex Visa utilizando un método de pago externo, como una tarjeta de crédito o débito internacional.

Su Propósito Principal: CARGAR SALDO
El objetivo es simplemente tener fondos disponibles en tu cuenta para poder usarlos dentro de la plataforma.

¿Cómo se hace?
Vas a "Agregar Dinero", seleccionas la pestaña "Tarjeta de Crédito", eliges un monto (actualmente a partir de $500) e introduces los datos de tu tarjeta para procesar el pago.

Resultado Inmediato:
El dinero se acredita a tu saldo de Remeex Visa de forma inmediata y puedes usarlo para transferencias o futuros servicios.',
  '{"source": "remeex_guide", "category": "recargas", "language": "es"}',
  '00000000-0000-0000-0000-000000000000' -- UUID por defecto, cambiar por admin real
),
(
  gen_random_uuid(),
  'Coherencia Financiera en Remeex Visa',
  'text/markdown', 
  'docs/coherencia_financiera.md',
  'Guía Completa sobre la Coherencia Financiera en Remeex Visa

1. ¿Qué es la "Coherencia Financiera"?

En términos simples, la coherencia financiera es un principio de seguridad que utiliza el sistema de Remeex Visa para analizar si tus acciones dentro de la aplicación son lógicas y consistentes con el comportamiento esperado de un propietario legítimo de fondos.

2. ¿Por Qué Remeex Visa Utiliza este Principio?

El objetivo principal es proteger tu dinero y prevenir el fraude. Se utiliza para detectar "banderas rojas" (señales de alerta) que podrían indicar:
- Alguien está usando una tarjeta de crédito robada para cargar fondos
- Alguien ha obtenido acceso no autorizado a tu cuenta
- Se está intentando usar la plataforma para actividades ilícitas

3. El Ejemplo Clave: La Incoherencia que Activa el Bloqueo

La Situación: Un usuario recibe una cantidad significativa de dinero en su cuenta Remeex Visa (por ejemplo, $500 a través de una recarga con tarjeta de crédito).

La Lógica del Sistema: El sistema reconoce que hay un saldo alto y valioso en la cuenta. Para proteger esos fondos, el siguiente paso lógico y obligatorio antes de permitir un retiro es la validación de la cuenta bancaria.

La Acción Requerida: Para validar, el sistema le pide al usuario que realice una recarga mínima (por ejemplo, $25) desde la cuenta bancaria que registró.

La "Bandera Roja": El usuario, a pesar de tener $500 disponibles, se niega o tarda mucho en realizar la pequeña recarga de validación de $25.',
  '{"source": "remeex_guide", "category": "seguridad", "language": "es"}',
  '00000000-0000-0000-0000-000000000000'
),
(
  gen_random_uuid(),
  'Funcionalidades Adicionales Remeex Visa',
  'text/markdown',
  'docs/funcionalidades_adicionales.md', 
  'Funcionalidades Adicionales: Tu Caja de Herramientas Financieras

Tu cuenta Remeex Visa va más allá de las recargas y transferencias. Descubre aquí los servicios avanzados que tienes a tu disposición una vez que tu cuenta está completamente activa.

Más Allá del Banco: Retira tu Dinero en Efectivo

¿Qué es?
En el panel de "Servicios", verás la opción "Retiro en efectivo" asociada con Western Union. Esto te permite convertir tu saldo digital de Remeex Visa en dinero en efectivo.

¿Cómo funciona?
Requisito Indispensable: Para acceder a esta y a todas las funciones de retiro, es fundamental que primero hayas completado la validación de tu cuenta bancaria.

Costo: Remeex Visa no cobra comisiones por gestionar esta operación.

Proceso: El sistema te guiará para generar un código de retiro. Con ese código, la persona que tú designes (o tú mismo) puede acercarse a una agencia de Western Union autorizada para recoger el dinero en efectivo.

Tu Lealtad Tiene Recompensa: El Programa de Puntos

¿Qué es?
Notarás que en tu panel principal, junto a tu nivel de cuenta (Estándar, Bronce, etc.), aparece un contador de "puntos".

¿Para qué sirven?
Este es un programa de lealtad. Cada vez que realizas operaciones, acumulas puntos que te ayudan a mantener o mejorar tu nivel de cuenta. Puedes canjear estos puntos directamente por saldo en tu cuenta.

Recibe Pagos al Instante: Tu Código QR Personal

¿Qué es?
Dentro de "Ajustes", la opción "Mi QR" genera un código único para tu cuenta.

¿Cómo lo uso?
Es la forma más rápida de recibir dinero de otro usuario de Remeex Visa. En lugar de darle tu correo, simplemente muéstrale tu código QR.',
  '{"source": "remeex_guide", "category": "funcionalidades", "language": "es"}',
  '00000000-0000-0000-0000-000000000000'
);

-- Conversación de ejemplo
INSERT INTO conversations (id, user_id, title, status) VALUES 
(
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000', -- Cambiar por usuario real
  'Consulta sobre Recargas',
  'active'
);

-- Mensajes de ejemplo
-- (Se agregarán automáticamente cuando los usuarios interactúen con el chat)

-- Eventos de ejemplo para observabilidad
INSERT INTO events (name, payload) VALUES 
('system_initialized', '{"version": "1.0.0", "timestamp": "2024-08-16T08:00:00Z"}'),
('documents_seeded', '{"count": 3, "category": "remeex_guides"}');

COMMIT;

-- Notas para configuración inicial:
-- 1. Cambiar '00000000-0000-0000-0000-000000000000' por el UUID real del usuario admin
-- 2. Ejecutar este script después de crear el usuario admin en Supabase Auth
-- 3. Generar embeddings para los documentos si se va a usar RAG real
-- 4. Ajustar permisos de Storage para el bucket 'uploads'