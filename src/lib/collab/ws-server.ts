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
import { prisma } from '../prisma';

// ── Types ────────────────────────────────────────────────────────────────────

interface AuthenticatedSocket extends WebSocket {
  userId: string;
  email: string;
  orgIds: string[];
  isAlive: boolean;
  /** Cached write permissions per terminal session: sessionId -> { canWrite, cachedAt } */
  terminalPermissions: Map<string, { canWrite: boolean; cachedAt: number }>;
}

interface WSMessage {
  type: string;
  channel: 'presence' | 'chat' | 'terminal' | 'audio-signal' | 'notification';
  payload: Record<string, unknown>;
}

// ── State ────────────────────────────────────────────────────────────────────

/** orgId -> Set<AuthenticatedSocket> */
const orgRooms = new Map<string, Set<AuthenticatedSocket>>();

/** sharedSessionId -> Set<AuthenticatedSocket> */
const terminalRooms = new Map<string, Set<AuthenticatedSocket>>();

/** channelId -> Set<AuthenticatedSocket> */
const chatRooms = new Map<string, Set<AuthenticatedSocket>>();

/** audioRoomId -> Set<AuthenticatedSocket> */
const audioRooms = new Map<string, Set<AuthenticatedSocket>>();

/** Maximum participants per audio room (mesh topology) */
const MAX_AUDIO_PARTICIPANTS = 5;

/** Global reference to the WSS instance for multi-device helpers */
let wssInstance: WebSocketServer | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Find all active sockets for a given userId (multi-device support). */
function socketsForUser(userId: string): AuthenticatedSocket[] {
  if (!wssInstance) return [];
  const result: AuthenticatedSocket[] = [];
  Array.from(wssInstance.clients as Set<AuthenticatedSocket>).forEach(client => {
    if (client.userId === userId && client.readyState === WebSocket.OPEN) {
      result.push(client);
    }
  });
  return result;
}

/** Check if a user still has at least one other open connection. */
function hasOtherConnections(userId: string, exclude: AuthenticatedSocket): boolean {
  if (!wssInstance) return false;
  return Array.from(wssInstance.clients as Set<AuthenticatedSocket>).some(client =>
    client !== exclude && client.userId === userId && client.readyState === WebSocket.OPEN
  );
}

