/**
 * lib/ms-teams.ts
 *
 * MS Teams webhook integration for DeepTerm notifications.
 * Sends Adaptive Card messages to a Teams channel via incoming webhook.
 *
 * Setup:
 *   1. In MS Teams, go to a channel > Connectors > Incoming Webhook
 *   2. Copy the webhook URL
 *   3. Set MS_TEAMS_WEBHOOK_URL in your environment
 *
 * Usage:
 *   import { notifyTeams, notifyTeamsOrgEvent } from '@/lib/ms-teams';
 *   await notifyTeams('member_joined', { ... });
 */

const MS_TEAMS_WEBHOOK_URL = process.env.MS_TEAMS_WEBHOOK_URL || '';

type TeamsEventType =
  | 'member_joined'
  | 'member_left'
  | 'member_invited'
  | 'terminal_shared'
  | 'audio_call_started'
  | 'chat_message'
  | 'build_status'
  | 'security_alert';

interface TeamsNotificationBase {
  orgName?: string;
  teamName?: string;
}

interface MemberEventPayload extends TeamsNotificationBase {
  email: string;
  role?: string;
  invitedBy?: string;
}

interface TerminalSharedPayload extends TeamsNotificationBase {
  ownerEmail: string;
  sessionName: string;
  participantCount?: number;
}

interface AudioCallPayload extends TeamsNotificationBase {
  starterEmail: string;
  roomName: string;
  participantCount?: number;
}

interface ChatMessagePayload extends TeamsNotificationBase {
  senderEmail: string;
  channelName: string;
  messagePreview: string;
}

interface BuildStatusPayload extends TeamsNotificationBase {
  status: 'success' | 'failure';
  repo: string;
  branch?: string;
  commitMessage?: string;
  url?: string;
}

interface SecurityAlertPayload extends TeamsNotificationBase {
  severity: 'low' | 'medium' | 'high' | 'critical';
  eventType: string;
  details?: string;
}

type PayloadMap = {
  member_joined: MemberEventPayload;
  member_left: MemberEventPayload;
  member_invited: MemberEventPayload;
  terminal_shared: TerminalSharedPayload;
  audio_call_started: AudioCallPayload;
  chat_message: ChatMessagePayload;
  build_status: BuildStatusPayload;
  security_alert: SecurityAlertPayload;
};

// Color mapping for event types
const EVENT_COLORS: Record<TeamsEventType, string> = {
  member_joined: 'Good',      // green
  member_left: 'Warning',     // yellow
  member_invited: 'Accent',   // blue
  terminal_shared: 'Good',
  audio_call_started: 'Accent',
  chat_message: 'Default',
  build_status: 'Default',    // set dynamically
  security_alert: 'Attention', // red
};

const EVENT_ICONS: Record<TeamsEventType, string> = {
  member_joined: '👋',
  member_left: '👤',
  member_invited: '📧',
  terminal_shared: '🖥️',
  audio_call_started: '🎙️',
  chat_message: '💬',
  build_status: '🔨',
  security_alert: '🔒',
};

const EVENT_TITLES: Record<TeamsEventType, string> = {
  member_joined: 'Member Joined',
  member_left: 'Member Left',
  member_invited: 'New Invitation Sent',
  terminal_shared: 'Terminal Session Shared',
  audio_call_started: 'Audio Call Started',
  chat_message: 'New Message',
  build_status: 'Build Status',
  security_alert: 'Security Alert',
};

/**
 * Build an Adaptive Card payload for MS Teams webhook.
 */
