import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { streamChat, type SSEEvent } from '@/lib/admin-ai/chat';
import { z } from 'zod';

const RequestSchema = z.object({
  conversationId: z.string().nullable().optional(),
  message: z.string().min(1).max(32_000),
  pageContext: z
    .object({
      page: z.string(),
      summary: z.string(),
      data: z.record(z.unknown()).optional(),
    })
    .nullable()
    .optional(),
  modelOverride: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Bad Request', message: parsed.error.message },
      { status: 400 },
    );
  }

  const { conversationId, message, pageContext, modelOverride } = parsed.data;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for await (const event of streamChat({
          adminUserId: session.id,
          conversationId: conversationId ?? null,
          message,
          pageContext: pageContext ?? null,
          modelOverride: modelOverride ?? null,
        })) {
          send(event);
        }
      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering for SSE
    },
  });
}
