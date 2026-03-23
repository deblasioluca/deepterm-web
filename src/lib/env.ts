import { z } from 'zod';

/**
 * Runtime validation for environment variables.
 *
 * Import this module early (e.g. in `src/lib/prisma.ts` or layout) so
 * missing / malformed env vars surface immediately instead of causing
 * cryptic failures when a feature is first used.
 *
 * Variables marked `.optional()` won't block startup — they only fail
 * when the feature that needs them is invoked.
 */

const envSchema = z.object({
  // ── Required ─────────────────────────────────────────────
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET is required'),

  // ── Optional with defaults ───────────────────────────────
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // ── Auth (optional — features degrade gracefully) ────────
  JWT_SECRET: z.string().optional(),
  WEBAUTHN_RP_ID: z.string().optional(),

  // ── OAuth providers ──────────────────────────────────────
  GITHUB_ID: z.string().optional(),
  GITHUB_SECRET: z.string().optional(),
  APPLE_ID: z.string().optional(),
  APPLE_SECRET: z.string().optional(),

  // ── Redis ────────────────────────────────────────────────
  REDIS_URL: z.string().optional(),

  // ── Email / SMTP ─────────────────────────────────────────
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  ADMIN_ALERT_EMAIL: z.string().email().optional(),

  // ── Stripe ───────────────────────────────────────────────
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // ── CORS ─────────────────────────────────────────────────
  CORS_ALLOWED_ORIGINS: z.string().optional(),

  // ── API keys ─────────────────────────────────────────────
  APP_API_KEY: z.string().optional(),
  X_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  AI_DEV_API_KEY: z.string().optional(),
  NODE_RED_API_KEY: z.string().optional(),

  // ── MS Teams ───────────────────────────────────────────────
  MS_TEAMS_WEBHOOK_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error(
      `\n❌ Invalid environment variables:\n${formatted}\n\n` +
      'See .env.example for the required configuration.\n',
    );

    // In production, crash hard so the process doesn't start with bad config.
    // In development, log the warning but let the process continue so the
    // developer can iterate without having every optional var configured.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Environment validation failed — refusing to start.');
    }
  }

  // Return the parsed result (with defaults applied) when valid,
  // or fall back to raw process.env cast when in dev with validation errors.
  return (result.success ? result.data : process.env) as Env;
}

/**
 * Validated environment variables.
 * Import this instead of accessing `process.env` directly for type-safe access.
 */
export const env = validateEnv();
