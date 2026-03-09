/**
 * AI Auto-Triage — Reviews incoming issues/ideas, asks clarifying questions,
 * and produces a final summary when satisfied.
 *
 * Flow:
 * 1. New issue/idea created → triageIssue() or triageIdea() called (fire-and-forget)
 * 2. AI reviews the submission and posts a comment with clarifying questions
 * 3. When user replies, processTriage() is called to continue the conversation
 * 4. Once AI deems info sufficient, it posts a final summary
 */

import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai-client';
import { sendIssueReplyEmail, sendIdeaReplyEmail } from '@/lib/email';

const SYSTEM_PROMPT_ISSUE = `You are an AI triage assistant for DeepTerm, a professional SSH client platform.

Your job is to review incoming bug reports / defect submissions and ensure they contain enough information for the engineering team to act on.

When reviewing a submission, check for:
1. Clear description of the problem
2. Steps to reproduce (if applicable)
3. Expected vs actual behavior
4. Platform/environment details (macOS version, DeepTerm version)
5. Error messages or logs (if applicable)

If information is MISSING or UNCLEAR:
- Ask specific, numbered questions to get the missing details
- Be friendly and professional
- Keep questions concise (max 3-4 questions per response)
- Start with "Thanks for reporting this!"

If the information is SUFFICIENT:
- Start your response with exactly: [TRIAGE_COMPLETE]
- Then provide a structured summary with:
  - **Title**: A clear, concise title
  - **Category**: One of: SSH Remote Connection, SFTP, Vault, AI Assistant, General, Other
  - **Priority**: low, medium, high, or urgent
  - **Summary**: 2-3 sentence summary of the issue
  - **Steps to Reproduce**: Numbered steps
  - **Expected Behavior**: What should happen
  - **Actual Behavior**: What actually happens

Keep your tone helpful and empathetic. The user is reporting a problem they encountered.`;

const SYSTEM_PROMPT_IDEA = `You are an AI triage assistant for DeepTerm, a professional SSH client platform.

Your job is to review incoming feature ideas/requests and ensure they are well-defined enough for the product team to evaluate.

When reviewing an idea, check for:
1. Clear description of what the user wants
2. The problem it solves or use case
3. How they envision it working

If the idea is VAGUE or needs clarification:
- Ask specific, numbered questions to flesh out the idea
- Be enthusiastic and encouraging
- Keep questions concise (max 3 questions per response)
- Start with "Great idea! Let me ask a few questions to better understand your vision."

If the idea is WELL-DEFINED:
- Start your response with exactly: [TRIAGE_COMPLETE]
- Then provide a structured summary with:
  - **Title**: A clear, concise feature title
  - **Category**: feature, improvement, or integration
  - **Impact**: How many users would benefit (few, some, many, all)
  - **Summary**: 2-3 sentence summary of the feature
  - **User Story**: "As a [user type], I want [feature] so that [benefit]"
  - **Acceptance Criteria**: Bullet list of what "done" looks like

Keep your tone positive and collaborative.`;

/**
 * Triage a newly created issue. Called fire-and-forget after issue creation.
 */
export async function triageIssue(issueId: string): Promise<void> {
  try {
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        title: true,
        description: true,
        area: true,
        userId: true,
        user: { select: { name: true, email: true } },
        attachments: { select: { originalFilename: true, kind: true } },
      },
    });

    if (!issue) return;

    const userMessage = buildIssueContext(issue);
    const response = await callAI('triage.review', SYSTEM_PROMPT_ISSUE, [
      { role: 'user', content: userMessage },
    ]);

    await prisma.issueUpdate.create({
      data: {
        issueId: issue.id,
        authorType: 'ai',
        authorEmail: 'ai-triage@deepterm.net',
        message: response.content,
        visibility: 'public',
      },
    });

    await prisma.issue.update({
      where: { id: issue.id },
      data: { updatedAt: new Date() },
    });

    // Send email + in-app notification if AI asked questions
    if (!response.content.startsWith('[TRIAGE_COMPLETE]')) {
      await notifyUser({
        userId: issue.userId,
        userName: issue.user.name || issue.user.email,
        userEmail: issue.user.email,
        type: 'ai_triage',
        title: `Follow-up on your issue: ${issue.title}`,
        message: response.content,
        sourceType: 'issue',
        sourceId: issue.id,
        linkUrl: `/dashboard/issues/${issue.id}`,
      });
      sendIssueReplyEmail({
        userName: issue.user.name || issue.user.email,
        userEmail: issue.user.email,
        issueTitle: issue.title,
        issueId: issue.id,
        replyMessage: response.content,
      }).catch(() => {});
    }

    console.log(`[AI Triage] Issue ${issueId} reviewed — ${response.content.startsWith('[TRIAGE_COMPLETE]') ? 'complete' : 'questions asked'}`);
  } catch (error) {
    console.error(`[AI Triage] Failed to triage issue ${issueId}:`, error);
  }
}

