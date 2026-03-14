/**
 * GitHub Commit & PR utilities — creates branches, commits files, opens PRs.
 * Uses Git Trees API with base64 encoding + Contents API fallback on 422.
 */

const GITHUB_API = "https://api.github.com";

interface FileChange {
  path: string;
  content: string;
  action: "create" | "update" | "delete";
}
interface CommitResult { sha: string; branch: string; url: string; }
interface PRResult { number: number; url: string; title: string; }

function getHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
}

async function ghFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: getHeaders(), ...options });
  if (!res.ok) { const body = await res.text().catch(() => ""); throw new Error(`GitHub API ${res.status}: ${body.slice(0, 500)}`); }
  return res.json();
}

async function getBranchSHA(repo: string, branch: string): Promise<string> {
  const data = await ghFetch<{ object: { sha: string } }>(`${GITHUB_API}/repos/${repo}/git/ref/heads/${branch}`);
  return data.object.sha;
}

async function createBranch(repo: string, branchName: string, baseBranch: string): Promise<string> {
  const baseSHA = await getBranchSHA(repo, baseBranch);
  try {
    await ghFetch<{ ref: string }>(`${GITHUB_API}/repos/${repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSHA }) });
  } catch (err) {
    if (err instanceof Error && err.message.includes("422")) { console.log(`[GitHub] Branch ${branchName} already exists on ${repo}`); }
    else throw err;
  }
  return baseSHA;
}

function toBase64(content: string): string { return Buffer.from(content, "utf-8").toString("base64"); }

function validateFiles(files: FileChange[]): FileChange[] {
  const valid: FileChange[] = [];
  for (const f of files) {
    if (f.action === "delete") { valid.push(f); continue; }
    if (!f.content || f.content.trim().length === 0) { console.warn(`[GitHub] Skipping empty file: ${f.path}`); continue; }
    valid.push(f);
  }
  if (valid.length === 0) throw new Error("No valid files to commit — all files were empty or invalid");
  return valid;
}

async function commitFilesViaContentsAPI(repo: string, branch: string, files: FileChange[], message: string): Promise<{ sha: string }> {
  for (const file of files) {
    if (file.action === "delete") {
      try {
        const existing = await ghFetch<{ sha: string }>(`${GITHUB_API}/repos/${repo}/contents/${file.path}?ref=${branch}`);
        await ghFetch(`${GITHUB_API}/repos/${repo}/contents/${file.path}`, { method: "DELETE", body: JSON.stringify({ message: `${message} (delete ${file.path})`, sha: existing.sha, branch }) });
      } catch (e) { console.warn(`[GitHub] Could not delete ${file.path}:`, e); }
      continue;
    }
    let existingSha: string | undefined;
    try { const existing = await ghFetch<{ sha: string }>(`${GITHUB_API}/repos/${repo}/contents/${file.path}?ref=${branch}`); existingSha = existing.sha; } catch { /* new file */ }
    await ghFetch<{ content: { sha: string } }>(`${GITHUB_API}/repos/${repo}/contents/${file.path}`, { method: "PUT", body: JSON.stringify({ message, content: toBase64(file.content), branch, ...(existingSha ? { sha: existingSha } : {}) }) });
    console.log(`[GitHub] Contents API committed: ${file.path}`);
  }
  const sha = await getBranchSHA(repo, branch);
  return { sha };
}

export async function commitFiles(repo: string, branch: string, baseBranch: string, files: FileChange[], message: string): Promise<CommitResult> {
  const validFiles = validateFiles(files);
  await createBranch(repo, branch, baseBranch);
  const branchSHA = await getBranchSHA(repo, branch);
  const commitData = await ghFetch<{ tree: { sha: string } }>(`${GITHUB_API}/repos/${repo}/git/commits/${branchSHA}`);
  const baseTreeSHA = commitData.tree.sha;

  const treeEntries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string | null }> = [];
  for (const file of validFiles) {
    if (file.action === "delete") { treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: null }); }
    else {
      const blob = await ghFetch<{ sha: string }>(`${GITHUB_API}/repos/${repo}/git/blobs`, { method: "POST", body: JSON.stringify({ content: toBase64(file.content), encoding: "base64" }) });
      treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }
  }

  let newCommitSha: string;
  let newCommitUrl = "";
  try {
    const newTree = await ghFetch<{ sha: string }>(`${GITHUB_API}/repos/${repo}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseTreeSHA, tree: treeEntries }) });
    const newCommit = await ghFetch<{ sha: string; html_url: string }>(`${GITHUB_API}/repos/${repo}/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: newTree.sha, parents: [branchSHA] }) });
    await ghFetch(`${GITHUB_API}/repos/${repo}/git/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha }) });
    newCommitSha = newCommit.sha;
    newCommitUrl = newCommit.html_url;
    console.log(`[GitHub] Trees API commit succeeded: ${branch} -> ${newCommitSha.slice(0, 8)}`);
  } catch (err) {
    const is422 = err instanceof Error && (err.message.includes("422") || err.message.includes("BadObjectState"));
    if (!is422) throw err;
    console.warn(`[GitHub] Trees API 422 on ${branch} — falling back to Contents API`);
    const result = await commitFilesViaContentsAPI(repo, branch, validFiles, message);
    newCommitSha = result.sha;
    console.log(`[GitHub] Contents API fallback succeeded: ${branch} -> ${newCommitSha.slice(0, 8)}`);
  }
  return { sha: newCommitSha, branch, url: newCommitUrl };
}

