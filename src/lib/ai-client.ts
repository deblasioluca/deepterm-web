/**
 * Unified AI client — routes AI calls to the correct provider based on
 * database configuration, with fallback to ANTHROPIC_API_KEY env var.
 *
 * Usage: callAI('planning.propose', systemPrompt, messages)
 */

import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/ai-encryption';
import { AI_ACTIVITIES, type AIActivityKey } from '@/lib/ai-activities';
import { logAIUsage, calculateCost, type AICallContext } from '@/lib/ai-usage';

// ── Types ────────────────────────────────────────

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
}

interface ResolvedConfig {
  providerSlug: string;
  modelId: string;
  apiKey: string;
  baseUrl: string | null;
  temperature: number;
  maxTokens: number;
  systemPromptOverride: string | null;
}

// ── Resolution Cache (60s TTL) ───────────────────

let assignmentCache: Map<string, ResolvedConfig> | null = null;
let cacheFetchedAt = 0;
const CACHE_TTL = 60_000;

async function resolveConfig(activity: string): Promise<ResolvedConfig> {
  const activityDef = AI_ACTIVITIES[activity as AIActivityKey];
  if (!activityDef) throw new Error(`Unknown AI activity: ${activity}`);

  // Check cache
  if (assignmentCache && Date.now() - cacheFetchedAt < CACHE_TTL) {
    const cached = assignmentCache.get(activity);
    if (cached) return { ...cached };
  }

  // Try DB assignment
  try {
    const assignment = await prisma.aIActivityAssignment.findUnique({
      where: { activity },
      include: { model: { include: { provider: true } } },
    });

    if (assignment?.model?.isEnabled && assignment.model.provider?.isEnabled) {
      const apiKey = decryptApiKey(assignment.model.provider.encryptedKey);
      if (apiKey) {
        const config: ResolvedConfig = {
          providerSlug: assignment.model.provider.slug,
          modelId: assignment.model.modelId,
          apiKey,
          baseUrl: assignment.model.provider.baseUrl,
          temperature: assignment.temperature,
          maxTokens: assignment.maxTokens,
          systemPromptOverride: assignment.systemPromptOverride || null,
        };
        // Update cache
        if (!assignmentCache || Date.now() - cacheFetchedAt >= CACHE_TTL) {
          assignmentCache = new Map();
          cacheFetchedAt = Date.now();
        }
        assignmentCache.set(activity, config);
        return { ...config };
      }
    }
  } catch (e) {
    console.warn(`[AI Client] DB lookup failed for ${activity}, falling back to env:`, e);
  }

  // Fallback: env var (Anthropic only)
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (!envKey) {
    throw new Error(`No AI configuration for activity "${activity}" and ANTHROPIC_API_KEY is not set`);
  }

  return {
    providerSlug: 'anthropic',
    modelId: activityDef.defaultModel,
    apiKey: envKey,
    baseUrl: null,
    temperature: activityDef.defaultTemperature,
    maxTokens: activityDef.defaultMaxTokens,
    systemPromptOverride: null,
  };
}

// ── Retry Helper ────────────────────────────────

function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('429') || msg.includes('rate_limit') || msg.includes('rate limit');
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff on rate limit errors.
 * Waits: 5s, 15s, 30s, 60s (up to maxRetries).
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 4, label = ''): Promise<T> {
  const delays = [5000, 15000, 30000, 60000];
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < maxRetries && isRateLimitError(err)) {
        const delay = delays[Math.min(attempt, delays.length - 1)];
        console.warn(`[AI Client] Rate limit hit${label ? ` for ${label}` : ''}, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

// ── Provider Implementations ─────────────────────

async function callAnthropic(
  config: ResolvedConfig, systemPrompt: string, messages: AIMessage[]
): Promise<AIResponse> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: config.apiKey,
    maxRetries: 4,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  });

  const response = await client.messages.create({
    model: config.modelId,
    max_tokens: config.maxTokens,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });

  const content = response.content
    .filter(b => b.type === 'text')
    .map(b => 'text' in b ? b.text : '')
    .join('\n');

  return {
    content,
    model: config.modelId,
    provider: 'anthropic',
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };
}

async function callOpenAICompatible(
  config: ResolvedConfig, systemPrompt: string, messages: AIMessage[], provider: string
): Promise<AIResponse> {
  const defaultUrls: Record<string, string> = {
    openai: 'https://api.openai.com',
    mistral: 'https://api.mistral.ai',
    groq: 'https://api.groq.com/openai',
  };

  const base = config.baseUrl || defaultUrls[provider] || defaultUrls.openai;
  const url = `${base}/v1/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelId,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${provider} API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    model: config.modelId,
    provider,
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
}

async function callGoogle(
  config: ResolvedConfig, systemPrompt: string, messages: AIMessage[]
): Promise<AIResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.modelId}:generateContent?key=${config.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: config.maxTokens,
        temperature: config.temperature,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google AI API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts;
  const content = Array.isArray(parts)
    ? parts.map((p: { text?: string }) => p.text || '').join('\n')
    : '';

  return {
    content,
    model: config.modelId,
    provider: 'google',
    inputTokens: data.usageMetadata?.promptTokenCount || 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
  };
}

