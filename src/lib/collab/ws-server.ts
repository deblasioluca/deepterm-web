/**
 * WebSocket collaboration server for DeepTerm.
 * Handles: presence heartbeats, chat messages, terminal I/O relay, audio signaling.
 *
 * This module is loaded by the custom Next.js server (server.ts) and attaches
 * a `ws.WebSocketServer` to the same HTTP server that Next.js uses.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Server } from 'http';
import { verifyAccessToken } from '../zk/jwt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Types ────────────────────────────────────────────────────────────────────

interface AuthenticatedSocket extends WebSocket {
  userId: string;
  email: string;
  orgIds: string[];
  isAlive: boolean;
}

interface WSMessage {
  type: string;
  channel: 'presence' | 'chat' | 'terminal' | 'audio-signal';
  payload: Record<string, unknown>;
}

// ── State ────────────────────────────────────────────────────────────────────

/** orgId -> Set<AuthenticatedSocket> */
const orgRooms = new Map<string, Set<AuthenticatedSocket>>();

/** sharedSessionId -> Set<AuthenticatedSocket> */
const terminalRooms = new Map<string, Set<AuthenticatedSocket>>();

/** channelId -> Set<AuthenticatedSocket> */
const chatRooms = new Map<string, Set<AuthenticatedSocket>>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function broadcast(room: Set<AuthenticatedSocket>, message: object, exclude?: AuthenticatedSocket) {
  const data = JSON.stringify(message);
  for (const client of room) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function joinRoom(map: Map<string, Set<AuthenticatedSocket>>, key: string, ws: AuthenticatedSocket) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)!.add(ws);
}

function leaveRoom(map: Map<string, Set<AuthenticatedSocket>>, key: string, ws: AuthenticatedSocket) {
  const room = map.get(key);
  if (room) {
    room.delete(ws);
    if (room.size === 0) map.delete(key);
  }
}

function leaveAllRooms(ws: AuthenticatedSocket) {
  for (const [key, room] of orgRooms) {
    if (room.delete(ws) && room.size === 0) orgRooms.delete(key);
  }
  for (const [key, room] of terminalRooms) {
    if (room.delete(ws)) {
      broadcast(room, {
        type: 'participant_left',
        channel: 'terminal',
        payload: { userId: ws.userId, sessionId: key },
      });
      if (room.size === 0) terminalRooms.delete(key);
    }
  }
  for (const [key, room] of chatRooms) {
    if (room.delete(ws) && room.size === 0) chatRooms.delete(key);
  }
}

// ── Message Handlers ─────────────────────────────────────────────────────────

function handlePresence(ws: AuthenticatedSocket, payload: Record<string, unknown>) {
  for (const orgId of ws.orgIds) {
    joinRoom(orgRooms, orgId, ws);
    const room = orgRooms.get(orgId);
    if (room) {
      broadcast(room, {
        type: 'presence_update',
        channel: 'presence',
        payload: {
          userId: ws.userId,
          email: ws.email,
          status: payload.status || 'online',
          orgId,
        },
      }, ws);
    }
  }
}

async function handleChat(ws: AuthenticatedSocket, payload: Record<string, unknown>) {
  const { channelId, content, type: msgType, fileId, messageId } = payload;

  if (!channelId || typeof channelId !== 'string') return;

  // Verify user has access to this channel before joining
  if (!chatRooms.get(channelId)?.has(ws)) {
    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: { participants: { select: { userId: true } } },
    });
    if (!channel) {
      ws.send(JSON.stringify({ type: 'error', message: 'Channel not found' }));
      return;
    }
    if (channel.type === 'dm') {
      const isParticipant = channel.participants.some(p => p.userId === ws.userId);
      if (!isParticipant) {
        ws.send(JSON.stringify({ type: 'error', message: 'Access denied to channel' }));
        return;
      }
    } else {
      // Team channel: verify org membership
      const membership = await prisma.organizationUser.findUnique({
        where: { organizationId_userId: { organizationId: channel.organizationId, userId: ws.userId } },
      });
      if (!membership || membership.status !== 'confirmed') {
        ws.send(JSON.stringify({ type: 'error', message: 'Access denied to channel' }));
        return;
      }
    }
  }

  joinRoom(chatRooms, channelId, ws);

  const room = chatRooms.get(channelId);
  if (room) {
    broadcast(room, {
      type: 'chat_message',
      channel: 'chat',
      payload: {
        messageId,
        channelId,
        senderId: ws.userId,
        senderEmail: ws.email,
        content,
        type: msgType || 'text',
        fileId: fileId || null,
        timestamp: new Date().toISOString(),
      },
    }, ws);
  }
}

