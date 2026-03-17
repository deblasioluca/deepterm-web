/**
 * Admin AI system prompt builder.
 * Assembles CLAUDE.md (or custom override) + infrastructure block + page context.
 */

import fs from 'fs';
import path from 'path';
import type { AdminPageContext } from '@/components/admin/AdminAIContext';

const INFRA_BLOCK = `
## Infrastructure
- **Webapp (Raspberry Pi 5):** SSH \`macan@10.10.10.10\` — primary production server, runs Next.js via PM2
- **CI Mac:** SSH \`lucadeblasio@192.168.20.198\` — macOS CI/CD machine (SSH access pending network config)
- **AI Dev Mac:** SSH \`luca@192.168.20.222\` — Xcode + Swift development machine (SSH access pending)
- **Airflow:** \`http://192.168.20.222:8080\` — Apache Airflow (Docker Compose), 5 DAGs for CI/CD orchestration
- **Node-RED:** configured via \`NODE_RED_URL\` env var — automation and notifications

## Repositories
- **Web application (this codebase):** https://github.com/deblasioluca/deepterm-web
- **Native macOS app (SwiftUI):** https://github.com/deblasioluca/deepterm

## Your Capabilities
You have the following tools available. Use them proactively:
- \`list_documentation\` — list available documentation files
- \`read_documentation\` — read a specific documentation file by name
- \`get_system_health\` — current server DB stats, memory usage, uptime
- \`get_ai_usage\` — AI cost/token usage statistics for today/week/month
`;

export async function buildSystemPrompt(
  pageContext: AdminPageContext | null,
  customSystemPrompt?: string | null,
): Promise<string> {
  // Load CLAUDE.md or use the admin-configured override
  let basePrompt: string;
  if (customSystemPrompt) {
    basePrompt = customSystemPrompt;
  } else {
    try {
      const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
      basePrompt = fs.readFileSync(claudeMdPath, 'utf-8');
    } catch {
      basePrompt =
        '# DeepTerm Admin Assistant\nYou are an AI assistant for the DeepTerm admin panel.';
    }
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  let prompt = `${basePrompt}

---

## Admin AI Assistant Role

You are the embedded AI assistant for the DeepTerm **admin panel**. You have deep knowledge of the DeepTerm codebase, architecture, infrastructure, and operations. Help the administrator manage the platform, diagnose issues, understand data, run operations, and take actions.

**Current date/time:** ${now}
`;

  prompt += INFRA_BLOCK;

  if (pageContext) {
    prompt += `
## Current Admin Page

The administrator is currently viewing: **${pageContext.page}**

${pageContext.summary}
${pageContext.data ? `\nPage data:\n\`\`\`json\n${JSON.stringify(pageContext.data, null, 2)}\n\`\`\`` : ''}
`;
  }

  return prompt.trim();
}