/**
 * Triage a newly created idea. Called fire-and-forget after idea creation.
 */
export async function triageIdea(ideaId: string): Promise<void> {
  try {
    const idea = await prisma.idea.findUnique({
      where: { id: ideaId },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        authorId: true,
        author: { select: { name: true, email: true } },
      },
    });

    if (!idea) return;

    const userMessage = `New feature idea submitted:\n\nTitle: ${idea.title}\nCategory: ${idea.category}\n\nDescription:\n${idea.description}`;
    const response = await callAI('triage.review', SYSTEM_PROMPT_IDEA, [
      { role: 'user', content: userMessage },
    ]);

    await prisma.ideaComment.create({
      data: {
        ideaId: idea.id,
        authorType: 'ai',
        authorName: 'DeepTerm AI',
        authorEmail: 'ai-triage@deepterm.net',
        message: response.content,
        visibility: 'public',
      },
    });

    // Send email + in-app notification if AI asked questions
    if (!response.content.startsWith('[TRIAGE_COMPLETE]')) {
      await notifyUser({
        userId: idea.authorId,
        userName: idea.author.name || idea.author.email,
        userEmail: idea.author.email,
        type: 'ai_triage',
        title: `Follow-up on your idea: ${idea.title}`,
        message: response.content,
        sourceType: 'idea',
        sourceId: idea.id,
        linkUrl: `/dashboard/ideas/${idea.id}`,
      });
      sendIdeaReplyEmail({
        userName: idea.author.name || idea.author.email,
        userEmail: idea.author.email,
        ideaTitle: idea.title,
        ideaId: idea.id,
        replyMessage: response.content,
      }).catch(() => {});
    }

    console.log(`[AI Triage] Idea ${ideaId} reviewed — ${response.content.startsWith('[TRIAGE_COMPLETE]') ? 'complete' : 'questions asked'}`);
  } catch (error) {
    console.error(`[AI Triage] Failed to triage idea ${ideaId}:`, error);
  }
}

/**
 * Continue triage conversation after user replies to an issue.
 * Called when user posts a comment on an issue that has active AI triage.
 */
