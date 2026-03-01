/**
 * Documentation structure — single source of truth for the sidebar nav,
 * page routing, and content rendering.
 *
 * Updated: 2026-03-01
 * Categories: 14 | Articles: 47
 */

import {
  BookOpen,
  Download,
  Terminal,
  Server,
  Key,
  Shield,
  Users,
  Database,
  Settings,
  HelpCircle,
  Zap,
  Lock,
  Fingerprint,
  FolderKey,
  RefreshCw,
  MonitorSmartphone,
  FileText,
  Code,
  ArrowLeftRight,
  Wifi,
  Bot,
  type LucideIcon,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────

export interface DocArticle {
  slug: string;
  title: string;
  description?: string;
  content: string; // markdown-ish HTML (rendered in prose block)
}

export interface DocCategory {
  label: string;
  icon: LucideIcon;
  articles: DocArticle[];
}

// ── Content ────────────────────────────────────────────────

export const DOC_CATEGORIES: DocCategory[] = [
  // ─── Getting Started ───────────────────────────────────
  {
    label: 'Getting Started',
    icon: BookOpen,
    articles: [
      {
        slug: 'what-is-deepterm',
        title: 'What is DeepTerm?',
        description: 'Overview of DeepTerm and its core concepts.',
        content: `
<p>DeepTerm is a modern, native macOS SSH client built for developers, DevOps engineers, and system administrators. It combines a powerful terminal emulator with an SFTP file manager, reusable command snippets, port forwarding, and encrypted vault-based credential management — all in a beautiful SwiftUI interface.</p>

<h3>Core Concepts</h3>

<p><strong>Hosts</strong> — each remote machine you connect to is represented as a Host. A host stores its address, port, and the credentials needed to authenticate. You can connect with SSH or Mosh using passwords, SSH keys, Touch ID, or FIDO2 hardware keys.</p>

<p><strong>Modes</strong> — DeepTerm operates in four modes, switchable from the toolbar: <strong>SSH</strong> (terminal), <strong>SFTP</strong> (file manager), <strong>Snippets</strong> (reusable commands), and <strong>Port Forwarding</strong> (SSH tunnels). Each mode is a full-featured tool, not a bolted-on add-on.</p>

<p><strong>Keychain</strong> — a centralized place to manage your SSH keys, identities (username + auth), certificates, Touch ID biometric keys, and FIDO2 hardware keys. Keys and identities can be shared across multiple hosts.</p>

<p><strong>Vaults</strong> — your credentials live inside encrypted vaults. Each vault is end-to-end encrypted with your master password using AES-256-GCM. The server stores only encrypted blobs — never any metadata about what's inside. This is our zero-knowledge architecture.</p>

<p><strong>Teams</strong> — invite team members and share vaults with fine-grained access control. Collaborate on shared infrastructure without sharing passwords over Slack.</p>

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin: 16px 0; font-family: monospace; font-size: 13px;">
  <div style="color: #8b949e; margin-bottom: 12px;">DeepTerm at a glance</div>
  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px;">
      <span style="color: #58a6ff;">🖥️ SSH Terminal</span><br/>
      <span style="color: #8b949e; font-size: 11px;">Multi-tab, split pane, Mosh</span>
    </div>
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px;">
      <span style="color: #58a6ff;">📁 SFTP Browser</span><br/>
      <span style="color: #8b949e; font-size: 11px;">Dual-pane drag &amp; drop</span>
    </div>
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px;">
      <span style="color: #58a6ff;">📝 Snippets</span><br/>
      <span style="color: #8b949e; font-size: 11px;">Multi-host execution</span>
    </div>
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px;">
      <span style="color: #58a6ff;">↔️ Port Forwarding</span><br/>
      <span style="color: #8b949e; font-size: 11px;">Local, Remote, SOCKS</span>
    </div>
  </div>
</div>
`,
      },
      {
        slug: 'installation',
        title: 'Installation',
        description: 'Download and install DeepTerm on macOS.',
        content: `
<h3>System Requirements</h3>
<ul>
  <li>macOS 14.0 (Sonoma) or later</li>
  <li>Apple Silicon (M1/M2/M3/M4) or Intel Mac</li>
  <li>~80 MB disk space</li>
</ul>

<h3>Download</h3>
<p>Download the latest <code>.dmg</code> installer from your <a href="/dashboard/get-the-app">Dashboard</a> or from the direct link provided in your welcome email.</p>

<h3>Install</h3>
<ol>
  <li>Open the <code>.dmg</code> file.</li>
  <li>Drag <strong>DeepTerm</strong> into <strong>Applications</strong>.</li>
  <li>Launch DeepTerm from your Applications folder or Spotlight.</li>
  <li>On first launch, macOS may ask you to confirm because the app was downloaded from the internet. Click <strong>Open</strong>.</li>
</ol>

<h3>Auto-Update</h3>
<p>DeepTerm checks for updates automatically. When a new version is available you'll see a notification inside the app. You can also check manually from <strong>DeepTerm → Check for Updates</strong>.</p>
`,
      },
      {
        slug: 'quick-start',
        title: 'Quick Start',
        description: 'Connect to your first server in under a minute.',
        content: `
<h3>1. Sign In</h3>
<p>Launch DeepTerm and sign in with your DeepTerm account. If you don't have one yet, <a href="/register">create a free account</a>.</p>

<h3>2. Add a Host</h3>
<p>Click the <strong>+</strong> button in the sidebar and choose <strong>New Host</strong>. Enter the hostname or IP address, port (default 22), and a display name.</p>

<h3>3. Set Credentials</h3>
<p>Choose an authentication method:</p>
<ul>
  <li><strong>Password</strong> — enter the password directly (stored in your encrypted vault).</li>
  <li><strong>SSH Key</strong> — pick an existing key from your keychain or import a <code>.pem</code> file.</li>
  <li><strong>Touch ID</strong> — authenticate with your fingerprint using a Secure Enclave key.</li>
  <li><strong>FIDO2</strong> — use a YubiKey or other hardware security key.</li>
</ul>

<h3>4. Connect</h3>
<p>Double-click the host (or press <kbd>⏎</kbd>) to open a terminal session. You're in!</p>

<h3>5. Explore Modes</h3>
<p>Use the toolbar to switch between SSH (terminal), SFTP (files), Snippets (commands), and Port Forwarding (tunnels).</p>
`,
      },
    ],
  },

  // ─── Connections & SSH ─────────────────────────────────
  {
    label: 'Connections & SSH',
    icon: Terminal,
    articles: [
      {
        slug: 'ssh-connections',
        title: 'SSH Connections',
        description: 'Set up and manage SSH connections.',
        content: `
<h3>Creating a Connection</h3>
<p>Open the sidebar and click <strong>+</strong> → <strong>New Host</strong>. Fill in:</p>
<ul>
  <li><strong>Label</strong> — a human-readable name.</li>
  <li><strong>Hostname / IP</strong> — the address of the remote machine.</li>
  <li><strong>Port</strong> — defaults to 22.</li>
  <li><strong>Username</strong> — the remote user to log in as.</li>
  <li><strong>Authentication</strong> — password, SSH key, identity, Touch ID, or FIDO2.</li>
</ul>

<h3>Connection Options</h3>
<p>Under <strong>Advanced</strong> you can configure:</p>
<ul>
  <li>Keep-alive interval (prevent idle disconnects).</li>
  <li>Environment variables sent on connect.</li>
  <li>Startup command (runs automatically after login).</li>
  <li>Proxy / jump host (see <a href="/documentation/jump-hosts">Jump Hosts</a>).</li>
  <li>Mosh protocol (see <a href="/documentation/mosh-protocol">Mosh</a>).</li>
</ul>

<h3>Reconnecting</h3>
<p>If a session drops, DeepTerm shows a <strong>Reconnect</strong> banner at the top. Click it or press <kbd>⌘R</kbd> to reconnect instantly. With Mosh enabled, sessions survive network changes automatically.</p>
`,
      },
      {
        slug: 'jump-hosts',
        title: 'Jump Hosts (Bastion)',
        description: 'Connect through an intermediate server.',
        content: `
<p>Jump hosts (also called bastion hosts) let you reach servers that aren't directly accessible from the internet.</p>

<h3>Setup</h3>
<ol>
  <li>Create a host entry for the bastion server.</li>
  <li>Create a host entry for the target server.</li>
  <li>On the target host, open <strong>Advanced → Proxy/Jump Host</strong> and select the bastion.</li>
</ol>

<p>DeepTerm will automatically open an SSH tunnel through the bastion when you connect to the target.</p>

<h3>Multi-Hop</h3>
<p>Need to chain through multiple jump hosts? Select a chain of hosts in order — DeepTerm will tunnel through each one sequentially.</p>

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin: 16px 0; font-family: monospace; font-size: 12px; color: #8b949e;">
  <div style="color: #58a6ff; margin-bottom: 8px;">Multi-hop tunnel flow</div>
  <div>You → <span style="color: #f0883e;">Bastion A</span> → <span style="color: #f0883e;">Bastion B</span> → <span style="color: #3fb950;">Target Server</span></div>
  <div style="margin-top: 4px; font-size: 11px;">Each hop is an encrypted SSH tunnel nested inside the previous one.</div>
</div>
`,
      },
      {
        slug: 'split-terminals',
        title: 'Split Terminals',
        description: 'Run multiple sessions side by side.',
        content: `
<p>DeepTerm supports horizontal and vertical terminal splits so you can monitor multiple servers at once.</p>

<h3>Creating Splits</h3>
<ul>
  <li><kbd>⌘D</kbd> — split vertically (side by side).</li>
  <li><kbd>⌘⇧D</kbd> — split horizontally (top / bottom).</li>
  <li><kbd>⌘W</kbd> — close the active pane.</li>
  <li><kbd>⌘⌥←/→/↑/↓</kbd> — move focus between panes.</li>
</ul>

<p>Each pane can connect to a different host — or run a local shell. Drag the divider to resize.</p>
`,
      },
      {
        slug: 'local-terminal',
        title: 'Local Terminal',
        description: 'Use DeepTerm as your local shell.',
        content: `
<p>DeepTerm isn't just for remote servers. Open a local terminal tab from <strong>File → New Local Terminal</strong> or press <kbd>⌘T</kbd>.</p>

<p>Local terminals use your default shell (<code>zsh</code>, <code>bash</code>, <code>fish</code>, etc.) and inherit your <code>PATH</code> and environment. All the same split, search, and theming features work in local mode.</p>
`,
      },
      {
        slug: 'mosh-protocol',
        title: 'Mosh Protocol',
        description: 'Roaming-resilient connections with Mobile Shell.',
        content: `
<p>Mosh (Mobile Shell) is an alternative to SSH that maintains your session even when switching networks, closing your laptop lid, or experiencing high-latency connections. DeepTerm has built-in Mosh support — no separate install needed.</p>

<h3>How It Works</h3>
<p>Mosh uses SSH to bootstrap the connection, then switches to a UDP-based protocol that:</p>
<ul>
  <li>Survives network changes (Wi-Fi → cellular → back).</li>
  <li>Stays connected through laptop sleep/wake cycles.</li>
  <li>Provides instant local echo (no waiting for the round-trip).</li>
  <li>Works well on high-latency or lossy connections.</li>
</ul>

<h3>Enabling Mosh</h3>
<ol>
  <li>Edit a host and go to the <strong>Advanced</strong> section.</li>
  <li>Toggle <strong>Mosh Protocol (Mobile Shell)</strong> on.</li>
  <li>Optionally enable <strong>Auto-detect</strong> — DeepTerm will try Mosh first and fall back to SSH if the server doesn't have <code>mosh-server</code> installed.</li>
</ol>

<h3>Server Requirements</h3>
<p>The remote server must have <code>mosh-server</code> installed:</p>
<ul>
  <li>Ubuntu/Debian: <code>sudo apt install mosh</code></li>
  <li>CentOS/RHEL: <code>sudo yum install mosh</code></li>
  <li>macOS: <code>brew install mosh</code></li>
</ul>
<p>The server firewall must allow UDP ports 60000–61000.</p>

<h3>Mosh vs SSH</h3>
<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; margin: 16px 0; font-size: 13px;">
  <table style="width: 100%; border-collapse: collapse;">
    <thead>
      <tr style="background: #161b22;">
        <th style="padding: 8px 12px; text-align: left; color: #8b949e; border-bottom: 1px solid #30363d;">Feature</th>
        <th style="padding: 8px 12px; text-align: center; color: #8b949e; border-bottom: 1px solid #30363d;">SSH</th>
        <th style="padding: 8px 12px; text-align: center; color: #8b949e; border-bottom: 1px solid #30363d;">Mosh</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="padding: 6px 12px; color: #c9d1d9; border-bottom: 1px solid #21262d;">Roaming</td><td style="text-align:center; color: #f85149;">✗</td><td style="text-align:center; color: #3fb950;">✓</td></tr>
      <tr><td style="padding: 6px 12px; color: #c9d1d9; border-bottom: 1px solid #21262d;">Survives sleep</td><td style="text-align:center; color: #f85149;">✗</td><td style="text-align:center; color: #3fb950;">✓</td></tr>
      <tr><td style="padding: 6px 12px; color: #c9d1d9; border-bottom: 1px solid #21262d;">Local echo</td><td style="text-align:center; color: #f85149;">✗</td><td style="text-align:center; color: #3fb950;">✓</td></tr>
      <tr><td style="padding: 6px 12px; color: #c9d1d9; border-bottom: 1px solid #21262d;">Port forwarding</td><td style="text-align:center; color: #3fb950;">✓</td><td style="text-align:center; color: #f85149;">✗</td></tr>
      <tr><td style="padding: 6px 12px; color: #c9d1d9; border-bottom: 1px solid #21262d;">SFTP</td><td style="text-align:center; color: #3fb950;">✓</td><td style="text-align:center; color: #f85149;">✗</td></tr>
      <tr><td style="padding: 6px 12px; color: #c9d1d9;">Agent forwarding</td><td style="text-align:center; color: #3fb950;">✓</td><td style="text-align:center; color: #f85149;">✗</td></tr>
    </tbody>
  </table>
</div>
<p><em>Tip: Mosh is best for interactive terminal work. Use SSH when you need port forwarding, SFTP, or agent forwarding.</em></p>
`,
      },
    ],
  },

  // ─── SFTP File Manager ─────────────────────────────────
  {
    label: 'SFTP File Manager',
    icon: FileText,
    articles: [
      {
        slug: 'sftp-overview',
        title: 'SFTP Overview',
        description: 'Browse and transfer files with the dual-pane file manager.',
        content: `
<p>DeepTerm includes a full-featured SFTP file manager with a dual-pane interface for browsing local and remote filesystems side by side. Transfer files with drag and drop, manage permissions, and perform all common file operations.</p>

<h3>Opening SFTP</h3>
<p>Click the <strong>SFTP</strong> button in the toolbar or switch to SFTP mode from the mode selector. Select a host to connect to, and the remote pane will show the server's filesystem.</p>

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin: 16px 0; font-family: monospace; font-size: 12px;">
  <div style="color: #58a6ff; margin-bottom: 12px;">Dual-Pane Layout</div>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px; background: #30363d; border-radius: 6px; overflow: hidden;">
    <div style="background: #0d1117; padding: 16px;">
      <div style="color: #3fb950; font-weight: 600; margin-bottom: 8px;">📁 Local</div>
      <div style="color: #8b949e; font-size: 11px;">/Users/you/Documents</div>
      <div style="margin-top: 8px; color: #c9d1d9;">
        <div>📁 Projects/</div>
        <div>📄 readme.md</div>
        <div>📄 deploy.sh</div>
        <div style="color: #58a6ff;">📄 config.yml ← drag</div>
      </div>
    </div>
    <div style="background: #0d1117; padding: 16px;">
      <div style="color: #f0883e; font-weight: 600; margin-bottom: 8px;">🌐 Remote</div>
      <div style="color: #8b949e; font-size: 11px;">/home/deploy/app</div>
      <div style="margin-top: 8px; color: #c9d1d9;">
        <div>📁 src/</div>
        <div>📁 config/</div>
        <div>📄 package.json</div>
        <div style="color: #58a6ff;">→ drop here</div>
      </div>
    </div>
  </div>
  <div style="color: #8b949e; font-size: 11px; margin-top: 8px; text-align: center;">Drag files between panes to upload or download</div>
</div>

<h3>Dual Pane</h3>
<p>The left pane shows your local filesystem. The right pane shows the remote server. Navigate independently in each pane — click folders to enter them, use the breadcrumb path bar to jump back up.</p>

<h3>Connection Reuse</h3>
<p>SFTP reuses your existing SSH connection, so there's no additional authentication step. If you're already connected to a host in SSH mode, switching to SFTP connects instantly.</p>
`,
      },
      {
        slug: 'sftp-transfers',
        title: 'File Transfers',
        description: 'Upload and download files with drag and drop.',
        content: `
<h3>Uploading Files</h3>
<p>Drag files from the <strong>local pane</strong> (left) to the <strong>remote pane</strong> (right). You can drag multiple files and folders at once. A transfer progress overlay appears showing each file's status.</p>

<h3>Downloading Files</h3>
<p>Drag files from the <strong>remote pane</strong> (right) to the <strong>local pane</strong> (left). Files are downloaded to the directory currently shown in the local pane.</p>

<h3>Transfer Queue</h3>
<p>All transfers are queued and processed sequentially. The transfer overlay shows:</p>
<ul>
  <li>File name and direction (upload/download).</li>
  <li>Progress bar with percentage.</li>
  <li>Transfer speed and estimated time remaining.</li>
  <li>Cancel button for individual transfers.</li>
</ul>

<h3>Large Files</h3>
<p>SFTP handles files of any size. For very large files, the progress bar updates in real time so you can monitor the transfer.</p>
`,
      },
      {
        slug: 'sftp-file-operations',
        title: 'File Operations',
        description: 'Rename, delete, chmod, and more.',
        content: `
<p>Right-click any file or folder in either pane to access these operations:</p>

<h3>All 11 File Actions</h3>
<ol>
  <li><strong>Open / View</strong> — open the file in its default application.</li>
  <li><strong>Rename</strong> — change the file or folder name inline.</li>
  <li><strong>Delete</strong> — remove the file or folder (with confirmation).</li>
  <li><strong>Create Folder</strong> — create a new directory (<kbd>⌘⇧N</kbd>).</li>
  <li><strong>Change Permissions</strong> — set chmod permissions (e.g., 755, 644) on remote files.</li>
  <li><strong>Refresh</strong> — reload the current directory listing.</li>
  <li><strong>Get Info</strong> — view file size, modification date, owner, and permissions.</li>
  <li><strong>Duplicate</strong> — create a copy of the file in the same directory.</li>
  <li><strong>Compress</strong> — create an archive of the selected file(s).</li>
  <li><strong>Upload</strong> — send the file to the remote server.</li>
  <li><strong>Download</strong> — save the remote file locally.</li>
</ol>

<h3>Hidden Files</h3>
<p>Toggle hidden files (dotfiles) with <kbd>⌘⇧H</kbd> or the eye icon in the toolbar.</p>

<h3>Filtering</h3>
<p>Type in the filter bar to narrow the file list in real time. Filtering works in both local and remote panes independently.</p>
`,
      },
    ],
  },

  // ─── Snippets ──────────────────────────────────────────
  {
    label: 'Snippets',
    icon: Code,
    articles: [
      {
        slug: 'snippets-overview',
        title: 'Snippets Overview',
        description: 'Save and reuse shell commands across hosts.',
        content: `
<p>Snippets are reusable shell commands that you can execute on one or multiple SSH hosts simultaneously. Think of them as your personal command library — organised in folders, tagged for easy search, and ready to run with one click.</p>

<h3>Opening Snippets</h3>
<p>Click <strong>Snippets</strong> in the toolbar or switch to Snippets mode from the mode selector.</p>

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin: 16px 0; font-family: monospace; font-size: 12px;">
  <div style="color: #58a6ff; margin-bottom: 12px;">Snippet Library</div>
  <div style="display: grid; grid-template-columns: 200px 1fr; gap: 2px; background: #30363d; border-radius: 6px; overflow: hidden;">
    <div style="background: #0d1117; padding: 12px;">
      <div style="color: #c9d1d9; font-weight: 600; margin-bottom: 8px;">Folders</div>
      <div style="color: #8b949e; font-size: 11px;">
        <div style="padding: 2px 0;">📁 System Health</div>
        <div style="padding: 2px 0;">📁 Docker</div>
        <div style="padding: 2px 0; color: #58a6ff;">📁 Deployments ●</div>
        <div style="padding: 2px 0;">📁 Database</div>
      </div>
    </div>
    <div style="background: #0d1117; padding: 12px;">
      <div style="color: #3fb950; font-weight: 600; margin-bottom: 4px;">Deploy to Production</div>
      <div style="color: #8b949e; font-size: 11px; margin-bottom: 8px;">Tags: deploy, prod, release</div>
      <div style="background: #161b22; border-radius: 4px; padding: 8px; color: #c9d1d9; font-size: 11px;">
        cd /opt/app &amp;&amp; git pull origin main<br/>
        npm install --production<br/>
        pm2 restart all
      </div>
      <div style="color: #8b949e; font-size: 10px; margin-top: 8px;">Used 23 times · Last run: 2h ago</div>
    </div>
  </div>
</div>
`,
      },
      {
        slug: 'snippets-create',
        title: 'Creating Snippets',
        description: 'Create, edit, and organise command snippets.',
        content: `
<h3>Create a Snippet</h3>
<p>Click the <strong>+</strong> button in Snippets mode. Fill in:</p>
<ul>
  <li><strong>Name</strong> — a descriptive title (e.g., "Check disk usage").</li>
  <li><strong>Command</strong> — the shell command(s) to execute. Multi-line is supported.</li>
  <li><strong>Description</strong> — optional notes about what the command does.</li>
  <li><strong>Tags</strong> — for quick filtering and search.</li>
  <li><strong>Folder</strong> — organise related snippets together.</li>
</ul>

<h3>Built-in Library</h3>
<p>DeepTerm ships with 8 built-in snippets to get you started:</p>
<ol>
  <li><strong>System Information</strong> — <code>uname -a; uptime; df -h</code></li>
  <li><strong>Memory Usage</strong> — <code>free -h</code></li>
  <li><strong>Disk Usage</strong> — <code>df -h; du -sh /*</code></li>
  <li><strong>Top Processes</strong> — <code>ps aux --sort=-%mem | head -10</code></li>
  <li><strong>Network Info</strong> — <code>ip addr; ip route</code></li>
  <li><strong>Docker Status</strong> — <code>docker ps -a; docker images</code></li>
  <li><strong>Git Status</strong> — <code>git status; git log -5 --oneline</code></li>
  <li><strong>Update Packages</strong> — <code>apt update &amp;&amp; apt upgrade -y</code></li>
</ol>

<h3>Favourites</h3>
<p>Mark frequently used snippets as favourites — they appear at the top of the list for quick access.</p>
`,
      },
      {
        slug: 'snippets-execution',
        title: 'Executing Snippets',
        description: 'Run commands on one or many hosts at once.',
        content: `
<h3>Single Host Execution</h3>
<p>Select a snippet and click <strong>Execute</strong>. Choose a host from the picker and the command runs immediately. The output is captured and displayed in the result panel.</p>

<h3>Multi-Host Execution</h3>
<p>Select multiple hosts in the execution dialog to run the same command on all of them <strong>simultaneously</strong>. DeepTerm uses Swift's <code>TaskGroup</code> for true parallel execution — results stream in as each host completes.</p>

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin: 16px 0; font-family: monospace; font-size: 12px;">
  <div style="color: #58a6ff; margin-bottom: 8px;">Multi-host result — "Check disk usage" on 3 servers</div>
  <div style="margin: 4px 0; padding: 8px; background: #161b22; border-radius: 4px; border-left: 3px solid #3fb950;">
    <span style="color: #3fb950;">✓ web-01</span> <span style="color: #8b949e;">(0.4s)</span><br/>
    <span style="color: #c9d1d9; font-size: 11px;">/dev/sda1 &nbsp; 45G &nbsp; 12G &nbsp; 31G &nbsp; 28%</span>
  </div>
  <div style="margin: 4px 0; padding: 8px; background: #161b22; border-radius: 4px; border-left: 3px solid #3fb950;">
    <span style="color: #3fb950;">✓ web-02</span> <span style="color: #8b949e;">(0.6s)</span><br/>
    <span style="color: #c9d1d9; font-size: 11px;">/dev/sda1 &nbsp; 45G &nbsp; 38G &nbsp; 5G &nbsp; 89%</span>
  </div>
  <div style="margin: 4px 0; padding: 8px; background: #161b22; border-radius: 4px; border-left: 3px solid #f85149;">
    <span style="color: #f85149;">✗ db-01</span> <span style="color: #8b949e;">(timeout)</span><br/>
    <span style="color: #8b949e; font-size: 11px;">Connection refused</span>
  </div>
</div>

<h3>Saved Tasks</h3>
<p>Save a snippet + host combination as a <strong>Task</strong> for one-click repeat execution. Great for routine operations like daily health checks or deployment scripts.</p>

<h3>Usage Statistics</h3>
<p>Each snippet tracks how many times it's been run and when it was last used, helping you identify your most-used commands.</p>
`,
      },
    ],
  },

  // ─── Port Forwarding ──────────────────────────────────
  {
    label: 'Port Forwarding',
    icon: ArrowLeftRight,
    articles: [
      {
        slug: 'port-forwarding-overview',
        title: 'Port Forwarding Overview',
        description: 'Create SSH tunnels for local, remote, and dynamic forwarding.',
        content: `
<p>Port forwarding (SSH tunneling) lets you securely access services through an encrypted SSH connection. DeepTerm supports all three types: Local, Remote, and Dynamic (SOCKS proxy).</p>

<h3>Opening Port Forwarding</h3>
<p>Click <strong>Port Forwarding</strong> in the toolbar or switch to Port Forward mode. You'll see a list of your configured forwards with their status (active / inactive).</p>

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin: 16px 0; font-family: monospace; font-size: 12px;">
  <div style="color: #58a6ff; margin-bottom: 12px;">Three Forwarding Types</div>
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px;">
      <div style="color: #3fb950; font-weight: 600;">Local Forward</div>
      <div style="color: #8b949e; font-size: 11px; margin-top: 4px;">Access remote services<br/>on localhost</div>
      <div style="color: #58a6ff; font-size: 11px; margin-top: 8px;">-L 3306:db:3306</div>
    </div>
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px;">
      <div style="color: #f0883e; font-weight: 600;">Remote Forward</div>
      <div style="color: #8b949e; font-size: 11px; margin-top: 4px;">Expose local services<br/>to the remote server</div>
      <div style="color: #58a6ff; font-size: 11px; margin-top: 8px;">-R 8080:localhost:80</div>
    </div>
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px;">
      <div style="color: #bc8cff; font-weight: 600;">Dynamic (SOCKS)</div>
      <div style="color: #8b949e; font-size: 11px; margin-top: 4px;">Route all traffic<br/>through SSH tunnel</div>
      <div style="color: #58a6ff; font-size: 11px; margin-top: 8px;">-D 1080</div>
    </div>
  </div>
</div>
`,
      },
      {
        slug: 'local-forwarding',
        title: 'Local Forwarding',
        description: 'Access remote services on your local machine.',
        content: `
<p>Local forwarding makes a remote service appear on a local port. This is the most common type — use it to access databases, web admin panels, or any TCP service behind a firewall.</p>

<h3>Example: Access a Remote Database</h3>
<p>Your database runs on port 5432 on a server that's only accessible via SSH. Create a local forward:</p>
<ul>
  <li><strong>Local Port:</strong> 5432</li>
  <li><strong>Remote Host:</strong> localhost (from the server's perspective)</li>
  <li><strong>Remote Port:</strong> 5432</li>
</ul>
<p>Now connect your database client to <code>localhost:5432</code> — traffic is tunneled through SSH.</p>

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin: 16px 0; font-family: monospace; font-size: 12px; color: #8b949e;">
  <div style="color: #58a6ff; margin-bottom: 8px;">Local Forward — Data Flow</div>
  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
    <span style="color: #3fb950; background: #0d2818; padding: 4px 8px; border-radius: 4px;">Your Mac :5432</span>
    <span>→ encrypted →</span>
    <span style="color: #f0883e; background: #2d1b06; padding: 4px 8px; border-radius: 4px;">SSH Server</span>
    <span>→ local →</span>
    <span style="color: #bc8cff; background: #1e0f30; padding: 4px 8px; border-radius: 4px;">PostgreSQL :5432</span>
  </div>
</div>

<h3>Common Use Cases</h3>
<ul>
  <li>Database access (PostgreSQL, MySQL, Redis)</li>
  <li>Web admin panels (phpMyAdmin, Grafana, Kibana)</li>
  <li>Internal APIs behind a firewall</li>
  <li>Development servers running on a remote machine</li>
</ul>
`,
      },
      {
        slug: 'remote-forwarding',
        title: 'Remote Forwarding',
        description: 'Expose local services to a remote server.',
        content: `
<p>Remote forwarding makes a local service available on the remote server's port. Use it to share your local development server or expose a webhook endpoint.</p>

<h3>Example: Share a Local Web Server</h3>
<p>You have a development server running on <code>localhost:3000</code> and want a colleague on the remote server to access it:</p>
<ul>
  <li><strong>Remote Port:</strong> 8080</li>
  <li><strong>Local Host:</strong> localhost</li>
  <li><strong>Local Port:</strong> 3000</li>
</ul>
<p>Anyone on the remote server can now access your dev server at <code>localhost:8080</code>.</p>

<h3>Common Use Cases</h3>
<ul>
  <li>Demo local apps to a team on a shared server</li>
  <li>Expose webhook receivers for testing</li>
  <li>Provide temporary access to local services</li>
</ul>
`,
      },
      {
        slug: 'dynamic-forwarding',
        title: 'Dynamic Forwarding (SOCKS)',
        description: 'Route traffic through a SOCKS proxy tunnel.',
        content: `
<p>Dynamic forwarding creates a SOCKS5 proxy that routes all traffic through the SSH tunnel. This is useful for bypassing firewalls or securing traffic on untrusted networks.</p>

<h3>Setup</h3>
<ol>
  <li>Create a new port forward with type <strong>Dynamic</strong>.</li>
  <li>Set the <strong>Local Port</strong> (e.g., 1080).</li>
  <li>Start the tunnel.</li>
  <li>Configure your browser or application to use SOCKS5 proxy at <code>localhost:1080</code>.</li>
</ol>

<h3>macOS System Proxy</h3>
<p>To route all system traffic: System Settings → Network → your connection → Proxies → SOCKS Proxy → set to <code>localhost:1080</code>.</p>

<h3>Common Use Cases</h3>
<ul>
  <li>Secure browsing on public Wi-Fi</li>
  <li>Access geo-restricted content through a remote server</li>
  <li>Route application traffic through a trusted server</li>
</ul>
`,
      },
    ],
  },

  // ─── Hosts & Groups ───────────────────────────────────
  {
    label: 'Hosts & Groups',
    icon: Server,
    articles: [
      {
        slug: 'managing-hosts',
        title: 'Managing Hosts',
        description: 'Create, edit, duplicate, and delete hosts.',
        content: `
<h3>Creating Hosts</h3>
<p>Use the <strong>+</strong> button or <kbd>⌘N</kbd> to add a new host. Fill in connection details and select credentials from your keychain, then save.</p>

<h3>Editing</h3>
<p>Right-click a host and choose <strong>Edit</strong>, or select it and press <kbd>⌘E</kbd>. Changes take effect on the next connection.</p>

<h3>Duplicating</h3>
<p>Right-click → <strong>Duplicate</strong> creates a copy with the same settings. Useful when adding similar servers.</p>

<h3>Deleting</h3>
<p>Right-click → <strong>Delete</strong> or press <kbd>⌫</kbd>. Deleted hosts are moved to the trash and can be restored within 30 days.</p>

<h3>Tags</h3>
<p>Add tags to hosts for quick filtering. Type a tag in the host editor or drag a tag from the sidebar onto a host.</p>
`,
      },
      {
        slug: 'groups',
        title: 'Groups',
        description: 'Organise hosts into folders and nested groups.',
        content: `
<h3>Creating Groups</h3>
<p>Click <strong>+</strong> → <strong>New Group</strong> or right-click in the sidebar and choose <strong>New Group</strong>. Name it something descriptive (e.g., "Production", "AWS EU-West").</p>

<h3>Nesting</h3>
<p>Drag a group into another group to create hierarchy. There's no limit on depth, but 2–3 levels is recommended for clarity.</p>

<h3>Group Defaults</h3>
<p>Set default credentials, port, or username at the group level. Any host inside the group inherits these unless overridden. This reduces duplication when all servers in a group share the same SSH key or identity.</p>

<h3>Sorting</h3>
<p>Groups can be sorted alphabetically, by last-connected date, or manually (drag to reorder).</p>
`,
      },
      {
        slug: 'search',
        title: 'Search & Filter',
        description: 'Find hosts, groups, and credentials instantly.',
        content: `
<h3>Global Search</h3>
<p>Press <kbd>⌘K</kbd> to open the command palette. Type any host name, IP, tag, or group name and DeepTerm will fuzzy-match across everything.</p>

<h3>Sidebar Filter</h3>
<p>Use the filter bar at the top of the sidebar to narrow by tag, group, or connection status (online / offline).</p>

<h3>Recent Connections</h3>
<p>The <strong>Recent</strong> section at the top of the sidebar shows your last 10 connections for quick access.</p>
`,
      },
    ],
  },

  // ─── Keychain ──────────────────────────────────────────
  {
    label: 'Keychain',
    icon: Key,
    articles: [
      {
        slug: 'keychain-overview',
        title: 'Keychain Overview',
        description: 'Centralised management for keys, identities, and credentials.',
        content: `
<p>The DeepTerm Keychain is a centralised place to manage all your authentication materials. Instead of configuring credentials per-host, create them once in the Keychain and assign them to any number of hosts.</p>

<h3>What's in the Keychain</h3>
<ul>
  <li><strong>SSH Keys</strong> — Ed25519, RSA, ECDSA private keys (generated or imported).</li>
  <li><strong>Identities</strong> — a username paired with an authentication method (password, key, Touch ID, FIDO2).</li>
  <li><strong>Certificates</strong> — SSH certificates with CA issuer, validity period, and principals.</li>
  <li><strong>Touch ID Keys</strong> — biometric keys stored in the Secure Enclave.</li>
  <li><strong>FIDO2 Keys</strong> — hardware security keys (YubiKey, etc.).</li>
</ul>

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin: 16px 0; font-family: monospace; font-size: 12px;">
  <div style="color: #58a6ff; margin-bottom: 12px;">Keychain Tabs</div>
  <div style="display: flex; gap: 8px; margin-bottom: 12px;">
    <span style="background: #161b22; border: 1px solid #58a6ff; color: #58a6ff; padding: 4px 12px; border-radius: 4px;">🔑 Keys</span>
    <span style="background: #161b22; border: 1px solid #30363d; color: #8b949e; padding: 4px 12px; border-radius: 4px;">📜 Certificates</span>
    <span style="background: #161b22; border: 1px solid #30363d; color: #8b949e; padding: 4px 12px; border-radius: 4px;">🔐 Touch ID</span>
    <span style="background: #161b22; border: 1px solid #30363d; color: #8b949e; padding: 4px 12px; border-radius: 4px;">🔑 FIDO2</span>
  </div>
  <div style="background: #161b22; border-radius: 6px; padding: 12px;">
    <div style="display: flex; justify-content: space-between; color: #c9d1d9; margin-bottom: 6px;">
      <span>🔑 id_ed25519 (default)</span>
      <span style="color: #3fb950; font-size: 11px;">Ed25519</span>
    </div>
    <div style="display: flex; justify-content: space-between; color: #c9d1d9; margin-bottom: 6px;">
      <span>🔑 aws-prod-key.pem</span>
      <span style="color: #f0883e; font-size: 11px;">RSA 4096</span>
    </div>
    <div style="display: flex; justify-content: space-between; color: #c9d1d9;">
      <span>👤 admin (all prod servers)</span>
      <span style="color: #8b949e; font-size: 11px;">Identity · Key auth</span>
    </div>
  </div>
</div>

<h3>Assigning to Hosts</h3>
<p>When editing a host, pick an identity or key from the Keychain dropdown. The host references the Keychain item — if you update the key or rotate a password in the Keychain, all hosts using it are automatically updated.</p>
`,
      },
      {
        slug: 'ssh-keys',
        title: 'SSH Keys',
        description: 'Generate, import, and manage SSH keys.',
        content: `
<h3>Generating a Key</h3>
<p>Go to <strong>Keychain → Keys</strong> and click <strong>Generate New Key</strong>. Choose:</p>
<ul>
  <li><strong>Algorithm</strong> — Ed25519 (recommended), RSA (2048/4096), or ECDSA.</li>
  <li><strong>Label</strong> — a descriptive name (e.g., "Production key").</li>
  <li><strong>Passphrase</strong> — optional, for additional protection.</li>
</ul>
<p>The key is stored in your encrypted vault.</p>

<h3>Importing</h3>
<p>Click <strong>Import Key</strong> and select a <code>.pem</code>, <code>.pub</code>, or OpenSSH-format private key file. DeepTerm detects the format automatically.</p>

<h3>Exporting</h3>
<p>Right-click a key and choose <strong>Copy Public Key</strong> to paste it into <code>authorized_keys</code> on your server.</p>

<h3>Passphrase Protection</h3>
<p>Keys encrypted with a passphrase require entry on first use. DeepTerm can remember the passphrase in macOS Keychain so you don't need to enter it again.</p>
`,
      },
      {
        slug: 'identities',
        title: 'Identities',
        description: 'Reusable username + authentication combinations.',
        content: `
<p>An Identity combines a <strong>username</strong> with an <strong>authentication method</strong>. Create identities for your common login combinations and assign them to multiple hosts.</p>

<h3>Creating an Identity</h3>
<ol>
  <li>Go to <strong>Keychain → Keys</strong> (identities appear alongside keys).</li>
  <li>Click <strong>New Identity</strong>.</li>
  <li>Enter a username and select the authentication method:</li>
</ol>
<ul>
  <li><strong>Password</strong> — stored encrypted in your vault.</li>
  <li><strong>SSH Key</strong> — reference a key from the Keychain.</li>
  <li><strong>Certificate</strong> — use an SSH certificate.</li>
  <li><strong>Touch ID</strong> — use a Secure Enclave biometric key.</li>
  <li><strong>FIDO2</strong> — use a hardware security key.</li>
</ul>

<h3>Using Identities</h3>
<p>When editing a host, select an identity from the credentials dropdown. The host will use that identity's username and auth method to connect.</p>

<h3>Benefits</h3>
<p>If you change a password or rotate a key, update it once in the identity — all hosts referencing it pick up the change automatically.</p>
`,
      },
      {
        slug: 'touch-id',
        title: 'Touch ID / Secure Enclave',
        description: 'Authenticate with your fingerprint using hardware-backed keys.',
        content: `
<p>DeepTerm can generate SSH keys stored in your Mac's <strong>Secure Enclave</strong> — the same hardware chip that protects Touch ID and Apple Pay. These keys cannot be exported, copied, or stolen — authentication always requires your fingerprint.</p>

<h3>How It Works</h3>
<ol>
  <li>Go to <strong>Keychain → Touch ID</strong>.</li>
  <li>Click <strong>Generate Biometric Key</strong>.</li>
  <li>Touch ID verifies your identity.</li>
  <li>An ECDSA P-256 key is created in the Secure Enclave.</li>
  <li>The public key is displayed — copy it to your server's <code>authorized_keys</code>.</li>
</ol>

<h3>Security Guarantees</h3>
<ul>
  <li>Private key never leaves the Secure Enclave hardware.</li>
  <li>Every SSH authentication requires a fresh Touch ID scan.</li>
  <li>Cannot be exported, backed up, or transferred to another device.</li>
  <li>ECDSA P-256 is the only algorithm supported by the Secure Enclave.</li>
</ul>

<p><em>Note: Touch ID keys are unique to each Mac. If you use multiple Macs, you'll need a separate biometric key on each one.</em></p>
`,
      },
      {
        slug: 'fido2-keys',
        title: 'FIDO2 Hardware Keys',
        description: 'Use YubiKey or other FIDO2 security keys for SSH.',
        content: `
<p>FIDO2 hardware keys (like YubiKey) provide the highest level of authentication security. The private key lives on the physical device and requires a touch to sign each authentication challenge.</p>

<h3>Setup</h3>
<ol>
  <li>Go to <strong>Keychain → FIDO2</strong>.</li>
  <li>Insert your FIDO2 key (USB) or hold it near (NFC).</li>
  <li>Click <strong>Register FIDO2 Key</strong>.</li>
  <li>Touch the key to confirm.</li>
  <li>Copy the generated public key to your server's <code>authorized_keys</code>.</li>
</ol>

<h3>Supported Keys</h3>
<ul>
  <li>YubiKey 5 series (USB-A, USB-C, NFC)</li>
  <li>Any FIDO2-compatible security key with <code>ecdsa-sk</code> or <code>ed25519-sk</code> support</li>
</ul>

<h3>Server Requirements</h3>
<p>The server must run OpenSSH 8.2+ to support FIDO2 key types (<code>sk-ecdsa-sha2-nistp256@openssh.com</code> or <code>sk-ssh-ed25519@openssh.com</code>).</p>
`,
      },
      {
        slug: 'credential-export-import',
        title: 'Export & Import',
        description: 'Export and import credentials between devices.',
        content: `
<h3>Exporting Credentials</h3>
<p>Go to <strong>Settings → Export</strong> to create an encrypted backup of your hosts and credentials. The export file is encrypted with a passphrase you choose — it's safe to transfer via USB drive or secure file sharing.</p>

<h3>Importing</h3>
<p>Go to <strong>Settings → Import</strong> and select the exported file. Enter the passphrase to decrypt and import all hosts, keys, and identities.</p>

<h3>What's Exported</h3>
<ul>
  <li>All hosts and groups (connection profiles)</li>
  <li>SSH keys (private + public)</li>
  <li>Identities (username + auth method)</li>
  <li>Passwords (encrypted with your passphrase)</li>
  <li>Snippets and port forwarding configurations</li>
</ul>

<p><em>Note: Touch ID and FIDO2 keys cannot be exported — they are hardware-bound. You'll need to re-register them on the new device.</em></p>
`,
      },
    ],
  },

  // ─── Vaults ────────────────────────────────────────────
  {
    label: 'Vaults',
    icon: FolderKey,
    articles: [
      {
        slug: 'vault-overview',
        title: 'Vault Overview',
        description: 'How zero-knowledge encrypted vaults work.',
        content: `
<p>Vaults are the core of DeepTerm's credential security. Every piece of sensitive data — SSH keys, passwords, host configurations — is stored inside an encrypted vault.</p>

<h3>Zero-Knowledge Architecture</h3>
<p>When you create a vault, DeepTerm derives an encryption key from your master password using Argon2id. All data is encrypted with AES-256-GCM <em>before</em> it leaves your device. The server stores only encrypted blobs — it cannot see names, types, or any metadata about your credentials.</p>

<h3>Vault Structure</h3>
<ul>
  <li><strong>Personal Vault</strong> — created automatically, for your private credentials.</li>
  <li><strong>Team Vaults</strong> — shared with specific team members (requires a Team or Business plan).</li>
</ul>
`,
      },
      {
        slug: 'vault-sync',
        title: 'Sync & Conflict Resolution',
        description: 'How vault data syncs across devices.',
        content: `
<h3>Sync Model</h3>
<p>DeepTerm syncs vaults to the cloud so you can access your credentials on multiple Macs. Sync happens automatically when you save changes and when the app launches.</p>

<h3>Conflict Resolution</h3>
<p>If the same item is edited on two devices simultaneously, DeepTerm uses last-write-wins semantics based on the <code>revisionDate</code> timestamp. The newer change takes precedence.</p>

<h3>Offline Mode</h3>
<p>A local encrypted copy of your vault is kept on disk. If you're offline, you can still connect to servers using cached credentials. Changes are queued and pushed when connectivity returns.</p>
`,
      },
      {
        slug: 'vault-sharing',
        title: 'Sharing Vaults',
        description: 'Share vaults with team members.',
        content: `
<p>Team and Business plans allow vault sharing. A shared vault lets multiple users access the same credentials without sending passwords over insecure channels.</p>

<h3>How It Works</h3>
<ol>
  <li>Create a team vault from <strong>Settings → Vaults → New Team Vault</strong>.</li>
  <li>Add credentials to the vault.</li>
  <li>Invite team members and set their role (<strong>read</strong> or <strong>read/write</strong>).</li>
</ol>

<p>Shared vault keys are exchanged using asymmetric encryption — each team member's public key wraps the vault key, and only their private key can unwrap it.</p>
`,
      },
    ],
  },

  // ─── Security ──────────────────────────────────────────
  {
    label: 'Security',
    icon: Shield,
    articles: [
      {
        slug: 'security-overview',
        title: 'Security Overview',
        description: 'How DeepTerm keeps your data safe.',
        content: `
<p>Security is the foundation of DeepTerm. Here's a summary of the key measures:</p>
<ul>
  <li><strong>End-to-end encryption</strong> — AES-256-GCM for vault data; TLS 1.2+ for all API traffic.</li>
  <li><strong>Zero-knowledge server</strong> — the server stores encrypted blobs only. No names, types, or metadata.</li>
  <li><strong>macOS Keychain</strong> — vault master keys and SSH key passphrases stored in hardware-backed Keychain.</li>
  <li><strong>Secure Enclave</strong> — Touch ID keys are generated and stored in hardware; they can never leave the chip.</li>
  <li><strong>FIDO2 support</strong> — authenticate with hardware security keys for maximum protection.</li>
  <li><strong>Sandboxed app</strong> — runs in a macOS sandbox with minimal entitlements.</li>
</ul>
`,
      },
      {
        slug: 'two-factor-auth',
        title: 'Two-Factor Authentication',
        description: 'Enable 2FA with TOTP or passkeys.',
        content: `
<h3>TOTP (Time-Based One-Time Password)</h3>
<ol>
  <li>Go to <a href="/dashboard/2fa">Dashboard → 2FA</a>.</li>
  <li>Scan the QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.).</li>
  <li>Enter the 6-digit code to verify.</li>
  <li>Save your backup codes in a secure location.</li>
</ol>

<h3>Passkeys / WebAuthn</h3>
<p>For passwordless login, register a passkey from <a href="/dashboard/passkeys">Dashboard → Passkeys</a>. Passkeys use FIDO2/WebAuthn and work with Touch ID, Face ID, or hardware security keys (YubiKey).</p>

<h3>Recovery</h3>
<p>If you lose access to your authenticator, use one of your backup codes. Each code can only be used once. If you've exhausted all codes, contact support with account verification.</p>
`,
      },
      {
        slug: 'encryption',
        title: 'Encryption Details',
        description: 'Technical details of the encryption used.',
        content: `
<h3>Key Derivation</h3>
<p>Your master password is stretched using <strong>Argon2id</strong> with a per-user salt (128-bit). Parameters: memory = 64 MiB, iterations = 3, parallelism = 4. The result is a 256-bit symmetric key.</p>

<h3>Data Encryption</h3>
<p>Vault items are encrypted with <strong>AES-256-GCM</strong>. Each item has a unique 96-bit IV. The authentication tag prevents tampering. The encrypted blob includes the item type, name, and all fields — the server sees nothing.</p>

<h3>Transport</h3>
<p>All API communication uses <strong>TLS 1.2 or 1.3</strong> (ECDHE key exchange, AES-GCM ciphers). Certificate pinning is planned for a future release.</p>

<h3>SSH Protocol</h3>
<p>DeepTerm uses <strong>libssh2</strong> for SSH connections. Supported algorithms include chacha20-poly1305, aes256-gcm, and curve25519-sha256 for key exchange.</p>
`,
      },
    ],
  },

  // ─── Teams ─────────────────────────────────────────────
  {
    label: 'Teams',
    icon: Users,
    articles: [
      {
        slug: 'team-setup',
        title: 'Setting Up a Team',
        description: 'Create a team and invite members.',
        content: `
<h3>Create a Team</h3>
<ol>
  <li>Go to <a href="/dashboard/team">Dashboard → Team</a>.</li>
  <li>Click <strong>Create Team</strong> and enter a name.</li>
  <li>You are automatically the team owner.</li>
</ol>

<h3>Invite Members</h3>
<p>Click <strong>Invite</strong> and enter their email address. They'll receive an invitation link that expires in 7 days. Roles:</p>
<ul>
  <li><strong>Admin</strong> — can invite/remove members and manage shared vaults.</li>
  <li><strong>Member</strong> — can use shared vaults assigned to them.</li>
</ul>
`,
      },
      {
        slug: 'team-vaults',
        title: 'Team Vaults',
        description: 'Share credentials securely with your team.',
        content: `
<p>Team vaults let you share sets of credentials with specific team members. Each member decrypts the vault with their own key — credentials are never exposed in plain text on the server.</p>

<h3>Access Control</h3>
<ul>
  <li><strong>Read-only</strong> — member can connect using credentials but cannot edit or export them.</li>
  <li><strong>Read-write</strong> — member can add, edit, and delete credentials.</li>
  <li><strong>Admin</strong> — can manage vault membership + read-write access.</li>
</ul>
`,
      },
    ],
  },

  // ─── Sync & Devices ────────────────────────────────────
  {
    label: 'Sync & Devices',
    icon: RefreshCw,
    articles: [
      {
        slug: 'multi-device',
        title: 'Multiple Devices',
        description: 'Use DeepTerm on multiple Macs.',
        content: `
<p>Sign in with the same account on multiple Macs and your vaults will sync automatically. Each device registers itself and receives a device token for secure API access.</p>

<h3>Device Management</h3>
<p>View all registered devices from <a href="/dashboard/security-assessment">Dashboard → Security Assessment</a>. You can revoke a device token if a machine is lost or decommissioned.</p>
`,
      },
      {
        slug: 'sync-details',
        title: 'How Sync Works',
        description: 'Technical details of vault synchronisation.',
        content: `
<h3>Protocol</h3>
<p>DeepTerm uses a REST-based sync protocol over HTTPS. On launch and on every save, the client sends its last-known revision date. The server responds with any items newer than that date.</p>

<h3>Deduplication</h3>
<p>Items are deduplicated by their encrypted content hash. If two devices create the same credential, only one copy is stored server-side.</p>

<h3>Soft Deletes</h3>
<p>Deleted items are marked with a <code>deletedAt</code> timestamp and excluded from sync after 30 days. This ensures that deletes propagate to all devices before the record is permanently removed.</p>
`,
      },
    ],
  },

  // ─── Account & Billing ────────────────────────────────
  {
    label: 'Account & Billing',
    icon: Settings,
    articles: [
      {
        slug: 'account-management',
        title: 'Account Management',
        description: 'Manage your DeepTerm account.',
        content: `
<h3>Profile</h3>
<p>Update your name and email from <a href="/dashboard">Dashboard</a>. Changes take effect immediately.</p>

<h3>Change Password</h3>
<p>Go to <strong>Dashboard → Security</strong> and click <strong>Change Password</strong>. You'll be asked to enter your current password first.</p>

<h3>Delete Account</h3>
<p>Account deletion is permanent. All vaults, credentials, and team memberships will be destroyed. Go to <strong>Dashboard → Settings → Delete Account</strong> and confirm.</p>
`,
      },
      {
        slug: 'plans-and-billing',
        title: 'Plans & Billing',
        description: 'Free, Pro, and Business plans.',
        content: `
<h3>Plans</h3>
<ul>
  <li><strong>Free</strong> — up to 3 hosts, 1 vault, single device.</li>
  <li><strong>Pro</strong> — unlimited hosts, unlimited vaults, unlimited devices, priority support, vault sharing.</li>
  <li><strong>Business</strong> — everything in Pro + team management, SSO, audit logs, and dedicated support.</li>
</ul>

<h3>Billing</h3>
<p>Pro and Business plans are billed monthly or annually via Stripe. Manage your subscription, update payment methods, and download invoices from <a href="/dashboard/billing">Dashboard → Billing</a>.</p>
`,
      },
    ],
  },

  // ─── Troubleshooting ──────────────────────────────────
  {
    label: 'Troubleshooting',
    icon: HelpCircle,
    articles: [
      {
        slug: 'connection-issues',
        title: 'Connection Issues',
        description: 'Common connection problems and fixes.',
        content: `
<h3>Connection Refused</h3>
<p>Verify the host is reachable (<code>ping hostname</code>), the SSH service is running (<code>sudo systemctl status sshd</code>), and the port is correct (default 22).</p>

<h3>Authentication Failed</h3>
<ul>
  <li>Check that the username and password / key are correct.</li>
  <li>Ensure your public key is in <code>~/.ssh/authorized_keys</code> on the server.</li>
  <li>For Touch ID keys, verify the public key was added to the server.</li>
  <li>For FIDO2 keys, ensure the server runs OpenSSH 8.2+ for <code>sk-</code> key type support.</li>
  <li>Check <code>/var/log/auth.log</code> (or <code>/var/log/secure</code>) on the server for details.</li>
</ul>

<h3>Connection Drops</h3>
<p>Enable <strong>Keep-Alive</strong> in the host's advanced settings. Set the interval to 30–60 seconds. Also check if your network / firewall has idle-session timeouts. Consider enabling <strong>Mosh</strong> for connections that need to survive network changes.</p>

<h3>Slow Connections</h3>
<p>Try disabling DNS lookups on the server: set <code>UseDNS no</code> in <code>/etc/ssh/sshd_config</code>. Also try a different cipher (<code>aes128-gcm</code> is faster on older hardware).</p>
`,
      },
      {
        slug: 'sftp-issues',
        title: 'SFTP Issues',
        description: 'File transfer problems and fixes.',
        content: `
<h3>SFTP Connection Failed</h3>
<p>SFTP uses the same SSH connection. If SSH works but SFTP doesn't, check that the server's SFTP subsystem is enabled:</p>
<pre><code># In /etc/ssh/sshd_config:
Subsystem sftp /usr/lib/openssh/sftp-server</code></pre>

<h3>Permission Denied</h3>
<p>The connected user must have read/write permissions on the target directory. Check with <code>ls -la</code> and use <code>chmod</code> to fix.</p>

<h3>Transfer Interrupted</h3>
<p>If a transfer is interrupted, restart it — DeepTerm will overwrite the partial file. For very large files, consider using <code>rsync</code> via a snippet for resumable transfers.</p>
`,
      },
      {
        slug: 'sync-issues',
        title: 'Sync Issues',
        description: 'Vault sync not working? Try these fixes.',
        content: `
<h3>Vault Not Syncing</h3>
<ol>
  <li>Check your internet connection.</li>
  <li>Sign out and sign back in (this refreshes your API tokens).</li>
  <li>Go to <strong>Settings → Sync</strong> and click <strong>Force Sync</strong>.</li>
</ol>

<h3>Duplicate Items</h3>
<p>If you see duplicates after a sync, it usually means the same credential was created on two devices before they synced. Delete the duplicate — the sync engine will propagate the deletion.</p>

<h3>Conflict</h3>
<p>If the same item was edited on two devices, the most recent edit wins. There is no manual merge UI — the newer version is always kept.</p>
`,
      },
      {
        slug: 'app-issues',
        title: 'App Issues',
        description: 'App crashes, performance, and general fixes.',
        content: `
<h3>App Won't Launch</h3>
<ul>
  <li>Make sure you're running macOS 14.0+.</li>
  <li>Try deleting <code>~/Library/Caches/net.deepterm.app</code> and restarting.</li>
  <li>Re-download and reinstall from the Dashboard.</li>
</ul>

<h3>High CPU / Memory</h3>
<p>If you have many terminal tabs open, each consumes a PTY and some memory. Close unused tabs. If the issue persists, check <strong>Activity Monitor</strong> and send us the details via <a href="/dashboard/help">Help → Report Issue</a>.</p>

<h3>Logs</h3>
<p>Diagnostic logs are stored at <code>~/Library/Logs/DeepTerm/</code>. Attach them when submitting a support request.</p>
`,
      },
    ],
  },

  // ─── Keyboard Shortcuts ───────────────────────────────
  {
    label: 'Keyboard Shortcuts',
    icon: Zap,
    articles: [
      {
        slug: 'shortcuts',
        title: 'All Keyboard Shortcuts',
        description: 'Complete list of keyboard shortcuts.',
        content: `
<h3>General</h3>
<table>
  <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
  <tbody>
    <tr><td><kbd>⌘K</kbd></td><td>Open command palette / search</td></tr>
    <tr><td><kbd>⌘N</kbd></td><td>New host</td></tr>
    <tr><td><kbd>⌘T</kbd></td><td>New local terminal tab</td></tr>
    <tr><td><kbd>⌘W</kbd></td><td>Close active tab / pane</td></tr>
    <tr><td><kbd>⌘,</kbd></td><td>Open settings</td></tr>
  </tbody>
</table>

<h3>Terminal</h3>
<table>
  <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
  <tbody>
    <tr><td><kbd>⌘D</kbd></td><td>Split vertically</td></tr>
    <tr><td><kbd>⌘⇧D</kbd></td><td>Split horizontally</td></tr>
    <tr><td><kbd>⌘⌥←/→/↑/↓</kbd></td><td>Move focus between panes</td></tr>
    <tr><td><kbd>⌘R</kbd></td><td>Reconnect</td></tr>
    <tr><td><kbd>⌘F</kbd></td><td>Find in terminal output</td></tr>
    <tr><td><kbd>⌘C</kbd></td><td>Copy (when text selected) / Send interrupt</td></tr>
    <tr><td><kbd>⌘V</kbd></td><td>Paste</td></tr>
  </tbody>
</table>

<h3>Navigation</h3>
<table>
  <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
  <tbody>
    <tr><td><kbd>⌘1–9</kbd></td><td>Switch to tab 1–9</td></tr>
    <tr><td><kbd>⌘⇧[</kbd> / <kbd>⌘⇧]</kbd></td><td>Previous / next tab</td></tr>
    <tr><td><kbd>⌘E</kbd></td><td>Edit selected host</td></tr>
    <tr><td><kbd>⏎</kbd></td><td>Connect to selected host</td></tr>
    <tr><td><kbd>⌫</kbd></td><td>Delete selected host</td></tr>
  </tbody>
</table>

<h3>SFTP</h3>
<table>
  <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
  <tbody>
    <tr><td><kbd>⌘⇧H</kbd></td><td>Toggle hidden files</td></tr>
    <tr><td><kbd>⌘⇧N</kbd></td><td>New folder</td></tr>
    <tr><td><kbd>⌘⌫</kbd></td><td>Delete selected file</td></tr>
    <tr><td><kbd>⏎</kbd></td><td>Open / enter directory</td></tr>
  </tbody>
</table>
`,
      },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────

/** Flat lookup: slug → article (+ parent category label) */
export function findArticle(slug: string): (DocArticle & { category: string }) | null {
  for (const cat of DOC_CATEGORIES) {
    const art = cat.articles.find(a => a.slug === slug);
    if (art) return { ...art, category: cat.label };
  }
  return null;
}

/** First article in the first category (index page default) */
export function getDefaultArticle(): DocArticle & { category: string } {
  const cat = DOC_CATEGORIES[0];
  return { ...cat.articles[0], category: cat.label };
}

/** All articles flat for search */
export function getAllArticles(): (DocArticle & { category: string })[] {
  return DOC_CATEGORIES.flatMap(cat =>
    cat.articles.map(a => ({ ...a, category: cat.label }))
  );
}
