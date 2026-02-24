'use client';

import { motion } from 'framer-motion';
import { TerminalWindow, TerminalLine } from '@/components/ui';
import { Cpu, Keyboard, FolderOpen, Palette } from 'lucide-react';
import { useLocale } from '@/components/i18n/LocaleProvider';

const deepDiveFeatures = [
  {
    icon: Cpu,
    title: 'Native macOS Performance',
    description:
      'Built from the ground up for macOS using SwiftUI. No Electron, no web views — just native Apple frameworks delivering smooth 120Hz performance, Retina-optimized text rendering, and seamless integration with your Mac. Optimized for Apple Silicon (M1/M2/M3).',
    terminalContent: (
      <>
        <div className="flex gap-4 mb-4">
          {/* Sidebar mockup */}
          <div className="w-48 border-r border-border pr-4">
            <div className="text-xs text-text-tertiary mb-2">CONNECTIONS</div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-2 py-1 bg-accent-primary/10 rounded text-xs">
                <span className="w-2 h-2 bg-accent-secondary rounded-full" />
                prod-server-01
              </div>
              <div className="flex items-center gap-2 px-2 py-1 text-text-secondary text-xs">
                <span className="w-2 h-2 bg-text-tertiary rounded-full" />
                staging-db
              </div>
              <div className="flex items-center gap-2 px-2 py-1 text-text-secondary text-xs">
                <span className="w-2 h-2 bg-text-tertiary rounded-full" />
                dev-frontend
              </div>
            </div>
          </div>
          {/* Terminal content */}
          <div className="flex-1">
            <TerminalLine prompt="$" command="neofetch" />
            <TerminalLine output="       _,met$$$$$gg.           user@macbook" />
            <TerminalLine output="    ,g$$$$$$$$$$$$$$$P.        OS: macOS 14.3 Sonoma" />
            <TerminalLine output="  ,g$$P               Y$$.     Host: MacBook Pro M3 Max" />
            <TerminalLine output="  ,$$P                 $$$.    Kernel: Darwin 23.3.0" />
          </div>
        </div>
      </>
    ),
    imagePosition: 'left',
  },
  {
    icon: null,
    title: 'True Terminal Emulation',
    description:
      'Full VT100/xterm-256color terminal emulation with true PTY support. Real-time output streaming with low latency. Beautiful syntax highlighting, full Unicode and emoji support, and customizable fonts, sizes, and color themes.',
    pills: ['xterm-256color', 'PTY Support', 'Low Latency', 'Retina Display'],
    terminalContent: (
      <>
        <TerminalLine prompt="$" command="htop" />
        <div className="mt-2 font-mono text-xs">
          <div className="text-accent-secondary">  CPU[||||||||||||||||      62%]</div>
          <div className="text-accent-warning">  MEM[||||||||||           45%]</div>
          <div className="text-text-secondary mt-2">  PID USER      PRI  NI  VIRT   RES   SHR S CPU% MEM%</div>
          <div className="text-accent-danger"> 4821 root       20   0 1.2G  456M   24M S 89.2  5.2</div>
          <div className="text-text-secondary"> 1234 nginx      20   0  128M   32M   12M S  2.1  0.4</div>
          <div className="text-text-secondary"> 5678 postgres   20   0  512M  256M   64M S  1.5  2.8</div>
        </div>
      </>
    ),
    imagePosition: 'right',
  },
  {
    icon: Keyboard,
    title: 'Keyboard-First Workflow',
    description:
      'Comprehensive keyboard shortcuts for every action. Open connections with ⌘O, new tabs with ⌘T, split terminals with ⌘⇧D, switch tabs with ⌘1-9. Navigate and control everything without ever touching the mouse.',
    terminalContent: (
      <div className="flex flex-wrap gap-3">
        {['⌘T', '⌘⇧D', '⌘O', '⌘1-9', '⌘W', '⌘K', '⌘↑', '⌘↓'].map((shortcut) => (
          <div
            key={shortcut}
            className="px-4 py-2 bg-background-tertiary border border-border rounded-lg font-mono text-sm text-text-primary"
          >
            {shortcut}
          </div>
        ))}
      </div>
    ),
    imagePosition: 'left',
  },
  {
    icon: FolderOpen,
    title: 'SFTP & Port Forwarding',
    description:
      'Built-in SFTP file browser and port forwarding — no extra tools needed. Drag and drop file paths directly into the terminal. Transfer files between hosts and clients with ease.',
    terminalContent: (
      <div className="font-mono text-xs">
        <div className="flex items-center gap-2 text-text-tertiary mb-2">
          <span>📁 /var/www/html</span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-accent-primary">
            <span>📁</span> app/
          </div>
          <div className="flex items-center gap-2 text-accent-primary">
            <span>📁</span> config/
          </div>
          <div className="flex items-center gap-2 text-text-primary">
            <span>📄</span> index.html <span className="text-text-tertiary">2.4 KB</span>
          </div>
          <div className="flex items-center gap-2 text-text-primary">
            <span>📄</span> styles.css <span className="text-text-tertiary">8.1 KB</span>
          </div>
          <div className="flex items-center gap-2 text-text-primary">
            <span>📄</span> app.js <span className="text-text-tertiary">24.6 KB</span>
          </div>
        </div>
      </div>
    ),
    imagePosition: 'right',
  },
];

export function DeepDiveFeatures() {
  const { messages } = useLocale();

  const localizedDeepDiveFeatures = deepDiveFeatures.map((feature, index) => ({
    ...feature,
    title: messages.home.deepDiveFeatures[index]?.title ?? feature.title,
    description: messages.home.deepDiveFeatures[index]?.description ?? feature.description,
  }));

  return (
    <section className="py-section">
      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <h2 className="text-h2 font-bold text-text-primary mb-4">
            {messages.home.deepDiveTitle}
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            {messages.home.deepDiveSubtitle}
          </p>
        </motion.div>

        <div className="space-y-32">
          {localizedDeepDiveFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6 }}
              className={`flex flex-col lg:flex-row items-center gap-12 ${
                feature.imagePosition === 'right' ? 'lg:flex-row-reverse' : ''
              }`}
            >
              {/* Terminal/Visual */}
              <div className="flex-1 w-full">
                <TerminalWindow title={`DeepTerm — ${feature.title}`}>
                  {feature.terminalContent}
                </TerminalWindow>
              </div>

              {/* Content */}
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-text-primary mb-4">
                  {feature.title}
                </h3>
                <p className="text-text-secondary mb-6">{feature.description}</p>
                {feature.pills && (
                  <div className="flex flex-wrap gap-2">
                    {feature.pills.map((pill) => (
                      <span
                        key={pill}
                        className="px-3 py-1 bg-accent-primary/10 text-accent-primary text-sm rounded-full"
                      >
                        {pill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
