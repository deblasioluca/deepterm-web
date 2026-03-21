/**
 * Custom Next.js server with WebSocket support for team collaboration.
 *
 * Usage:  node --require tsx/cjs server.ts
 * Or via: npx tsx server.ts
 *
 * This replaces `next start` so that the WebSocket server can share
 * the same HTTP port.
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { attachWebSocketServer } from './src/lib/collab/ws-server';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || '', true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Attach the collaboration WebSocket server
  attachWebSocketServer(server);

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket collab endpoint: ws://${hostname}:${port}/ws/collab`);
    // Signal PM2 that the server is ready (works with wait_ready: true)
    if (process.send) process.send('ready');
  });
});
