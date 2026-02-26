import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai-client';

export const dynamic = 'force-dynamic';

// GET: Look up existing report by storyId or epicId
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storyId = searchParams.get('storyId');
    const epicId = searchParams.get('epicId');

    if (!storyId && !epicId) {
      return NextResponse.json({ error: 'storyId or epicId required' }, { status: 400 });
    }

    const report = await prisma.implementationReport.findUnique({
      where: storyId ? { storyId } : { epicId: epicId! },
    });

    if (!report) {
      return NextResponse.json(null);
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error('Report lookup error:', error);
    return NextResponse.json({ error: 'Failed to look up report' }, { status: 500 });
  }
}

// POST: Auto-generate an implementation report from GitHub PRs
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { storyId, epicId } = body;

    if (!storyId && !epicId) {
      return NextResponse.json({ error: 'storyId or epicId required' }, { status: 400 });
    }

    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) {
      return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 500 });
    }

    // Collect GitHub issue numbers
    const issueNumbers: number[] = [];
    let targetTitle = '';

    if (storyId) {
      const story = await prisma.story.findUnique({ where: { id: storyId } });
      if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 });
      targetTitle = story.title;
      if (story.githubIssueNumber) issueNumbers.push(story.githubIssueNumber);
    }

    if (epicId) {
      const epic = await prisma.epic.findUnique({
        where: { id: epicId },
        include: { stories: true },
      });
      if (!epic) return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
      targetTitle = epic.title;
      for (const s of epic.stories) {
        if (s.githubIssueNumber) issueNumbers.push(s.githubIssueNumber);
      }
    }

    if (issueNumbers.length === 0) {
      return NextResponse.json({
        error: 'No linked GitHub issues found — cannot auto-populate',
      }, { status: 422 });
    }

    // Fetch PRs that reference these issues
    const headers = {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
    };

    const allPRs: Array<{ number: number; title: string; url: string; state: string }> = [];
    const allFiles: string[] = [];

    for (const issueNum of issueNumbers) {
      // Search for PRs mentioning this issue
      const searchRes = await fetch(
        `https://api.github.com/search/issues?q=repo:deblasioluca/deepterm+is:pr+${issueNum}+in:body`,
        { headers }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        for (const item of searchData.items || []) {
          allPRs.push({
            number: item.number,
            title: item.title,
            url: item.html_url,
            state: item.state,
          });

          // Fetch PR files
          const filesRes = await fetch(
            `https://api.github.com/repos/deblasioluca/deepterm/pulls/${item.number}/files?per_page=100`,
            { headers }
          );
          if (filesRes.ok) {
            const files = await filesRes.json();
            for (const f of files) {
              allFiles.push(f.filename);
            }
          }
        }
      }
    }

    // Categorize files
    const testsAdded = allFiles.filter(f => (f.includes('test') || f.includes('Test') || f.includes('spec')) && !f.includes('node_modules'));
    const testsUpdated = allFiles.filter(f => (f.includes('.test.') || f.includes('.spec.')) && !testsAdded.includes(f));
    const docsUpdated = allFiles.filter(f => f.includes('Documentation/') || (f.endsWith('.md') && !f.includes('test')));
    const helpPagesUpdated = allFiles.filter(f => f.includes('help/') || f.includes('docs/') || f.includes('content/'));
    const uniqueFiles = Array.from(new Set(allFiles));
    const uniquePRs = allPRs.filter((pr, i) => allPRs.findIndex(p => p.number === pr.number) === i);

    // AI summary
    let summary = '';
    try {
      const aiResponse = await callAI(
        'reports.generate',
        'Summarize implementation changes for a report. Be concise and specific. 2-4 sentences.',
        [{
          role: 'user',
          content: `Target: ${targetTitle}\n\nPRs:\n${uniquePRs.map(p => `#${p.number}: ${p.title}`).join('\n')}\n\nFiles changed (${uniqueFiles.length}):\n${uniqueFiles.slice(0, 30).join('\n')}${uniqueFiles.length > 30 ? '\n... and more' : ''}\n\nSummarize what was implemented.`,
        }],
        { maxTokens: 1024 }
      );
      summary = aiResponse.content;
    } catch (err) {
      console.error('[Report] AI summary failed:', err);
      summary = `${uniquePRs.length} PRs, ${uniqueFiles.length} files changed.`;
    }

    // Upsert report
    const where = storyId ? { storyId } : { epicId: epicId! };
    const data = {
      status: 'complete',
      testsAdded: JSON.stringify(testsAdded),
      testsUpdated: JSON.stringify(testsUpdated),
      docsUpdated: JSON.stringify(docsUpdated),
      helpPagesUpdated: JSON.stringify(helpPagesUpdated),
      filesChanged: JSON.stringify(uniqueFiles),
      prNumbers: JSON.stringify(uniquePRs),
      summary,
    };

    const report = await prisma.implementationReport.upsert({
      where,
      create: { storyId: storyId || null, epicId: epicId || null, ...data },
      update: data,
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error('Report generate error:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