export async function continueIssueTriage(issueId: string): Promise<void> {
  try {
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        title: true,
        description: true,
        area: true,
        userId: true,
        user: { select: { name: true, email: true } },
        attachments: { select: { originalFilename: true, kind: true } },
        updates: {
          where: { visibility: 'public' },
          select: { authorType: true, message: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!issue) return;

    // Check if there's an AI message in the conversation (triage is active)
    const hasAiMessage = issue.updates.some((u) => u.authorType === 'ai');
    if (!hasAiMessage) return;

    // Check if triage is already complete
    const lastAiMessage = [...issue.updates].reverse().find((u) => u.authorType === 'ai');
    if (lastAiMessage?.message.startsWith('[TRIAGE_COMPLETE]')) return;

    // Check the last message is from the user (don't respond to our own messages)
    const lastMessage = issue.updates[issue.updates.length - 1];
    if (lastMessage?.authorType !== 'user') return;

    // Build conversation history
    const messages = buildConversationHistory(issue);
    const response = await callAI('triage.review', SYSTEM_PROMPT_ISSUE, messages);

    await prisma.issueUpdate.create({
      data: {
        issueId: issue.id,
        authorType: 'ai',
        authorEmail: 'ai-triage@deepterm.net',
        message: response.content,
        visibility: 'public',
      },
    });

    await prisma.issue.update({
      where: { id: issue.id },
      data: { updatedAt: new Date() },
    });

    // Notify user of AI follow-up
    if (!response.content.startsWith('[TRIAGE_COMPLETE]')) {
      await notifyUser({
        userId: issue.userId,
        userName: issue.user.name || issue.user.email,
        userEmail: issue.user.email,
        type: 'ai_triage',
        title: `Follow-up on your issue: ${issue.title}`,
        message: response.content,
        sourceType: 'issue',
        sourceId: issue.id,
        linkUrl: `/dashboard/issues/${issue.id}`,
      });
      sendIssueReplyEmail({
        userName: issue.user.name || issue.user.email,
        userEmail: issue.user.email,
        issueTitle: issue.title,
        issueId: issue.id,
        replyMessage: response.content,
      }).catch(() => {});
    }

    console.log(`[AI Triage] Issue ${issueId} follow-up — ${response.content.startsWith('[TRIAGE_COMPLETE]') ? 'complete' : 'more questions'}`);
  } catch (error) {
    console.error(`[AI Triage] Failed to continue issue triage ${issueId}:`, error);
  }
}

/**
 * Continue triage conversation after user replies on an idea.
 */
export async function continueIdeaTriage(ideaId: string): Promise<void> {
  try {
    const idea = await prisma.idea.findUnique({
      where: { id: ideaId },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        authorId: true,
        author: { select: { name: true, email: true } },
        comments: {
          where: { visibility: 'public' },
          select: { authorType: true, message: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!idea) return;

    // Check if AI triage is active
    const hasAiComment = idea.comments.some((c) => c.authorType === 'ai');
    if (!hasAiComment) return;

    // Check if triage already complete
    const lastAiComment = [...idea.comments].reverse().find((c) => c.authorType === 'ai');
    if (lastAiComment?.message.startsWith('[TRIAGE_COMPLETE]')) return;

    // Don't respond to our own messages
    const lastComment = idea.comments[idea.comments.length - 1];
    if (lastComment?.authorType !== 'user') return;

    // Build conversation
    const initialContext = `New feature idea submitted:\n\nTitle: ${idea.title}\nCategory: ${idea.category}\n\nDescription:\n${idea.description}`;
    const messages = [
      { role: 'user' as const, content: initialContext },
      ...idea.comments.map((c) => ({
        role: (c.authorType === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: c.message,
      })),
    ];

    const response = await callAI('triage.review', SYSTEM_PROMPT_IDEA, messages);

    await prisma.ideaComment.create({
      data: {
        ideaId: idea.id,
        authorType: 'ai',
        authorName: 'DeepTerm AI',
        authorEmail: 'ai-triage@deepterm.net',
        message: response.content,
        visibility: 'public',
      },
    });

    // Notify user of AI follow-up
    if (!response.content.startsWith('[TRIAGE_COMPLETE]')) {
      await notifyUser({
        userId: idea.authorId,
        userName: idea.author.name || idea.author.email,
        userEmail: idea.author.email,
        type: 'ai_triage',
        title: `Follow-up on your idea: ${idea.title}`,
        message: response.content,
        sourceType: 'idea',
        sourceId: idea.id,
        linkUrl: `/dashboard/ideas/${idea.id}`,
      });
      sendIdeaReplyEmail({
        userName: idea.author.name || idea.author.email,
        userEmail: idea.author.email,
        ideaTitle: idea.title,
        ideaId: idea.id,
        replyMessage: response.content,
      }).catch(() => {});
    }

    console.log(`[AI Triage] Idea ${ideaId} follow-up — ${response.content.startsWith('[TRIAGE_COMPLETE]') ? 'complete' : 'more questions'}`);
  } catch (error) {
    console.error(`[AI Triage] Failed to continue idea triage ${ideaId}:`, error);
  }
}

// ── Helpers ──────────────────────────────────────

function buildIssueContext(issue: {
  title: string;
  description: string;
  area: string;
  attachments: { originalFilename: string; kind: string }[];
}): string {
  const parts = [
    `New bug report submitted:`,
    `\nTitle: ${issue.title}`,
    `Area: ${issue.area}`,
    `\nDescription:\n${issue.description}`,
  ];

  if (issue.attachments.length > 0) {
    parts.push(`\nAttachments: ${issue.attachments.map((a) => `${a.originalFilename} (${a.kind})`).join(', ')}`);
  }

  return parts.join('\n');
}

function buildConversationHistory(issue: {
  title: string;
  description: string;
  area: string;
  attachments: { originalFilename: string; kind: string }[];
  updates: { authorType: string; message: string }[];
}): { role: 'user' | 'assistant'; content: string }[] {
  const initialContext = buildIssueContext(issue);
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: initialContext },
  ];

  for (const update of issue.updates) {
    // Skip the initial "Issue submitted." system message
    if (update.message === 'Issue submitted.') continue;

    if (update.authorType === 'ai') {
      messages.push({ role: 'assistant', content: update.message });
    } else if (update.authorType === 'user') {
      messages.push({ role: 'user', content: update.message });
    }
    // Skip admin messages in AI conversation
  }

  return messages;
}

/**
 * Create an in-app notification for a user.
 */
async function notifyUser(params: {
  userId: string;
  userName: string;
  userEmail: string;
  type: string;
  title: string;
  message: string;
  sourceType: string;
  sourceId: string;
  linkUrl: string;
}): Promise<void> {
  try {
    await prisma.userNotification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message.substring(0, 500),
        linkUrl: params.linkUrl,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
      },
    });
  } catch (error) {
    console.error('[Notification] Failed to create notification:', error);
  }
}
