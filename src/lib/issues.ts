import path from 'path';

export type IssueArea =
  | 'General'
  | 'SSH Remote Connection'
  | 'SFTP'
  | 'Vault'
  | 'AI Assistant'
  | 'Other';

export const ISSUE_AREAS: IssueArea[] = [
  'General',
  'SSH Remote Connection',
  'SFTP',
  'Vault',
  'AI Assistant',
  'Other',
];

export type IssueStatus = 'open' | 'in_progress' | 'waiting_on_user' | 'resolved' | 'closed';

export const ISSUE_STATUSES: IssueStatus[] = [
  'open',
  'in_progress',
  'waiting_on_user',
  'resolved',
  'closed',
];

export function normalizeIssueArea(input: string | null | undefined): IssueArea {
  const v = (input || '').trim();
  const match = ISSUE_AREAS.find((a) => a.toLowerCase() === v.toLowerCase());
  return match || 'General';
}

export function normalizeIssueStatus(input: string | null | undefined): IssueStatus {
  const v = (input || '').trim().toLowerCase();
  const match = ISSUE_STATUSES.find((s) => s === v);
  return match || 'open';
}

export function getIssuesStorageDir(): string {
  return (
    process.env.DEEPTERM_ISSUES_DIR ||
    path.join(process.cwd(), 'data', 'issues')
  );
}

export function safePathSegment(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed.replace(/[^a-zA-Z0-9._-]/g, '_') : 'unknown';
}
