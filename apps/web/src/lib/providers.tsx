'use client';

import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { configureApiAuth } from '@/lib/api';
import { wsClient, WsServerEvents } from '@/lib/ws';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/ui';
import type { ChatMessage, CornerStyle, ThemeMode } from '@/types';

function applyTheme(theme: ThemeMode | string | undefined, corner: CornerStyle | string | undefined) {
  const root = document.documentElement;
  const mode = (theme as ThemeMode) || 'system';
  let resolved: 'light' | 'dark' = 'light';
  if (mode === 'dark') resolved = 'dark';
  else if (mode === 'light') resolved = 'light';
  else {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-corner', (corner as CornerStyle) || 'soft');
}

function AuthBootstrap({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const setHydrated = useAuthStore((s) => s.setHydrated);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const replaceByClientId = useChatStore((s) => s.replaceByClientId);
  const updateByClientId = useChatStore((s) => s.updateByClientId);

  useEffect(() => {
    configureApiAuth({
      getTokens: () => ({
        accessToken: useAuthStore.getState().accessToken,
        refreshToken: useAuthStore.getState().refreshToken,
      }),
      setTokens: (access, refresh) => useAuthStore.getState().setTokens(access, refresh),
      onLogout: () => {
        useAuthStore.getState().clear();
        wsClient.disconnect();
      },
    });
    // If persist already finished before this mount
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
    }
  }, [setHydrated]);

  useEffect(() => {
    applyTheme(user?.theme, user?.corner_style);
    if (!user) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(user.theme, user.corner_style);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [user?.theme, user?.corner_style, user]);

  useEffect(() => {
    if (!hydrated) return;
    if (accessToken) {
      wsClient.connect(accessToken);
    } else {
      wsClient.disconnect();
    }
  }, [accessToken, hydrated]);

  useEffect(() => {
    const offNew = wsClient.on(WsServerEvents.MESSAGE_NEW, (payload) => {
      const msg = payload as ChatMessage;
      if (msg?.conversation_id) appendMessage(msg.conversation_id, msg);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    const offAck = wsClient.on(WsServerEvents.MESSAGE_ACK, (payload) => {
      const data = payload as {
        client_message_id?: string;
        message?: ChatMessage;
      };
      if (data.message?.conversation_id && data.client_message_id) {
        replaceByClientId(data.message.conversation_id, data.client_message_id, data.message);
      } else if (data.message?.conversation_id) {
        appendMessage(data.message.conversation_id, data.message);
      }
    });
    const updateMessage = useChatStore.getState().updateMessage;
    const offRevoke = wsClient.on(WsServerEvents.MESSAGE_REVOKE, (payload) => {
      const data = payload as { message_id?: string; conversation_id?: string };
      if (data.conversation_id && data.message_id) {
        updateMessage(data.conversation_id, data.message_id, {
          revoked_at: new Date().toISOString(),
          body: null,
        });
      }
    });
    const offDelete = wsClient.on(WsServerEvents.MESSAGE_DELETE, (payload) => {
      const data = payload as {
        message_id?: string;
        conversation_id?: string;
      };
      if (data.conversation_id && data.message_id) {
        updateMessage(data.conversation_id, data.message_id, {
          message_type: 'deleted',
          body: null,
          attachments: [],
        });
      }
    });
    const offError = wsClient.on(WsServerEvents.ERROR, (payload) => {
      const data = payload as {
        conversation_id?: string;
        client_message_id?: string;
      };
      if (data.conversation_id && data.client_message_id) {
        updateByClientId(data.conversation_id, data.client_message_id, {
          pending: false,
          failed: true,
        });
      }
    });
    const offConversation = wsClient.on(
      WsServerEvents.CONVERSATION_UPDATED,
      () => {
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      },
    );
    const offNotification = wsClient.on(WsServerEvents.NOTIFICATION_NEW, () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notification-count'] });
    });
    return () => {
      offNew();
      offAck();
      offRevoke();
      offDelete();
      offError();
      offConversation();
      offNotification();
    };
  }, [
    appendMessage,
    queryClient,
    replaceByClientId,
    updateByClientId,
  ]);

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <AuthBootstrap>{children}</AuthBootstrap>
    </QueryClientProvider>
  );
}
