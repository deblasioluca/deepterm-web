# LLM Email Integration Proposal

**Author:** Devin AI  
**Date:** March 28, 2026  
**Status:** Proposal  

---

## Executive Summary

This proposal outlines how DeepTerm can leverage its existing LLM infrastructure to intelligently handle incoming emails — auto-classifying, drafting responses, and taking actions based on email content. The system would integrate with ImprovMX forwarding and the existing admin AI panel.

---

## Architecture Overview

```
Incoming Email
    │
    ▼
ImprovMX (forwarding)
    │
    ▼
Gmail Inbox (lucadeblasio1972@gmail.com)
    │
    ▼
Gmail API Webhook / Polling Service
    │
    ▼
┌─────────────────────────────────────┐
│  Email Ingestion Service            │
│  (Next.js API route or worker)      │
│                                     │
│  1. Parse email (from, subject,     │
│     body, attachments, thread ID)   │
│  2. Store in EmailMessage table     │
│  3. Trigger LLM classification      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  LLM Classification & Triage       │
│  (reuse admin-ai infrastructure)   │
│                                     │
│  Classify into:                     │
│  - support_request                  │
│  - bug_report                       │
│  - feature_request                  │
│  - billing_inquiry                  │
│  - partnership_inquiry              │
│  - spam                             │
│  - personal                         │
│                                     │
│  Extract:                           │
│  - Priority (P0-P3)                 │
│  - Sentiment (positive/neutral/neg) │
│  - User account (match by email)    │
│  - Action items                     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Action Router                      │
│                                     │
│  Based on classification:           │
│  - Draft response (LLM)            │
│  - Create Issue (auto)             │
│  - Create Idea (auto)              │
│  - Link to user account            │
│  - Escalate to admin               │
│  - Auto-reply (templated)          │
│  - Mark as spam (archive)          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Admin Email Dashboard              │
│  (extend /admin/email)              │
│                                     │
│  - Inbox view with classifications  │
│  - Draft responses (edit & send)    │
│  - One-click actions                │
│  - Thread view                      │
│  - Analytics (response time, etc.)  │
└─────────────────────────────────────┘
```

---

## Phase 1: Email Ingestion & Classification

### 1.1 Gmail API Integration

Use the Gmail API to poll or receive push notifications for new emails arriving at the forwarding address.

**Option A — Polling (simpler, recommended for MVP):**
- A scheduled task (cron / Airflow DAG) polls Gmail every 2-5 minutes
- Uses `gmail.users.messages.list` with `after:` query
- Stores processed message IDs to avoid duplicates

**Option B — Push Notifications (production):**
- Gmail Pub/Sub push to a webhook endpoint
- Real-time processing
- Requires Google Cloud Pub/Sub setup

### 1.2 Database Schema

```prisma
model EmailMessage {
  id              String    @id @default(cuid())
  gmailMessageId  String    @unique
  threadId        String?
  from            String
  to              String
  subject         String
  bodyText        String
  bodyHtml        String?
  receivedAt      DateTime
  classification  String?   // support_request, bug_report, etc.
  priority        String?   // P0, P1, P2, P3
  sentiment       String?   // positive, neutral, negative
  status          String    @default("unread") // unread, read, replied, archived, spam
  linkedUserId    String?   // FK to ZKUser if matched
  linkedIssueId   String?   // FK to Issue if auto-created
  linkedIdeaId    String?   // FK to Idea if auto-created
  draftResponse   String?   // LLM-generated draft
  actualResponse  String?   // What was actually sent
  respondedAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  linkedUser      ZKUser?   @relation(fields: [linkedUserId], references: [id])
}
```

### 1.3 LLM Classification Prompt

Reuse the existing `admin-ai` infrastructure (`src/lib/admin-ai/chat.ts`):

```
You are an email classifier for DeepTerm, a professional SSH client platform.

Classify the following email into one of these categories:
- support_request: User needs help with the product
- bug_report: User is reporting a bug or issue
- feature_request: User is suggesting a new feature
- billing_inquiry: Questions about subscriptions, payments, refunds
- partnership_inquiry: Business partnership, press, integration requests
- spam: Unsolicited commercial email
- personal: Personal correspondence for the founder

Also extract:
- Priority: P0 (critical/urgent), P1 (important), P2 (normal), P3 (low)
- Sentiment: positive, neutral, negative
- Action items: List of concrete actions needed

Email:
From: {from}
Subject: {subject}
Body: {body}

Respond in JSON format.
```

---

## Phase 2: Auto-Response Drafting

### 2.1 Context-Aware Response Generation

The LLM drafts responses using contextual information:

1. **User context** — If the sender matches a registered user, include their:
   - Account status (free/pro/business)
   - Organization memberships
   - Recent issues/ideas submitted
   - Subscription status

2. **Knowledge base** — Feed the LLM relevant documentation sections from `docs-data.ts` based on the email classification

3. **Previous interactions** — Include the email thread history for continuity

4. **Response templates** — Category-specific templates:
   - Support: Acknowledge, provide solution steps, offer escalation
   - Bug report: Acknowledge, ask for reproduction steps, link to issue tracker
   - Feature request: Thank, explain evaluation process, link to idea board
   - Billing: Acknowledge, provide relevant billing info, link to subscription page

### 2.2 Response Draft API

