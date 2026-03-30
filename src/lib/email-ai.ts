/**
 * Email AI service — LLM-powered classification, drafting, and automated actions.
 *
 * Phase 1: classifyEmail() — classify incoming emails with priority, sentiment
 * Phase 2: draftResponse() — generate response drafts with context
 * Phase 3: autoActions() — create Issues/Ideas from classified emails
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { logAIUsage } from '@/lib/ai-usage';
import { EMAIL_TOOLS, executeEmailTool } from '@/lib/email-tools';

// ── Types ────────────────────────────────────────────────────────────────────

export type EmailClassification =
  | 'support_request'
  | 'bug_report'
  | 'feature_request'
  | 'billing_inquiry'
  | 'partnership'
  | 'spam'
  | 'personal';

export type EmailPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type EmailSentiment = 'positive' | 'neutral' | 'negative';

export interface ClassificationResult {
  classification: EmailClassification;
  priority: EmailPriority;
  sentiment: EmailSentiment;
  actionItems: string[];
  reasoning: string;
}

export interface DraftResult {
  draftBody: string;
  draftText: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CLASSIFICATION_MODEL = 'claude-sonnet-4-20250514';
const DRAFT_MODEL = 'claude-sonnet-4-20250514';

const CLASSIFICATION_PROMPT = `You are an email classifier for DeepTerm, a professional SSH client and password manager platform for macOS.

DeepTerm offers:
- Encrypted vault (zero-knowledge) for SSH credentials and passwords
- Multi-tab terminal with SSH/SFTP support
- Team collaboration with shared terminals, chat, and audio channels
- AI-powered features (chat, MCP, A2A protocol)
- Free and Pro subscription tiers

Email aliases:
- support@deepterm.net — Bug reports, account issues, technical help, billing questions
- info@deepterm.net — General enquiries, partnership requests, press
- luca@deepterm.net — Direct contact with founder

Classify the following email into EXACTLY ONE category:
- support_request: User needs help with the product (setup, usage, troubleshooting)
- bug_report: User is reporting a bug, crash, or unexpected behavior
- feature_request: User is suggesting or requesting a new feature
- billing_inquiry: Questions about subscriptions, payments, refunds, pricing
- partnership: Business partnership, press, integration requests, marketing
- spam: Unsolicited commercial email, phishing, irrelevant mass emails
- personal: Personal correspondence for the founder

Also extract:
- Priority: P0 (critical/urgent — data loss, security, service down), P1 (important — broken feature, billing issue), P2 (normal — general request), P3 (low — nice-to-have, informational)
- Sentiment: positive, neutral, negative
- Action items: List of concrete actions needed (max 5)

Respond in this exact JSON format (no markdown, no code fences):
{
  "classification": "...",
  "priority": "P0|P1|P2|P3",
  "sentiment": "positive|neutral|negative",
  "actionItems": ["action 1", "action 2"],
  "reasoning": "Brief explanation of classification decision"
}`;

const DRAFT_RESPONSE_PROMPT = `You are a professional customer support agent for DeepTerm, a macOS SSH client and password manager platform.

## Product Knowledge

DeepTerm is a professional SSH client and zero-knowledge password manager, developed by Luca De Blasio as an indie product.

**Supported platforms:** macOS (Apple Silicon — M1/M2/M3/M4), Windows, Linux, iOS. Intel Macs and Android are NOT supported.

**Core features:**
- Zero-knowledge encrypted vault for SSH credentials and passwords (AES-256, client-side encryption)
- Multi-tab terminal with SSH/SFTP support
- Team collaboration: shared terminals, real-time chat, WebRTC audio channels
- AI-powered features: LLM chat assistant, MCP server integration, A2A protocol
- Organization management: teams, shared vaults, role-based access
- Passkey (WebAuthn) and 2FA (TOTP) login support
- Biometric unlock (Touch ID / Face ID)

**Support channels:**
- Email: support@deepterm.net, info@deepterm.net, luca@deepterm.net
- Website: https://deepterm.net
- In-app: Settings → Support

**Common support topics:**
- Vault sync issues → Check internet connection, try force-sync in Settings
- Login problems → Reset password via app, check 2FA setup
- Subscription not showing (Apple IAP) → Restore purchases in Settings → Subscription
- Subscription not showing (Org) → Contact your organization admin, check org membership at deepterm.net
- Shared terminal issues → Both users need Pro subscription, check organization membership
- AI features not working → Requires Pro subscription, check API key in Settings

## Tools

You have access to tools that let you look up LIVE customer data. **Always use tools** before drafting a response — never guess subscription status, pricing, or account details.

**When to use which tool:**
- Subscription/billing questions → call \`lookup_user_subscription\` + \`get_subscription_plans\`
- Account/usage questions → call \`lookup_user_profile\`
- Bug reports → call \`lookup_user_issues\` + \`get_known_issues\`
- Payment disputes → call \`lookup_user_invoices\` + \`lookup_user_payment_events\`
- Feature requests → call \`get_feature_roadmap\`
- General inquiries → call \`lookup_user_profile\` + \`get_announcements\`
- Returning customers → call \`lookup_email_history\` to check prior conversations

**Important rules based on tool results:**
- If subscription source is "organization", do NOT mention Apple App Store or Apple IAP.
- If subscription source is "apple_iap", refer them to Apple ID subscription management.
- If the user has an active Pro plan, NEVER tell them they are on the free plan.
- Use ACTUAL pricing from \`get_subscription_plans\` — do not hardcode prices.
- Reference specific billing dates, invoice amounts, etc. from tool results when relevant.

## Response Guidelines
- Be warm but professional — DeepTerm is an indie product by a solo developer
- Address the user by first name if available
- Be specific and actionable — don't give vague advice
- For bug reports: acknowledge the issue, ask for reproduction steps if needed, mention it's been logged
- For feature requests: thank them, explain the feature will be considered
- For support: provide clear step-by-step instructions
- For billing: be empathetic, reference the user's ACTUAL subscription data from tool results
- For partnership: express interest, mention the founder will follow up
- Sign off as "DeepTerm Support" or "Luca" depending on the alias
- NEVER contradict tool results — if tools say the user is on Pro, acknowledge that
- IMPORTANT: Always include an AI disclaimer before the sign-off. Use this exact line:
  "This response was generated by our AI assistant. If anything seems incorrect or you'd like to speak with a human, simply reply with the word HUMAN and we'll connect you with our team."

Format: Write the response as HTML email body (simple formatting, no complex layouts).
Also provide a plain-text version.
The AI disclaimer should appear as a small note before the sign-off, styled in a lighter/smaller font in HTML.

Once you have gathered all necessary data via tools, respond in this exact JSON format (no markdown, no code fences):
{
  "htmlBody": "<p>Hi [Name],</p><p>...</p><p style='font-size:12px;color:#888;margin-top:16px;'>This response was generated by our AI assistant. If anything seems incorrect or you'd like to speak with a human, simply reply with the word HUMAN and we will connect you with our team.</p><p>Best regards,<br>DeepTerm Support</p>",
  "textBody": "Hi [Name],\\n\\n...\\n\\n---\\nThis response was generated by our AI assistant. If anything seems incorrect or you'd like to speak with a human, simply reply with the word HUMAN and we will connect you with our team.\\n\\nBest regards,\\nDeepTerm Support"
}`;

// ── Phase 1: Classification ──────────────────────────────────────────────────

/**
 * Classify an email using Claude LLM.
 * Returns structured classification with priority, sentiment, and action items.
 */
