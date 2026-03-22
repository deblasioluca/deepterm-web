'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';

interface Participant {
  userId: string;
  email: string;
  canWrite: boolean;
}

interface SharedTerminalProps {
  sessionId: string;
  wsToken: string;
  wsUrl: string;
  canWrite: boolean;
  isOwner: boolean;
  userId: string;
  onDisconnect?: () => void;
  onParticipantsChange?: (participants: Participant[]) => void;
}

export function SharedTerminal({
  sessionId,
  wsToken,
  wsUrl,
  canWrite,
  isOwner,
  userId,
  onDisconnect,
  onParticipantsChange,
}: SharedTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const writePermissionRef = useRef(canWrite);
  const onDisconnectRef = useRef(onDisconnect);
  const onParticipantsChangeRef = useRef(onParticipantsChange);
  const [connected, setConnected] = useState(false);
  const [writePermission, setWritePermission] = useState(canWrite);

  // Keep refs/state in sync with latest props
  useEffect(() => { writePermissionRef.current = canWrite; setWritePermission(canWrite); }, [canWrite]);
  useEffect(() => { onDisconnectRef.current = onDisconnect; }, [onDisconnect]);
  useEffect(() => { onParticipantsChangeRef.current = onParticipantsChange; }, [onParticipantsChange]);

  const connectWebSocket = useCallback(() => {
    const ws = new WebSocket(`${wsUrl}?token=${wsToken}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Join the terminal session
      ws.send(JSON.stringify({
        type: 'join',
        channel: 'terminal',
        payload: { sessionId, action: 'join' },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'terminal_output':
            if (msg.payload?.data && termRef.current) {
              termRef.current.write(msg.payload.data);
            }
            break;
          case 'terminal_input':
            // Input from another participant — relay to terminal display
            if (msg.payload?.data && termRef.current) {
              termRef.current.write(msg.payload.data);
            }
            break;
          case 'participant_joined':
            if (onParticipantsChange) {
              // We'll get the full list from the REST API
            }
            break;
          case 'participant_left':
            if (onParticipantsChange) {
              // Refresh participants
            }
            break;
          case 'permission_change':
            if (msg.payload?.targetUserId === userId && msg.payload?.canWrite !== undefined) {
              setWritePermission(msg.payload.canWrite);
              writePermissionRef.current = msg.payload.canWrite;
            }
            break;
          case 'terminal_resize':
            if (msg.payload?.cols && msg.payload?.rows && termRef.current) {
              termRef.current.resize(msg.payload.cols, msg.payload.rows);
            }
            break;
          case 'error':
            console.error('WS error:', msg.message);
            break;
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      onDisconnectRef.current?.();
    };

    ws.onerror = () => {
      setConnected(false);
    };

    return ws;
  }, [sessionId, wsToken, wsUrl, userId]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: canWrite,
      cursorStyle: canWrite ? 'block' : 'underline',
      fontSize: 14,
      fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
      theme: {
        background: '#0D0D14',
        foreground: '#E0E0E0',
        cursor: '#00D4AA',
        selectionBackground: '#264F78',
        black: '#000000',
        red: '#FF5555',
        green: '#50FA7B',
        yellow: '#F1FA8C',
        blue: '#BD93F9',
        magenta: '#FF79C6',
        cyan: '#8BE9FD',
        white: '#F8F8F2',
        brightBlack: '#6272A4',
        brightRed: '#FF6E6E',
        brightGreen: '#69FF94',
        brightYellow: '#FFFFA5',
        brightBlue: '#D6ACFF',
        brightMagenta: '#FF92DF',
        brightCyan: '#A4FFFF',
        brightWhite: '#FFFFFF',
      },
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle user input — only send if user has write permission
    term.onData((data) => {
      if (writePermissionRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'input',
          channel: 'terminal',
          payload: { sessionId, action: 'input', data },
        }));
      }
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'resize',
          channel: 'terminal',
          payload: {
            sessionId,
            action: 'resize',
            cols: term.cols,
            rows: term.rows,
          },
        }));
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try { fitAddon.fit(); } catch { /* ignore */ }
      });
    });
    resizeObserver.observe(terminalRef.current);

    window.addEventListener('resize', handleResize);

    // Connect WebSocket
    const ws = connectWebSocket();

    // Display connection info
    term.writeln('\x1b[36m--- DeepTerm Shared Terminal ---\x1b[0m');
    term.writeln(`\x1b[33mSession:\x1b[0m ${sessionId}`);
    term.writeln(`\x1b[33mMode:\x1b[0m ${canWrite ? '\x1b[32mRead/Write\x1b[0m' : '\x1b[31mRead-Only\x1b[0m'}`);
    term.writeln('\x1b[90mConnecting...\x1b[0m');
    term.writeln('');

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      ws.close();
      term.dispose();
    };
  }, [sessionId, connectWebSocket, canWrite]);

  // Update cursor style when write permission changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.cursorBlink = writePermission;
      termRef.current.options.cursorStyle = writePermission ? 'block' : 'underline';
    }
  }, [writePermission]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      {/* Connection status badge */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
          connected
            ? 'bg-green-500/20 text-green-400'
            : 'bg-red-500/20 text-red-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
          writePermission
            ? 'bg-blue-500/20 text-blue-400'
            : 'bg-yellow-500/20 text-yellow-400'
        }`}>
          {writePermission ? 'Read/Write' : 'Read-Only'}
        </span>
      </div>
      <div
        ref={terminalRef}
        className="w-full h-full rounded-lg overflow-hidden"
        style={{ backgroundColor: '#0D0D14', padding: '8px' }}
      />
    </div>
  );
}
