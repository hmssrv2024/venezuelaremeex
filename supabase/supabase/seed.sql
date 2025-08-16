-- Seed data for testing

-- Insert admin user profile (will be created when first admin signs up)
-- This is just a placeholder - real admin will be created through auth

-- Insert sample documents for RAG testing
INSERT INTO documents (title, content, metadata) VALUES
('Guía de Uso del Chatbot', 'Este chatbot multimodal puede procesar texto, audio e imágenes. Puede cambiar entre diferentes modelos de IA según sus necesidades. Para usar el audio, simplemente mantenga presionado el botón de micrófono. Para imágenes, arrastre y suelte o use el botón de adjuntar.', '{"type": "guide", "category": "usage"}'),
('Políticas de Privacidad', 'Protegemos su privacidad. Todos los datos se almacenan de forma segura y solo se procesan para mejorar su experiencia de chat. No compartimos información personal con terceros sin su consentimiento.', '{"type": "policy", "category": "privacy"}'),
('Soporte Técnico', 'Si experimenta problemas técnicos, puede contactar al soporte a través del chat o usar la función de takeover para hablar directamente con un administrador humano.', '{"type": "support", "category": "technical"}');

-- Insert sample enhancement styles reference
INSERT INTO admin_drafts (admin_id, original_content, enhanced_content, style, diff_html) VALUES
(gen_random_uuid(), 'hola como estas', 'Buenos días, espero que se encuentre muy bien.', 'formal', '<div><del>hola como estas</del><ins>Buenos días, espero que se encuentre muy bien.</ins></div>'),
(gen_random_uuid(), 'necesito ayuda con esto urgente', 'Requiero asistencia inmediata.', 'concise', '<div><del>necesito ayuda con esto urgente</del><ins>Requiero asistencia inmediata.</ins></div>'),
(gen_random_uuid(), 'gracias por la info', '¡Muchas gracias por la información! 😊', 'friendly', '<div><del>gracias por la info</del><ins>¡Muchas gracias por la información! 😊</ins></div>');