export async function classifyEmail(email: {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  bodyText: string;
}): Promise<ClassificationResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const startedAt = Date.now();

  const userMessage = `Email to classify:
From: ${email.fromName ? `${email.fromName} <${email.from}>` : email.from}
To: ${email.to}
Subject: ${email.subject}
Body:
${email.bodyText.slice(0, 4000)}`;

  try {
    const response = await anthropic.messages.create({
      model: CLASSIFICATION_MODEL,
      max_tokens: 500,
      system: CLASSIFICATION_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(text.trim()) as ClassificationResult;

    // Validate fields
    const validClassifications: EmailClassification[] = [
      'support_request', 'bug_report', 'feature_request',
      'billing_inquiry', 'partnership', 'spam', 'personal',
    ];
    const validPriorities: EmailPriority[] = ['P0', 'P1', 'P2', 'P3'];
    const validSentiments: EmailSentiment[] = ['positive', 'neutral', 'negative'];

    if (!validClassifications.includes(parsed.classification)) {
      parsed.classification = 'support_request';
    }
    if (!validPriorities.includes(parsed.priority)) {
      parsed.priority = 'P2';
    }
    if (!validSentiments.includes(parsed.sentiment)) {
      parsed.sentiment = 'neutral';
    }
    if (!Array.isArray(parsed.actionItems)) {
      parsed.actionItems = [];
    }

    // Log usage
    const durationMs = Date.now() - startedAt;
    await logAIUsage({
      provider: 'anthropic',
      model: CLASSIFICATION_MODEL,
      activity: 'email.classify',
      category: 'email',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costCents: 0, // Will be calculated by logAIUsage
      durationMs,
      success: true,
    }).catch(() => {});

    return parsed;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    await logAIUsage({
      provider: 'anthropic',
      model: CLASSIFICATION_MODEL,
      activity: 'email.classify',
      category: 'email',
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
      durationMs,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    }).catch(() => {});

    // Return a safe default on failure
    return {
      classification: 'support_request',
      priority: 'P2',
      sentiment: 'neutral',
      actionItems: [],
      reasoning: `Classification failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Phase 2: Response Drafting ───────────────────────────────────────────────

/**
 * Generate a response draft for an email using Claude LLM.
 * Uses context from user account, classification, and thread history.
 */
export async function draftResponse(emailMessageId: string): Promise<DraftResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const startedAt = Date.now();

  // Load the email message
  const email = await prisma.emailMessage.findUnique({
    where: { id: emailMessageId },
  });
  if (!email) throw new Error(`EmailMessage not found: ${emailMessageId}`);

  // Load thread history (previous messages in same thread)
  let threadContext = '';
  if (email.threadId) {
    const threadMessages = await prisma.emailMessage.findMany({
      where: { threadId: email.threadId, id: { not: email.id } },
      orderBy: { receivedAt: 'asc' },
      take: 5,
    });
    if (threadMessages.length > 0) {
      threadContext = '\nPrevious messages in this thread:\n' +
        threadMessages.map((m) =>
          `[${m.receivedAt.toISOString().slice(0, 10)}] From: ${m.from} — ${m.subject}\n${m.bodyText.slice(0, 500)}`
        ).join('\n---\n');
    }
  }

  const userMessage = `Generate a response for this email. Use your tools to look up the customer's data before composing your reply.

From: ${email.fromName ? `${email.fromName} <${email.from}>` : email.from}
To: ${email.to}
Subject: ${email.subject}
Classification: ${email.classification ?? 'unknown'}
Priority: ${email.priority ?? 'P2'}
Sentiment: ${email.sentiment ?? 'neutral'}

Body:
${email.bodyText.slice(0, 4000)}
${threadContext}

Sender email for tool lookups: ${email.from}
Reply from alias: ${email.to}`;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  try {
    // Initial request with tools — Claude will call tools to gather data
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: userMessage },
    ];

    let response = await anthropic.messages.create({
      model: DRAFT_MODEL,
      max_tokens: 4000,
      system: DRAFT_RESPONSE_PROMPT,
      tools: EMAIL_TOOLS,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Tool-use loop: execute tool calls and feed results back (max 5 iterations)
    let iterations = 0;
    while (response.stop_reason === 'tool_use' && iterations < 5) {
      iterations++;

      // Collect all tool_use blocks from the response
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
      );

      // Execute each tool call
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await executeEmailTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Feed tool results back to Claude
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await anthropic.messages.create({
        model: DRAFT_MODEL,
        max_tokens: 4000,
        system: DRAFT_RESPONSE_PROMPT,
        tools: EMAIL_TOOLS,
        messages,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
    }

    // Extract the final text response
    const textBlock = response.content.find(
      (block): block is Anthropic.Messages.TextBlock => block.type === 'text',
    );
    const text = textBlock?.text ?? '';
    const parsed = JSON.parse(text.trim()) as {
      htmlBody: string;
      textBody: string;
    };

    const durationMs = Date.now() - startedAt;
    await logAIUsage({
      provider: 'anthropic',
      model: DRAFT_MODEL,
      activity: 'email.draft',
      category: 'email',
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costCents: 0,
      durationMs,
      success: true,
    }).catch(() => {});

    return {
      draftBody: parsed.htmlBody || '<p>Failed to generate draft.</p>',
      draftText: parsed.textBody || 'Failed to generate draft.',
      model: DRAFT_MODEL,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costCents: 0,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    await logAIUsage({
      provider: 'anthropic',
      model: DRAFT_MODEL,
      activity: 'email.draft',
      category: 'email',
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costCents: 0,
      durationMs,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    }).catch(() => {});

    throw new Error(`Draft generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Phase 3: Automated Actions ───────────────────────────────────────────────

/**
 * Perform automated actions based on email classification.
 * - bug_report → Create Issue
 * - feature_request → Create Idea
 * - spam → Auto-archive
 * Returns action taken (if any).
 */
export async function performAutoAction(emailMessageId: string): Promise<{
  action: string;
  entityId?: string;
  entityType?: string;
}> {
  const email = await prisma.emailMessage.findUnique({
    where: { id: emailMessageId },
  });
  if (!email) throw new Error(`EmailMessage not found: ${emailMessageId}`);

  const classification = email.classification;

  // Auto-archive spam
  if (classification === 'spam') {
    await prisma.emailMessage.update({
      where: { id: emailMessageId },
      data: { status: 'spam' },
    });
    return { action: 'archived_as_spam' };
  }

  // Auto-create Issue from bug reports
  if (classification === 'bug_report') {
    // Find or create a system user for email-sourced issues
    const systemUser = await getOrCreateEmailUser(email.from);
    if (systemUser) {
      const issue = await prisma.issue.create({
        data: {
          userId: systemUser.id,
          title: `[Email] ${email.subject}`.slice(0, 200),
          description: `**Reported via email from ${email.from}**\n\n${email.bodyText.slice(0, 2000)}`,
          status: 'open',
          priority: mapPriorityToIssue(email.priority),
          area: 'General',
        },
      });

      await prisma.emailMessage.update({
        where: { id: emailMessageId },
        data: { linkedIssueId: issue.id },
      });

      return { action: 'created_issue', entityId: issue.id, entityType: 'Issue' };
    }
  }

  // Auto-create Idea from feature requests
  if (classification === 'feature_request') {
    // Find or create a user for the idea author
    const ideaUser = await getOrCreateEmailUser(email.from);
    if (!ideaUser) return { action: 'none' };

    const idea = await prisma.idea.create({
      data: {
        title: `[Email] ${email.subject}`.slice(0, 200),
        description: `**Suggested via email from ${email.from}**\n\n${email.bodyText.slice(0, 2000)}`,
        status: 'consideration',
        category: 'feature',
        authorId: ideaUser.id,
      },
    });

    await prisma.emailMessage.update({
      where: { id: emailMessageId },
      data: { linkedIdeaId: idea.id },
    });

    return { action: 'created_idea', entityId: idea.id, entityType: 'Idea' };
  }

  return { action: 'none' };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Try to match sender email to an existing User, for linking Issues.
 */
async function getOrCreateEmailUser(email: string): Promise<{ id: string } | null> {
  // Try to find existing web User by email
  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });
  if (existing) return existing;

  // For email-sourced issues, we need a User record.
  // If no user exists, return null (admin can manually assign).
  return null;
}

function mapPriorityToIssue(priority: string | null): string {
  switch (priority) {
    case 'P0': return 'critical';
    case 'P1': return 'high';
    case 'P2': return 'medium';
    case 'P3': return 'low';
    default: return 'medium';
  }
}

// ── User Linking ─────────────────────────────────────────────────────────────

/**
 * Try to link an email message to an existing ZKUser by sender email.
 */
// ── Escalation Detection ─────────────────────────────────────────────────────

/** Keywords that trigger human escalation — skip auto-draft, flag for admin. */
const ESCALATION_KEYWORDS = [
  'human',
  'speak to a human',
  'talk to a human',
  'real person',
  'speak to someone',
  'talk to someone',
  'contact support',
  'escalate',
  'manager',
  'supervisor',
];

/**
 * Strip quoted text from an email reply so escalation detection only checks
 * the user's own words, not quoted AI disclaimers from previous messages.
 */
function stripQuotedText(bodyText: string): string {
  // Remove everything after "On ... wrote:" quote header (Gmail-style)
  const gmailQuote = bodyText.search(/^On .+ wrote:\s*$/m);
  if (gmailQuote !== -1) {
    return bodyText.slice(0, gmailQuote);
  }
  // Remove everything after Outlook-style "From: ... Sent: ..." separator
  const outlookQuote = bodyText.search(/^From:\s.+\nSent:\s/m);
  if (outlookQuote !== -1) {
    return bodyText.slice(0, outlookQuote);
  }
  // Remove everything after generic separator line "---" or "___"
  const separatorLine = bodyText.search(/^[-_]{3,}\s*$/m);
  if (separatorLine !== -1) {
    return bodyText.slice(0, separatorLine);
  }
  // Remove lines starting with '>'
  return bodyText
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('>'))
    .join('\n');
}

/**
 * Check if an email body contains escalation keywords requesting human review.
 * Returns true if the user is asking to speak with a human.
 * Strips quoted text first to avoid matching the AI disclaimer in replies.
 */
export function detectEscalation(bodyText: string): boolean {
  const unquoted = stripQuotedText(bodyText);
  const lower = unquoted.toLowerCase();
  return ESCALATION_KEYWORDS.some((kw) => {
    // Match whole-word for short keywords like "human"
    if (kw.length <= 7) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      return regex.test(lower);
    }
    return lower.includes(kw);
  });
}

// ── User Linking ─────────────────────────────────────────────────────────────

export async function linkEmailToUser(emailMessageId: string): Promise<string | null> {
  const email = await prisma.emailMessage.findUnique({
    where: { id: emailMessageId },
    select: { from: true },
  });
  if (!email) return null;

  const zkUser = await prisma.zKUser.findUnique({
    where: { email: email.from.toLowerCase() },
    select: { id: true },
  });

  if (zkUser) {
    await prisma.emailMessage.update({
      where: { id: emailMessageId },
      data: { linkedUserId: zkUser.id },
    });
    return zkUser.id;
  }

  return null;
}
