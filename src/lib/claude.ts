/**
 * @deprecated Use `callAI()` from `@/lib/ai-client` instead.
 * This singleton is kept only as a fallback. All new AI calls
 * should go through the unified ai-client which supports
 * multiple providers and per-activity model configuration.
 */
import Anthropic from '@anthropic-ai/sdk';

let anthropicInstance: Anthropic | null = null;

/** @deprecated Use `callAI()` from `@/lib/ai-client` instead. */
export function getAnthropic(): Anthropic {
  if (!anthropicInstance) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
    }
    anthropicInstance = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicInstance;
}
