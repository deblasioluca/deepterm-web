/**
 * Admin AI — SSH / local execution layer
 *
 * Phase 2: local exec on the RPi via child_process.exec
 * Phase 4: remote SSH to CI Mac + AI Dev Mac (after firewall config)
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const MAX_OUTPUT = 8_000;
const EXEC_TIMEOUT_MS = 30_000;

// ── Machine registry ──────────────────────────────────────────────────────────

export interface Machine {
  id: string;
  host: string;
  user: string;
  label: string;
  local: boolean; // true = child_process.exec, false = SSH2 (Phase 4)
}

export const MACHINES: Record<string, Machine> = {
  webapp: {
    id: 'webapp',
    host: '10.10.10.10',
    user: 'macan',
    label: 'Webapp (RPi)',
    local: true,
  },
  'ci-mac': {
    id: 'ci-mac',
    host: '192.168.1.248',
    user: 'lucadeblasio',
    label: 'CI Mac',
    local: false, // Phase 4 — firewall not configured
  },
  'ai-dev': {
    id: 'ai-dev',
    host: '192.168.1.249',
    user: 'luca',
    label: 'AI Dev Mac',
    local: false, // Phase 4 — firewall not configured
  },
};

// ── Safety filter ─────────────────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\//,          // rm -rf /
  /\bdd\s+if=/,               // dd if=... (disk overwrite)
  /\bmkfs\b/,                 // format filesystem
  />\s*\/dev\/(sda|sdb|hda)/, // redirect to disk device
  /\bsudo\s+passwd\b/,        // change root password
  /\bchmod\s+[0-7]*7\s+\/\b/, // chmod 777 /
];

function checkBlocked(command: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return `Command blocked by safety filter (matches: ${pattern.toString()})`;
    }
  }
  return null;
}

// ── Local execution (RPi — app runs ON this machine) ─────────────────────────

export async function execLocal(command: string): Promise<string> {
  const blocked = checkBlocked(command);
  if (blocked) return blocked;

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
    });

    let output = stdout || '';
    if (stderr) output += `\n[stderr]\n${stderr}`;
    if (!output.trim()) output = '(no output)';

    if (output.length > MAX_OUTPUT) {
      output =
        output.slice(0, MAX_OUTPUT) +
        `\n\n[truncated — ${output.length} total chars]`;
    }
    return output;
  } catch (err: unknown) {
    // exec throws when exit code != 0 but may still carry stdout/stderr
    if (err && typeof err === 'object' && 'stdout' in err) {
      const execErr = err as { stdout: string; stderr: string; code: number };
      let out = execErr.stdout || '';
      if (execErr.stderr) out += `\n[stderr]\n${execErr.stderr}`;
      out += `\n[exit code: ${execErr.code ?? 'unknown'}]`;
      if (out.length > MAX_OUTPUT) out = out.slice(0, MAX_OUTPUT) + '\n[truncated]';
      return out;
    }
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function execOnMachine(
  machineId: string,
  command: string,
): Promise<string> {
  const machine = MACHINES[machineId];
  if (!machine) {
    const available = Object.keys(MACHINES).join(', ');
    return `Unknown machine "${machineId}". Available machines: ${available}`;
  }

  if (!machine.local) {
    return (
      `Machine "${machine.label}" (${machine.id}) is in the backlog — ` +
      `remote SSH requires firewall configuration that hasn't been done yet. ` +
      `Use machine "webapp" for RPi commands.`
    );
  }

  return execLocal(command);
}
