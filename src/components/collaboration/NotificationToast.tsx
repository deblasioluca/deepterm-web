'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Terminal, Mic, Bell } from 'lucide-react';

export interface SessionNotification {
  id: string;
  notificationType: 'terminal_invite' | 'audio_invite';
  fromUserId: string;
  fromEmail: string;
  sessionId?: string;
  sessionName?: string;
  roomName?: string;
  orgId: string;
  timestamp: string;
}

interface NotificationToastProps {
  notifications: SessionNotification[];
  onDismiss: (id: string) => void;
  onAccept?: (notification: SessionNotification) => void;
}

export function NotificationToast({ notifications, onDismiss, onAccept }: NotificationToastProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map(n => (
        <NotificationCard
          key={n.id}
          notification={n}
          onDismiss={() => onDismiss(n.id)}
          onAccept={() => onAccept?.(n)}
        />
      ))}
    </div>
  );
}

function NotificationCard({
  notification,
  onDismiss,
  onAccept,
}: {
  notification: SessionNotification;
  onDismiss: () => void;
  onAccept: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; });

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismissRef.current(), 300);
    }, 15000);
    return () => clearTimeout(timer);
  }, []);

  const isTerminal = notification.notificationType === 'terminal_invite';
  const Icon = isTerminal ? Terminal : Mic;
  const title = isTerminal ? 'Terminal Session Invite' : 'Audio Call Invite';
  const description = isTerminal
    ? `${notification.fromEmail} invited you to "${notification.sessionName || 'a shared terminal'}"`
    : `${notification.fromEmail} started an audio call "${notification.roomName || 'Audio Channel'}"`;

  return (
    <div
      className={`bg-background-secondary border border-border rounded-xl shadow-lg p-4 transition-all duration-300 ${
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-accent-primary/20 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-accent-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
            <button onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }} className="text-text-tertiary hover:text-text-primary">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{description}</p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={onAccept}
              className="px-3 py-1 text-xs font-medium bg-accent-primary text-background-primary rounded-md hover:bg-accent-primary/80 transition-colors"
            >
              Join
            </button>
            <button
              onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}
              className="px-3 py-1 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook for managing notifications from WebSocket
export function useSessionNotifications(wsRef: React.RefObject<WebSocket | null>, wsConnected: boolean) {
  const [notifications, setNotifications] = useState<SessionNotification[]>([]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'session_invite' && msg.channel === 'notification') {
          const notification: SessionNotification = {
            id: crypto.randomUUID(),
            ...msg.payload,
          };
          setNotifications(prev => [...prev, notification]);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.addEventListener('message', handler);
    return () => ws.removeEventListener('message', handler);
  }, [wsRef, wsConnected]);

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return { notifications, dismiss };
}
