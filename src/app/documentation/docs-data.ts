/**
 * Documentation structure — single source of truth for the sidebar nav,
 * page routing, and content rendering.
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
<p>DeepTerm is a modern, native macOS SSH client built for developers, DevOps engineers, and system administrators. It combines a powerful terminal emulator with credential management, encrypted vaults, and team collaboration — all wrapped in a beautiful SwiftUI interface.</p>

<h3>Core Concepts</h3>

<p><strong>Hosts</strong> — each remote machine you connect to is represented as a Host. A host stores its address, port, and the credentials needed to authenticate. You can connect with SSH using passwords, key-based auth, or agent forwarding.</p>

<p><strong>Groups</strong> — organise related hosts into groups. Groups can represent environments (production, staging), providers (AWS, Hetzner), or projects. Nested groups let you build the hierarchy that matches your workflow.</p>

<p><strong>Vaults</strong> — your credentials live inside encrypted vaults. Each vault is end-to-end encrypted with your master password. The server stores only encrypted blobs — never any metadata about what's inside. This is our zero-knowledge architecture.</p>

<p><strong>Teams</strong> — invite team members and share vaults with fine-grained access control. Collaborate on shared infrastructure without sharing passwords over Slack.</p>
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
  <li><strong>Password</strong> — enter the password directly (stored in macOS Keychain).</li>
  <li><strong>SSH Key</strong> — pick an existing key from your vault or import a <code>.pem</code> / <code>.pub</code> file.</li>
  <li><strong>Agent</strong> — use your local SSH agent.</li>
</ul>

<h3>4. Connect</h3>
<p>Double-click the host (or press <kbd>⏎</kbd>) to open a terminal session. You're in!</p>

<h3>5. Organise</h3>
<p>Drag hosts into groups, assign tags, and use the search bar (<kbd>⌘K</kbd>) to find anything instantly.</p>
`,
      },
    ],
  },

  // ─── Connections ───────────────────────────────────────
  {
    label: 'Connections',
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
  <li><strong>Authentication</strong> — password, SSH key, or agent.</li>
</ul>

<h3>Connection Options</h3>
<p>Under <strong>Advanced</strong> you can configure:</p>
<ul>
  <li>Keep-alive interval (prevent idle disconnects).</li>
  <li>Environment variables sent on connect.</li>
  <li>Startup command (runs automatically after login).</li>
  <li>Proxy / jump host (see <a href="/documentation/jump-hosts">Jump Hosts</a>).</li>
</ul>

<h3>Reconnecting</h3>
<p>If a session drops, DeepTerm shows a <strong>Reconnect</strong> banner at the top. Click it or press <kbd>⌘R</kbd> to reconnect instantly.</p>
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
`,
      },
      {
        slug: 'split-terminals',
        title: 'Split Terminals',
        description: 'Run multiple sessions side by side.',
        content: `
<p>DeepTerm supports horizontal and vertical terminal splits so you can monitor multiple servers at once.</p>

<h3>Keyboard Shortcuts</h3>
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
<p>Use the <strong>+</strong> button or <kbd>⌘N</kbd> to add a new host. Fill in connection details and credentials, then save.</p>

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
<p>Click <strong>+</strong> → <strong>New Group</strong> or right-click in the sidebar and choose <strong>New Group</strong>. Name it something descriptive (e.g. "Production", "AWS EU-West").</p>

<h3>Nesting</h3>
<p>Drag a group into another group to create hierarchy. There's no limit on depth, but 2–3 levels is recommended for clarity.</p>

<h3>Group Defaults</h3>
<p>Set default credentials, port, or username at the group level. Any host inside the group inherits these unless overridden. This reduces duplication when all servers in a group share the same SSH key.</p>

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

  // ─── Credentials & Keys ───────────────────────────────
  {
    label: 'Credentials & Keys',
    icon: Key,
    articles: [
      {
        slug: 'ssh-keys',
        title: 'SSH Keys',
        description: 'Generate, import, and manage SSH keys.',
        content: `
<h3>Generating a Key</h3>
<p>Go to <strong>Settings → Keys</strong> and click <strong>Generate New Key</strong>. Choose the algorithm (Ed25519 recommended) and an optional passphrase. The key is stored in your encrypted vault.</p>

<h3>Importing</h3>
<p>Click <strong>Import Key</strong> and select a <code>.pem</code>, <code>.pub</code>, or OpenSSH-format private key file. DeepTerm detects the format automatically.</p>

<h3>Exporting</h3>
<p>Right-click a key and choose <strong>Copy Public Key</strong> to paste it into <code>authorized_keys</code> on your server.</p>

<h3>Passphrase Protection</h3>
<p>Keys encrypted with a passphrase require entry on first use. DeepTerm can remember the passphrase in macOS Keychain so you don't need to enter it again.</p>
`,
      },
      {
        slug: 'passwords',
        title: 'Passwords',
        description: 'How DeepTerm handles password storage.',
        content: `
<p>When you save a password for a host, it's stored in your encrypted vault — never in plain text on disk. On macOS, the vault key itself is protected by Keychain.</p>

<h3>Auto-Fill</h3>
<p>When connecting to a host, DeepTerm automatically fills the password from the vault. If the password has changed, you'll be prompted to update it.</p>

<h3>Password Generator</h3>
<p>Need a strong password? Click the <strong>dice icon</strong> next to the password field to generate a random password (configurable length, character classes).</p>
`,
      },
      {
        slug: 'keychain',
        title: 'macOS Keychain',
        description: 'How DeepTerm integrates with macOS Keychain.',
        content: `
<p>DeepTerm uses the macOS Keychain as a secure backing store for sensitive material:</p>
<ul>
  <li>Vault master key (used to derive the encryption key for your vaults)</li>
  <li>SSH key passphrases (when "remember" is selected)</li>
  <li>OAuth tokens</li>
</ul>

<p>All Keychain entries are scoped to the DeepTerm application. You can view them in <strong>Keychain Access.app</strong> under the login keychain.</p>
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

<p>Shared vault keys are exchanged using asymmetric encryption — TeamMember's public key wraps the vault key, and only their private key can unwrap it.</p>
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
  <li><strong>Sandboxed app</strong> — runs in a macOS sandbox with minimal entitlements.</li>
  <li><strong>SOC 2 Type II compliant</strong> — annual audit. Request the report from your security assessment page.</li>
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
  <li><strong>Free</strong> — 1 vault, unlimited hosts, single device.</li>
  <li><strong>Pro</strong> — unlimited vaults, unlimited devices, priority support, vault sharing.</li>
  <li><strong>Business</strong> — everything in Pro + team management, SSO, audit logs, and dedicated support.</li>
</ul>

<h3>Billing</h3>
<p>Pro and Business plans are billed monthly or annually via Stripe. Manage your subscription, update payment methods, and download invoices from <a href="/dashboard/billing">Dashboard → Billing</a>.</p>

<h3>Student Discount</h3>
<p>Students with a valid <code>.edu</code> email address get Pro free for 1 year. Apply from <a href="/dashboard/students">Dashboard → Students</a>.</p>
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
  <li>Check <code>/var/log/auth.log</code> (or <code>/var/log/secure</code>) on the server for details.</li>
</ul>

<h3>Connection Drops</h3>
<p>Enable <strong>Keep-Alive</strong> in the host's advanced settings. Set the interval to 30–60 seconds. Also check if your network / firewall has idle-session timeouts.</p>

<h3>Slow Connections</h3>
<p>Try disabling DNS lookups on the server: set <code>UseDNS no</code> in <code>/etc/ssh/sshd_config</code>. Also try a different cipher (<code>aes128-gcm</code> is faster on older hardware).</p>
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