function broadcast(room: Set<AuthenticatedSocket>, message: object, exclude?: AuthenticatedSocket) {
  const data = JSON.stringify(message);
  Array.from(room).forEach(client => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
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
  Array.from(orgRooms.entries()).forEach(([key, room]) => {
    if (room.delete(ws) && room.size === 0) orgRooms.delete(key);
  });
  Array.from(terminalRooms.entries()).forEach(([key, room]) => {
    if (room.delete(ws)) {
      broadcast(room, {
        type: 'participant_left',
        channel: 'terminal',
        payload: { userId: ws.userId, sessionId: key },
      });
      if (room.size === 0) terminalRooms.delete(key);
      // If the disconnecting user is the session owner and has no other sockets
      // still in this terminal room (multi-device), mark session inactive
      const ownerStillInRoom = Array.from(room).some(c => c.userId === ws.userId);
      if (!ownerStillInRoom) {
        prisma.sharedTerminalSession.findUnique({
          where: { id: key },
          select: { ownerId: true },
        }).then(sess => {
          if (sess && sess.ownerId === ws.userId) {
            prisma.sharedTerminalSession.update({
              where: { id: key },
              data: { isActive: false },
            }).then(() => {
              console.log(`[WS] Session ${key} marked inactive (owner disconnected)`);
            }).catch(err => console.error('[WS] Failed to deactivate session on disconnect:', err));
          }
        }).catch(() => { /* ignore */ });
      }
    }
  });
  Array.from(chatRooms.entries()).forEach(([key, room]) => {
    if (room.delete(ws) && room.size === 0) chatRooms.delete(key);
  });
  Array.from(audioRooms.entries()).forEach(([key, room]) => {
    if (room.delete(ws)) {
      broadcast(room, {
        type: 'audio_peer_left',
        channel: 'audio-signal',
        payload: { roomId: key, userId: ws.userId, email: ws.email, participantCount: room.size },
      });
      if (room.size === 0) audioRooms.delete(key);
    }
  });
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
      if (!membership || !['confirmed', 'active'].includes(membership.status)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Access denied to channel' }));
        return;
      }
      // If channel is scoped to a team, verify team membership
      if (channel.teamId) {
        const teamMember = await prisma.orgTeamMember.findUnique({
          where: { teamId_userId: { teamId: channel.teamId, userId: ws.userId } },
        });
        if (!teamMember) {
          ws.send(JSON.stringify({ type: 'error', message: 'Access denied to channel' }));
          return;
        }
      }
    }
  }

  joinRoom(chatRooms, channelId, ws);

  // Persist message to DB so it appears in REST API history
  if (content && typeof content === 'string') {
    try {
      const dbMessage = await prisma.chatMessage.create({
        data: {
          channelId,
          senderId: ws.userId,
          content: content as string,
          type: (msgType as string) || 'text',
          fileId: (fileId as string) || undefined,
        },
      });
      await prisma.chatChannel.update({
        where: { id: channelId },
        data: { updatedAt: new Date() },
      });

      const room = chatRooms.get(channelId);
      if (room) {
        broadcast(room, {
          type: 'chat_message',
          channel: 'chat',
          payload: {
            messageId: dbMessage.id,
            channelId,
            senderId: ws.userId,
            senderEmail: ws.email,
            content,
            type: msgType || 'text',
            fileId: fileId || null,
            timestamp: dbMessage.createdAt.toISOString(),
          },
        }, ws);
      }
    } catch (err) {
      console.error('Failed to persist chat message:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to save message' }));
    }
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
        include: { participants: { select: { userId: true, status: true, canWrite: true } } },
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
      // Determine actual canWrite from DB, not client-supplied payload
      const actualCanWrite = isOwner
        ? true
        : (session.participants.find(p => p.userId === ws.userId)?.canWrite ?? false);
      joinRoom(terminalRooms, sessionId, ws);
      const room = terminalRooms.get(sessionId);
      if (room) {
        broadcast(room, {
          type: 'participant_joined',
          channel: 'terminal',
          payload: { userId: ws.userId, email: ws.email, sessionId, canWrite: actualCanWrite },
        }, ws);
      }
      break;
    }
    case 'leave': {
      const room = terminalRooms.get(sessionId);
      if (room && room.has(ws)) {
        room.delete(ws);
        broadcast(room, {
          type: 'participant_left',
          channel: 'terminal',
          payload: { userId: ws.userId, sessionId },
        });
        if (room.size === 0) terminalRooms.delete(sessionId);
        // If the owner leaves and has no other sockets in the room (multi-device),
        // mark the session as inactive in the DB
        const ownerStillInRoom = Array.from(room).some(c => c.userId === ws.userId);
        if (!ownerStillInRoom) {
          prisma.sharedTerminalSession.findUnique({
            where: { id: sessionId },
            select: { ownerId: true },
          }).then(sess => {
            if (sess && sess.ownerId === ws.userId) {
              prisma.sharedTerminalSession.update({
                where: { id: sessionId },
                data: { isActive: false },
              }).then(() => {
                console.log(`[WS] Session ${sessionId} marked inactive (owner left)`);
              }).catch(err => console.error('[WS] Failed to deactivate session:', err));
            }
          }).catch(err => console.error('[WS] Failed to check session owner:', err));
        }
      }
      break;
    }
    case 'output': {
      // Output is sent by session owner — verify ownership before relaying (cached like input)
      const ownerCacheKey = `owner:${sessionId}`;
      const ownerCached = ws.terminalPermissions?.get(ownerCacheKey);
      const ownerNow = Date.now();
      const OWNER_CACHE_TTL = 30_000;
      let isOwner = false;
      if (ownerCached && (ownerNow - ownerCached.cachedAt) < OWNER_CACHE_TTL) {
        isOwner = ownerCached.canWrite;
      } else {
        const outSession = await prisma.sharedTerminalSession.findUnique({
          where: { id: sessionId },
          select: { ownerId: true },
        });
        isOwner = !!outSession && outSession.ownerId === ws.userId;
        if (!ws.terminalPermissions) ws.terminalPermissions = new Map();
        ws.terminalPermissions.set(ownerCacheKey, { canWrite: isOwner, cachedAt: ownerNow });
      }
      if (!isOwner) {
        ws.send(JSON.stringify({ type: 'error', message: 'Only the session owner can send output' }));
        return;
      }
      const outRoom = terminalRooms.get(sessionId);
      if (outRoom) {
        broadcast(outRoom, {
          type: 'terminal_output',
          channel: 'terminal',
          payload: { sessionId, userId: ws.userId, data: termData },
        }, ws);
      }
      break;
    }
    case 'input': {
      // Verify the sender has write permission before relaying input.
      // Cache uses a TTL (30s) so REST-API permission revocations propagate.
      const cached = ws.terminalPermissions?.get(sessionId);
      const now = Date.now();
      const PERM_CACHE_TTL = 30_000; // 30 seconds
      const hasValidCache = cached && (now - cached.cachedAt) < PERM_CACHE_TTL;
      if (hasValidCache) {
        if (!cached.canWrite) {
          ws.send(JSON.stringify({ type: 'error', message: 'Read-only: you cannot send input' }));
          return;
        }
      } else {
        // Check if user is session owner (always allowed)
        const sess = await prisma.sharedTerminalSession.findUnique({
          where: { id: sessionId },
          select: { ownerId: true },
        });
        let canWrite = false;
        if (sess && sess.ownerId === ws.userId) {
          canWrite = true;
        } else {
          // Check participant canWrite flag
          const participant = await prisma.sharedSessionParticipant.findUnique({
            where: { sessionId_userId: { sessionId, userId: ws.userId } },
            select: { canWrite: true },
          });
          canWrite = !!participant?.canWrite;
        }
        // Update cache with TTL
        if (!ws.terminalPermissions) ws.terminalPermissions = new Map();
        ws.terminalPermissions.set(sessionId, { canWrite, cachedAt: now });
        if (!canWrite) {
          ws.send(JSON.stringify({ type: 'error', message: 'Read-only: you cannot send input' }));
          return;
        }
      }
      const inRoom = terminalRooms.get(sessionId);
      if (inRoom) {
        broadcast(inRoom, {
          type: 'terminal_input',
          channel: 'terminal',
          payload: { sessionId, userId: ws.userId, data: termData },
        }, ws);
      }
      break;
    }
    case 'resize': {
      const room = terminalRooms.get(sessionId);
      if (room && room.has(ws)) {
        broadcast(room, {
          type: 'terminal_resize',
          channel: 'terminal',
          payload: { sessionId, userId: ws.userId, cols: payload.cols, rows: payload.rows },
        }, ws);
      }
      break;
    }
    case 'permission_change': {
      // Only the session owner can change permissions
      const permSession = await prisma.sharedTerminalSession.findUnique({
        where: { id: sessionId },
        select: { ownerId: true },
      });
      if (!permSession || permSession.ownerId !== ws.userId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Only the session owner can change permissions' }));
        return;
      }
      // Invalidate cached permission for the target user so TTL re-check picks up the change
      const targetId = payload.targetUserId as string;
      const pcRoom = terminalRooms.get(sessionId);
      if (pcRoom) {
        Array.from(pcRoom).forEach(client => {
          if (client.userId === targetId && client.terminalPermissions) {
            client.terminalPermissions.delete(sessionId);
          }
        });
        broadcast(pcRoom, {
          type: 'permission_change',
          channel: 'terminal',
          payload: { sessionId, targetUserId: targetId, canWrite: payload.canWrite },
        });
      }
      break;
    }
  }
}

