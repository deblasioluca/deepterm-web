'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  Phone,
  Users,
  AlertTriangle,
  Volume2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_PARTICIPANTS = 5;

// STUN servers for NAT traversal
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface Participant {
  userId: string;
  email: string;
  isMuted: boolean;
}

interface PeerConnection {
  userId: string;
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
}

interface AudioChannelProps {
  wsUrl: string;
  wsToken: string;
  orgId: string;
  roomId: string;
  userId: string;
  userEmail: string;
}

export function AudioChannel({
  wsUrl,
  wsToken,
  orgId,
  roomId,
  userId,
  userEmail,
}: AudioChannelProps) {
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState('');
  const [roomFull, setRoomFull] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidate[]>>(new Map());

  // Create a peer connection for a remote participant
  const createPeerConnection = useCallback((remoteUserId: string, remoteEmail: string): PeerConnection => {
    // Close any existing connection for this peer (glare/reconnect)
    const existing = peerConnectionsRef.current.get(remoteUserId);
    if (existing) {
      existing.pc.close();
      existing.audioEl.srcObject = null;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const audioEl = new Audio();
    audioEl.autoplay = true;

    // Add local audio tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle incoming remote audio
    pc.ontrack = (event) => {
      audioEl.srcObject = event.streams[0] || new MediaStream([event.track]);
    };

    // Send ICE candidates to the remote peer
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'audio_signal',
          channel: 'audio-signal',
          payload: {
            action: 'signal',
            roomId,
            orgId,
            targetUserId: remoteUserId,
            signalType: 'ice-candidate',
            signalData: JSON.stringify(event.candidate.toJSON()),
          },
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.warn(`[Audio] Peer ${remoteUserId} connection ${pc.connectionState}`);
      }
    };

    const peerConn: PeerConnection = { userId: remoteUserId, pc, audioEl };
    peerConnectionsRef.current.set(remoteUserId, peerConn);
    return peerConn;
  }, [roomId, orgId]);

  // Initiate a WebRTC offer to a remote peer
  const initiateOffer = useCallback(async (remoteUserId: string, remoteEmail: string) => {
    const peerConn = createPeerConnection(remoteUserId, remoteEmail);
    try {
      const offer = await peerConn.pc.createOffer({ offerToReceiveAudio: true });
      await peerConn.pc.setLocalDescription(offer);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'audio_signal',
          channel: 'audio-signal',
          payload: {
            action: 'signal',
            roomId,
            orgId,
            targetUserId: remoteUserId,
            signalType: 'offer',
            signalData: JSON.stringify(offer),
          },
        }));
      }
    } catch (err) {
      console.error('[Audio] Failed to create offer:', err);
    }
  }, [createPeerConnection, roomId, orgId]);

  // Handle incoming WebRTC signals
  const handleSignal = useCallback(async (fromUserId: string, fromEmail: string, signalType: string, signalData: string) => {
    switch (signalType) {
      case 'offer': {
        const peerConn = createPeerConnection(fromUserId, fromEmail);
        try {
          const offer = JSON.parse(signalData) as RTCSessionDescriptionInit;
          await peerConn.pc.setRemoteDescription(new RTCSessionDescription(offer));

          // Apply any pending ICE candidates
          const pending = pendingCandidatesRef.current.get(fromUserId) || [];
          for (const candidate of pending) {
            await peerConn.pc.addIceCandidate(candidate);
          }
          pendingCandidatesRef.current.delete(fromUserId);

          const answer = await peerConn.pc.createAnswer();
          await peerConn.pc.setLocalDescription(answer);

          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'audio_signal',
              channel: 'audio-signal',
              payload: {
                action: 'signal',
                roomId,
                orgId,
                targetUserId: fromUserId,
                signalType: 'answer',
                signalData: JSON.stringify(answer),
              },
            }));
          }
        } catch (err) {
          console.error('[Audio] Failed to handle offer:', err);
        }
        break;
      }

      case 'answer': {
        const peerConn = peerConnectionsRef.current.get(fromUserId);
        if (peerConn) {
          try {
            const answer = JSON.parse(signalData) as RTCSessionDescriptionInit;
            await peerConn.pc.setRemoteDescription(new RTCSessionDescription(answer));

            // Apply any pending ICE candidates
            const pending = pendingCandidatesRef.current.get(fromUserId) || [];
            for (const candidate of pending) {
              await peerConn.pc.addIceCandidate(candidate);
            }
            pendingCandidatesRef.current.delete(fromUserId);
          } catch (err) {
            console.error('[Audio] Failed to handle answer:', err);
          }
        }
        break;
      }

      case 'ice-candidate': {
        const peerConn = peerConnectionsRef.current.get(fromUserId);
        try {
          const candidate = new RTCIceCandidate(JSON.parse(signalData));
          if (peerConn && peerConn.pc.remoteDescription) {
            await peerConn.pc.addIceCandidate(candidate);
          } else {
            // Queue the candidate until remote description is set
            if (!pendingCandidatesRef.current.has(fromUserId)) {
              pendingCandidatesRef.current.set(fromUserId, []);
            }
            pendingCandidatesRef.current.get(fromUserId)!.push(candidate);
          }
        } catch (err) {
          console.error('[Audio] Failed to add ICE candidate:', err);
        }
        break;
      }
    }
  }, [createPeerConnection, roomId, orgId]);

  // Clean up all peer connections
  const cleanupPeers = useCallback(() => {
    peerConnectionsRef.current.forEach(({ pc, audioEl }) => {
      pc.close();
      audioEl.srcObject = null;
    });
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
  }, []);

  // Clean up local media stream
  const cleanupLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
  }, []);

  // Join audio channel
  const joinChannel = useCallback(async () => {
    setJoining(true);
    setError('');
    setRoomFull(false);

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = stream;

      // Connect WebSocket if not already connected
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        const protocol = wsUrl.startsWith('https') ? 'wss' : 'ws';
        const wsHost = wsUrl.replace(/^https?:\/\//, '');
        const ws = new WebSocket(`${protocol}://${wsHost}/ws/collab?token=${wsToken}`);

        ws.onopen = () => {
          // Send join audio room
          ws.send(JSON.stringify({
            type: 'audio_join',
            channel: 'audio-signal',
            payload: {
              action: 'join',
              roomId,
              orgId,
            },
          }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.channel !== 'audio-signal') return;

            switch (msg.type) {
              case 'audio_room_state': {
                const p = msg.payload;
                setParticipantCount(p.participantCount);
                setJoined(true);
                setJoining(false);

                // Add self to participants
                const allParticipants: Participant[] = [
                  { userId, email: userEmail, isMuted: false },
                  ...((p.participants as { userId: string; email: string }[]) || []).map(
                    (pp: { userId: string; email: string }) => ({ ...pp, isMuted: false })
                  ),
                ];
                setParticipants(allParticipants);

                // Initiate WebRTC offers to all existing participants
                for (const peer of p.participants || []) {
                  if (peer.userId !== userId) {
                    initiateOffer(peer.userId, peer.email);
                  }
                }
                break;
              }

              case 'audio_room_full': {
                setRoomFull(true);
                setJoining(false);
                cleanupLocalStream();
                break;
              }

              case 'audio_peer_joined': {
                const p = msg.payload;
                setParticipantCount(p.participantCount);
                setParticipants(prev => {
                  if (prev.some(pp => pp.userId === p.userId)) return prev;
                  return [...prev, { userId: p.userId, email: p.email, isMuted: false }];
                });
                // The new peer will initiate the offer to us
                break;
              }

              case 'audio_peer_left': {
                const p = msg.payload;
                setParticipantCount(p.participantCount);
                setParticipants(prev => prev.filter(pp => pp.userId !== p.userId));

                // Clean up peer connection
                const peerConn = peerConnectionsRef.current.get(p.userId);
                if (peerConn) {
                  peerConn.pc.close();
                  peerConn.audioEl.srcObject = null;
                  peerConnectionsRef.current.delete(p.userId);
                }
                break;
              }

              case 'audio_signal': {
                const p = msg.payload;
                handleSignal(p.fromUserId, p.fromEmail, p.signalType, p.signalData);
                break;
              }

              case 'audio_mute_change': {
                const p = msg.payload;
                setParticipants(prev =>
                  prev.map(pp =>
                    pp.userId === p.userId ? { ...pp, isMuted: p.isMuted } : pp
                  )
                );
                break;
              }
            }
          } catch (err) {
            console.error('[Audio] Failed to parse WS message:', err);
          }
        };

        ws.onclose = () => {
          setJoined(false);
          setJoining(false);
          cleanupPeers();
          cleanupLocalStream();
          setParticipants([]);
        };

        ws.onerror = () => {
          setError('WebSocket connection failed');
          setJoining(false);
          cleanupLocalStream();
        };

        wsRef.current = ws;
      } else {
        // Already connected, just join the room
        wsRef.current.send(JSON.stringify({
          type: 'audio_join',
          channel: 'audio-signal',
          payload: {
            action: 'join',
            roomId,
            orgId,
          },
        }));
      }
    } catch (err) {
      console.error('[Audio] Failed to join:', err);
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access in your browser settings.');
      } else {
        setError('Failed to join audio channel');
      }
      setJoining(false);
    }
  }, [wsUrl, wsToken, roomId, orgId, userId, userEmail, initiateOffer, handleSignal, cleanupPeers, cleanupLocalStream]);

  // Leave audio channel
  const leaveChannel = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'audio_leave',
        channel: 'audio-signal',
        payload: {
          action: 'leave',
          roomId,
          orgId,
        },
      }));
    }

    cleanupPeers();
    cleanupLocalStream();
    setJoined(false);
    setParticipants([]);
    setIsMuted(false);

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [roomId, orgId, cleanupPeers, cleanupLocalStream]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;

    const newMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = !newMuted;
    });
    setIsMuted(newMuted);

    // Update self in participants
    setParticipants(prev =>
      prev.map(p => p.userId === userId ? { ...p, isMuted: newMuted } : p)
    );

    // Broadcast mute state
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'audio_mute',
        channel: 'audio-signal',
        payload: {
          action: 'mute_change',
          roomId,
          orgId,
          isMuted: newMuted,
        },
      }));
    }
  }, [isMuted, userId, roomId, orgId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (joined) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'audio_leave',
            channel: 'audio-signal',
            payload: { action: 'leave', roomId, orgId },
          }));
        }
        cleanupPeers();
        cleanupLocalStream();
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
      }
    };
  }, [joined, roomId, orgId, cleanupPeers, cleanupLocalStream]);

  // Render: Not joined state
  if (!joined && !joining) {
    return (
      <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-background-secondary border border-border">
        <div className="flex items-center gap-2 text-text-secondary">
          <Volume2 className="w-5 h-5" />
          <span className="text-sm font-medium">Audio Channel</span>
        </div>

        {roomFull && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Room is full ({MAX_PARTICIPANTS}/{MAX_PARTICIPANTS} participants)</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={joinChannel}
          disabled={roomFull}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            roomFull
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          )}
        >
          <Phone className="w-4 h-4" />
          Join Audio
        </button>

        <span className="text-[10px] text-text-tertiary">
          Max {MAX_PARTICIPANTS} participants (mesh)
        </span>
      </div>
    );
  }

  // Render: Joining state
  if (joining) {
    return (
      <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-background-secondary border border-border">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="text-sm text-text-secondary">Connecting...</span>
      </div>
    );
  }

  // Render: Joined state
  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-background-secondary border border-green-500/30">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-green-400">In Call</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-text-tertiary" />
          <span className={cn(
            'text-xs font-medium',
            participantCount >= MAX_PARTICIPANTS ? 'text-amber-400' : 'text-text-tertiary'
          )}>
            {participantCount}/{MAX_PARTICIPANTS}
          </span>
        </div>
      </div>

      {/* Participant limit warning */}
      {participantCount >= MAX_PARTICIPANTS && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Room full — no new participants can join</span>
        </div>
      )}

      {/* Participants list */}
      <div className="flex flex-col gap-1.5">
        {participants.map((p) => (
          <div
            key={p.userId}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-background-tertiary"
          >
            <div className="w-6 h-6 rounded-full bg-accent-primary/20 flex items-center justify-center text-[10px] font-bold text-accent-primary">
              {p.email.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-text-primary truncate flex-1">
              {p.userId === userId ? `${p.email} (You)` : p.email}
            </span>
            {p.isMuted ? (
              <MicOff className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 justify-center pt-1">
        <button
          onClick={toggleMute}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            isMuted
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-background-tertiary text-text-primary hover:bg-background-tertiary/80'
          )}
        >
          {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          {isMuted ? 'Unmute' : 'Mute'}
        </button>

        <button
          onClick={leaveChannel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
        >
          <PhoneOff className="w-3.5 h-3.5" />
          Leave
        </button>
      </div>
    </div>
  );
}