function buildAdaptiveCard<T extends TeamsEventType>(
  type: T,
  payload: PayloadMap[T],
): Record<string, unknown> {
  const facts: { title: string; value: string }[] = [];
  let color = EVENT_COLORS[type];

  // Build facts based on event type
  switch (type) {
    case 'member_joined':
    case 'member_left':
    case 'member_invited': {
      const p = payload as MemberEventPayload;
      facts.push({ title: 'Email', value: p.email });
      if (p.role) facts.push({ title: 'Role', value: p.role });
      if (p.invitedBy) facts.push({ title: 'Invited by', value: p.invitedBy });
      break;
    }
    case 'terminal_shared': {
      const p = payload as TerminalSharedPayload;
      facts.push({ title: 'Session', value: p.sessionName });
      facts.push({ title: 'Owner', value: p.ownerEmail });
      if (p.participantCount !== undefined) {
        facts.push({ title: 'Participants', value: String(p.participantCount) });
      }
      break;
    }
    case 'audio_call_started': {
      const p = payload as AudioCallPayload;
      facts.push({ title: 'Room', value: p.roomName });
      facts.push({ title: 'Started by', value: p.starterEmail });
      if (p.participantCount !== undefined) {
        facts.push({ title: 'Participants', value: String(p.participantCount) });
      }
      break;
    }
    case 'chat_message': {
      const p = payload as ChatMessagePayload;
      facts.push({ title: 'Channel', value: `#${p.channelName}` });
      facts.push({ title: 'From', value: p.senderEmail });
      facts.push({ title: 'Message', value: p.messagePreview });
      break;
    }
    case 'build_status': {
      const p = payload as BuildStatusPayload;
      color = p.status === 'success' ? 'Good' : 'Attention';
      facts.push({ title: 'Status', value: p.status === 'success' ? 'Success' : 'Failed' });
      facts.push({ title: 'Repository', value: p.repo });
      if (p.branch) facts.push({ title: 'Branch', value: p.branch });
      if (p.commitMessage) facts.push({ title: 'Commit', value: p.commitMessage });
      break;
    }
    case 'security_alert': {
      const p = payload as SecurityAlertPayload;
      color = p.severity === 'critical' || p.severity === 'high' ? 'Attention' : 'Warning';
      facts.push({ title: 'Severity', value: p.severity.toUpperCase() });
      facts.push({ title: 'Event', value: p.eventType });
      if (p.details) facts.push({ title: 'Details', value: p.details });
      break;
    }
  }

  // Add org/team context if present
  const base = payload as TeamsNotificationBase;
  if (base.orgName) facts.push({ title: 'Organization', value: base.orgName });
  if (base.teamName) facts.push({ title: 'Team', value: base.teamName });

  // Build the Adaptive Card (MS Teams webhook format)
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: `${EVENT_ICONS[type]} **${EVENT_TITLES[type]}**`,
              size: 'Medium',
              weight: 'Bolder',
              color: color,
            },
            {
              type: 'FactSet',
              facts: facts.map(f => ({ title: f.title, value: f.value })),
            },
            {
              type: 'TextBlock',
              text: `DeepTerm • ${new Date().toLocaleString()}`,
              size: 'Small',
              isSubtle: true,
            },
          ],
        },
      },
    ],
  };
}

/**
 * Send a notification to MS Teams via incoming webhook.
 * Fire-and-forget by default. Returns result if options.wait is true.
 */
export async function notifyTeams<T extends TeamsEventType>(
  type: T,
  payload: PayloadMap[T],
  options?: { wait?: boolean; timeoutMs?: number; webhookUrl?: string },
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = options?.webhookUrl || MS_TEAMS_WEBHOOK_URL;
  if (!url) {
    return { ok: false, error: 'MS_TEAMS_WEBHOOK_URL not configured' };
  }

  const timeout = options?.timeoutMs ?? 5000;
  const card = buildAdaptiveCard(type, payload);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!options?.wait) {
      return { ok: response.ok, status: response.status };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, status: response.status, error: text };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ms-teams] Failed to notify ${type}: ${message}`);
    return { ok: false, error: message };
  }
}

// -- Convenience wrappers --

export function notifyTeamsMemberJoined(member: {
  email: string;
  role?: string;
  orgName?: string;
}) {
  return notifyTeams('member_joined', {
    email: member.email,
    role: member.role,
    orgName: member.orgName,
  });
}

export function notifyTeamsMemberInvited(invite: {
  email: string;
  invitedBy: string;
  orgName?: string;
}) {
  return notifyTeams('member_invited', {
    email: invite.email,
    invitedBy: invite.invitedBy,
    orgName: invite.orgName,
  });
}

export function notifyTeamsTerminalShared(session: {
  ownerEmail: string;
  sessionName: string;
  participantCount?: number;
  orgName?: string;
}) {
  return notifyTeams('terminal_shared', {
    ownerEmail: session.ownerEmail,
    sessionName: session.sessionName,
    participantCount: session.participantCount,
    orgName: session.orgName,
  });
}

export function notifyTeamsAudioCall(call: {
  starterEmail: string;
  roomName: string;
  participantCount?: number;
  orgName?: string;
}) {
  return notifyTeams('audio_call_started', {
    starterEmail: call.starterEmail,
    roomName: call.roomName,
    participantCount: call.participantCount,
    orgName: call.orgName,
  });
}

export function notifyTeamsBuildStatus(build: BuildStatusPayload) {
  return notifyTeams('build_status', build);
}

export function notifyTeamsSecurityAlert(alert: SecurityAlertPayload) {
  return notifyTeams('security_alert', alert);
}

/**
 * Check if MS Teams webhook is configured.
 */
export function isTeamsConfigured(): boolean {
  return !!MS_TEAMS_WEBHOOK_URL;
}