function handleAudioSignal(ws: AuthenticatedSocket, payload: Record<string, unknown>) {
  const { action, roomId, targetUserId, signalType, signalData, orgId } = payload;

  // Verify org membership
  if (!orgId || typeof orgId !== 'string' || !ws.orgIds.includes(orgId)) return;

  const roomKey = `${orgId}:${typeof roomId === 'string' ? roomId : 'default'}`;

  switch (action) {
    case 'join': {
      // Check participant limit
      const existingRoom = audioRooms.get(roomKey);
      const currentCount = existingRoom ? existingRoom.size : 0;

      // Handle reconnect / multi-tab: remove old socket for same userId, then re-add
      if (existingRoom) {
        const oldSocket = Array.from(existingRoom).find(c => c.userId === ws.userId);
        if (oldSocket) {
          existingRoom.delete(oldSocket);
          // Notify others that the old socket left (will be replaced by new join below)
          broadcast(existingRoom, {
            type: 'audio_peer_left',
            channel: 'audio-signal',
            payload: {
              roomId: roomKey,
              userId: ws.userId,
              email: ws.email,
              participantCount: existingRoom.size,
              maxParticipants: MAX_AUDIO_PARTICIPANTS,
            },
          });
        }
      }

      const updatedCount = existingRoom ? existingRoom.size : 0;
      if (updatedCount >= MAX_AUDIO_PARTICIPANTS) {
        ws.send(JSON.stringify({
          type: 'audio_room_full',
          channel: 'audio-signal',
          payload: {
            roomId: roomKey,
            maxParticipants: MAX_AUDIO_PARTICIPANTS,
            participantCount: updatedCount,
          },
        }));
        return;
      }

      joinRoom(audioRooms, roomKey, ws);
      const room = audioRooms.get(roomKey)!;

      // Send current room state to the joiner
      const existingParticipants = Array.from(room)
        .filter(c => c !== ws)
        .map(c => ({ userId: c.userId, email: c.email }));

      ws.send(JSON.stringify({
        type: 'audio_room_state',
        channel: 'audio-signal',
        payload: {
          roomId: roomKey,
          participants: existingParticipants,
          participantCount: room.size,
          maxParticipants: MAX_AUDIO_PARTICIPANTS,
        },
      }));

      // Notify existing participants about the new peer
      broadcast(room, {
        type: 'audio_peer_joined',
        channel: 'audio-signal',
        payload: {
          roomId: roomKey,
          userId: ws.userId,
          email: ws.email,
          participantCount: room.size,
          maxParticipants: MAX_AUDIO_PARTICIPANTS,
        },
      }, ws);
      break;
    }

    case 'leave': {
      const room = audioRooms.get(roomKey);
      if (room && room.has(ws)) {
        room.delete(ws);
        broadcast(room, {
          type: 'audio_peer_left',
          channel: 'audio-signal',
          payload: {
            roomId: roomKey,
            userId: ws.userId,
            email: ws.email,
            participantCount: room.size,
            maxParticipants: MAX_AUDIO_PARTICIPANTS,
          },
        });
        if (room.size === 0) audioRooms.delete(roomKey);
      }
      break;
    }

    case 'signal': {
      // Relay WebRTC signaling (offer/answer/ice-candidate) to a specific peer
      if (!targetUserId || typeof targetUserId !== 'string') return;

      const room = audioRooms.get(roomKey);
      if (!room || !room.has(ws)) return;

      Array.from(room).forEach(client => {
        if (client.userId === targetUserId && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'audio_signal',
            channel: 'audio-signal',
            payload: {
              roomId: roomKey,
              fromUserId: ws.userId,
              fromEmail: ws.email,
              signalType,
              signalData,
            },
          }));
        }
      });
      break;
    }

    case 'mute_change': {
      const room = audioRooms.get(roomKey);
      if (!room || !room.has(ws)) return;

      broadcast(room, {
        type: 'audio_mute_change',
        channel: 'audio-signal',
        payload: {
          roomId: roomKey,
          userId: ws.userId,
          isMuted: !!payload.isMuted,
        },
      }, ws);
      break;
    }

    default: {
      // Legacy: relay raw signal to targetUserId (backward compat)
      if (!targetUserId || typeof targetUserId !== 'string') return;
      const orgRoom = orgRooms.get(orgId);
      if (!orgRoom) return;

      Array.from(orgRoom).forEach(client => {
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
        }
      });
    }
  }
}

