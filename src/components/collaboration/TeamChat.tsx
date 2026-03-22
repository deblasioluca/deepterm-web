'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Hash, Loader2 } from 'lucide-react';
import { Card, Button } from '@/components/ui';

interface ChatMessageData {
  id: string;
  senderId: string;
  senderEmail: string;
  senderName?: string;
  content: string;
  type: string;
  createdAt: string;
}

interface ChatChannelData {
  id: string;
  name: string;
  type: string;
  teamId?: string;
}

interface TeamChatProps {
  orgId: string;
  wsRef: React.RefObject<WebSocket | null>;
  currentUserId: string;
}

export function TeamChat({ orgId, wsRef, currentUserId }: TeamChatProps) {
  const [channels, setChannels] = useState<ChatChannelData[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const onMessageRef = useRef<((event: MessageEvent) => void) | null>(null);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`/api/zk/chat/channels?orgId=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
        if (data.channels?.length > 0 && !selectedChannel) {
          setSelectedChannel(data.channels[0].id);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [orgId, selectedChannel]);

  const fetchMessages = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`/api/zk/chat/channels/${channelId}/messages?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    if (selectedChannel) {
      fetchMessages(selectedChannel);
    }
  }, [selectedChannel, fetchMessages]);

  // Listen for WebSocket chat messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'chat_message' && msg.payload?.channelId === selectedChannel) {
          setMessages(prev => [...prev, {
            id: msg.payload.id || crypto.randomUUID(),
            senderId: msg.payload.senderId,
            senderEmail: msg.payload.senderEmail || '',
            senderName: msg.payload.senderName,
            content: msg.payload.content,
            type: msg.payload.type || 'text',
            createdAt: msg.payload.createdAt || new Date().toISOString(),
          }]);
        }
      } catch {
        // ignore parse errors
      }
    };
    onMessageRef.current = handler;

    const ws = wsRef.current;
    if (ws) {
      ws.addEventListener('message', handler);
      return () => ws.removeEventListener('message', handler);
    }
  }, [wsRef, selectedChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChannel) return;
    setSending(true);

    try {
      const res = await fetch(`/api/zk/chat/channels/${selectedChannel}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage.trim() }),
      });
      if (res.ok) {
        setNewMessage('');
      }
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      </Card>
    );
  }

  if (channels.length === 0) {
    return (
      <Card className="p-6 text-center">
        <Hash className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-text-primary mb-2">No Chat Channels</h3>
        <p className="text-text-secondary text-sm">
          Chat channels are created automatically when teams are set up.
          Create a team in your organization to get started.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[500px]">
      {/* Channel tabs */}
      <div className="flex items-center gap-1 p-2 border-b border-border overflow-x-auto">
        {channels.map(ch => (
          <button
            key={ch.id}
            onClick={() => setSelectedChannel(ch.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
              selectedChannel === ch.id
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            {ch.name || 'general'}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex flex-col ${msg.senderId === currentUserId ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-medium text-text-secondary">
                  {msg.senderName || msg.senderEmail?.split('@')[0] || 'Unknown'}
                </span>
                <span className="text-xs text-text-tertiary">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                msg.senderId === currentUserId
                  ? 'bg-accent-primary/20 text-text-primary'
                  : 'bg-background-tertiary text-text-primary'
              }`}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="p-3 border-t border-border flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
          disabled={sending}
        />
        <Button type="submit" variant="primary" disabled={sending || !newMessage.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </Card>
  );
}