// ── Public API ───────────────────────────────────

/**
 * Call an AI model for a specific activity.
 * Resolution: DB assignment → env var fallback → error.
 */
export async function callAI(
  activity: string,
  systemPrompt: string,
  messages: AIMessage[],
  overrides?: { temperature?: number; maxTokens?: number; context?: AICallContext }
): Promise<AIResponse> {
  const startTime = Date.now();
  const config = await resolveConfig(activity);
  if (overrides?.temperature !== undefined) config.temperature = overrides.temperature;
  if (overrides?.maxTokens !== undefined) config.maxTokens = overrides.maxTokens;

  // Apply system prompt override if configured in the assignment
  const finalPrompt = config.systemPromptOverride || systemPrompt;

  const dispatch = (): Promise<AIResponse> => {
    switch (config.providerSlug) {
      case 'anthropic':
        return callAnthropic(config, finalPrompt, messages);
      case 'openai':
      case 'mistral':
      case 'groq':
        return callOpenAICompatible(config, finalPrompt, messages, config.providerSlug);
      case 'google':
        return callGoogle(config, finalPrompt, messages);
      default:
        throw new Error(`Unsupported AI provider: ${config.providerSlug}`);
    }
  };

  let response: AIResponse | undefined;
  let success = true;
  let errorMessage: string | undefined;

  try {
    response = await withRetry(dispatch, 4, activity);
    return response;
  } catch (err) {
    success = false;
    errorMessage = err instanceof Error ? err.message : 'Unknown error';
    throw err;
  } finally {
    const durationMs = Date.now() - startTime;
    const activityDef = AI_ACTIVITIES[activity as AIActivityKey];

    // Log asynchronously — never block the caller
    logAIUsage({
      provider: config.providerSlug,
      model: config.modelId,
      activity,
      category: activityDef?.category || 'unknown',
      inputTokens: response?.inputTokens || 0,
      outputTokens: response?.outputTokens || 0,
      costCents: calculateCost(
        { costPer1kInput: null, costPer1kOutput: null, modelId: config.modelId },
        response?.inputTokens || 0,
        response?.outputTokens || 0,
      ),
      durationMs,
      success,
      errorMessage,
      context: overrides?.context,
    }).catch(err => console.error('[AI Usage] Failed to log:', err));
  }
}



// ── Ensemble support ─────────────────────────────

/**
 * Resolve all assigned models for an activity (primary + secondary + tertiary).
 * Returns 1-3 configs depending on what's assigned.
 */