// ── Notification Handler ──────────────────────────────────────────────────────

async function handleNotification(ws: AuthenticatedSocket, payload: Record<string, unknown>) {
  // Support both nested format ({ notificationType, data: {...} }) and flat format
  // from the macOS app ({ sessionType: "terminal", sessionId, sessionName, ... }).
  const orgId = (payload.orgId as string) || '';
  console.log(`[WS-Notify] Received notification from ${ws.email}, orgId=${orgId}, payload keys: ${Object.keys(payload).join(',')}`);
  if (!orgId || !ws.orgIds.includes(orgId)) {
    console.log(`[WS-Notify] Rejected: orgId=${orgId} not in sender orgIds=[${ws.orgIds.join(',')}]`);
    return;
  }

  const rawTargets = Array.isArray(payload.targetUserIds) ? payload.targetUserIds as string[] : [];

  // Determine notification type from either nested or flat format
  let notificationType = payload.notificationType as string | undefined;
  if (!notificationType) {
    // Flat format: derive from sessionType ("terminal" -> "terminal_invite")
    const sessionType = payload.sessionType as string | undefined;
    if (sessionType === 'terminal') notificationType = 'terminal_invite';
    else if (sessionType === 'audio') notificationType = 'audio_invite';
  }
  if (!notificationType) return;

  // Extract data from either nested "data" field or flat payload
  const data = (payload.data && typeof payload.data === 'object')
    ? payload.data as Record<string, unknown>
    : payload;

  // Validate that target users are confirmed members of this organization
  const validMembers = rawTargets.length > 0
    ? await prisma.organizationUser.findMany({
        where: { organizationId: orgId, userId: { in: rawTargets }, status: { in: ['confirmed', 'active'] } },
        select: { userId: true },
      })
    : [];
  const targets = validMembers.map(m => m.userId).filter((id): id is string => id != null);
  console.log(`[WS-Notify] type=${notificationType}, rawTargets=${rawTargets.length}, validTargets=${targets.length}, targets=[${targets.join(',')}]`);

  switch (notificationType) {
    case 'terminal_invite': {
      const sessionId = data.sessionId as string;
      const sessionName = (data.sessionName as string) || 'Shared Terminal';
      const orgName = (data.orgName as string) || '';
      // Notify online users via WebSocket
      for (const targetId of targets) {
        const sockets = socketsForUser(targetId);
        console.log(`[WS-Notify] Target ${targetId}: ${sockets.length} socket(s) online`);
        if (sockets.length > 0) {
          for (const sock of sockets) {
            sock.send(JSON.stringify({
              type: 'session_invite',
              channel: 'notification',
              payload: {
                notificationType: 'terminal_invite',
                sessionType: 'terminal',
                fromUserId: ws.userId,
                fromEmail: ws.email,
                sessionId,
                sessionName,
                orgId,
                orgName,
                timestamp: new Date().toISOString(),
              },
            }));
          }
        } else {
          // User is offline — queue email notification
          queueOfflineNotification(targetId, {
            type: 'terminal_invite',
            fromEmail: ws.email,
            sessionName,
            orgId,
          }).catch(err => console.error('[WS] Failed to queue offline notification:', err));
        }
      }
      break;
    }
    case 'audio_invite': {
      const roomName = (data.roomName as string) || 'Audio Channel';
      if (targets.length > 0) {
        // Person-to-person call: send invite to specific users (Item f)
        for (const targetId of targets) {
          const sockets = socketsForUser(targetId);
          console.log(`[WS-Notify] Audio invite to ${targetId}: ${sockets.length} socket(s) online`);
          if (sockets.length > 0) {
            for (const sock of sockets) {
              sock.send(JSON.stringify({
                type: 'session_invite',
                channel: 'notification',
                payload: {
                  notificationType: 'audio_invite',
                  fromUserId: ws.userId,
                  fromEmail: ws.email,
                  roomName,
                  roomId: data.roomId || 'default',
                  orgId,
                  timestamp: new Date().toISOString(),
                },
              }));
            }
          } else {
            queueOfflineNotification(targetId, {
              type: 'audio_invite',
              fromEmail: ws.email,
              sessionName: roomName,
              orgId,
            }).catch(err => console.error('[WS] Failed to queue offline audio notification:', err));
          }
        }
      } else {
        // Broadcast to all org members that an audio call started
        const room = orgRooms.get(orgId);
        if (room) {
          broadcast(room, {
            type: 'session_invite',
            channel: 'notification',
            payload: {
              notificationType: 'audio_invite',
              fromUserId: ws.userId,
              fromEmail: ws.email,
              roomName,
              roomId: data.roomId || 'default',
              orgId,
              timestamp: new Date().toISOString(),
            },
          }, ws);
        }
      }
      break;
    }
  }
}