```typescript
// POST /api/admin/email/draft
export async function POST(request: Request) {
  const { messageId } = await request.json();
  const email = await prisma.emailMessage.findUnique({ where: { id: messageId } });
  
  // Build context
  const userContext = email.linkedUserId 
    ? await getUserContext(email.linkedUserId) 
    : null;
  const relevantDocs = await searchDocs(email.classification, email.subject);
  const threadHistory = await getThreadHistory(email.threadId);
  
  // Generate draft via existing admin AI
  const draft = await generateEmailResponse({
    email,
    userContext,
    relevantDocs,
    threadHistory,
  });
  
  // Store draft
  await prisma.emailMessage.update({
    where: { id: messageId },
    data: { draftResponse: draft },
  });
  
  return NextResponse.json({ draft });
}
```

---

## Phase 3: Automated Actions

### 3.1 Action Types

| Classification | Auto-Action | Requires Approval |
|---------------|-------------|-------------------|
| `bug_report` | Create Issue in database | No (auto) |
| `feature_request` | Create Idea in database | No (auto) |
| `support_request` | Draft response + assign priority | Yes (admin reviews draft) |
| `billing_inquiry` | Draft response + link to billing | Yes (admin reviews draft) |
| `partnership_inquiry` | Forward to founder + draft ack | Yes |
| `spam` | Archive silently | No (auto) |
| `personal` | No action, flag for founder | No |

### 3.2 Issue/Idea Auto-Creation

When a `bug_report` email arrives:
```typescript
// Auto-create an Issue
const issue = await prisma.issue.create({
  data: {
    title: extractedTitle,
    description: email.bodyText,
    status: 'open',
    priority: classification.priority,
    source: 'email',
    sourceEmailId: email.id,
    userId: email.linkedUserId,
  },
});
```

### 3.3 Email Sending

Use the existing `src/lib/email.ts` Nodemailer infrastructure to send responses:
```typescript
// Send response from support@deepterm.net
await transporter.sendMail({
  from: '"DeepTerm Support" <support@deepterm.net>',
  to: email.from,
  subject: `Re: ${email.subject}`,
  inReplyTo: email.gmailMessageId,
  references: email.threadId,
  html: approvedResponse,
});
```

---

## Phase 4: Admin Dashboard Extension

### 4.1 New Admin Email Tabs

Extend the existing `/admin/email` page with additional tabs:

1. **Inbox** — All incoming emails with classification badges, priority indicators
2. **Drafts** — LLM-generated response drafts awaiting approval
3. **Sent** — Sent responses with thread view
4. **Analytics** — Response time metrics, classification distribution, volume trends
5. **Aliases** — Existing alias management (already built)
6. **Logs** — Existing delivery logs (already built)

### 4.2 Inbox UI Features

- Color-coded priority badges (P0 red, P1 orange, P2 blue, P3 gray)
- Classification tags with icons
- One-click "Send Draft" button
- Edit draft inline before sending
- "Create Issue" / "Create Idea" quick actions
- Thread grouping
- Search and filter by classification, priority, date, sender

---

## Phase 5: macOS App Integration (Future)

### 5.1 In-App Email Notifications

The macOS app could display email-related notifications:
- New support request assigned
- Draft ready for review
- Response sent confirmation

### 5.2 Quick Reply from App

Using the existing collaboration WebSocket infrastructure, admins could:
- View email summary in the app
- Approve/edit/send drafts from the app
- Get real-time notifications of new emails

---

## Implementation Roadmap

| Phase | Effort | Dependencies | Priority |
|-------|--------|-------------|----------|
| 1. Ingestion & Classification | 2-3 days | Gmail API credentials, LLM API key | High |
| 2. Response Drafting | 1-2 days | Phase 1 | High |
| 3. Automated Actions | 1-2 days | Phase 1 | Medium |
| 4. Dashboard Extension | 2-3 days | Phases 1-3 | Medium |
| 5. macOS Integration | 3-5 days | Phase 4 | Low |

**Total estimated effort:** 9-15 days

---

## Environment Variables Required

```env
# Gmail API (for email ingestion)
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=

# Already configured
IMPROVMX_API_KEY=         # Alias management
SMTP_HOST=                # Outbound email
SMTP_USER=                # Gmail SMTP user
SMTP_PASSWORD=            # Gmail app password
ADMIN_ALERT_EMAIL=        # Admin notifications
```

---

## Security Considerations

1. **Email content is sensitive** — store encrypted at rest, restrict access to admin panel
2. **LLM context** — do not send user credentials or vault data to the LLM, only email metadata and body
3. **Auto-actions** — support requests and billing inquiries always require human approval before sending
4. **Rate limiting** — limit auto-classification to prevent API cost spikes
5. **Spam filtering** — auto-archive spam without LLM processing to save costs
6. **Audit trail** — log all email actions (classify, draft, send, archive) for accountability

---

## Cost Estimate

| Component | Monthly Cost (estimated) |
|-----------|------------------------|
| Gmail API | Free (under quota) |
| LLM API (classification) | ~$5-15 (depends on volume) |
| LLM API (response drafting) | ~$10-30 (depends on volume) |
| ImprovMX | Free tier |
| **Total** | **~$15-45/month** |

---

## Summary

This proposal leverages DeepTerm's existing infrastructure:
- **ImprovMX** for email forwarding (already set up)
- **Admin AI panel** for LLM integration (already built)
- **Nodemailer** for sending emails (already configured)
- **Admin panel** for email management UI (already started with alias management)

The key addition is a Gmail API integration layer for ingestion and an LLM classification pipeline that routes emails to the right actions. The admin always retains final approval for outbound responses.