async function handleTerminal(ws: AuthenticatedSocket, payload: Record<string, unknown>) {
  const { sessionId, action, data: termData, canWrite } = payload;

  if (!sessionId || typeof sessionId !== 'string') return;

  switch (action) {
    case 'join': {
      // Verify user is owner or invited participant before joining
      const session = await prisma.sharedTerminalSession.findUnique({
        where: { id: sessionId },
        include: { participants: { select: { userId: true, status: true } } },
      });
      if (!session || !session.isActive) {
        ws.send(JSON.stringify({ type: 'error', message: 'Session not found or inactive' }));
        return;
      }
      const isOwner = session.ownerId === ws.userId;
      const isParticipant = session.participants.some(
        p => p.userId === ws.userId && p.status !== 'left'
      );
      if (!isOwner && !isParticipant) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authorized to join this session' }));
        return;
      }
      joinRoom(terminalRooms, sessionId, ws);
      const room = terminalRooms.get(sessionId);
      if (room) {
        broadcast(room, {
          type: 'participant_joined',
          channel: 'terminal',
          payload: { userId: ws.userId, email: ws.email, sessionId, canWrite },
        }, ws);
      }
      break;
    }
    case 'leave': {
      leaveRoom(terminalRooms, sessionId, ws);
      const room = terminalRooms.get(sessionId);
      if (room) {
        broadcast(room, {
          type: 'participant_left',
          channel: 'terminal',
          payload: { userId: ws.userId, sessionId },
        });
      }
      break;
    }
    case 'output':
    case 'input': {
      const room = terminalRooms.get(sessionId);
      if (room) {
        broadcast(room, {
          type: `terminal_${action}`,
          channel: 'terminal',
          payload: { sessionId, userId: ws.userId, data: termData },
        }, ws);
      }
      break;
    }
    case 'resize': {
      const room = terminalRooms.get(sessionId);
      if (room) {
        broadcast(room, {
          type: 'terminal_resize',
          channel: 'terminal',
          payload: { sessionId, userId: ws.userId, cols: payload.cols, rows: payload.rows },
        }, ws);
      }
      break;
    }
    case 'permission_change': {
      const room = terminalRooms.get(sessionId);
      if (room) {
        broadcast(room, {
          type: 'permission_change',
          channel: 'terminal',
          payload: { sessionId, targetUserId: payload.targetUserId, canWrite: payload.canWrite },
        });
      }
      break;
    }
  }
}

function handleAudioSignal(ws: AuthenticatedSocket, payload: Record<string, unknown>) {
  const { targetUserId, signalType, signalData, orgId } = payload;

  if (!targetUserId || typeof targetUserId !== 'string') return;

  const room = orgId && typeof orgId === 'string' ? orgRooms.get(orgId) : null;
  if (!room) return;

  for (const client of room) {
    if (client.userId === targetUserId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'audio_signal',
        channel: 'audio-signal',
        payload: {
          fromUserId: ws.userId,
          fromEmail: ws.email,
          signalType,
          signalData,
        },
      }));
      break;
    }
  }
}

// ── Server Setup ─────────────────────────────────────────────────────────────

export function attachWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/collab' });

  // Ping/pong keepalive every 30s
  const interval = setInterval(() => {
    for (const client of wss.clients as Set<AuthenticatedSocket>) {
      if (!client.isAlive) {
        leaveAllRooms(client);
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, 30_000);

  wss.on('close', () => clearInterval(interval));

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const authWs = ws as AuthenticatedSocket;

    // Authenticate via query param: ?token=<JWT>
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Missing authentication token');
      return;
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      ws.close(4001, 'Invalid or expired token');
      return;
    }

    authWs.userId = payload.userId;
    authWs.email = payload.email;
    authWs.orgIds = payload.orgIds || [];
    authWs.isAlive = true;

    // Auto-join org rooms
    for (const orgId of authWs.orgIds) {
      joinRoom(orgRooms, orgId, authWs);
    }

    // Broadcast online status
    handlePresence(authWs, { status: 'online' });

    authWs.on('pong', () => {
      authWs.isAlive = true;
    });

    authWs.on('message', (raw: Buffer) => {
      try {
        const msg: WSMessage = JSON.parse(raw.toString());

        switch (msg.channel) {
          case 'presence':
            handlePresence(authWs, msg.payload);
            break;
          case 'chat':
            handleChat(authWs, msg.payload);
            break;
          case 'terminal':
            handleTerminal(authWs, msg.payload);
            break;
          case 'audio-signal':
            handleAudioSignal(authWs, msg.payload);
            break;
          default:
            authWs.send(JSON.stringify({ type: 'error', message: `Unknown channel: ${msg.channel}` }));
        }
      } catch {
        authWs.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    authWs.on('close', () => {
      // Broadcast offline status
      for (const orgId of authWs.orgIds) {
        const room = orgRooms.get(orgId);
        if (room) {
          broadcast(room, {
            type: 'presence_update',
            channel: 'presence',
            payload: {
              userId: authWs.userId,
              email: authWs.email,
              status: 'offline',
              orgId,
            },
          }, authWs);
        }
      }
      leaveAllRooms(authWs);
    });

    // Send welcome message
    authWs.send(JSON.stringify({
      type: 'connected',
      payload: { userId: authWs.userId, email: authWs.email, orgIds: authWs.orgIds },
    }));
  });

  console.log('[WS] Collaboration WebSocket server attached at /ws/collab');
  return wss;
}