/** Queue an email notification for an offline user. */
async function queueOfflineNotification(
  targetUserId: string,
  data: { type: string; fromEmail: string; sessionName?: string; orgId: string },
) {
  // Look up user email
  const user = await prisma.zKUser.findUnique({
    where: { id: targetUserId },
    select: { email: true },
  });
  if (!user?.email) return;

  // Look up org name
  const org = await prisma.organization.findUnique({
    where: { id: data.orgId },
    select: { name: true },
  });

  // Import email sender dynamically to avoid circular deps
  const { sendSessionInviteEmail } = await import('../email');
  await sendSessionInviteEmail({
    email: user.email,
    userName: user.email.split('@')[0],
    fromEmail: data.fromEmail,
    sessionType: data.type === 'terminal_invite' ? 'Shared Terminal' : 'Audio Call',
    sessionName: data.sessionName || 'Team Session',
    orgName: org?.name || 'your organization',
  });
}

// ── Server Setup ─────────────────────────────────────────────────────────────

export function attachWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/collab' });
  wssInstance = wss;

  // Ping/pong keepalive every 30s
  const interval = setInterval(() => {
    Array.from(wss.clients as Set<AuthenticatedSocket>).forEach(client => {
      if (!client.isAlive) {
        leaveAllRooms(client);
        client.terminate();
        return;
      }
      client.isAlive = false;
      client.ping();
    });
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
    authWs.terminalPermissions = new Map();

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
            handleChat(authWs, msg.payload).catch(err => {
              console.error('Chat handler error:', err);
              authWs.send(JSON.stringify({ type: 'error', message: 'Internal chat error' }));
            });
            break;
          case 'terminal':
            handleTerminal(authWs, msg.payload).catch(err => {
              console.error('Terminal handler error:', err);
              authWs.send(JSON.stringify({ type: 'error', message: 'Internal terminal error' }));
            });
            break;
          case 'audio-signal':
            handleAudioSignal(authWs, msg.payload);
            break;
          case 'notification':
            handleNotification(authWs, msg.payload).catch(err => {
              console.error('Notification handler error:', err);
              authWs.send(JSON.stringify({ type: 'error', message: 'Internal notification error' }));
            });
            break;
          default:
            authWs.send(JSON.stringify({ type: 'error', message: `Unknown channel: ${msg.channel}` }));
        }
      } catch {
        authWs.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    authWs.on('close', () => {
      // Only broadcast offline if this was the user's last connection (multi-device)
      const stillOnline = hasOtherConnections(authWs.userId, authWs);
      if (!stillOnline) {
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
