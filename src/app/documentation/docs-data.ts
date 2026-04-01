/**
 * Documentation structure — single source of truth for the sidebar nav,
 * page routing, and content rendering.
 *
 * Updated: 2026-03-28
 * Categories: 24 | Articles: 67
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
  Cpu,
  Wrench,
  LayoutGrid,
  History,
  Radio,
  Volume2,
  UserPlus,
  Share2,
  MessageSquare,
  Headphones,
  Building2,
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

<div class="screenshot-frame">
  <img src="/screenshots/app-hosts.png" alt="DeepTerm — Hosts view with vault sidebar" />
  <div class="screenshot-caption">DeepTerm main window — the Hosts view with the vault sidebar on the left</div>
</div>

<h3>Core Concepts</h3>

<p><strong>Hosts</strong> — each remote machine you connect to is represented as a Host. A host stores its address, port, and the credentials needed to authenticate. You can connect with SSH or Mosh using passwords, SSH keys, Touch ID, or FIDO2 hardware keys.</p>

<p><strong>Vault Panel</strong> — the left sidebar organises everything you need: <strong>Hosts</strong>, <strong>SFTP</strong>, <strong>Keychain</strong>, <strong>Port Forwarding</strong>, <strong>Snippets</strong>, <strong>Known Hosts</strong>, and <strong>History</strong>. Each section is a full-featured tool accessible from the sidebar navigation.</p>

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
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px;">
      <span style="color: #58a6ff;">🤖 AI Chat</span><br/>
      <span style="color: #8b949e; font-size: 11px;">MCP tools &amp; A2A agents</span>
    </div>
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px;">
      <span style="color: #58a6ff;">🔧 Workspace</span><br/>
      <span style="color: #8b949e; font-size: 11px;">Multi-terminal splits</span>
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
<p>In the vault panel, go to <strong>Hosts</strong> and click the <strong>+</strong> button. Enter the hostname or IP address, port (default 22), and a display name.</p>

<h3>3. Set Credentials</h3>
<p>Choose an authentication method:</p>
<ul>
  <li><strong>Password</strong> — enter the password directly (stored in your encrypted vault).</li>
  <li><strong>SSH Key</strong> — pick an existing key from your keychain or import a <code>.pem</code> file.</li>
  <li><strong>Touch ID</strong> — authenticate with your fingerprint using a Secure Enclave key.</li>
  <li><strong>FIDO2</strong> — use a YubiKey or other hardware security key.</li>
</ul>

<h3>4. Connect</h3>
<p>Double-click the host (or press <kbd>⏎</kbd>) to open a terminal session. A new connection tab appears in the top tab bar. You can also type a hostname in the quick-connect search field and press <kbd>⏎</kbd> to connect instantly.</p>

<h3>5. Explore the Interface</h3>
<p>Use the vault panel sidebar to navigate between Hosts, SFTP, Keychain, Port Forwarding, Snippets, Known Hosts, and History. Connection tabs appear at the top alongside the Vault tab. Toggle the AI chat panel using the chevron button between the terminal and chat areas.</p>

<div class="screenshot-frame">
  <img src="/screenshots/app-hosts.png" alt="DeepTerm vault sidebar with hosts" />
  <div class="screenshot-caption">The vault sidebar lists Hosts, SFTP, Keychain, Port Forwarding, Snippets, Known Hosts, and History</div>
</div>
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
<div class="screenshot-frame">
  <img src="/screenshots/app-hosts.png" alt="DeepTerm SSH Connections — Hosts view" />
  <div class="screenshot-caption">Hosts view — manage your SSH connections from the vault sidebar</div>
</div>

<h3>Creating a Connection</h3>
<p>In the vault panel, go to <strong>Hosts</strong> and click <strong>+</strong> to add a new host. Fill in:</p>
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
<p>DeepTerm supports vertical terminal splits through the <strong>Workspace</strong> feature, allowing you to view multiple terminal sessions side by side.</p>

<h3>Using Workspaces</h3>
<p>When you have multiple connections open, you can add them to a <strong>Workspace</strong> tab that combines multiple terminals into a split view:</p>
<ul>
  <li>Right-click a connection tab and choose <strong>Add to Workspace</strong> to merge it into the workspace.</li>
  <li>Terminals in the workspace are displayed vertically side by side.</li>
  <li>To remove a terminal from the workspace, right-click it and choose <strong>Break Out</strong> — it returns to its own tab.</li>
  <li>When a terminal is added to the workspace, its individual tab is hidden from the top bar.</li>
</ul>

<h3>Workspace vs Individual Tabs</h3>
<p>Each connection starts as its own tab. Add multiple connections to the workspace when you need to monitor several servers at once. Break them out again when you want a full-screen view of a single session.</p>
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

<div class="screenshot-frame">
  <img src="/screenshots/app-sftp.png" alt="DeepTerm SFTP file browser" />
  <div class="screenshot-caption">SFTP file browser — browse local and remote filesystems side by side</div>
</div>

<h3>Opening SFTP</h3>
<p>In the vault panel sidebar, click <strong>SFTP</strong> (just below Hosts). Select a host to connect to, and the remote pane will show the server's filesystem.</p>

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

<div class="screenshot-frame">
  <img src="/screenshots/app-snippets.png" alt="DeepTerm Snippets library" />
  <div class="screenshot-caption">Snippets library — built-in commands for common system administration tasks</div>
</div>

<h3>Opening Snippets</h3>
<p>In the vault panel sidebar, click <strong>Snippets</strong> to access your snippet library.</p>

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

<div class="screenshot-frame">
  <img src="/screenshots/app-port-forwarding.png" alt="DeepTerm Port Forwarding" />
  <div class="screenshot-caption">Port Forwarding view — create and manage SSH tunnels</div>
</div>

<h3>Opening Port Forwarding</h3>
<p>In the vault panel sidebar, click <strong>Port Forwarding</strong>. You'll see a list of your configured forwards with their status (active / inactive).</p>

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
<p>In the vault panel, go to <strong>Hosts</strong> and use the <strong>+</strong> button or <kbd>⌘N</kbd> to add a new host. Fill in connection details and select credentials from your keychain, then save.</p>

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
<p>In the Hosts section of the vault panel, click <strong>+</strong> → <strong>New Group</strong> or right-click in the host list and choose <strong>New Group</strong>. Name it something descriptive (e.g., "Production", "AWS EU-West").</p>

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

<h3>Quick Connect</h3>
<p>The search field at the top of the vault panel doubles as a quick connect box. Type a hostname or IP address and press <kbd>⏎</kbd> to connect instantly without creating a saved host profile.</p>

<h3>Connection History</h3>
<p>Click <strong>History</strong> in the vault sidebar to see your recent connections. Double-click any entry to reconnect.</p>
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

<div class="screenshot-frame">
  <img src="/screenshots/app-keychain.png" alt="DeepTerm Keychain" />
  <div class="screenshot-caption">Keychain view — manage SSH keys and identities with Keys and Identities tabs</div>
</div>

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
<p>If you lose access to your authenticator, use one of your backup codes. Each code can only be used once. If you've exhausted all codes, contact <a href="mailto:support@deepterm.net">support@deepterm.net</a> with account verification.</p>
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
  <li>Go to <a href="/dashboard/organization">Dashboard → Organization</a>.</li>
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
<p>Diagnostic logs are stored at <code>~/Library/Logs/DeepTerm/</code>. Attach them when submitting a support request to <a href="mailto:support@deepterm.net">support@deepterm.net</a>.</p>
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

  // ─── AI Chat ────────────────────────────────────────────
  {
    label: 'AI Chat',
    icon: Bot,
    articles: [
      {
        slug: 'ai-chat-overview',
        title: 'AI Chat Overview',
        description: 'Use AI assistants alongside your terminal sessions.',
        content: `
<p>DeepTerm includes a built-in AI chat panel that runs alongside your terminal. Ask questions, get command suggestions, debug errors, and automate tasks — all without leaving the app.</p>

<h3>Opening the AI Chat</h3>
<p>Click the chevron button (<strong>‹</strong>) between the terminal and the right edge to toggle the AI chat panel. The toggle is positioned at the top of the divider for easy access.</p>

<h3>How It Works</h3>
<p>The AI chat connects to your configured LLM provider (OpenAI, Anthropic, Ollama, Devin, or others) and has access to your terminal context. It can:</p>
<ul>
  <li>Suggest commands based on what you're trying to do.</li>
  <li>Explain error messages and propose fixes.</li>
  <li>Generate scripts and one-liners.</li>
  <li>Call MCP tools and delegate tasks to A2A agents.</li>
  <li>Provide context-aware autocomplete suggestions.</li>
</ul>

<h3>Terminal Context</h3>
<p>The AI can see your current terminal session context — recent commands, working directory, and environment. This means it gives relevant suggestions, not generic ones.</p>

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin: 16px 0; font-family: monospace; font-size: 12px;">
  <div style="color: #58a6ff; margin-bottom: 12px;">AI Chat Panel</div>
  <div style="display: grid; grid-template-columns: 1fr 300px; gap: 2px; background: #30363d; border-radius: 6px; overflow: hidden;">
    <div style="background: #0d1117; padding: 16px;">
      <div style="color: #3fb950; font-weight: 600; margin-bottom: 8px;">Terminal</div>
      <div style="color: #c9d1d9; font-size: 11px;">
        <div>$ kubectl get pods</div>
        <div style="color: #f85149;">Error: connection refused</div>
      </div>
    </div>
    <div style="background: #0d1117; padding: 16px;">
      <div style="color: #bc8cff; font-weight: 600; margin-bottom: 8px;">AI Chat</div>
      <div style="color: #8b949e; font-size: 11px;">
        <div>The connection error suggests your kubeconfig is pointing to an unreachable cluster. Try:</div>
        <div style="color: #c9d1d9; margin-top: 4px; background: #161b22; padding: 4px 8px; border-radius: 4px;">kubectl config current-context</div>
      </div>
    </div>
  </div>
</div>
`,
      },
      {
        slug: 'ai-providers',
        title: 'LLM Providers',
        description: 'Configure AI providers: OpenAI, Anthropic, Ollama, Devin, and more.',
        content: `
<p>DeepTerm supports multiple LLM providers. Configure them in <strong>Settings → AI Providers</strong>.</p>

<h3>Supported Providers</h3>
<ul>
  <li><strong>OpenAI</strong> — GPT-4o, GPT-4, GPT-3.5 Turbo. Requires an API key from <a href="https://platform.openai.com">platform.openai.com</a>.</li>
  <li><strong>Anthropic</strong> — Claude 4 Sonnet, Claude 4 Opus. Requires an API key from <a href="https://console.anthropic.com">console.anthropic.com</a>.</li>
  <li><strong>Ollama</strong> — Run models locally (Llama, Mistral, CodeLlama, etc.). Install <a href="https://ollama.com">Ollama</a> and it connects automatically at <code>http://localhost:11434</code>.</li>
  <li><strong>Devin</strong> — Cognition AI's software engineering agent. Requires a <code>cog_...</code> API key.</li>
  <li><strong>Custom</strong> — any OpenAI-compatible API endpoint (e.g., Azure OpenAI, Together AI, Groq).</li>
</ul>

<h3>Configuration</h3>
<ol>
  <li>Open <strong>Settings → AI Providers</strong>.</li>
  <li>Select a provider from the dropdown.</li>
  <li>Enter your API key.</li>
  <li>Choose a model (or use the default).</li>
  <li>Optionally set a custom base URL for self-hosted endpoints.</li>
</ol>

<h3>Vault Sync</h3>
<p>Your LLM provider configurations (including API keys) are encrypted and synced through your vault. Set up on one Mac, and it's available on all your devices.</p>
`,
      },
      {
        slug: 'ai-features',
        title: 'AI Features',
        description: 'RAG search, prompt templates, guardrails, diagnostics, and more.',
        content: `
<p>Beyond basic chat, DeepTerm includes several advanced AI features:</p>

<h3>RAG over Session History</h3>
<p>DeepTerm indexes your past terminal sessions so the AI can answer questions like "how did I fix the disk space issue on web-01 last week?" or "what command did I use to restart the Docker service?" Past sessions are searched using text matching and results are injected into the AI context.</p>

<h3>Prompt Templates / Runbooks</h3>
<p>Create reusable AI prompts that combine terminal commands with AI reasoning. Built-in templates include:</p>
<ul>
  <li><strong>Check Disk Health</strong> — runs diagnostics and interprets results.</li>
  <li><strong>Deploy Application</strong> — guided deployment with safety checks.</li>
  <li><strong>Security Audit</strong> — scans for common vulnerabilities.</li>
  <li><strong>Database Backup</strong> — automated backup with verification.</li>
  <li><strong>Network Diagnostics</strong> — systematic connectivity troubleshooting.</li>
  <li><strong>Log Analysis</strong> — parses and summarises log files.</li>
</ul>
<p>Create your own templates with variables that get filled in at runtime. Templates sync across devices via your vault.</p>

<h3>Context-Aware Autocomplete</h3>
<p>The AI enhances command autocomplete by considering your current directory, recent commands, available MCP tools, and common patterns for the tools you're using.</p>

<h3>Guardrails / Policy Engine</h3>
<p>Define safety policies that the AI enforces before executing commands:</p>
<ul>
  <li><strong>Block destructive operations</strong> — prevents <code>rm -rf /</code> and similar commands.</li>
  <li><strong>Require approval</strong> — commands that modify services or databases require confirmation.</li>
  <li><strong>Production protection</strong> — extra safeguards when connected to production hosts.</li>
</ul>
<p>Default policies are included and you can create custom rules.</p>

<h3>Connection Diagnostics</h3>
<p>When an SSH connection fails, the AI automatically runs diagnostic steps: DNS resolution, port reachability, SSH service check, authentication verification, and network latency measurement. Results are presented as a clear diagnosis report.</p>

<h3>Multi-Host Orchestration</h3>
<p>The AI can coordinate commands across multiple connected hosts simultaneously — useful for rolling deployments, cluster-wide health checks, or distributed log collection.</p>
`,
      },
    ],
  },

  // ─── MCP Integration ──────────────────────────────────
  {
    label: 'MCP Integration',
    icon: Wrench,
    articles: [
      {
        slug: 'mcp-overview',
        title: 'MCP Overview',
        description: 'Extend AI capabilities with Model Context Protocol servers.',
        content: `
<p>The <strong>Model Context Protocol (MCP)</strong> is an open standard that lets AI models call external tools. DeepTerm includes a built-in MCP client that connects to MCP servers, making their tools available to the AI chat.</p>

<h3>What MCP Enables</h3>
<p>With MCP, the AI can go beyond text generation and actually <em>do things</em>:</p>
<ul>
  <li>Read and write files on remote servers.</li>
  <li>Query databases directly.</li>
  <li>Interact with GitHub, Docker, Kubernetes, AWS, and more.</li>
  <li>Execute custom tools you define yourself.</li>
</ul>

<h3>How It Works</h3>
<ol>
  <li>You configure one or more MCP servers in <strong>Settings → MCP Servers</strong>.</li>
  <li>DeepTerm connects to each server and discovers its available tools.</li>
  <li>When you chat with the AI, it can call these tools to answer your questions or perform actions.</li>
  <li>Tool results are displayed inline in the chat.</li>
</ol>

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin: 16px 0; font-family: monospace; font-size: 12px;">
  <div style="color: #58a6ff; margin-bottom: 12px;">MCP Tool Flow</div>
  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: #8b949e;">
    <span style="color: #c9d1d9; background: #161b22; padding: 4px 8px; border-radius: 4px;">You ask a question</span>
    <span>→</span>
    <span style="color: #bc8cff; background: #1e0f30; padding: 4px 8px; border-radius: 4px;">AI decides to call a tool</span>
    <span>→</span>
    <span style="color: #f0883e; background: #2d1b06; padding: 4px 8px; border-radius: 4px;">MCP server executes</span>
    <span>→</span>
    <span style="color: #3fb950; background: #0d2818; padding: 4px 8px; border-radius: 4px;">Result shown in chat</span>
  </div>
</div>
`,
      },
      {
        slug: 'mcp-servers',
        title: 'Configuring MCP Servers',
        description: 'Add and manage MCP server connections.',
        content: `
<h3>Adding an MCP Server</h3>
<ol>
  <li>Open <strong>Settings → MCP Servers</strong>.</li>
  <li>Click <strong>Add Server</strong>.</li>
  <li>Enter a name and select the transport type.</li>
  <li>Fill in the connection details (see below).</li>
  <li>Click <strong>Save</strong> — DeepTerm connects and discovers available tools.</li>
</ol>

<h3>Transport Types</h3>
<p>DeepTerm supports all three MCP transport protocols:</p>

<table>
  <thead><tr><th>Transport</th><th>Use Case</th><th>Configuration</th></tr></thead>
  <tbody>
    <tr>
      <td><strong>stdio</strong></td>
      <td>Local servers (runs as a subprocess)</td>
      <td>Command path + arguments (e.g., <code>npx @modelcontextprotocol/server-filesystem /Users/you</code>)</td>
    </tr>
    <tr>
      <td><strong>SSE</strong></td>
      <td>Remote servers (Server-Sent Events)</td>
      <td>URL endpoint (e.g., <code>http://localhost:3001/sse</code>)</td>
    </tr>
    <tr>
      <td><strong>Streamable HTTP</strong></td>
      <td>Remote servers (HTTP with streaming)</td>
      <td>URL endpoint + optional headers</td>
    </tr>
  </tbody>
</table>

<h3>Vault Sync</h3>
<p>MCP server configurations are encrypted and synced through your vault. Configure your servers once and they appear on all your devices.</p>
`,
      },
      {
        slug: 'mcp-marketplace',
        title: 'Tool Marketplace',
        description: 'Browse and install popular MCP servers with one click.',
        content: `
<p>DeepTerm includes a built-in catalog of popular MCP servers that you can install with one click. Think of it as an app store for AI tools.</p>

<h3>Available Servers</h3>
<table>
  <thead><tr><th>Server</th><th>Category</th><th>What It Does</th></tr></thead>
  <tbody>
    <tr><td><strong>Filesystem</strong></td><td>Core</td><td>Read/write local files</td></tr>
    <tr><td><strong>Git</strong></td><td>Developer</td><td>Git operations (status, diff, commit)</td></tr>
    <tr><td><strong>GitHub</strong></td><td>Developer</td><td>Issues, PRs, repos</td></tr>
    <tr><td><strong>Docker</strong></td><td>DevOps</td><td>Container management</td></tr>
    <tr><td><strong>Kubernetes</strong></td><td>DevOps</td><td>Cluster operations</td></tr>
    <tr><td><strong>PostgreSQL</strong></td><td>Database</td><td>Query PostgreSQL databases</td></tr>
    <tr><td><strong>SQLite</strong></td><td>Database</td><td>Query SQLite databases</td></tr>
    <tr><td><strong>Puppeteer</strong></td><td>Browser</td><td>Web scraping and automation</td></tr>
    <tr><td><strong>Fetch</strong></td><td>Network</td><td>HTTP requests</td></tr>
    <tr><td><strong>Memory</strong></td><td>Core</td><td>Persistent key-value storage</td></tr>
    <tr><td><strong>Slack</strong></td><td>Communication</td><td>Send and read Slack messages</td></tr>
    <tr><td><strong>AWS</strong></td><td>Cloud</td><td>AWS service management</td></tr>
  </tbody>
</table>

<h3>Installing</h3>
<p>Browse the marketplace, click <strong>Install</strong> on a server, and DeepTerm handles the rest — downloading, configuring the transport, and connecting. Some servers require additional configuration (API keys, database URLs) which you'll be prompted for.</p>
`,
      },
    ],
  },

  // ─── A2A Protocol ─────────────────────────────────────
  {
    label: 'A2A Protocol',
    icon: Cpu,
    articles: [
      {
        slug: 'a2a-overview',
        title: 'A2A Overview',
        description: 'Agent-to-Agent protocol for AI agent collaboration.',
        content: `
<p>The <strong>Agent-to-Agent (A2A)</strong> protocol is an open standard for AI agents to communicate with each other. DeepTerm implements A2A alongside MCP, enabling your AI assistant to delegate specialised tasks to external agents.</p>

<h3>MCP vs A2A</h3>
<table>
  <thead><tr><th>Feature</th><th>MCP</th><th>A2A</th></tr></thead>
  <tbody>
    <tr><td>Purpose</td><td>Tool calling (deterministic)</td><td>Agent delegation (intelligent)</td></tr>
    <tr><td>Interaction</td><td>Request → Response</td><td>Multi-turn conversation</td></tr>
    <tr><td>Discovery</td><td>Tool list</td><td>Agent Cards</td></tr>
    <tr><td>Streaming</td><td>Per-tool</td><td>SSE task updates</td></tr>
  </tbody>
</table>

<h3>Use Cases</h3>
<ul>
  <li><strong>DevOps orchestration</strong> — delegate deployment tasks to a specialised deployment agent.</li>
  <li><strong>Security scanning</strong> — hand off vulnerability analysis to a security-focused agent.</li>
  <li><strong>Monitoring</strong> — let a monitoring agent watch your infrastructure and report back.</li>
  <li><strong>Code review</strong> — send code changes to a code review agent for analysis.</li>
</ul>

<h3>How It Works</h3>
<ol>
  <li>Configure A2A agents in <strong>Settings → A2A Agents</strong>.</li>
  <li>DeepTerm discovers each agent's capabilities via its <strong>Agent Card</strong> (a JSON document at <code>/.well-known/agent-card.json</code>).</li>
  <li>The AI chat can delegate tasks to agents based on their declared skills.</li>
  <li>Results stream back via Server-Sent Events (SSE) and appear in the chat.</li>
</ol>
`,
      },
      {
        slug: 'a2a-agents',
        title: 'Configuring A2A Agents',
        description: 'Add, manage, and connect to A2A-compliant agents.',
        content: `
<h3>Adding an Agent</h3>
<ol>
  <li>Open <strong>Settings → A2A Agents</strong>.</li>
  <li>Click <strong>Add Agent</strong>.</li>
  <li>Enter a name and the agent's base URL.</li>
  <li>Optionally add an API key and custom HTTP headers.</li>
  <li>Click <strong>Save</strong> — DeepTerm fetches the Agent Card and connects.</li>
</ol>

<h3>Agent Card Discovery</h3>
<p>When you add an agent, DeepTerm fetches its Agent Card from <code>{base_url}/.well-known/agent-card.json</code>. The card declares:</p>
<ul>
  <li><strong>Name and description</strong> — what the agent does.</li>
  <li><strong>Skills</strong> — specific capabilities with input/output descriptions.</li>
  <li><strong>Supported capabilities</strong> — streaming, push notifications, state management.</li>
  <li><strong>Authentication requirements</strong> — API keys, OAuth, etc.</li>
</ul>

<h3>Connection States</h3>
<p>Each agent shows its connection status in the settings panel:</p>
<ul>
  <li><span style="color: #3fb950;">●</span> <strong>Connected</strong> — agent is reachable and ready.</li>
  <li><span style="color: #f0883e;">●</span> <strong>Connecting</strong> — establishing connection.</li>
  <li><span style="color: #f85149;">●</span> <strong>Error</strong> — connection failed (click to retry).</li>
  <li><span style="color: #8b949e;">●</span> <strong>Disconnected</strong> — agent is disabled or not configured.</li>
</ul>

<h3>MCP + A2A Bridge</h3>
<p>DeepTerm includes a bridge that lets MCP tools and A2A agents work together. An MCP tool can trigger an A2A agent task, and A2A agents can invoke MCP tools — enabling powerful cross-protocol workflows.</p>

<h3>Vault Sync</h3>
<p>A2A agent configurations (including API keys) are encrypted and synced through your vault, just like MCP servers and LLM providers.</p>
`,
      },
    ],
  },

  // ─── Workspace & Layout ───────────────────────────────
  {
    label: 'Workspace & Layout',
    icon: LayoutGrid,
    articles: [
      {
        slug: 'layout-overview',
        title: 'App Layout',
        description: 'Understanding the DeepTerm interface layout.',
        content: `
<p>DeepTerm uses a clean, focused layout designed to keep you productive:</p>

<h3>Top Tab Bar</h3>
<p>The tab bar sits at the top of the window, next to the macOS traffic light buttons (close/minimize/fullscreen). It contains:</p>
<ul>
  <li><strong>Vault tab</strong> — shows the vault panel with sidebar navigation.</li>
  <li><strong>Connection tabs</strong> — one tab per active SSH connection.</li>
  <li><strong>Workspace tab</strong> — appears when you combine multiple terminals into a split view.</li>
  <li><strong>+ button</strong> — quick actions for new connections.</li>
</ul>

<h3>Vault Panel</h3>
<p>When the Vault tab is selected, the left sidebar shows navigation for:</p>
<ul>
  <li><strong>Hosts</strong> — your saved server profiles.</li>
  <li><strong>SFTP</strong> — file manager access.</li>
  <li><strong>Keychain</strong> — SSH keys, identities, certificates.</li>
  <li><strong>Port Forwarding</strong> — SSH tunnel configurations.</li>
  <li><strong>Snippets</strong> — reusable command library.</li>
  <li><strong>Known Hosts</strong> — verified server fingerprints.</li>
  <li><strong>History</strong> — recent connection log.</li>
</ul>

<h3>Connection View</h3>
<p>When you click a connection tab, the vault panel disappears and you get a full-screen terminal. The AI chat panel can be toggled using the chevron button on the right edge.</p>

<h3>Quick Connect</h3>
<p>The search field at the top of the vault panel doubles as a quick connect box. Type a hostname or IP and press <kbd>⏎</kbd> to connect instantly without creating a saved host profile.</p>
`,
      },
      {
        slug: 'connection-history',
        title: 'Connection History',
        description: 'View and reconnect from your connection history.',
        content: `
<p>The <strong>History</strong> section in the vault panel sidebar keeps a log of all your recent connections.</p>

<div class="screenshot-frame">
  <img src="/screenshots/app-history.png" alt="DeepTerm Connection History" />
  <div class="screenshot-caption">Connection History — view and reconnect from your recent sessions</div>
</div>

<h3>Viewing History</h3>
<p>Click <strong>History</strong> in the vault sidebar to see your recent connections, including:</p>
<ul>
  <li>Host name and address.</li>
  <li>Connection time and duration.</li>
  <li>Connection status (success/failure).</li>
</ul>

<h3>Reconnecting</h3>
<p>Double-click any history entry to open a new connection to that host. This is the fastest way to reconnect to a recently used server.</p>

<h3>Deleting History</h3>
<p>Right-click a history entry and choose <strong>Delete</strong> to remove it. You can also clear all history from the context menu.</p>
`,
      },
      {
        slug: 'known-hosts',
        title: 'Known Hosts',
        description: 'Manage verified server fingerprints.',
        content: `
<p>The <strong>Known Hosts</strong> section in the vault panel tracks SSH server fingerprints you've previously verified. This protects against man-in-the-middle attacks.</p>

<div class="screenshot-frame">
  <img src="/screenshots/app-known-hosts.png" alt="DeepTerm Known Hosts" />
  <div class="screenshot-caption">Known Hosts — verified server fingerprints protect against MITM attacks</div>
</div>

<h3>First Connection</h3>
<p>When you connect to a server for the first time, DeepTerm shows the server's fingerprint and asks you to verify it. Once accepted, the fingerprint is saved to your known hosts list.</p>

<h3>Fingerprint Changes</h3>
<p>If a server's fingerprint changes (e.g., after a reinstall), DeepTerm warns you. You can accept the new fingerprint or abort the connection.</p>

<h3>Managing Known Hosts</h3>
<p>View and delete known host entries from the vault sidebar. Useful when servers are rebuilt or decommissioned.</p>
`,
      },
    ],
  },

  // ─── Team Collaboration ─────────────────────────────
  {
    label: 'Collaboration',
    icon: Radio,
    articles: [
      {
        slug: 'collaboration-overview',
        title: 'Collaboration Overview',
        description: 'Real-time team collaboration features in DeepTerm.',
        content: `
<p>DeepTerm includes a full suite of real-time collaboration features that let your team work together seamlessly — whether you're pair-programming on a shared terminal, chatting about an issue, or hopping on an audio call.</p>

<h3>What's Included</h3>
<ul>
  <li><strong>Team Presence</strong> — see who's online and what they're working on in real time.</li>
  <li><strong>Shared Terminals</strong> — share your terminal session so teammates can watch or collaborate live.</li>
  <li><strong>Team Chat</strong> — text messaging within your organization, with file sharing support.</li>
  <li><strong>Audio Channels</strong> — WebRTC-based voice calls with up to 5 participants per room.</li>
  <li><strong>Session Notifications</strong> — get notified when teammates invite you to a session or audio channel.</li>
</ul>

<h3>How It Works</h3>
<p>All collaboration features run over a persistent WebSocket connection to the DeepTerm server. When you sign in and select an organization, a WebSocket is established at <code>/ws/collab</code> that handles presence updates, chat messages, terminal sharing, and signalling for audio calls.</p>

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin: 16px 0; font-family: monospace; font-size: 12px;">
  <div style="color: #58a6ff; margin-bottom: 12px;">Collaboration Architecture</div>
  <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center;">
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px; text-align: center;">
      <div style="color: #3fb950; font-weight: 600;">macOS App</div>
      <div style="color: #8b949e; font-size: 11px; margin-top: 4px;">WebSocket client</div>
    </div>
    <div style="color: #8b949e;">\u2194</div>
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px; text-align: center;">
      <div style="color: #f0883e; font-weight: 600;">DeepTerm Server</div>
      <div style="color: #8b949e; font-size: 11px; margin-top: 4px;">WebSocket relay + REST API</div>
    </div>
  </div>
  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px;">
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 4px; padding: 8px; text-align: center; font-size: 11px; color: #c9d1d9;">Presence</div>
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 4px; padding: 8px; text-align: center; font-size: 11px; color: #c9d1d9;">Chat</div>
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 4px; padding: 8px; text-align: center; font-size: 11px; color: #c9d1d9;">Terminals</div>
    <div style="background: #161b22; border: 1px solid #30363d; border-radius: 4px; padding: 8px; text-align: center; font-size: 11px; color: #c9d1d9;">Audio</div>
  </div>
</div>

<h3>Requirements</h3>
<ul>
  <li>A <strong>Team</strong> or <strong>Business</strong> plan.</li>
  <li>At least one organization with team members.</li>
  <li>Active internet connection (WebSocket-based).</li>
</ul>
`,
      },
      {
        slug: 'team-presence',
        title: 'Team Presence',
        description: 'See who is online and what they are working on.',
        content: `
<p>Team Presence shows you which members of your organization are currently online, what device they're using, and what they're working on — all in real time.</p>

<h3>Accessing Presence</h3>
<p>In the macOS app, go to the <strong>Teams</strong> section in the vault sidebar and select the <strong>Presence</strong> tab. On the web, visit <a href="/dashboard/collaboration">Dashboard \u2192 Collaboration</a>.</p>

<h3>Presence States</h3>
<ul>
  <li><span style="color: #3fb950;">\u25cf</span> <strong>Online</strong> — user is active in DeepTerm.</li>
  <li><span style="color: #f0883e;">\u25cf</span> <strong>Away</strong> — user has DeepTerm open but hasn't interacted recently.</li>
  <li><span style="color: #8b949e;">\u25cf</span> <strong>Offline</strong> — user is not connected.</li>
</ul>

<h3>Activity Information</h3>
<p>Presence indicators show:</p>
<ul>
  <li>Current status (online/away/offline).</li>
  <li>Device name and platform.</li>
  <li>What they're working on (e.g., "Connected to web-prod-01").</li>
  <li>Last seen timestamp for offline users.</li>
</ul>

<h3>Quick Actions</h3>
<p>Click on an online team member to:</p>
<ul>
  <li><strong>Invite to Terminal</strong> — send them an invitation to join your shared terminal session.</li>
  <li><strong>Invite to Audio</strong> — invite them to your current audio channel.</li>
  <li><strong>Open Chat</strong> — start a direct message conversation.</li>
</ul>
`,
      },
      {
        slug: 'shared-terminals',
        title: 'Shared Terminals',
        description: 'Share your terminal session for real-time collaboration.',
        content: `
<p>Shared Terminals let you broadcast your terminal session to teammates. They can watch in real time and (if granted write access) type commands alongside you — perfect for pair programming, debugging, and mentoring.</p>

<h3>Sharing Your Terminal</h3>
<ol>
  <li>Open a terminal connection to any host.</li>
  <li>In the <strong>Teams</strong> sidebar, click the <strong>Share Terminal</strong> button (rectangle icon).</li>
  <li>Choose a session name and the organization to share with.</li>
  <li>Click <strong>Share</strong> — your terminal is now live for teammates to join.</li>
</ol>

<h3>Joining a Shared Session</h3>
<p>When a teammate shares their terminal, it appears in the <strong>Teams \u2192 Sessions</strong> tab. Click <strong>Join</strong> to open a read-only view of their terminal. On the web, visit <a href="/dashboard/terminal">Dashboard \u2192 Shared Terminal</a> to view shared sessions in your browser.</p>

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin: 16px 0; font-family: monospace; font-size: 12px;">
  <div style="color: #58a6ff; margin-bottom: 12px;">Shared Terminal Session</div>
  <div style="background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px;">
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span style="color: #3fb950;">\u25cf Production Debug Session</span>
      <span style="color: #8b949e; font-size: 11px;">2 participants</span>
    </div>
    <div style="background: #0d1117; border-radius: 4px; padding: 8px; color: #c9d1d9; font-size: 11px;">
      <div>$ kubectl get pods -n production</div>
      <div style="color: #8b949e;">NAME&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;READY&nbsp;&nbsp;STATUS</div>
      <div style="color: #3fb950;">api-7d8f9b6c4-x2k9j&nbsp;&nbsp;1/1&nbsp;&nbsp;&nbsp;&nbsp;Running</div>
      <div style="color: #f85149;">worker-5c4d3b2a1-m8n7&nbsp;0/1&nbsp;&nbsp;&nbsp;&nbsp;CrashLoopBackOff</div>
    </div>
  </div>
</div>

<h3>Session Controls</h3>
<ul>
  <li><strong>End Session</strong> — the owner can end the shared session at any time.</li>
  <li><strong>Leave</strong> — participants can leave without ending the session.</li>
  <li><strong>Refresh</strong> — reload the list of available sessions.</li>
</ul>

<h3>Web Viewer</h3>
<p>The web-based shared terminal viewer uses xterm.js to render the terminal in your browser. It supports full ANSI color output, cursor movement, and real-time updates. No app installation required for viewers.</p>
`,
      },
      {
        slug: 'team-chat',
        title: 'Team Chat',
        description: 'Text messaging and file sharing within your organization.',
        content: `
<p>Team Chat provides instant messaging between organization members. Use it for quick questions, sharing command outputs, or coordinating during incidents.</p>

<h3>Opening Chat</h3>
<p>In the macOS app, click the <strong>chat bubble</strong> button in the Teams header. A separate chat window opens with your organization's channels.</p>

<h3>Features</h3>
<ul>
  <li><strong>Real-time messaging</strong> — messages appear instantly for all connected members.</li>
  <li><strong>File sharing</strong> — drag and drop files into the chat to share with your team.</li>
  <li><strong>Message history</strong> — scroll back through previous conversations.</li>
  <li><strong>Organization-scoped</strong> — each organization has its own chat space.</li>
</ul>

<h3>Web Access</h3>
<p>Team Chat is also available on the web at <a href="/dashboard/collaboration">Dashboard \u2192 Collaboration</a>, so team members can participate from any device with a browser.</p>
`,
      },
    ],
  },

  // ─── Audio Channels ─────────────────────────────────
  {
    label: 'Audio Channels',
    icon: Headphones,
    articles: [
      {
        slug: 'audio-overview',
        title: 'Audio Channels Overview',
        description: 'Voice communication with WebRTC-based audio channels.',
        content: `
<p>Audio Channels bring voice communication to DeepTerm. Using WebRTC technology, you can join audio rooms to talk with teammates while working — no need to switch to a separate app like Zoom or Discord.</p>

<h3>Key Features</h3>
<ul>
  <li><strong>Mesh topology</strong> — direct peer-to-peer audio connections for low latency.</li>
  <li><strong>Up to 5 participants</strong> per room (optimised for mesh topology).</li>
  <li><strong>Mute / unmute</strong> — toggle your microphone with one click.</li>
  <li><strong>Room management</strong> — create, join, and leave audio rooms.</li>
  <li><strong>Cross-platform</strong> — works in the macOS app and the web dashboard.</li>
</ul>

<h3>How It Works</h3>
<p>Audio channels use <strong>WebRTC</strong> with a mesh topology. Each participant connects directly to every other participant — no media server is needed. The DeepTerm server handles signalling (SDP offer/answer and ICE candidates) via the WebSocket connection.</p>

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin: 16px 0; font-family: monospace; font-size: 12px;">
  <div style="color: #58a6ff; margin-bottom: 12px;">WebRTC Mesh Topology (3 participants)</div>
  <div style="text-align: center; color: #c9d1d9; line-height: 2;">
    <div><span style="color: #3fb950;">\ud83c\udf99\ufe0f Alice</span></div>
    <div style="color: #8b949e;">\u2199\ufe0f &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\u2198\ufe0f</div>
    <div><span style="color: #58a6ff;">\ud83c\udf99\ufe0f Bob</span> \u2014\u2014\u2014 <span style="color: #f0883e;">\ud83c\udf99\ufe0f Carol</span></div>
  </div>
  <div style="color: #8b949e; font-size: 11px; margin-top: 8px; text-align: center;">Each participant connects directly to every other participant</div>
</div>

<h3>Limitations</h3>
<ul>
  <li><strong>5-person limit</strong> — mesh topology doesn't scale well beyond 5 peers. For larger groups, use an external conferencing tool.</li>
  <li><strong>No recording</strong> — audio channels are ephemeral and not recorded.</li>
  <li><strong>Microphone access required</strong> — you'll be prompted to grant microphone permission on first use.</li>
</ul>
`,
      },
      {
        slug: 'audio-usage',
        title: 'Using Audio Channels',
        description: 'Create, join, and manage audio rooms.',
        content: `
<h3>Creating a Room</h3>
<ol>
  <li>In the macOS app, go to <strong>Teams \u2192 Audio</strong> tab.</li>
  <li>Click <strong>Create Room</strong> and enter a name (e.g., "Incident Call").</li>
  <li>Your microphone activates and you're in the room.</li>
</ol>

<h3>Joining a Room</h3>
<p>Active audio rooms appear in the <strong>Audio</strong> tab. Click <strong>Join</strong> to enter. On the web, visit <a href="/dashboard/audio">Dashboard \u2192 Audio Channels</a>.</p>

<h3>Controls</h3>
<ul>
  <li><strong>Mute / Unmute</strong> — click the microphone button or press the mute shortcut.</li>
  <li><strong>Leave Room</strong> — click the hang-up button to leave the room.</li>
  <li><strong>Participant List</strong> — see who's in the room and their mute status.</li>
</ul>

<h3>Inviting Others</h3>
<p>From the Presence tab, click on an online team member and choose <strong>Invite to Audio</strong>. They'll receive a notification that they can accept or dismiss.</p>

<h3>Troubleshooting</h3>
<ul>
  <li><strong>No audio</strong> — check that DeepTerm has microphone permission in System Settings \u2192 Privacy &amp; Security \u2192 Microphone.</li>
  <li><strong>WebRTC not available</strong> — starting with v1.0.19, the WebRTC framework is bundled automatically via Swift Package Manager. If you're on an older version, update to the latest release so <code>canImport(WebRTC)</code> succeeds and real audio code runs instead of placeholder mode.</li>
  <li><strong>Echo or feedback</strong> — use headphones or enable echo cancellation in your system audio settings.</li>
  <li><strong>Can't connect</strong> — WebRTC requires certain ports for peer connections. If you're behind a restrictive firewall, peer connections may fail.</li>
</ul>
`,
      },
    ],
  },

  // ─── Organization Management ────────────────────────
  {
    label: 'Organizations',
    icon: Building2,
    articles: [
      {
        slug: 'org-overview',
        title: 'Organization Overview',
        description: 'Understanding the Organization hierarchy.',
        content: `
<p>Organizations are the top-level entity for team management in DeepTerm. Every team feature — billing, member management, vaults, collaboration — lives under an Organization.</p>

<h3>Hierarchy</h3>
<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin: 16px 0; font-family: monospace; font-size: 12px;">
  <div style="color: #58a6ff; margin-bottom: 12px;">DeepTerm Hierarchy</div>
  <div style="color: #c9d1d9; line-height: 2;">
    <div><span style="color: #3fb950;">\ud83c\udfe2 Organization</span> (billing, subscription, SSO)</div>
    <div style="padding-left: 24px;"><span style="color: #58a6ff;">\ud83d\udc65 Team</span> (group of members)</div>
    <div style="padding-left: 48px;"><span style="color: #f0883e;">\ud83d\udc64 Members</span> (users with roles)</div>
    <div style="padding-left: 24px;"><span style="color: #58a6ff;">\ud83d\udd12 Vaults</span> (personal + team vaults)</div>
    <div style="padding-left: 24px;"><span style="color: #58a6ff;">\ud83d\udcac Collaboration</span> (chat, presence, audio)</div>
  </div>
</div>

<h3>Key Concepts</h3>
<ul>
  <li><strong>Organization</strong> — owns the subscription and billing. Has one or more teams.</li>
  <li><strong>Team</strong> — a group of members within the organization. Teams can have their own vaults.</li>
  <li><strong>Members</strong> — users invited to the organization with specific roles (owner, admin, member).</li>
  <li><strong>Vaults</strong> — can be personal (private to a user) or team vaults (shared with team members).</li>
</ul>
`,
      },
      {
        slug: 'org-management',
        title: 'Managing Organizations',
        description: 'Create organizations, invite members, and manage teams.',
        content: `
<h3>Creating an Organization</h3>
<p>In the macOS app, go to <strong>Account Settings</strong> (gear icon) and click <strong>Create Organization</strong>. On the web, visit <a href="/dashboard/collaboration">Dashboard \u2192 Collaboration</a>.</p>

<h3>Inviting Members</h3>
<ol>
  <li>Open your organization in Account Settings or the Collaboration dashboard.</li>
  <li>Click <strong>Invite Member</strong>.</li>
  <li>Enter their email address and select a role.</li>
  <li>If the invitee is on the <strong>Free</strong> or <strong>Starter</strong> plan, you'll be asked to confirm that your organization will cover their seat subscription. The invite cannot be sent without this confirmation.</li>
  <li>They receive an email invitation with a link to join.</li>
</ol>

<p><strong>Note:</strong> You can invite users who don't have a DeepTerm account yet. They'll be prompted to create one when they click the invitation link. Unregistered users are treated as Free-plan users, so the same seat coverage confirmation applies.</p>

<h3>Subscription &amp; Seat Coverage</h3>
<p>When your organization is on a <strong>Team</strong> or <strong>Business</strong> plan:</p>
<ul>
  <li><strong>Free/Starter invitees</strong> — the organization covers their seat. They are elevated to the org's plan upon joining. This uses one of your paid seats.</li>
  <li><strong>Pro+ invitees</strong> — they already have their own subscription. They join without consuming an additional seat.</li>
  <li>If all seats are in use, you must purchase additional seats before inviting more Free/Starter users.</li>
</ul>
<p>The inviter always sees the invitee's current plan before sending the invitation, ensuring full transparency about costs.</p>

<h3>Member Roles</h3>
<table>
  <thead><tr><th>Role</th><th>Permissions</th></tr></thead>
  <tbody>
    <tr><td><strong>Owner</strong></td><td>Full control — billing, members, teams, vaults, settings</td></tr>
    <tr><td><strong>Admin</strong></td><td>Manage members, teams, and vaults (no billing access)</td></tr>
    <tr><td><strong>Member</strong></td><td>Access shared vaults and collaboration features</td></tr>
  </tbody>
</table>

<h3>Managing Teams</h3>
<p>Within an organization, you can create teams to group members:</p>
<ol>
  <li>Click <strong>Manage Teams</strong> in the organization view.</li>
  <li>Click <strong>Create Team</strong> and enter a name.</li>
  <li>Add members from the organization to the team.</li>
</ol>

<h3>Removing Members</h3>
<p>Organization admins and owners can remove members from the organization settings. Removed members immediately lose access to all shared vaults and collaboration features.</p>
`,
      },
      {
        slug: 'org-billing',
        title: 'Organization Billing',
        description: 'Subscription management at the organization level.',
        content: `
<h3>Billing Owner</h3>
<p>The organization owner manages the subscription. Billing is at the <strong>organization level</strong> — one subscription covers all members.</p>

<h3>Subscription Plans</h3>
<p>Organizations can subscribe to Team or Business plans, which unlock collaboration features, team vaults, SSO, and more. See <a href="/pricing">Pricing</a> for details.</p>

<h3>Managing Billing</h3>
<p>From the web dashboard:</p>
<ul>
  <li><a href="/dashboard/billing">Dashboard \u2192 Billing</a> — view current plan, next billing date, and usage.</li>
  <li><strong>Update Payment Method</strong> — add or change credit cards and PayPal.</li>
  <li><strong>Download Invoices</strong> — access past invoices as PDFs.</li>
  <li><strong>Cancel Subscription</strong> — cancels at the end of the current billing period.</li>
</ul>

<h3>Seat Management</h3>
<p>Your subscription includes a number of seats. Each confirmed or invited organization member occupies one seat. Add more seats from the billing page if your team grows beyond the current allocation.</p>

<h3>How Seats Work When Inviting</h3>
<p>When you invite someone to your organization:</p>
<ul>
  <li><strong>Free/Starter users</strong> — the organization covers their seat cost. You must confirm this before the invite can be sent. They are elevated to your org's plan (e.g. Team) when they accept.</li>
  <li><strong>Pro+ users</strong> — they have their own subscription. They join without consuming an additional org seat because they are self-paying.</li>
</ul>
<p>The member list in the organization settings shows each member's plan, whether their seat is covered by the org, and current seat usage vs. total seats available.</p>
`,
      },
    ],
  },

  // ─── Session Notifications ──────────────────────────
  {
    label: 'Notifications',
    icon: UserPlus,
    articles: [
      {
        slug: 'session-notifications',
        title: 'Session Notifications',
        description: 'Get notified when teammates invite you to sessions or audio channels.',
        content: `
<p>Session Notifications keep you in the loop when teammates want to collaborate. When someone invites you to a shared terminal session or an audio channel, you receive an in-app notification that you can accept or dismiss.</p>

<h3>Types of Notifications</h3>
<ul>
  <li><strong>Terminal Invitation</strong> — a teammate wants you to join their shared terminal session.</li>
  <li><strong>Audio Invitation</strong> — a teammate wants you to join their audio channel.</li>
</ul>

<h3>Responding to Invitations</h3>
<p>When you receive an invitation, a notification banner appears:</p>
<ul>
  <li><strong>Accept</strong> — joins the session or audio channel immediately.</li>
  <li><strong>Dismiss</strong> — hides the notification without joining.</li>
</ul>

<h3>Notification Management</h3>
<p>Notifications are managed through the <strong>SessionNotificationService</strong> in the macOS app. They appear as non-intrusive banners and auto-dismiss after a timeout if not acted upon. Active invitations are visible in the Teams \u2192 Presence view.</p>

<h3>Privacy</h3>
<p>Invitations only come from members of your organization. You won't receive notifications from users outside your org.</p>
`,
      },
    ],
  },

  // ─── Vault Sync for AI ────────────────────────────────
  {
    label: 'Vault Sync',
    icon: History,
    articles: [
      {
        slug: 'vault-sync-ai',
        title: 'Syncing AI Configurations',
        description: 'Sync LLM providers, MCP servers, A2A agents, and more across devices.',
        content: `
<p>DeepTerm syncs all your AI-related configurations through the encrypted vault, so you set things up once and they're available on every device.</p>

<h3>What Gets Synced</h3>
<table>
  <thead><tr><th>Configuration</th><th>What's Included</th></tr></thead>
  <tbody>
    <tr><td><strong>LLM Providers</strong></td><td>API keys, selected models, custom endpoints</td></tr>
    <tr><td><strong>MCP Servers</strong></td><td>Server URLs, transport type, commands, auth headers</td></tr>
    <tr><td><strong>A2A Agents</strong></td><td>Agent URLs, API keys, custom HTTP headers</td></tr>
    <tr><td><strong>Snippets</strong></td><td>Command snippets, folders, tags, usage statistics</td></tr>
    <tr><td><strong>Port Forwarding</strong></td><td>Tunnel configurations and rules</td></tr>
    <tr><td><strong>Prompt Templates</strong></td><td>Custom AI runbooks and prompt templates</td></tr>
  </tbody>
</table>

<h3>How It Works</h3>
<p>All configurations are encrypted with AES-256-GCM using your vault's master key before being sent to the server. The server stores only encrypted blobs — it never sees your API keys, passwords, or configuration details.</p>

<h3>Sync Triggers</h3>
<ul>
  <li>Automatic sync on app launch.</li>
  <li>Automatic sync when you save changes.</li>
  <li>Manual sync from <strong>Settings → Sync → Force Sync</strong>.</li>
</ul>

<h3>Conflict Resolution</h3>
<p>If the same configuration is edited on two devices, the most recent change wins (last-write-wins based on timestamp).</p>
`,
      },
    ],
  },

  // ─── Contact & Support ──────────────────────────────
  {
    label: 'Contact & Support',
    icon: HelpCircle,
    articles: [
      {
        slug: 'contact',
        title: 'Contact Us',
        description: 'Get in touch with the DeepTerm team.',
        content: `
<p>We\'d love to hear from you. Reach us at any of the addresses below:</p>

<h3>Email Addresses</h3>
<table>
  <thead><tr><th>Address</th><th>Use For</th></tr></thead>
  <tbody>
    <tr>
      <td><strong><a href="mailto:support@deepterm.net">support@deepterm.net</a></strong></td>
      <td>Bug reports, account issues, technical help, billing questions</td>
    </tr>
    <tr>
      <td><strong><a href="mailto:info@deepterm.net">info@deepterm.net</a></strong></td>
      <td>General enquiries, partnership requests, press</td>
    </tr>
    <tr>
      <td><strong><a href="mailto:luca@deepterm.net">luca@deepterm.net</a></strong></td>
      <td>Direct contact with the founder</td>
    </tr>
  </tbody>
</table>

<h3>In-App Support</h3>
<ul>
  <li><strong>Report a Bug</strong> — in the macOS app go to <strong>Settings → Support → Feedback → Report</strong>.</li>
  <li><strong>Suggest a Feature</strong> — in the macOS app go to <strong>Settings → Support → Feedback → Suggest</strong>.</li>
  <li><strong>Help Center</strong> — visit <a href="/dashboard/help">Dashboard → Help</a> in the web app.</li>
</ul>

<h3>Response Times</h3>
<p>We aim to respond within 24 hours on business days. Pro and Business plan users receive priority support.</p>
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