export async function createPullRequest(repo: string, head: string, base: string, title: string, body: string, labels?: string[]): Promise<PRResult> {
  try {
    const existing = await ghFetch<Array<{ number: number; html_url: string; title: string }>>(`${GITHUB_API}/repos/${repo}/pulls?head=${repo.split("/")[0]}:${head}&base=${base}&state=open`);
    if (existing.length > 0) {
      await ghFetch(`${GITHUB_API}/repos/${repo}/pulls/${existing[0].number}`, { method: "PATCH", body: JSON.stringify({ body }) });
      return { number: existing[0].number, url: existing[0].html_url, title: existing[0].title };
    }
  } catch { /* create new */ }
  const pr = await ghFetch<{ number: number; html_url: string; title: string }>(`${GITHUB_API}/repos/${repo}/pulls`, { method: "POST", body: JSON.stringify({ title, body, head, base }) });
  if (labels?.length) { try { await ghFetch(`${GITHUB_API}/repos/${repo}/issues/${pr.number}/labels`, { method: "POST", body: JSON.stringify({ labels }) }); } catch { /* non-fatal */ } }
  return { number: pr.number, url: pr.html_url, title: pr.title };
}

const WEB_PATTERNS = [/^src\//, /^prisma\//, /^public\//, /^styles\//, /^next\.config/, /^package\.json$/, /^tailwind\.config/, /^tsconfig/, /^\.env/, /^middleware\.ts$/];
const APP_PATTERNS = [/^DeepTerm\//, /^Sources\//, /^Pods\//, /\.swift$/, /\.xcodeproj/, /\.xcworkspace/, /^Podfile/, /^Package\.swift$/, /\.entitlements$/, /\.plist$/];

export function detectRepo(filePath: string): "web" | "app" | "unknown" {
  if (WEB_PATTERNS.some(p => p.test(filePath))) return "web";
  if (APP_PATTERNS.some(p => p.test(filePath))) return "app";
  return "unknown";
}

export function groupByRepo(files: FileChange[], defaultRepo: string): Map<string, FileChange[]> {
  const WEB_REPO = "deblasioluca/deepterm-web";
  const APP_REPO = "deblasioluca/deepterm";
  const groups = new Map<string, FileChange[]>();
  for (const file of files) {
    const detected = detectRepo(file.path);
    const repo = detected === "web" ? WEB_REPO : detected === "app" ? APP_REPO : defaultRepo;
    if (!groups.has(repo)) groups.set(repo, []);
    groups.get(repo)!.push(file);
  }
  return groups;
}
