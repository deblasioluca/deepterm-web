"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Hash,
  Users,
  Terminal,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Send,
  Circle,
  Loader2,
  ChevronRight,
  MessageSquare,
  Volume2,
  Search,
  MoreVertical,
  Plus,
  Bell,
  Settings,
} from "lucide-react";
import { Card, Button, Badge } from "@/components/ui";
import {
  NotificationToast,
  useSessionNotifications,
} from "@/components/collaboration/NotificationToast";

// -- Types --

interface ChatChannel {
  id: string;
  name: string;
  type: string;
  teamId?: string;
  unreadCount?: number;
  lastMessage?: string;
  lastMessageAt?: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderEmail: string;
  senderName?: string;
  content: string;
  type: string;
  createdAt: string;
}

interface PresenceMember {
  userId: string;
  email: string;
  name?: string;
  status: "online" | "away" | "busy" | "offline";
  lastSeen?: string;
}

interface OrgData {
  id: string;
  name: string;
  role: string;
}

type PanelView = "chat" | "terminal" | "audio";

// -- Main Component --

export default function CollaborationPage() {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgData[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [wsConnected, setWsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [panelView, setPanelView] = useState<PanelView>("chat");
  const [showParticipants, setShowParticipants] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { notifications, dismiss } = useSessionNotifications(wsRef, wsConnected);

  useEffect(() => {
    async function init() {
      try {
        const orgsRes = await fetch("/api/zk/organizations");
        if (orgsRes.ok) {
          const data = await orgsRes.json();
          const rawOrgs = Array.isArray(data)
            ? data
            : data.organizations || [];
          const confirmed = rawOrgs
            .filter(
              (o: { status?: string }) =>
                o.status === "confirmed" || !o.status,
            )
            .map((o: { id: string; name: string; role?: string }) => ({
              id: o.id,
              name: o.name,
              role: o.role || "member",
            }));
          setOrgs(confirmed);
          if (confirmed.length > 0) {
            setSelectedOrgId(confirmed[0].id);
          }
        }
        const tokenRes = await fetch("/api/terminal/ws-token", {
          method: "POST",
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          setCurrentUserId(tokenData?.userId || "");
          setCurrentUserEmail(tokenData?.email || "");
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (!selectedOrgId) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function connect() {
      if (cancelled) return;
      try {
        const tokenRes = await fetch("/api/terminal/ws-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId: selectedOrgId }),
        });
        if (!tokenRes.ok || cancelled) return;
        const { token } = await tokenRes.json();
        if (cancelled) return;
        const protocol =
          window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws/collab?token=${token}`;
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          if (cancelled) {
            ws?.close();
            return;
          }
          setWsConnected(true);
          wsRef.current = ws;
        };
        ws.onclose = () => {
          setWsConnected(false);
          wsRef.current = null;
          if (!cancelled) {
            reconnectTimer = setTimeout(connect, 5000);
          }
        };
        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      }
    }
    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
    };
  }, [selectedOrgId]);

  const handleNotificationAccept = useCallback(
    (notification: { notificationType: string }) => {
      if (notification.notificationType === "terminal_invite") {
        setPanelView("terminal");
      } else if (notification.notificationType === "audio_invite") {
        setPanelView("audio");
      }
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div className="max-w-5xl">
        <Card className="p-12 text-center">
          <MessageSquare className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            No Organization Yet
          </h3>
          <p className="text-text-secondary text-sm mb-6 max-w-md mx-auto">
            Collaboration features require an organization. Create one to start
            sharing terminals, chatting, and making audio calls with your team.
          </p>
          <Button
            variant="primary"
            onClick={() => {
              window.location.href = "/dashboard/organization";
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Create Organization
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col -mt-4">
      <NotificationToast
        notifications={notifications}
        onDismiss={dismiss}
        onAccept={handleNotificationAccept}
      />

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-background-tertiary border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <select
            value={selectedOrgId || ""}
            onChange={(e) => { setSelectedOrgId(e.target.value); setSelectedChannelId(null); }}
            className="bg-transparent border border-border/50 rounded-md px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-accent-primary"
          >
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 ml-2">
            <TopBarTab
              active={panelView === "chat"}
              onClick={() => setPanelView("chat")}
              icon={<MessageSquare className="w-4 h-4" />}
              label="Chat"
            />
            <TopBarTab
              active={panelView === "terminal"}
              onClick={() => setPanelView("terminal")}
              icon={<Terminal className="w-4 h-4" />}
              label="Terminals"
            />
            <TopBarTab
              active={panelView === "audio"}
              onClick={() => setPanelView("audio")}
              icon={<Volume2 className="w-4 h-4" />}
              label="Audio"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={wsConnected ? "success" : "warning"}
            className="text-[10px]"
          >
            {wsConnected ? "Connected" : "Reconnecting..."}
          </Badge>
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className={`p-1.5 rounded-md transition-colors ${
              showParticipants
                ? "bg-accent-primary/10 text-accent-primary"
                : "text-text-tertiary hover:text-text-primary"
            }`}
            title="Toggle participants panel"
          >
            <Users className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex flex-1 min-h-0">
        {panelView === "chat" && selectedOrgId && (
          <ChannelSidebar
            orgId={selectedOrgId}
            selectedChannelId={selectedChannelId}
            onSelectChannel={setSelectedChannelId}
          />
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {panelView === "chat" && selectedOrgId && (
            <ChatPanel
              orgId={selectedOrgId}
              wsRef={wsRef}
              wsConnected={wsConnected}
              currentUserId={currentUserId}
              currentUserEmail={currentUserEmail}
              selectedChannelId={selectedChannelId}
              onSelectChannel={setSelectedChannelId}
            />
          )}
          {panelView === "terminal" && selectedOrgId && (
            <TerminalPanel
              orgId={selectedOrgId}
              currentUserId={currentUserId}
            />
          )}
          {panelView === "audio" && selectedOrgId && <AudioPanel orgId={selectedOrgId} wsRef={wsRef} wsConnected={wsConnected} />}
        </div>

        {showParticipants && selectedOrgId && (
          <ParticipantsSidebar orgId={selectedOrgId} />
        )}
      </div>
    </div>
  );
}

// -- Top Bar Tab --

function TopBarTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-accent-primary/15 text-accent-primary"
          : "text-text-tertiary hover:text-text-primary hover:bg-white/5"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// -- Channel Sidebar (Left) --

function ChannelSidebar({
  orgId,
  selectedChannelId,
  onSelectChannel,
}: {
  orgId: string;
  selectedChannelId: string | null;
  onSelectChannel: (id: string) => void;
}) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function fetchChannels() {
      try {
        const res = await fetch(`/api/zk/chat/channels?orgId=${orgId}`);
        if (res.ok) {
          const data = await res.json();
          const chs = Array.isArray(data) ? data : (data.channels || []);
          setChannels(chs);
          if (chs.length > 0 && !selectedChannelId) {
            onSelectChannel(chs[0].id);
          }
        }
      } catch {
        // silent
      }
    }
    fetchChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function handleCreateChannel() {
    if (creating) return;
    const name = prompt('Channel name:');
    if (!name?.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/zk/chat/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, type: 'team', name: name.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        const channelId = data.id || data.data?.id;
        // Refresh channel list
        const listRes = await fetch(`/api/zk/chat/channels?orgId=${orgId}`);
        if (listRes.ok) {
          const listData = await listRes.json();
          const chs = Array.isArray(listData) ? listData : (listData.channels || []);
          setChannels(chs);
          if (channelId) onSelectChannel(channelId);
        }
      }
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="w-60 bg-background-secondary border-r border-border flex flex-col shrink-0">
      <div className="px-3 py-3 border-b border-border/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider">
            Channels
          </h3>
          <button
            onClick={handleCreateChannel}
            disabled={creating}
            className="p-1 text-text-tertiary hover:text-text-primary rounded transition-colors disabled:opacity-50"
            title="Create channel"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-white/5 border-none rounded-md pl-7 pr-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-primary/30"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {channels.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <p className="text-xs text-text-tertiary">No channels yet</p>
          </div>
        ) : (
          channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => onSelectChannel(ch.id)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                selectedChannelId === ch.id
                  ? "bg-accent-primary/10 text-accent-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-white/5"
              }`}
            >
              <Hash className="w-3.5 h-3.5 shrink-0" />
              <span className="text-sm truncate flex-1">
                {ch.name || "general"}
              </span>
              {(ch.unreadCount ?? 0) > 0 && (
                <span className="w-5 h-5 text-[10px] font-bold bg-accent-primary text-white rounded-full flex items-center justify-center shrink-0">
                  {ch.unreadCount}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// -- Chat Panel (Center) --

function ChatPanel({
  orgId,
  wsRef,
  wsConnected,
  currentUserId,
  currentUserEmail,
  selectedChannelId,
  onSelectChannel,
}: {
  orgId: string;
  wsRef: React.RefObject<WebSocket | null>;
  wsConnected: boolean;
  currentUserId: string;
  currentUserEmail: string;
  selectedChannelId: string | null;
  onSelectChannel: (id: string) => void;
}) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchChannels() {
      try {
        const res = await fetch(`/api/zk/chat/channels?orgId=${orgId}`);
        if (res.ok) {
          const data = await res.json();
          const chs = Array.isArray(data) ? data : (data.channels || []);
          setChannels(chs);
          if (chs.length > 0 && !selectedChannelId) {
            onSelectChannel(chs[0].id);
          }
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    if (!selectedChannelId) return;
    async function fetchMessages() {
      try {
        const res = await fetch(
          `/api/zk/chat/channels/${selectedChannelId}/messages?limit=50`,
        );
        if (res.ok) {
          const data = await res.json();
          setMessages(Array.isArray(data) ? data : (data.messages || []));
        }
      } catch {
        // silent
      }
    }
    fetchMessages();
  }, [selectedChannelId]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (
          msg.type === "chat_message" &&
          msg.payload?.channelId === selectedChannelId
        ) {
          // Skip messages from ourselves (already shown via optimistic UI)
          if (msg.payload.senderId === currentUserId) return;
          setMessages((prev) => [
            ...prev,
            {
              id: msg.payload.id || crypto.randomUUID(),
              senderId: msg.payload.senderId,
              senderEmail: msg.payload.senderEmail || "",
              senderName: msg.payload.senderName,
              content: msg.payload.content,
              type: msg.payload.type || "text",
              createdAt: msg.payload.createdAt || new Date().toISOString(),
            },
          ]);
        }
      } catch {
        // ignore
      }
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [wsRef, wsConnected, selectedChannelId, currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChannelId) return;
    const content = newMessage.trim();
    // Optimistic UI: immediately show the message locally
    const optimisticMsg: ChatMessage = {
      id: crypto.randomUUID(),
      senderId: currentUserId,
      senderEmail: currentUserEmail,
      senderName: currentUserEmail.split("@")[0] || "You",
      content,
      type: "text",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setNewMessage("");
    setSending(true);
    try {
      const res = await fetch(
        `/api/zk/chat/channels/${selectedChannelId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        setNewMessage(content);
      }
    } catch {
      // Remove optimistic message on failure and restore input
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setNewMessage(content);
    } finally {
      setSending(false);
    }
  };

  const activeChannelName =
    channels.find((c) => c.id === selectedChannelId)?.name || "general";

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Hash className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            No Chat Channels
          </h3>
          <p className="text-text-secondary text-sm max-w-md">
            Chat channels are created automatically when teams are set up.
            Create a team in your organization to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background-secondary">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-text-tertiary" />
          <h3 className="text-sm font-semibold text-text-primary">
            {activeChannelName}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 text-text-tertiary hover:text-text-primary rounded transition-colors">
            <Bell className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-text-tertiary hover:text-text-primary rounded transition-colors">
            <Search className="w-4 h-4" />
          </button>
          <button className="p-1.5 text-text-tertiary hover:text-text-primary rounded transition-colors">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <MessageSquare className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
              <p className="text-text-tertiary text-sm">
                No messages yet. Start the conversation!
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => {
              const isOwn = msg.senderId === currentUserId;
              const showAvatar =
                i === 0 || messages[i - 1].senderId !== msg.senderId;
              const senderName =
                msg.senderName ||
                msg.senderEmail?.split("@")[0] ||
                "Unknown";
              const time = new Date(msg.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={msg.id}
                  className={`group flex gap-3 px-2 py-0.5 rounded-md hover:bg-white/[0.02] ${showAvatar ? "mt-3" : ""}`}
                >
                  <div className="w-8 shrink-0">
                    {showAvatar && (
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          isOwn
                            ? "bg-accent-primary/20 text-accent-primary"
                            : "bg-purple-500/20 text-purple-400"
                        }`}
                      >
                        {senderName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {showAvatar && (
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span
                          className={`text-sm font-semibold ${isOwn ? "text-accent-primary" : "text-purple-400"}`}
                        >
                          {senderName}
                        </span>
                        <span className="text-[10px] text-text-tertiary">
                          {time}
                        </span>
                      </div>
                    )}
                    <p className="text-sm text-text-primary leading-relaxed break-words">
                      {msg.content}
                    </p>
                  </div>

                  {!showAvatar && (
                    <span className="text-[10px] text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity self-center shrink-0">
                      {time}
                    </span>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="px-4 pb-3">
        <form
          onSubmit={sendMessage}
          className="flex items-center gap-2 bg-background-tertiary border border-border/50 rounded-lg px-3 py-2"
        >
          <Plus className="w-5 h-5 text-text-tertiary shrink-0 cursor-pointer hover:text-text-secondary transition-colors" />
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`Message #${activeChannelName}`}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !newMessage.trim()}
            className="p-1.5 text-accent-primary hover:text-accent-primary/80 disabled:text-text-tertiary disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

// -- Terminal Panel (Center) --

interface SharedSession {
  id: string;
  ownerId: string;
  ownerEmail: string;
  sessionName: string;
  participants: {
    userId: string;
    email: string;
    canWrite: boolean;
    status: string;
  }[];
}

function TerminalPanel({
  orgId,
  currentUserId,
}: {
  orgId: string;
  currentUserId: string;
}) {
  const [sessions, setSessions] = useState<SharedSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const tokenRes = await fetch("/api/terminal/ws-token", {
          method: "POST",
        });
        if (!tokenRes.ok) return;
        const tokenData = await tokenRes.json();
        const res = await fetch(`/api/zk/terminal/share?orgId=${orgId}`, {
          headers: { Authorization: `Bearer ${tokenData.token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSessions(Array.isArray(data) ? data : []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, [orgId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background-secondary">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-green-500" />
          <h3 className="text-sm font-semibold text-text-primary">
            Shared Terminals
          </h3>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <Terminal className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                No Active Sessions
              </h3>
              <p className="text-text-secondary text-sm mb-4">
                Share a terminal session from the DeepTerm macOS app to let team
                members view or collaborate in real time.
              </p>
              <div className="text-xs text-text-tertiary space-y-1">
                <p>1. Open a terminal in the DeepTerm macOS app</p>
                <p>2. Click the share icon in the terminal toolbar</p>
                <p>3. Team members will see the session here</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const active = session.participants.filter(
                (p) => p.status === "joined",
              );
              const isOwner = session.ownerId === currentUserId;
              return (
                <Card key={session.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Circle className="w-2.5 h-2.5 fill-green-400 text-green-400" />
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {session.sessionName || "Unnamed Session"}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          Shared by {session.ownerEmail} &middot;{" "}
                          {active.length} active
                          {isOwner && " (you)"}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        window.open(`/dashboard/terminal?sessionId=${session.id}`, "_blank");
                      }}
                    >
                      <ChevronRight className="w-4 h-4" />
                      View
                    </Button>
                  </div>
                  {session.participants.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {session.participants.map((p) => (
                        <Badge
                          key={p.userId}
                          variant={
                            p.status === "joined" ? "success" : "default"
                          }
                        >
                          {p.email.split("@")[0]}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// -- Audio Panel (Center) --

function AudioPanel({ orgId, wsRef, wsConnected }: { orgId: string; wsRef: React.RefObject<WebSocket | null>; wsConnected: boolean }) {
  const [inRoom, setInRoom] = useState(false);
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Listen for audio-signal messages
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        // Server sends audio_room_state on successful join (with full participant list)
        if (msg.type === "audio_room_state") {
          setInRoom(true);
          setJoining(false);
          if (msg.payload?.participants) {
            setParticipants(msg.payload.participants.map((p: { email?: string; userId?: string }) => p.email || p.userId || "unknown"));
          }
        }
        // Server sends audio_peer_joined when another user joins
        if (msg.type === "audio_peer_joined" && msg.payload?.email) {
          setParticipants((prev) => [...prev, msg.payload.email]);
        }
        // Server sends audio_peer_left when another user leaves
        if (msg.type === "audio_peer_left" && msg.payload?.email) {
          setParticipants((prev) => prev.filter((p) => p !== msg.payload.email));
        }
        // Server sends audio_room_full when room is at capacity
        if (msg.type === "audio_room_full") {
          setError(`Room is full (max ${msg.payload?.maxParticipants || 5} participants)`);
          setInRoom(false);
          setJoining(false);
          // Release microphone since we can't join
          mediaStreamRef.current?.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }
      } catch { /* ignore */ }
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [wsRef, wsConnected]);

  // Cleanup media stream and leave room on unmount or org change
  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
      setInRoom(false);
      setMuted(false);
      setParticipants([]);
      setJoining(false);
      setError(null);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          channel: "audio-signal",
          type: "audio_leave",
          payload: { action: "leave", orgId },
        }));
      }
    };
  }, [orgId, wsRef]);

  const handleJoinRoom = async () => {
    setError(null);
    setJoining(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          channel: "audio-signal",
          type: "audio_join",
          payload: { action: "join", orgId },
        }));
        // Don't set inRoom here — wait for audio_room_state from server
      } else {
        // WebSocket not connected — release mic and show error
        stream.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
        setError("Not connected to collaboration server");
        setJoining(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access denied");
      setJoining(false);
    }
  };

  const handleLeaveRoom = () => {
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    mediaStreamRef.current = null;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        channel: "audio-signal",
        type: "audio_leave",
        payload: { action: "leave", orgId },
      }));
    }
    setInRoom(false);
    setMuted(false);
    setParticipants([]);
  };

  const handleToggleMute = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(t => { t.enabled = muted; });
      setMuted(!muted);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background-secondary">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-text-primary">
            Audio Channels
          </h3>
          {inRoom && (
            <Badge variant="success" className="text-[10px]">In Call</Badge>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {error && (
            <Card className="p-4 border-red-500/30 bg-red-500/5">
              <p className="text-sm text-red-400">{error}</p>
            </Card>
          )}
          <Card className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${inRoom ? "bg-green-500/15" : "bg-blue-500/15"}`}>
                <Mic className={`w-6 h-6 ${inRoom ? "text-green-500" : "text-blue-500"}`} />
              </div>
              <div>
                <h4 className="text-base font-semibold text-text-primary">
                  Voice Chat
                </h4>
                <p className="text-sm text-text-tertiary">
                  {inRoom ? `${participants.length + 1} participant(s) in call` : "WebRTC peer-to-peer · up to 5 participants"}
                </p>
              </div>
            </div>
            {inRoom && participants.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {participants.map((p, i) => (
                  <Badge key={i} variant="default">{p.split("@")[0]}</Badge>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={inRoom ? handleLeaveRoom : handleJoinRoom}
                disabled={joining}
                className={`flex items-center gap-2 p-3 rounded-lg transition-colors cursor-pointer ${
                  inRoom
                    ? "bg-red-500/10 hover:bg-red-500/20 border border-red-500/30"
                    : "bg-green-500/10 hover:bg-green-500/20 border border-green-500/30"
                } ${joining ? "opacity-50 cursor-wait" : ""}`}
              >
                {inRoom ? <PhoneOff className="w-4 h-4 text-red-500" /> : <Phone className="w-4 h-4 text-green-500" />}
                <div>
                  <p className="text-xs font-medium text-text-primary">
                    {joining ? "Joining..." : inRoom ? "Leave Room" : "Join Room"}
                  </p>
                  <p className="text-[10px] text-text-tertiary">
                    {inRoom ? "Disconnect from call" : "Connect to audio channel"}
                  </p>
                </div>
              </button>
              <button
                onClick={handleToggleMute}
                disabled={!inRoom}
                className={`flex items-center gap-2 p-3 rounded-lg transition-colors ${
                  inRoom ? "bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer border border-border/30" : "bg-white/[0.02] opacity-50 cursor-not-allowed border border-transparent"
                }`}
              >
                {muted ? <MicOff className="w-4 h-4 text-red-500" /> : <Mic className="w-4 h-4 text-green-500" />}
                <div>
                  <p className="text-xs font-medium text-text-primary">
                    {muted ? "Unmute" : "Mute"}
                  </p>
                  <p className="text-[10px] text-text-tertiary">
                    Toggle your microphone
                  </p>
                </div>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// -- Participants Sidebar (Right) --

function ParticipantsSidebar({ orgId }: { orgId: string }) {
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPresence() {
      try {
        const res = await fetch(`/api/zk/presence/org/${orgId}`);
        if (res.ok) {
          const data = await res.json();
          setMembers(Array.isArray(data) ? data : (data.members || []));
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchPresence();
    const interval = setInterval(fetchPresence, 15000);
    return () => clearInterval(interval);
  }, [orgId]);

  const online = members.filter((m) => m.status === "online");
  const away = members.filter((m) => m.status === "away");
  const busy = members.filter((m) => m.status === "busy");
  const offline = members.filter((m) => m.status === "offline");

  const statusDot = (status: string) => {
    switch (status) {
      case "online":
        return "bg-green-500";
      case "away":
        return "bg-yellow-500";
      case "busy":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="w-56 bg-background-secondary border-l border-border flex flex-col shrink-0">
      <div className="px-3 py-3 border-b border-border/50">
        <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider">
          Participants ({members.length})
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
          </div>
        ) : (
          <>
            {online.length > 0 && (
              <MemberGroup
                label={`Online \u2014 ${online.length}`}
                members={online}
                statusDot={statusDot}
              />
            )}
            {away.length > 0 && (
              <MemberGroup
                label={`Away \u2014 ${away.length}`}
                members={away}
                statusDot={statusDot}
              />
            )}
            {busy.length > 0 && (
              <MemberGroup
                label={`Busy \u2014 ${busy.length}`}
                members={busy}
                statusDot={statusDot}
              />
            )}
            {offline.length > 0 && (
              <MemberGroup
                label={`Offline \u2014 ${offline.length}`}
                members={offline}
                statusDot={statusDot}
              />
            )}
            {members.length === 0 && (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-text-tertiary">No members found</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="px-3 py-2 border-t border-border/50">
        <button
          onClick={() => {
            window.location.href = "/dashboard/organization";
          }}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-text-tertiary hover:text-text-primary hover:bg-white/5 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Manage Organization
        </button>
      </div>
    </div>
  );
}

function MemberGroup({
  label,
  members,
  statusDot,
}: {
  label: string;
  members: PresenceMember[];
  statusDot: (status: string) => string;
}) {
  return (
    <div className="mb-2">
      <p className="px-3 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
        {label}
      </p>
      {members.map((m) => (
        <div
          key={m.userId}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors cursor-pointer"
        >
          <div className="relative">
            <div className="w-7 h-7 bg-accent-primary/15 rounded-full flex items-center justify-center">
              <span className="text-[10px] font-bold text-accent-primary">
                {(m.name || m.email).charAt(0).toUpperCase()}
              </span>
            </div>
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background-secondary ${statusDot(m.status)}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-text-primary truncate">
              {m.name || m.email.split("@")[0]}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
