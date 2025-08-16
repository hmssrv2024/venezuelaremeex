import { getSupabase } from '../utils/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface RealtimeCallbacks {
  onTyping?: (data: any) => void;
  onPresence?: (data: any) => void;
  onTakeover?: (data: any) => void;
  onMessage?: (data: any) => void;
}

export class RealtimeService {
  private supabase = getSupabase();
  private channel: RealtimeChannel | null = null;
  private conversationId: string | null = null;
  private callbacks: RealtimeCallbacks = {};

  async connect(conversationId: string, callbacks: RealtimeCallbacks): Promise<void> {
    this.conversationId = conversationId;
    this.callbacks = callbacks;

    // Crear canal para la conversación
    this.channel = this.supabase.channel(`conversation:${conversationId}`, {
      config: {
        presence: {
          key: conversationId
        }
      }
    });

    // Configurar presence
    this.channel
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel!.presenceState();
        this.callbacks.onPresence?.(state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        this.callbacks.onPresence?.({ event: 'join', key, presences: newPresences });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        this.callbacks.onPresence?.({ event: 'leave', key, presences: leftPresences });
      });

    // Eventos personalizados
    this.channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        this.callbacks.onTyping?.(payload);
      })
      .on('broadcast', { event: 'takeover_change' }, (payload) => {
        this.callbacks.onTakeover?.(payload);
      })
      .on('broadcast', { event: 'admin_message' }, (payload) => {
        this.callbacks.onMessage?.(payload);
      });

    // Escuchar cambios en la base de datos
    this.channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          this.callbacks.onMessage?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${conversationId}`
        },
        (payload) => {
          if (payload.new.bot_paused !== payload.old.bot_paused) {
            this.callbacks.onTakeover?.({
              action: payload.new.bot_paused ? 'start' : 'end',
              conversation_id: conversationId
            });
          }
        }
      );

    // Suscribirse al canal
    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Trackear presencia
        await this.channel!.track({
          user_id: (await this.supabase.auth.getUser()).data.user?.id,
          online_at: new Date().toISOString(),
          type: 'user'
        });
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      await this.channel.unsubscribe();
      this.channel = null;
    }
    this.conversationId = null;
    this.callbacks = {};
  }

  async sendTyping(isTyping: boolean): Promise<void> {
    if (!this.channel) return;

    await this.channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        typing: isTyping,
        user_id: (await this.supabase.auth.getUser()).data.user?.id,
        timestamp: new Date().toISOString()
      }
    });
  }

  async sendCustomEvent(event: string, payload: any): Promise<void> {
    if (!this.channel) return;

    await this.channel.send({
      type: 'broadcast',
      event,
      payload
    });
  }

  getPresenceState(): any {
    return this.channel?.presenceState() || {};
  }
}