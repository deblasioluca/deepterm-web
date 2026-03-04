/**
 * Admin AI chat orchestrator.
 *
 * Handles multi-turn streaming conversations with Claude, including tool execution loops.
 * Persists conversations + messages to DB. Logs usage to AIUsageLog.
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { calculateCost } from '@/lib/ai-usage';
import { buildSystemPrompt } from './context';
import { TOOL_DEFINITIONS, executeTool } from './tools';
import type { AdminPageContext } from '@/components/admin/AdminAIContext';

const MAX_TOOL_ROUNDS = 10;

// ── SSE event types sent to the client ───────────────────────────────────────

export type SSEEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_start'; tool: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; tool: string; toolUseId: string; output: string }
  | { type: 'done'; conversationId: string; messageId: string; inputTokens: number; outputTokens: number }
  | { type: 'error'; error: string };

// ── Parameters ────────────────────────────────────────────────────────────────

export interface ChatParams {
  adminUserId: string;
  conversationId?: string | null;
  message: string;
  pageContext?: AdminPageContext | null;
  modelOverride?: string | null;
}

// ── Main generator ────────────────────────────────────────────────────────────

export async function* streamChat(params: ChatParams): AsyncGenerator<SSEEvent> {
  const { adminUserId, message, pageContext, modelOverride } = params;
  const startedAt = Date.now();

  // ── Load / create config ──────────────────────────────────────────────────
  const config = await prisma.adminAIConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });

  const model = modelOverride ?? config.modelId;
  const systemPrompt = await buildSystemPrompt(pageContext ?? null, config.systemPrompt);

  // ── Resolve conversation ──────────────────────────────────────────────────
  let conversationId = params.conversationId ?? null;

  if (!conversationId) {
    const title = message.slice(0, 60) + (message.length > 60 ? '…' : '');
    const conv = await prisma.adminAIConversation.create({
      data: {
        adminUserId,
        title,
        pageContext: pageContext ? JSON.stringify(pageContext) : null,
      },
    });
    conversationId = conv.id;
  }

  // ── Persist user message ──────────────────────────────────────────────────
  await prisma.adminAIMessage.create({
    data: { conversationId, role: 'user', content: message },
  });

  // ── Load conversation history (last 20 messages for context) ─────────────
  const history = await prisma.adminAIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  // Build Anthropic message array from DB history
  const anthropicMessages: Anthropic.MessageParam[] = [];
  for (const msg of history) {
    if (msg.role === 'user' && !msg.toolResults) {
      anthropicMessages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      if (msg.toolCalls) {
        const toolCalls = JSON.parse(msg.toolCalls) as Array<{ id: string; name: string; input: unknown }>;
        const toolResults = msg.toolResults
          ? (JSON.parse(msg.toolResults) as Array<{ toolUseId: string; output: string }>)
          : [];

        anthropicMessages.push({
          role: 'assistant',
          content: [
            ...(msg.content ? [{ type: 'text' as const, text: msg.content }] : []),
            ...toolCalls.map((tc) => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.name,
              input: tc.input as Record<string, unknown>,
            })),
          ],
        });

        if (toolResults.length > 0) {
          anthropicMessages.push({
            role: 'user',
            content: toolResults.map((tr) => ({
              type: 'tool_result' as const,
              tool_use_id: tr.toolUseId,
              content: tr.output,
            })),
          });
        }
      } else {
        anthropicMessages.push({ role: 'assistant', content: msg.content });
      }
    }
  }

  // ── Anthropic client ──────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let assistantText = '';
  const allToolCalls: Array<{ id: string; name: string; input: unknown }> = [];
  const allToolResults: Array<{ toolUseId: string; name: string; output: string }> = [];

  // ── Tool execution loop ───────────────────────────────────────────────────
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = anthropic.messages.stream({
        model,
        max_tokens: config.maxTokensPerMessage,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: TOOL_DEFINITIONS,
      });

      // Stream text tokens to client
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          assistantText += event.delta.text;
          yield { type: 'token', text: event.delta.text };
        }
      }

      const finalMsg = await stream.finalMessage();
      totalInputTokens += finalMsg.usage.input_tokens;
      totalOutputTokens += finalMsg.usage.output_tokens;

      // No more tool calls — we're done
      if (finalMsg.stop_reason !== 'tool_use') break;

      // Execute each tool call
      const toolUseBlocks = finalMsg.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      const roundToolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const toolInput = toolUse.input as Record<string, unknown>;

        allToolCalls.push({ id: toolUse.id, name: toolUse.name, input: toolInput });
        yield { type: 'tool_start', tool: toolUse.name, toolUseId: toolUse.id, input: toolInput };

        const output = await executeTool(toolUse.name, toolInput);
        allToolResults.push({ toolUseId: toolUse.id, name: toolUse.name, output });
        yield { type: 'tool_result', tool: toolUse.name, toolUseId: toolUse.id, output };

        roundToolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: output,
        });
      }

      // Append this round's assistant message + tool results to the running history
      anthropicMessages.push({ role: 'assistant', content: finalMsg.content });
      anthropicMessages.push({ role: 'user', content: roundToolResults });
    }

    // ── Persist assistant message ─────────────────────────────────────────
    const costCents = calculateCost(
      { modelId: model },
      totalInputTokens,
      totalOutputTokens,
    );

    const savedMsg = await prisma.adminAIMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: assistantText,
        toolCalls: allToolCalls.length > 0 ? JSON.stringify(allToolCalls) : null,
        toolResults: allToolResults.length > 0 ? JSON.stringify(allToolResults) : null,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costCents,
      },
    });

    // ── Log usage (fire-and-forget) ───────────────────────────────────────
    const durationMs = Date.now() - startedAt;
    prisma.aIUsageLog
      .create({
        data: {
          provider: 'anthropic',
          model,
          activity: 'admin.chat',
          category: 'agent',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          costCents,
          durationMs,
          success: true,
        },
      })
      .catch(() => {});

    yield {
      type: 'done',
      conversationId,
      messageId: savedMsg.id,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startedAt;

    prisma.aIUsageLog
      .create({
        data: {
          provider: 'anthropic',
          model,
          activity: 'admin.chat',
          category: 'agent',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          costCents: 0,
          durationMs,
          success: false,
          errorMessage: errorMsg,
        },
      })
      .catch(() => {});

    yield { type: 'error', error: errorMsg };
  }
}