async function resolveEnsembleConfigs(activity: string): Promise<{ role: 'primary' | 'secondary' | 'tertiary'; config: ResolvedConfig }[]> {
  const primary = await resolveConfig(activity);
  const results: { role: 'primary' | 'secondary' | 'tertiary'; config: ResolvedConfig }[] = [
    { role: 'primary', config: primary },
  ];

  try {
    const assignment = await prisma.aIActivityAssignment.findUnique({
      where: { activity },
      include: {
        secondaryModel: { include: { provider: true } },
        tertiaryModel: { include: { provider: true } },
      },
    });

    if (assignment?.secondaryModel?.isEnabled && assignment.secondaryModel.provider?.isEnabled) {
      const apiKey = decryptApiKey(assignment.secondaryModel.provider.encryptedKey);
      if (apiKey) {
        results.push({
          role: 'secondary',
          config: {
            providerSlug: assignment.secondaryModel.provider.slug,
            modelId: assignment.secondaryModel.modelId,
            apiKey,
            baseUrl: assignment.secondaryModel.provider.baseUrl,
            temperature: assignment.temperature,
            maxTokens: assignment.maxTokens,
            systemPromptOverride: assignment.systemPromptOverride || null,
          },
        });
      }
    }

    if (assignment?.tertiaryModel?.isEnabled && assignment.tertiaryModel.provider?.isEnabled) {
      const apiKey = decryptApiKey(assignment.tertiaryModel.provider.encryptedKey);
      if (apiKey) {
        results.push({
          role: 'tertiary',
          config: {
            providerSlug: assignment.tertiaryModel.provider.slug,
            modelId: assignment.tertiaryModel.modelId,
            apiKey,
            baseUrl: assignment.tertiaryModel.provider.baseUrl,
            temperature: assignment.temperature,
            maxTokens: assignment.maxTokens,
            systemPromptOverride: assignment.tertiaryModel.provider.slug === primary.providerSlug ? null : assignment.systemPromptOverride || null,
          },
        });
      }
    }
  } catch (e) {
    console.warn(`[AI Ensemble] Failed to load secondary/tertiary for ${activity}:`, e);
  }

  return results;
}

export interface EnsembleResponse {
  role: 'primary' | 'secondary' | 'tertiary';
  response: AIResponse;
}

/**
 * Call all assigned models for an activity in parallel (ensemble mode).
 * Returns 1-3 responses. If only primary is assigned, behaves like callAI.
 * Failed calls are logged but don't block other models.
 */
export async function callAIEnsemble(
  activity: string,
  systemPrompt: string,
  messages: AIMessage[],
  overrides?: { temperature?: number; maxTokens?: number; context?: AICallContext }
): Promise<EnsembleResponse[]> {
  const configs = await resolveEnsembleConfigs(activity);

  // If only primary, just use normal callAI path
  if (configs.length === 1) {
    const response = await callAI(activity, systemPrompt, messages, overrides);
    return [{ role: 'primary', response }];
  }

  // Parallel calls to all configured models
  const promises = configs.map(async ({ role, config }) => {
    const startTime = Date.now();
    if (overrides?.temperature !== undefined) config.temperature = overrides.temperature;
    if (overrides?.maxTokens !== undefined) config.maxTokens = overrides.maxTokens;
    const finalPrompt = config.systemPromptOverride || systemPrompt;

    const dispatch = (): Promise<AIResponse> => {
      switch (config.providerSlug) {
        case 'anthropic':
          return callAnthropic(config, finalPrompt, messages);
        case 'openai':
        case 'mistral':
        case 'groq':
          return callOpenAICompatible(config, finalPrompt, messages, config.providerSlug);
        case 'google':
          return callGoogle(config, finalPrompt, messages);
        default:
          throw new Error(`Unsupported AI provider: ${config.providerSlug}`);
      }
    };

    try {
      const response = await withRetry(dispatch, 2, `${activity}[${role}]`);
      const durationMs = Date.now() - startTime;
      const activityDef = AI_ACTIVITIES[activity as AIActivityKey];
      logAIUsage({
        provider: config.providerSlug,
        model: config.modelId,
        activity: `${activity}[${role}]`,
        category: activityDef?.category || 'unknown',
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costCents: calculateCost(
          { costPer1kInput: null, costPer1kOutput: null, modelId: config.modelId },
          response.inputTokens,
          response.outputTokens,
        ),
        durationMs,
        success: true,
        context: overrides?.context,
      }).catch(() => {});
      return { role, response } as EnsembleResponse;
    } catch (err) {
      console.error(`[AI Ensemble] ${role} model failed for ${activity}:`, err);
      return null;
    }
  });

  const results = await Promise.all(promises);
  const valid = results.filter((r): r is EnsembleResponse => r !== null);

  if (valid.length === 0) {
    throw new Error(`All ensemble models failed for activity "${activity}"`);
  }

  return valid;
}

/** Invalidate the assignment cache (call after config changes). */
export function invalidateAICache(): void {
  assignmentCache = null;
  cacheFetchedAt = 0;
}
