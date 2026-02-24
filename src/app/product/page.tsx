'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import {
  Button,
  Card,
  TerminalWindow,
  TerminalLine,
  TerminalCursor,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui';
import {
  Terminal,
  Server,
  SplitSquareHorizontal,
  Layers,
  Code2,
  Brain,
  Shield,
  Palette,
  Check,
  Users,
  Database,
  Network,
  GraduationCap,
  Wrench,
} from 'lucide-react';

const featureSections = [
  {
    title: 'A terminal that keeps up with you',
    description:
      'Native macOS terminal with full VT100/xterm-256color support. True PTY (pseudo-terminal) for seamless remote interactions. Real-time output streaming with low latency. Beautiful syntax highlighting, customizable color themes, font, and size settings. Full Unicode and emoji support.',
    pills: ['xterm-256color', 'PTY Support', 'Low Latency', 'Retina Display'],
    terminal: (
      <>
        <TerminalLine prompt="$" command="htop" />
        <div className="mt-2 font-mono text-xs space-y-1">
          <div className="text-accent-secondary">CPU[||||||||||||||||      62%] MEM[||||||||||           45%]</div>
          <div className="text-text-secondary mt-2">  PID USER      PRI  NI  VIRT   RES   SHR S CPU% MEM%</div>
          <div className="text-accent-danger"> 4821 root       20   0 1.2G  456M   24M S 89.2  5.2</div>
          <div className="text-accent-secondary"> 1234 nginx      20   0  128M   32M   12M S  2.1  0.4</div>
          <div className="text-text-secondary"> 5678 postgres   20   0  512M  256M   64M S  1.5  2.8</div>
        </div>
      </>
    ),
    imagePosition: 'right',
  },
  {
    title: 'Your servers, organized',
    description:
      'Organize servers into custom groups for a better workflow. Quick sidebar access to all your SSH profiles. Support for both password and SSH key authentication. Credentials stored securely in macOS Keychain. One-click connection to frequently used servers. Local shell support alongside remote connections.',
    pills: ['Custom Groups', 'SSH Keys', 'Keychain Storage', 'One-Click Connect'],
    terminal: (
      <div className="space-y-2 font-mono text-xs">
        <div className="text-text-tertiary mb-3">CONNECTIONS</div>
        <div className="space-y-1">
          <div className="text-text-tertiary text-[10px] mt-2">AWS — 12 hosts</div>
          <div className="flex items-center gap-2 px-2 py-1.5 bg-accent-primary/10 rounded">
            <span className="w-2 h-2 bg-accent-secondary rounded-full" />
            <span className="text-text-primary">prod-api-01</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="w-2 h-2 bg-accent-secondary rounded-full" />
            <span className="text-text-secondary">prod-api-02</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="w-2 h-2 bg-text-tertiary rounded-full" />
            <span className="text-text-secondary">prod-db-master</span>
          </div>
          <div className="text-text-tertiary text-[10px] mt-3">Production — 5 hosts</div>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="w-2 h-2 bg-accent-secondary rounded-full" />
            <span className="text-text-secondary">web-frontend</span>
          </div>
          <div className="text-text-tertiary text-[10px] mt-3">Staging — 8 hosts</div>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="w-2 h-2 bg-text-tertiary rounded-full" />
            <span className="text-text-secondary">staging-api</span>
          </div>
        </div>
      </div>
    ),
    imagePosition: 'left',
  },
  {
    title: 'Multiple servers, one screen',
    description:
      'Split your terminal horizontally to view multiple sessions simultaneously. Add unlimited panes to work with multiple servers at once. Easy pane navigation with keyboard shortcuts. Automatic focus management and visual indicators. Resize panes to fit your workflow perfectly. Each pane maintains its own independent session.',
    pills: ['Unlimited Panes', 'Keyboard Nav', 'Independent Sessions', 'Flexible Resize'],
    terminal: (
      <div className="grid grid-cols-3 gap-2 font-mono text-xs">
        <div className="bg-background-tertiary p-2 rounded border border-border">
          <div className="text-text-tertiary text-[10px] mb-1">prod-logs</div>
          <TerminalLine prompt="$" command="tail -f /var/log/syslog" />
          <div className="text-text-secondary text-[10px]">Jan 15 14:32:01 api Started...</div>
        </div>
        <div className="bg-background-tertiary p-2 rounded border border-accent-primary">
          <div className="text-text-tertiary text-[10px] mb-1">monitoring</div>
          <TerminalLine prompt="$" command="top" />
          <div className="text-accent-secondary text-[10px]">CPU: 45% MEM: 62%</div>
        </div>
        <div className="bg-background-tertiary p-2 rounded border border-border">
          <div className="text-text-tertiary text-[10px] mb-1">deployment</div>
          <TerminalLine prompt="$" command="./deploy.sh" />
          <div className="text-accent-secondary text-[10px]">✓ Deployed v2.4.1</div>
        </div>
      </div>
    ),
    imagePosition: 'right',
  },
  {
    title: 'Switch contexts instantly',
    description:
      'Open unlimited SSH sessions in separate tabs. Switch between connections instantly with ⌘1-9 shortcuts. Each tab shows real-time connection status. Drag and drop to reorder. Close with ⌘W. Tab persistence across app launches.',
    pills: ['Unlimited Tabs', '⌘1-9 Switching', 'Drag & Drop', 'Session Persistence'],
    terminal: (
      <div className="font-mono text-xs">
        <div className="flex gap-1 mb-3 overflow-x-auto pb-2">
          {[
            { name: 'prod-db', active: true, connected: true },
            { name: 'staging-api', active: false, connected: true },
            { name: 'dev-frontend', active: false, connected: true },
            { name: 'monitoring', active: false, connected: false },
            { name: 'logs', active: false, connected: true },
            { name: 'backup', active: false, connected: true },
          ].map((tab) => (
            <div
              key={tab.name}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t ${
                tab.active ? 'bg-background-primary text-text-primary' : 'bg-background-tertiary text-text-secondary'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${tab.connected ? 'bg-accent-secondary' : 'bg-text-tertiary'}`} />
              {tab.name}
            </div>
          ))}
        </div>
        <TerminalLine prompt="postgres@prod-db:~$" command="SELECT COUNT(*) FROM users;" />
        <TerminalLine output=" count " />
        <TerminalLine output="-------" />
        <TerminalLine output=" 84521" />
      </div>
    ),
    imagePosition: 'left',
  },
  {
    title: 'Your command library',
    description:
      'Save frequently used commands for instant execution. Organize snippets into categories. Execute with a single click and view output directly. Build your personal command library. Perfect for repetitive administrative tasks — deployments, log rotations, health checks, database backups.',
    pills: ['Categories', 'One-Click Execute', 'Personal Library', 'Inline Output'],
    terminal: (
      <div className="font-mono text-xs space-y-3">
        <div className="text-text-tertiary">SNIPPETS</div>
        <div className="space-y-2">
          <div className="text-text-tertiary text-[10px]">Deployment</div>
          <div className="flex items-center justify-between px-2 py-1.5 bg-background-tertiary rounded hover:bg-background-tertiary/80 cursor-pointer">
            <span className="text-text-primary">Deploy Production</span>
            <span className="text-accent-secondary">▶</span>
          </div>
          <div className="flex items-center justify-between px-2 py-1.5 bg-background-tertiary rounded">
            <span className="text-text-secondary">Rollback Last Deploy</span>
            <span className="text-text-tertiary">▶</span>
          </div>
          <div className="text-text-tertiary text-[10px] mt-3">Monitoring</div>
          <div className="flex items-center justify-between px-2 py-1.5 bg-background-tertiary rounded">
            <span className="text-text-secondary">Check Disk Usage</span>
            <span className="text-text-tertiary">▶</span>
          </div>
          <div className="flex items-center justify-between px-2 py-1.5 bg-background-tertiary rounded">
            <span className="text-text-secondary">View Active Connections</span>
            <span className="text-text-tertiary">▶</span>
          </div>
        </div>
      </div>
    ),
    imagePosition: 'right',
  },
  {
    title: 'AI that understands your terminal',
    description:
      'Integrated chat interface for AI assistance, right in the sidebar alongside your connections. Get help with terminal commands and SSH issues. Ask questions about server administration. Learn best practices while you work. Context-aware suggestions based on your workflow. The AI chat is optional and only activates if you provide your own API key — we never collect any data.',
    pills: ['Sidebar Integration', 'Context-Aware', 'Your API Key', 'Zero Data Collection'],
    terminal: (
      <div className="font-mono text-xs space-y-3">
        <div className="flex gap-2">
          <span className="text-accent-primary">You:</span>
          <span className="text-text-primary">How do I find large files on this server?</span>
        </div>
        <div className="flex gap-2">
          <span className="text-accent-secondary">AI:</span>
          <div className="text-text-secondary">
            <p>You can use the `find` command to locate files larger than a specific size:</p>
            <code className="block mt-2 p-2 bg-background-tertiary rounded text-accent-secondary">
              find / -type f -size +100M 2&gt;/dev/null
            </code>
            <p className="mt-2">This finds all files larger than 100MB. Adjust the size as needed.</p>
          </div>
        </div>
      </div>
    ),
    imagePosition: 'left',
  },
  {
    title: 'Security without compromise',
    description:
      'All credentials stored securely in macOS Keychain. Support for encrypted SSH private keys with passphrase protection. No passwords stored in plain text. Sandboxed for maximum security. Built on industry-standard libssh2. No data collection, no analytics, no third-party tracking. All operations are local.',
    pills: ['macOS Keychain', 'Sandboxed', 'libssh2', 'Zero Tracking'],
    terminal: (
      <div className="font-mono text-xs space-y-2">
        <div className="flex items-center gap-2 text-accent-secondary">
          <Shield className="w-4 h-4" />
          <span>Security Status: Protected</span>
        </div>
        <div className="mt-3 space-y-2 text-text-secondary">
          <div className="flex items-center gap-2">
            <Check className="w-3 h-3 text-accent-secondary" />
            <span>Credentials encrypted in Keychain</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-3 h-3 text-accent-secondary" />
            <span>App running in sandbox</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-3 h-3 text-accent-secondary" />
            <span>No network telemetry</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-3 h-3 text-accent-secondary" />
            <span>SSH keys passphrase-protected</span>
          </div>
        </div>
      </div>
    ),
    imagePosition: 'right',
  },
  {
    title: 'Designed exclusively for macOS',
    description:
      'Built using SwiftUI — no Electron, no web views. Supports both light and dark mode. Fully native macOS interface that respects your system preferences. Smooth 120Hz animations and transitions. Retina-optimized for crisp text rendering on every Mac display.',
    pills: ['SwiftUI', 'Light & Dark Mode', '120Hz', 'Retina Optimized'],
    terminal: (
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/5 p-3 rounded-lg">
          <div className="text-[10px] text-text-tertiary mb-2">Light Mode</div>
          <div className="bg-gray-100 p-2 rounded text-gray-800 text-xs font-mono">
            <div className="text-gray-500">$ ls -la</div>
            <div>drwxr-xr-x  5 user</div>
          </div>
        </div>
        <div className="bg-background-tertiary p-3 rounded-lg">
          <div className="text-[10px] text-text-tertiary mb-2">Dark Mode</div>
          <div className="bg-[#0D0D14] p-2 rounded text-xs font-mono">
            <div className="text-text-secondary">$ ls -la</div>
            <div className="text-text-primary">drwxr-xr-x  5 user</div>
          </div>
        </div>
      </div>
    ),
    imagePosition: 'left',
  },
];

const includedFeatures = [
  'Unlimited SSH connections',
  'Unlimited tabs',
  'Unlimited split panes',
  'Command snippets',
  'AI chat assistant',
  'SFTP & port forwarding',
  'All features available',
  'Regular updates',
  'No subscription required',
  'One-time purchase',
];

const targetAudience = [
  { icon: Wrench, title: 'System Administrators', description: 'Managing multiple servers and credentials' },
  { icon: Server, title: 'DevOps Engineers', description: 'Deploying and monitoring infrastructure' },
  { icon: Code2, title: 'Web Developers', description: 'Working with remote dev environments' },
  { icon: Database, title: 'Database Administrators', description: 'Running queries across multiple DB servers' },
  { icon: Network, title: 'Network Engineers', description: 'Configuring routers and switches' },
  { icon: GraduationCap, title: 'Students & Learners', description: 'Learning server administration' },
];

const faqs = [
  {
    q: 'Does DeepTerm require a subscription?',
    a: 'No. One-time purchase, all features included.',
  },
  {
    q: 'Can I connect to multiple servers at once?',
    a: 'Yes, unlimited tabs and split views allow you to work with as many servers as you need simultaneously.',
  },
  {
    q: 'How are my passwords stored?',
    a: 'All credentials are stored exclusively in macOS Keychain, the same secure storage used by Safari and other Apple apps.',
  },
  {
    q: 'Does it work with SSH keys?',
    a: 'Yes, including encrypted keys with passphrases. We support all standard key formats.',
  },
  {
    q: 'What terminal emulation is supported?',
    a: 'Full xterm-256color with true PTY support for complete compatibility with all terminal applications.',
  },
  {
    q: 'Can I use it for local terminal access?',
    a: 'Yes, a built-in local shell profile is included alongside remote connections.',
  },
  {
    q: 'Does the AI chat send my data anywhere?',
    a: 'Only if you configure your own API key. We collect zero data — the AI feature is entirely optional and user-controlled.',
  },
  {
    q: 'Is this compatible with Apple Silicon?',
    a: 'Fully optimized for M1/M2/M3/M4 and Intel Macs with native performance.',
  },
  {
    q: 'What protocols are supported?',
    a: 'SSH, SFTP, Telnet, and Serial connections are all supported.',
  },
];

export default function ProductPage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero Section */}
        <section className="pt-32 pb-16">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-4xl md:text-h1 font-bold mb-6">
                <span className="gradient-text">DeepTerm</span>
              </h1>
              <p className="text-xl md:text-2xl text-text-secondary mb-4">
                Professional SSH Client Built for macOS
              </p>
              <p className="text-lg text-text-secondary max-w-2xl mx-auto mb-8">
                Transform your Mac into a professional SSH workstation.
                Connect to remote servers with ease, manage multiple sessions,
                and boost your productivity with split terminals and AI.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="#">
                  <Button variant="primary" size="lg">
                    Download for macOS
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button variant="secondary" size="lg">
                    View Pricing
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Feature Sections */}
        <section className="py-section">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
            <div className="space-y-32">
              {featureSections.map((section, index) => (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-100px' }}
                  transition={{ duration: 0.6 }}
                  className={`flex flex-col lg:flex-row items-center gap-12 ${
                    section.imagePosition === 'right' ? 'lg:flex-row-reverse' : ''
                  }`}
                >
                  <div className="flex-1 w-full">
                    <TerminalWindow title={`DeepTerm — ${section.title}`}>
                      {section.terminal}
                    </TerminalWindow>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-4">
                      {section.title}
                    </h2>
                    <p className="text-text-secondary mb-6">{section.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {section.pills.map((pill) => (
                        <span
                          key={pill}
                          className="px-3 py-1 bg-accent-primary/10 text-accent-primary text-sm rounded-full"
                        >
                          {pill}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* What's Included */}
        <section className="py-section bg-background-secondary/30">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center mb-12"
            >
              <h2 className="text-h2 font-bold text-text-primary mb-4">
                What&apos;s Included
              </h2>
            </motion.div>

            <Card className="max-w-2xl mx-auto">
              <div className="grid grid-cols-2 gap-4">
                {includedFeatures.map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-accent-secondary flex-shrink-0" />
                    <span className="text-text-primary">{feature}</span>
                  </div>
                ))}
              </div>
              <div className="mt-8 text-center">
                <Link href="#">
                  <Button variant="primary" size="lg">
                    Download for macOS — $19.99
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </section>

        {/* Perfect For */}
        <section className="py-section">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center mb-12"
            >
              <h2 className="text-h2 font-bold text-text-primary mb-4">
                Perfect For
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {targetAudience.map((audience, index) => {
                const Icon = audience.icon;
                return (
                  <motion.div
                    key={audience.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Card hover className="h-full text-center">
                      <div className="w-12 h-12 bg-accent-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Icon className="w-6 h-6 text-accent-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-text-primary mb-2">
                        {audience.title}
                      </h3>
                      <p className="text-text-secondary">{audience.description}</p>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-section bg-background-secondary/30">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center mb-12"
            >
              <h2 className="text-h2 font-bold text-text-primary mb-4">
                Frequently Asked Questions
              </h2>
            </motion.div>

            <div className="max-w-2xl mx-auto">
              <Accordion>
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`faq-${index}`}>
                    <AccordionTrigger value={`faq-${index}`}>{faq.q}</AccordionTrigger>
                    <AccordionContent value={`faq-${index}`}>{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
