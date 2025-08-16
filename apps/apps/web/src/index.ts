import { ChatWidget } from './components/ChatWidget';
import { ChatConfig } from './types/config';
import './styles/main.css';

// Global namespace para el widget
(window as any).MegaChat = {
  init: (config: ChatConfig) => {
    const widget = new ChatWidget(config);
    widget.init();
    return widget;
  },
  version: '1.0.0'
};

// Auto-init si hay configuración en data attributes
document.addEventListener('DOMContentLoaded', () => {
  const scripts = document.querySelectorAll('script[data-mega-chat]');
  
  scripts.forEach(script => {
    const config = {
      supabaseUrl: script.getAttribute('data-supabase-url'),
      supabaseKey: script.getAttribute('data-supabase-key'),
      defaultModel: script.getAttribute('data-default-model') || 'auto',
      theme: script.getAttribute('data-theme') || 'light',
      language: script.getAttribute('data-language') || 'es-ES'
    };
    
    if (config.supabaseUrl && config.supabaseKey) {
      (window as any).MegaChat.init(config);
    }
  });
});

export { ChatWidget, ChatConfig };