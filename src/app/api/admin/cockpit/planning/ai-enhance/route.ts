import { NextResponse } from 'next/server';
import { callAI } from '@/lib/ai-client';
import { getRepoContext } from '@/lib/repo-context';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are a senior product manager and technical writer for DeepTerm, a professional SSH client platform (macOS, Windows, Linux, iOS).
The web application is built with Next.js 14, TypeScript, Prisma/SQLite, and Tailwind CSS.

Your job is to enhance GitHub issue descriptions to make them clearer, more actionable, and better structured.
You have access to the full repository structure and project guidelines to write technically accurate descriptions.

Rules:
- Keep the same intent and scope as the original issue
- For BUG reports: ensure Steps to Reproduce, Expected Behavior, Actual Behavior sections exist
- For FEATURE requests: use a clear user story format with acceptance criteria
- For ENHANCEMENTS: describe the current behavior, proposed changes, and benefits
- Add acceptance criteria if missing
- Reference specific files, components, or modules from the codebase where relevant (e.g. "This affects src/lib/auth.ts")
- Suggest which areas of the codebase are likely impacted
- Keep language professional but concise
- Preserve any existing important details, screenshots references, or code snippets
- If the original description is empty or very brief, expand it based on the title and your knowledge of the codebase
- Do NOT add fake details or make assumptions about implementation — focus on requirements
- Return only the enhanced title and body text — no extra commentary

Return valid JSON matching the required schema.`;

export async function POST(request: Request) {
  try {
    const { title, body, labels } = await request.json();

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Fetch repo context (cached)
    const repoContext = await getRepoContext();

    const labelContext = Array.isArray(labels) && labels.length > 0
      ? `\nLabels: ${labels.map((l: { name: string }) => l.name).join(', ')}`
      : '';

    const userMessage = `Enhance this GitHub issue:

Title: ${title}
${labelContext}

Current Description:
${body || '(empty — please write a proper description based on the title)'}

${repoContext ? `\n---\n\n# Repository Context\n\n${repoContext}` : ''}`;

    console.log('[AI Enhance] Calling AI with repo context...');
    const aiResponse = await callAI(
      'planning.enhance',
      SYSTEM_PROMPT,
      [{ role: 'user', content: userMessage }],
      { maxTokens: 2048 }
    );
    console.log('[AI Enhance] AI responded via', aiResponse.provider, aiResponse.model);

    const fullText = aiResponse.content;
    if (!fullText) {
      return NextResponse.json({ error: 'No text response from AI' }, { status: 500 });
    }

    // Parse JSON from response
    let parsed: { title?: string; body?: string; summary?: string };
    try {
      parsed = JSON.parse(fullText.trim());
    } catch {
      const codeBlockMatch = fullText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(codeBlockMatch[1].trim());
        } catch {
          const jsonMatch = fullText.match(/\{[\s\S]*"body"[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsed = JSON.parse(jsonMatch[0]);
            } catch {
              console.error('[AI Enhance] Failed to parse JSON:', fullText.slice(0, 500));
              return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
            }
          } else {
            parsed = { title, body: fullText.trim() };
          }
        }
      } else {
        const jsonMatch = fullText.match(/\{[\s\S]*"body"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            parsed = { title, body: fullText.trim() };
          }
        } else {
          parsed = { title, body: fullText.trim() };
        }
      }
    }

    console.log('[AI Enhance] Parsed keys:', Object.keys(parsed));

    return NextResponse.json({
      title: typeof parsed.title === 'string' ? parsed.title : title,
      body: typeof parsed.body === 'string' ? parsed.body : (body || ''),
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Issue description enhanced',
    });
  } catch (error) {
    console.error('AI enhance error:', error);
    const message = error instanceof Error ? error.message : 'AI enhancement failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
