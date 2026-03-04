/**
 * Admin AI tool definitions and executors.
 *
 * Phase 1 (read-only):
 *   list_documentation, read_documentation, get_system_health, get_ai_usage
 *
 * Phase 2 (SSH, GitHub, Airflow, Node-RED, Stripe, vector search):
 *   ssh_exec, github_read, github_act,
 *   airflow_api, node_red_api, stripe_api,
 *   search_documentation, index_documentation
 */

import fs from 'fs';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { execOnMachine, MACHINES } from './ssh';
import * as gh from './github';
import { searchDocuments, indexDocument, listIndexedDocuments } from './vector-store';

// ── Shared ────────────────────────────────────────────────────────────────────

const MAX_OUTPUT_CHARS = 10_000;

function truncate(s: string): string {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  return (
    s.slice(0, MAX_OUTPUT_CHARS) +
    `\n\n[Output truncated — ${s.length} total chars]`
  );
}

// ── Tool Definitions ──────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  // ── Phase 1 ──────────────────────────────────────────────────────────────

  {
    name: 'list_documentation',
    description:
      'List all available documentation files in the Documentation/ folder. Returns file names, sizes, and last-modified dates.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_documentation',
    description:
      'Read the full contents of a documentation file. Use this to get technical details about architecture, APIs, deployment, or other topics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filename: {
          type: 'string',
          description: 'The documentation filename, e.g. "02-ARCHITECTURE.md"',
        },
      },
      required: ['filename'],
    },
  },
  {
    name: 'get_system_health',
    description:
      'Get current system health metrics: database record counts, process memory usage, and server uptime.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_ai_usage',
    description: 'Get AI cost and usage statistics for a given time period.',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'week', 'month'],
          description: 'Time period to query',
        },
      },
      required: ['period'],
    },
  },

  // ── Phase 2: SSH ──────────────────────────────────────────────────────────

  {
    name: 'ssh_exec',
    description:
      'Execute a shell command on a machine in the infrastructure. ' +
      'Current available machines: "webapp" (the Raspberry Pi this app runs on). ' +
      'CI Mac and AI Dev Mac are in the backlog — SSH not yet configured. ' +
      'Use for system inspection, log tailing, process management, disk checks, etc. ' +
      'Destructive commands like "rm -rf /" are blocked.',
    input_schema: {
      type: 'object' as const,
      properties: {
        machine: {
          type: 'string',
          enum: Object.keys(MACHINES),
          description: 'Target machine ID. Use "webapp" for the RPi.',
        },
        command: {
          type: 'string',
          description: 'The shell command to run.',
        },
      },
      required: ['machine', 'command'],
    },
  },

  // ── Phase 2: GitHub ───────────────────────────────────────────────────────

  {
    name: 'github_read',
    description:
      'Read data from GitHub: repositories, issues, PRs, workflow runs, commits, or file contents. ' +
      'Use for checking build status, reviewing open PRs, reading source files, or searching code.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: [
            'list_repos',
            'get_repo',
            'list_branches',
            'list_issues',
            'list_prs',
            'get_pr',
            'list_workflow_runs',
            'get_workflow_run',
            'get_commits',
            'get_file',
            'search_code',
            'search_issues',
          ],
          description: 'The read operation to perform.',
        },
        owner: {
          type: 'string',
          description: 'GitHub org/user. Default org: "deblasioluca"',
        },
        repo: {
          type: 'string',
          description: 'Repository name, e.g. "deepterm"',
        },
        number: {
          type: 'number',
          description: 'PR, issue, or workflow run number/ID',
        },
        file_path: {
          type: 'string',
          description: 'File path for get_file action, e.g. "src/app/page.tsx"',
        },
        ref: {
          type: 'string',
          description: 'Branch, tag, or commit SHA',
        },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Filter by state (for issues/PRs)',
        },
        query: {
          type: 'string',
          description: 'Search query for search_code or search_issues',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 20, max 30)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'github_act',
    description:
      'Perform write actions on GitHub: trigger workflow dispatch, create issues, ' +
      'add comments, or close issues. Use for CI/CD management and issue tracking.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: [
            'trigger_workflow',
            'create_issue',
            'add_issue_comment',
            'close_issue',
          ],
          description: 'The write operation to perform.',
        },
        owner: {
          type: 'string',
          description: 'GitHub org/user. Default: "deblasioluca"',
        },
        repo: {
          type: 'string',
          description: 'Repository name',
        },
        workflow: {
          type: 'string',
          description: 'Workflow filename, e.g. "ci.yml" (for trigger_workflow)',
        },
        ref: {
          type: 'string',
          description: 'Branch or tag to run workflow on (for trigger_workflow)',
        },
        inputs: {
          type: 'object',
          description: 'Workflow inputs key-value map (for trigger_workflow)',
        },
        number: {
          type: 'number',
          description: 'Issue or PR number (for comment/close)',
        },
        title: {
          type: 'string',
          description: 'Issue title (for create_issue)',
        },
        body: {
          type: 'string',
          description: 'Issue body or comment text (markdown)',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to add (for create_issue)',
        },
      },
      required: ['action'],
    },
  },

  // ── Phase 2: Airflow ──────────────────────────────────────────────────────

  {
    name: 'airflow_api',
    description:
      'Query or control Apache Airflow. List DAGs, get DAG run history, trigger a DAG run, or pause/unpause a DAG. ' +
      'Requires AIRFLOW_API_URL, AIRFLOW_USERNAME, AIRFLOW_PASSWORD env vars.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: [
            'list_dags',
            'get_dag',
            'list_dag_runs',
            'trigger_dag',
            'pause_dag',
            'unpause_dag',
            'get_task_instances',
          ],
          description: 'The Airflow operation to perform.',
        },
        dag_id: {
          type: 'string',
          description: 'DAG ID (required for all actions except list_dags)',
        },
        run_id: {
          type: 'string',
          description: 'DAG run ID (for get_task_instances)',
        },
        conf: {
          type: 'object',
          description: 'Configuration JSON to pass when triggering a DAG run',
        },
        limit: {
          type: 'number',
          description: 'Max results for list operations (default 20)',
        },
      },
      required: ['action'],
    },
  },

  // ── Phase 2: Node-RED ─────────────────────────────────────────────────────

  {
    name: 'node_red_api',
    description:
      'Interact with the Node-RED instance at 192.168.1.30:1880. ' +
      'List flows, get flow details, send a DeepTerm webhook notification, ' +
      'or make a generic HTTP call to the Node-RED API.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: [
            'list_flows',
            'get_flows_state',
            'send_webhook',
            'generic',
          ],
          description: 'Operation to perform.',
        },
        webhook_type: {
          type: 'string',
          description:
            'Webhook type for send_webhook (triage, build-status, release, payment, security, agent-pr)',
        },
        webhook_payload: {
          type: 'object',
          description: 'Payload for the webhook (for send_webhook)',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP method for generic action (default GET)',
        },
        api_path: {
          type: 'string',
          description: 'API path for generic action, e.g. "/flows" or "/flow/{id}"',
        },
        body: {
          type: 'object',
          description: 'Request body for generic POST/PUT',
        },
      },
      required: ['action'],
    },
  },

  // ── Phase 2: Stripe ───────────────────────────────────────────────────────

  {
    name: 'stripe_api',
    description:
      'Query Stripe billing data: revenue figures, subscriptions, customers, invoices. ' +
      'Read-only — no charges or refunds via this tool.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: [
            'get_revenue_summary',
            'list_subscriptions',
            'get_subscription',
            'list_customers',
            'search_customer',
            'list_invoices',
          ],
          description: 'Query to execute.',
        },
        subscription_id: {
          type: 'string',
          description: 'Stripe subscription ID for get_subscription',
        },
        customer_id: {
          type: 'string',
          description: 'Stripe customer ID for list_invoices',
        },
        email: {
          type: 'string',
          description: 'Customer email for search_customer',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 20, max 100)',
        },
        status: {
          type: 'string',
          description:
            'Subscription status filter: active, past_due, canceled, trialing, all (default active)',
        },
      },
      required: ['action'],
    },
  },

  // ── Phase 2: Vector search ────────────────────────────────────────────────

  {
    name: 'search_documentation',
    description:
      'Semantic vector search across indexed documentation. ' +
      'Returns the top-5 most relevant chunks from any indexed docs. ' +
      'Use this to find specific technical information without reading entire files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Natural-language search query',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'index_documentation',
    description:
      'Index a documentation file into the vector store for semantic search. ' +
      'Use list_documentation to see available files, then index relevant ones.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filename: {
          type: 'string',
          description: 'Documentation filename to index, e.g. "02-ARCHITECTURE.md"',
        },
      },
      required: ['filename'],
    },
  },
  {
    name: 'list_indexed_documents',
    description:
      'List all documentation files currently in the vector store, with chunk counts and index dates.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// ── Executor ──────────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    switch (name) {
      // Phase 1
      case 'list_documentation':
        return truncate(listDocumentation());
      case 'read_documentation':
        return truncate(readDocumentation(input.filename as string));
      case 'get_system_health':
        return truncate(await getSystemHealth());
      case 'get_ai_usage':
        return truncate(await getAIUsage(input.period as string));

      // Phase 2: SSH
      case 'ssh_exec':
        return truncate(
          await execOnMachine(
            input.machine as string,
            input.command as string,
          ),
        );

      // Phase 2: GitHub read
      case 'github_read':
        return truncate(await githubRead(input));

      // Phase 2: GitHub act
      case 'github_act':
        return truncate(await githubAct(input));

      // Phase 2: Airflow
      case 'airflow_api':
        return truncate(await airflowApi(input));

      // Phase 2: Node-RED
      case 'node_red_api':
        return truncate(await nodeRedApi(input));

      // Phase 2: Stripe
      case 'stripe_api':
        return truncate(await stripeApi(input));

      // Phase 2: Vector search
      case 'search_documentation':
        return truncate(await searchDocuments(input.query as string));
      case 'index_documentation':
        return truncate(await indexDocumentTool(input.filename as string));
      case 'list_indexed_documents':
        return truncate(await listIndexedDocuments());

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Tool "${name}" failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Phase 1 implementations ───────────────────────────────────────────────────

function listDocumentation(): string {
  const docsDir = path.join(process.cwd(), 'Documentation');
  const files = fs
    .readdirSync(docsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const stat = fs.statSync(path.join(docsDir, f));
      return {
        name: f,
        sizeKb: Math.round(stat.size / 1024),
        modifiedAt: stat.mtime.toISOString().slice(0, 10),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return JSON.stringify({ count: files.length, files }, null, 2);
}

function readDocumentation(filename: string): string {
  const safe = path.basename(filename);
  if (!safe.endsWith('.md')) {
    return 'Error: only .md files are accessible via this tool.';
  }
  const filePath = path.join(process.cwd(), 'Documentation', safe);
  if (!fs.existsSync(filePath)) {
    return `Error: file not found: ${safe}. Use list_documentation to see available files.`;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

async function getSystemHealth(): Promise<string> {
  const [userCount, zkUserCount, vaultItemCount, zkVaultCount, issueCount, ideaCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.zKUser.count(),
      prisma.zKVaultItem.count({ where: { deletedAt: null } }),
      prisma.zKVault.count(),
      prisma.issue.count(),
      prisma.idea.count(),
    ]);

  const mem = process.memoryUsage();
  const uptimeSecs = process.uptime();
  const days = Math.floor(uptimeSecs / 86400);
  const hours = Math.floor((uptimeSecs % 86400) / 3600);
  const mins = Math.floor((uptimeSecs % 3600) / 60);

  return JSON.stringify(
    {
      database: {
        webUsers: userCount,
        zkVaultUsers: zkUserCount,
        vaults: zkVaultCount,
        activeVaultItems: vaultItemCount,
        issues: issueCount,
        ideas: ideaCount,
      },
      process: {
        uptimeHuman: `${days}d ${hours}h ${mins}m`,
        uptimeSeconds: Math.round(uptimeSecs),
        memoryRssMb: Math.round(mem.rss / 1024 / 1024),
        memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        memoryHeapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        nodeVersion: process.version,
      },
    },
    null,
    2,
  );
}

async function getAIUsage(period: string): Promise<string> {
  const now = new Date();
  let startDate: Date;

  if (period === 'today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'week') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const logs = await prisma.aIUsageLog.findMany({
    where: { createdAt: { gte: startDate } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const totalCost = logs.reduce((s, l) => s + (l.costCents ?? 0), 0);
  const totalTokens = logs.reduce((s, l) => s + l.totalTokens, 0);
  const errors = logs.filter((l) => !l.success).length;

  const byActivity: Record<
    string,
    { calls: number; costCents: number; tokens: number }
  > = {};
  for (const l of logs) {
    if (!byActivity[l.activity])
      byActivity[l.activity] = { calls: 0, costCents: 0, tokens: 0 };
    byActivity[l.activity].calls++;
    byActivity[l.activity].costCents += l.costCents ?? 0;
    byActivity[l.activity].tokens += l.totalTokens;
  }

  const byActivitySorted = Object.entries(byActivity)
    .sort(([, a], [, b]) => b.costCents - a.costCents)
    .map(([activity, stats]) => ({
      activity,
      calls: stats.calls,
      tokens: stats.tokens,
      costCents: Math.round(stats.costCents * 100) / 100,
      costUsd: `$${(stats.costCents / 100).toFixed(4)}`,
    }));

  return JSON.stringify(
    {
      period,
      from: startDate.toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10),
      summary: {
        callCount: logs.length,
        errorCount: errors,
        totalTokens,
        totalCostCents: Math.round(totalCost * 100) / 100,
        totalCostUsd: `$${(totalCost / 100).toFixed(4)}`,
      },
      byActivity: byActivitySorted,
      recentCalls: logs.slice(0, 15).map((l) => ({
        activity: l.activity,
        model: l.model,
        tokens: l.totalTokens,
        costCents: l.costCents,
        success: l.success,
        error: l.errorMessage ?? undefined,
        at: l.createdAt,
      })),
    },
    null,
    2,
  );
}

// ── Phase 2: GitHub implementations ──────────────────────────────────────────

async function githubRead(input: Record<string, unknown>): Promise<string> {
  const action = input.action as string;
  const owner = (input.owner as string | undefined) ?? 'deblasioluca';
  const repo = input.repo as string | undefined;
  const limit = Math.min((input.limit as number | undefined) ?? 20, 30);

  switch (action) {
    case 'list_repos':
      return JSON.stringify(await gh.listRepos(owner), null, 2);
    case 'get_repo':
      return JSON.stringify(await gh.getRepo(owner, repo!), null, 2);
    case 'list_branches':
      return JSON.stringify(await gh.listBranches(owner, repo!), null, 2);
    case 'list_issues':
      return JSON.stringify(
        await gh.listIssues(
          owner,
          repo!,
          (input.state as 'open' | 'closed' | 'all') ?? 'open',
        ),
        null,
        2,
      );
    case 'list_prs':
      return JSON.stringify(
        await gh.listPRs(
          owner,
          repo!,
          (input.state as 'open' | 'closed' | 'all') ?? 'open',
        ),
        null,
        2,
      );
    case 'get_pr':
      return JSON.stringify(
        await gh.getPR(owner, repo!, input.number as number),
        null,
        2,
      );
    case 'list_workflow_runs':
      return JSON.stringify(
        await gh.listWorkflowRuns(owner, repo!, limit),
        null,
        2,
      );
    case 'get_workflow_run':
      return JSON.stringify(
        await gh.getWorkflowRun(owner, repo!, input.number as number),
        null,
        2,
      );
    case 'get_commits':
      return JSON.stringify(
        await gh.getCommits(
          owner,
          repo!,
          limit,
          input.ref as string | undefined,
        ),
        null,
        2,
      );
    case 'get_file':
      return await gh.getFileContent(
        owner,
        repo!,
        input.file_path as string,
        input.ref as string | undefined,
      );
    case 'search_code':
      return JSON.stringify(
        await gh.searchCode(input.query as string),
        null,
        2,
      );
    case 'search_issues':
      return JSON.stringify(
        await gh.searchIssues(input.query as string),
        null,
        2,
      );
    default:
      return `Unknown github_read action: ${action}`;
  }
}

async function githubAct(input: Record<string, unknown>): Promise<string> {
  const action = input.action as string;
  const owner = (input.owner as string | undefined) ?? 'deblasioluca';
  const repo = input.repo as string | undefined;

  switch (action) {
    case 'trigger_workflow':
      return await gh.triggerWorkflow(
        owner,
        repo!,
        input.workflow as string,
        input.ref as string,
        (input.inputs as Record<string, string>) ?? {},
      );
    case 'create_issue':
      return JSON.stringify(
        await gh.createIssue(
          owner,
          repo!,
          input.title as string,
          input.body as string,
          (input.labels as string[]) ?? [],
        ),
        null,
        2,
      );
    case 'add_issue_comment':
      return JSON.stringify(
        await gh.addIssueComment(
          owner,
          repo!,
          input.number as number,
          input.body as string,
        ),
        null,
        2,
      );
    case 'close_issue':
      return JSON.stringify(
        await gh.closeIssue(owner, repo!, input.number as number),
        null,
        2,
      );
    default:
      return `Unknown github_act action: ${action}`;
  }
}

// ── Phase 2: Airflow implementation ───────────────────────────────────────────

async function airflowApi(input: Record<string, unknown>): Promise<string> {
  const baseUrl = process.env.AIRFLOW_API_URL;
  if (!baseUrl) {
    return 'AIRFLOW_API_URL env var is not configured.';
  }

  const user = process.env.AIRFLOW_USERNAME ?? 'airflow';
  const pass = process.env.AIRFLOW_PASSWORD ?? '';
  const auth = Buffer.from(`${user}:${pass}`).toString('base64');

  async function airFetch(
    apiPath: string,
    options: RequestInit = {},
  ): Promise<unknown> {
    const url = `${baseUrl}/api/v1${apiPath}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Airflow ${apiPath} → ${res.status}: ${text.slice(0, 300)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  const action = input.action as string;
  const dagId = input.dag_id as string | undefined;
  const limit = (input.limit as number | undefined) ?? 20;

  switch (action) {
    case 'list_dags':
      return JSON.stringify(
        await airFetch(`/dags?limit=${limit}`),
        null,
        2,
      );
    case 'get_dag':
      return JSON.stringify(await airFetch(`/dags/${dagId}`), null, 2);
    case 'list_dag_runs':
      return JSON.stringify(
        await airFetch(`/dags/${dagId}/dagRuns?limit=${limit}&order_by=-start_date`),
        null,
        2,
      );
    case 'trigger_dag':
      return JSON.stringify(
        await airFetch(`/dags/${dagId}/dagRuns`, {
          method: 'POST',
          body: JSON.stringify({ conf: input.conf ?? {} }),
        }),
        null,
        2,
      );
    case 'pause_dag':
      return JSON.stringify(
        await airFetch(`/dags/${dagId}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_paused: true }),
        }),
        null,
        2,
      );
    case 'unpause_dag':
      return JSON.stringify(
        await airFetch(`/dags/${dagId}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_paused: false }),
        }),
        null,
        2,
      );
    case 'get_task_instances':
      return JSON.stringify(
        await airFetch(
          `/dags/${dagId}/dagRuns/${input.run_id}/taskInstances`,
        ),
        null,
        2,
      );
    default:
      return `Unknown airflow_api action: ${action}`;
  }
}

// ── Phase 2: Node-RED implementation ─────────────────────────────────────────

async function nodeRedApi(input: Record<string, unknown>): Promise<string> {
  const NODE_RED_BASE = process.env.NODE_RED_URL ?? 'http://192.168.1.30:1880';

  async function nrFetch(
    apiPath: string,
    options: RequestInit = {},
  ): Promise<unknown> {
    const res = await fetch(`${NODE_RED_BASE}${apiPath}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Node-RED ${apiPath} → ${res.status}: ${text.slice(0, 300)}`,
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  const action = input.action as string;

  switch (action) {
    case 'list_flows':
      return JSON.stringify(await nrFetch('/flows'), null, 2);

    case 'get_flows_state':
      return JSON.stringify(await nrFetch('/flows/state'), null, 2);

    case 'send_webhook': {
      const webhookType = input.webhook_type as string;
      const payload = input.webhook_payload ?? {};
      const result = await nrFetch(`/deepterm/${webhookType}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return `Webhook sent to /deepterm/${webhookType}: ${JSON.stringify(result)}`;
    }

    case 'generic': {
      const method = (input.method as string | undefined) ?? 'GET';
      const apiPath = input.api_path as string;
      if (!apiPath) return 'api_path is required for generic action';
      const options: RequestInit = { method };
      if (input.body && method !== 'GET') {
        options.body = JSON.stringify(input.body);
      }
      return JSON.stringify(await nrFetch(apiPath, options), null, 2);
    }

    default:
      return `Unknown node_red_api action: ${action}`;
  }
}

// ── Phase 2: Stripe implementation ───────────────────────────────────────────

async function stripeApi(input: Record<string, unknown>): Promise<string> {
  const { getStripe } = await import('@/lib/stripe');
  const stripe = getStripe();
  const action = input.action as string;
  const limit = Math.min((input.limit as number | undefined) ?? 20, 100);

  switch (action) {
    case 'get_revenue_summary': {
      // Last 30 days revenue from succeeded invoices
      const since = Math.floor(Date.now() / 1000) - 30 * 86400;
      const invoices = await stripe.invoices.list({
        limit: 100,
        status: 'paid',
        created: { gte: since },
      });
      const total = invoices.data.reduce(
        (s, inv) => s + (inv.amount_paid ?? 0),
        0,
      );
      const mrr = await stripe.subscriptions
        .list({ status: 'active', limit: 100 })
        .then((subs) =>
          subs.data.reduce(
            (s, sub) =>
              s +
              sub.items.data.reduce(
                (is, item) =>
                  is +
                  Math.round(
                    ((item.price.unit_amount ?? 0) * (item.quantity ?? 1)) /
                      (item.price.recurring?.interval === 'year' ? 12 : 1),
                  ),
                0,
              ),
            0,
          ),
        );
      return JSON.stringify(
        {
          last30DaysRevenueCents: total,
          last30DaysRevenueUsd: `$${(total / 100).toFixed(2)}`,
          mrrCents: mrr,
          mrrUsd: `$${(mrr / 100).toFixed(2)}`,
          invoiceCount: invoices.data.length,
        },
        null,
        2,
      );
    }

    case 'list_subscriptions': {
      const status =
        (input.status as string | undefined) ?? 'active';
      const params =
        status === 'all'
          ? { limit }
          : { limit, status: status as 'active' | 'past_due' | 'canceled' | 'trialing' };
      const subs = await stripe.subscriptions.list({
        ...params,
        expand: ['data.customer'],
      });
      return JSON.stringify(
        subs.data.map((s) => ({
          id: s.id,
          status: s.status,
          customer:
            typeof s.customer === 'object' && 'email' in s.customer
              ? (s.customer as { email?: string }).email
              : s.customer,
          plan: s.items.data[0]?.price?.nickname ?? s.items.data[0]?.price?.id,
          amount_cents: s.items.data.reduce(
            (t, i) => t + (i.price.unit_amount ?? 0) * (i.quantity ?? 1),
            0,
          ),
          cancel_at_period_end: s.cancel_at_period_end,
          billing_cycle_anchor: new Date(
            s.billing_cycle_anchor * 1000,
          ).toISOString(),
        })),
        null,
        2,
      );
    }

    case 'get_subscription': {
      const sub = await stripe.subscriptions.retrieve(
        input.subscription_id as string,
        { expand: ['customer', 'latest_invoice'] },
      );
      return JSON.stringify(sub, null, 2);
    }

    case 'list_customers': {
      const customers = await stripe.customers.list({ limit });
      return JSON.stringify(
        customers.data.map((c) => ({
          id: c.id,
          email: c.email,
          name: c.name,
          created: new Date(c.created * 1000).toISOString(),
          delinquent: c.delinquent,
        })),
        null,
        2,
      );
    }

    case 'search_customer': {
      const customers = await stripe.customers.list({
        email: input.email as string,
        limit: 5,
      });
      return JSON.stringify(customers.data, null, 2);
    }

    case 'list_invoices': {
      const params: Record<string, unknown> = { limit };
      if (input.customer_id) params.customer = input.customer_id;
      const invoices = await stripe.invoices.list(
        params as Parameters<typeof stripe.invoices.list>[0],
      );
      return JSON.stringify(
        invoices.data.map((inv) => ({
          id: inv.id,
          customer: inv.customer,
          amount_paid: inv.amount_paid,
          amount_due: inv.amount_due,
          status: inv.status,
          created: new Date(inv.created * 1000).toISOString(),
          invoice_url: inv.hosted_invoice_url,
        })),
        null,
        2,
      );
    }

    default:
      return `Unknown stripe_api action: ${action}`;
  }
}

// ── Phase 2: Vector search implementation ────────────────────────────────────

async function indexDocumentTool(filename: string): Promise<string> {
  const safe = path.basename(filename);
  if (!safe.endsWith('.md')) {
    return 'Error: only .md files can be indexed.';
  }
  const filePath = path.join(process.cwd(), 'Documentation', safe);
  if (!fs.existsSync(filePath)) {
    return `Error: file not found: ${safe}. Use list_documentation to see available files.`;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return indexDocument(safe, content);
}
