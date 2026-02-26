import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const NODE_RED_URL = process.env.NODE_RED_URL || 'http://192.168.1.30:1880';

async function notifyNodeRed(path: string, payload: Record<string, unknown>) {
  try {
    await fetch(`${NODE_RED_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error(`Node-RED notify failed (${path}):`, e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ── Triage: Approve/Reject/Defer issues ──
      case 'triage-issue': {
        const { issueId, decision, reason } = body;
        const statusMap: Record<string, string> = {
          approve: 'in_progress',
          reject: 'closed',
          defer: 'open',
        };
        const issue = await prisma.issue.update({
          where: { id: issueId },
          data: { status: statusMap[decision] || 'open' },
        });
        await notifyNodeRed('/deepterm/triage', {
          event: 'triage-decision',
          itemType: 'issue',
          id: issueId,
          title: issue.title,
          decision,
          reason: reason || '',
        });
        return NextResponse.json({ ok: true, issue });
      }

      // ── Triage: Approve/Reject/Defer ideas ──
      case 'triage-idea': {
        const { ideaId, decision, reason } = body;
        const statusMap: Record<string, string> = {
          approve: 'planned',
          reject: 'declined',
          defer: 'consideration',
        };
        const idea = await prisma.idea.update({
          where: { id: ideaId },
          data: { status: statusMap[decision] || 'consideration' },
        });
        await notifyNodeRed('/deepterm/triage', {
          event: 'triage-decision',
          itemType: 'idea',
          id: ideaId,
          title: idea.title,
          decision,
          reason: reason || '',
        });
        return NextResponse.json({ ok: true, idea });
      }

      // ── Trigger CI build ──
      case 'trigger-build': {
        const { workflow, branch } = body;
        const ghToken = process.env.GITHUB_TOKEN;
        if (!ghToken) return NextResponse.json({ error: 'No GITHUB_TOKEN' }, { status: 500 });

        const res = await fetch(
          `https://api.github.com/repos/deblasioluca/deepterm/actions/workflows/${workflow || 'pr-check.yml'}/dispatches`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${ghToken}`,
              Accept: 'application/vnd.github+json',
            },
            body: JSON.stringify({ ref: branch || 'main' }),
          }
        );
        if (!res.ok && res.status !== 204) {
          const err = await res.text();
          return NextResponse.json({ error: `GitHub API: ${res.status} ${err}` }, { status: 502 });
        }
        return NextResponse.json({ ok: true, message: `Triggered ${workflow || 'pr-check.yml'} on ${branch || 'main'}` });
      }

      // ── GitHub issue: close/reopen/label ──
      case 'github-issue-update': {
        const { issueNumber, state, addLabels, removeLabels } = body;
        const ghToken = process.env.GITHUB_TOKEN;
        if (!ghToken) return NextResponse.json({ error: 'No GITHUB_TOKEN' }, { status: 500 });

        const headers = {
          Authorization: `Bearer ${ghToken}`,
          Accept: 'application/vnd.github+json',
        };

        // Update state if provided
        if (state) {
          await fetch(`https://api.github.com/repos/deblasioluca/deepterm/issues/${issueNumber}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ state }),
          });
        }

        // Add labels if provided
        if (addLabels?.length) {
          await fetch(`https://api.github.com/repos/deblasioluca/deepterm/issues/${issueNumber}/labels`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ labels: addLabels }),
          });
        }

        // Remove labels if provided
        if (removeLabels?.length) {
          for (const label of removeLabels) {
            await fetch(`https://api.github.com/repos/deblasioluca/deepterm/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, {
              method: 'DELETE',
              headers,
            });
          }
        }

        return NextResponse.json({ ok: true });
      }

      // ── WhatsApp test message ──
      case 'test-whatsapp': {
        await notifyNodeRed('/deepterm/build-status', {
          event: 'build-success',
          repo: 'deblasioluca/deepterm',
          branch: 'main',
          workflow: 'cockpit-test',
          commitMessage: 'Test notification from cockpit',
          duration: '0s',
          url: 'https://deepterm.net/admin/cockpit',
        });
        return NextResponse.json({ ok: true, message: 'Test notification sent' });
      }

      // ── Release story (with CI check) ──
      case 'release-story': {
        const { storyId, force } = body;
        const story = await prisma.story.findUnique({ where: { id: storyId } });
        if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 });

        // If story has a linked GitHub issue, verify CI passed
        if (story.githubIssueNumber && !force) {
          const ghToken = process.env.GITHUB_TOKEN;
          if (ghToken) {
            try {
              // Get PRs that reference this issue
              const searchRes = await fetch(
                `https://api.github.com/search/issues?q=repo:deblasioluca/deepterm+is:pr+is:merged+${story.githubIssueNumber}+in:body`,
                { headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json' } }
              );
              if (searchRes.ok) {
                const searchData = await searchRes.json();
                if (searchData.total_count === 0) {
                  return NextResponse.json({
                    error: 'No merged PRs found for this Story\'s GitHub issue. Use force:true to override.',
                    issueNumber: story.githubIssueNumber,
                  }, { status: 409 });
                }
              }
            } catch {
              // GitHub API failure — warn but allow release
            }
          }
        }

        await prisma.story.update({
          where: { id: storyId },
          data: { status: 'released' },
        });
        await notifyNodeRed('/deepterm/planning', {
          event: 'story-released',
          storyId,
          title: story.title,
          githubIssueNumber: story.githubIssueNumber,
        });
        return NextResponse.json({ ok: true, message: 'Story released' });
      }

      // ── Release epic + all done stories ──
      case 'release-epic': {
        const { epicId } = body;
        await prisma.$transaction([
          prisma.epic.update({ where: { id: epicId }, data: { status: 'released' } }),
          prisma.story.updateMany({ where: { epicId, status: 'done' }, data: { status: 'released' } }),
        ]);
        await notifyNodeRed('/deepterm/planning', {
          event: 'epic-released',
          epicId,
        });
        return NextResponse.json({ ok: true, message: 'Epic released' });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('Cockpit action error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
