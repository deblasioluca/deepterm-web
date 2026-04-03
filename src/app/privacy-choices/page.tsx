'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { Card } from '@/components/ui';
import {
  Settings,
  Shield,
  Eye,
  MessageSquare,
  Mic,
  Database,
  Trash2,
  Download,
} from 'lucide-react';

const privacyChoices = [
  {
    icon: Database,
    title: 'Cloud Vault Sync',
    description:
      'Your vault data (SSH credentials, keys, identities, snippets) can be synced across devices via our encrypted cloud service. This feature requires a Pro plan or higher.',
    howToControl:
      'In the macOS app, go to Settings and choose whether to enable cloud vault sync. You can use DeepTerm entirely offline with a local-only vault on the Starter plan.',
  },
  {
    icon: Eye,
    title: 'AI-Powered Features',
    description:
      'DeepTerm offers AI autocomplete and an AI chat assistant that send terminal context or your questions to a third-party LLM provider (e.g., Anthropic, OpenAI).',
    howToControl:
      'AI features are opt-in. You choose your LLM provider and enter your own API key in Settings > AI Providers. No data is sent to any AI service unless you explicitly configure a provider and use the feature. You can remove your API key at any time to disable AI features entirely.',
  },
  {
    icon: MessageSquare,
    title: 'Team Chat Messages',
    description:
      'Chat messages sent through the collaboration feature are stored on our servers to provide message history for your team.',
    howToControl:
      'Chat is only active when you join a team organization. You can leave an organization at any time via Settings > Account > Organizations. When your account is deleted, all your chat messages are permanently removed.',
  },
  {
    icon: Mic,
    title: 'Microphone Access (Voice Calls)',
    description:
      'Voice calls use your microphone to capture audio. Audio streams are transmitted peer-to-peer via WebRTC and do not pass through our servers.',
    howToControl:
      'Microphone access requires your explicit permission via macOS system prompt. You can revoke it at any time in System Settings > Privacy & Security > Microphone. You can also mute your microphone during calls.',
  },
  {
    icon: Shield,
    title: 'Shared Terminal Sessions',
    description:
      'When you share a terminal session, your terminal output is relayed through our server to other participants in real time.',
    howToControl:
      'Terminal sharing is always initiated by you. You control who can join (by invitation only) and whether participants have read-only or read-write access. You can end a shared session at any time. Shared terminal data is not stored after the session ends.',
  },
  {
    icon: Settings,
    title: 'Website Analytics',
    description:
      'Our website collects anonymous page-view data (page URL, timestamp, approximate region) to understand how visitors use our site.',
    howToControl:
      'Website analytics are minimal and anonymous. No cookies are used for tracking. No data is shared with third-party analytics services. The macOS application collects no analytics whatsoever.',
  },
];

export default function PrivacyChoicesPage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero */}
        <section className="pt-32 pb-8">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="w-16 h-16 bg-accent-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Settings className="w-8 h-8 text-accent-primary" />
              </div>
              <h1 className="text-4xl md:text-h1 font-bold mb-4">
                Your Privacy Choices
              </h1>
              <p className="text-lg text-text-secondary max-w-2xl mx-auto">
                DeepTerm gives you full control over your data. Here is what you
                can configure and how.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Choices Grid */}
        <section className="pb-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            {privacyChoices.map((choice, index) => {
              const Icon = choice.icon;
              return (
                <motion.div
                  key={choice.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                >
                  <Card>
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-accent-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6 text-accent-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-text-primary mb-2">
                          {choice.title}
                        </h3>
                        <p className="text-text-secondary mb-3">
                          {choice.description}
                        </p>
                        <div className="bg-background-secondary/50 rounded-lg p-3">
                          <p className="text-sm text-text-primary">
                            <strong>How to control:</strong>{' '}
                            <span className="text-text-secondary">
                              {choice.howToControl}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Account Actions */}
        <section className="pb-24">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <Card className="bg-background-tertiary border-accent-primary/30">
                <h2 className="text-xl font-semibold text-text-primary mb-6">
                  Account-Level Privacy Actions
                </h2>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Download className="w-5 h-5 text-accent-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-text-primary font-medium">Export Your Data</p>
                      <p className="text-sm text-text-secondary">
                        You can export your vault credentials at any time from the
                        macOS app via File &gt; Export. Exports are available in
                        encrypted or plaintext format.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Trash2 className="w-5 h-5 text-accent-danger mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-text-primary font-medium">Delete Your Account</p>
                      <p className="text-sm text-text-secondary">
                        You can permanently delete your account from the macOS app
                        (Settings &gt; Account &gt; Delete Account) or from the web
                        dashboard (Dashboard &gt; Account &gt; Delete Account). This
                        removes all your data including encrypted vault items,
                        organization memberships, chat history, and account information.
                        This action is irreversible.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* Links */}
        <section className="pb-24">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-text-secondary">
              For more details, see our{' '}
              <Link
                href="/privacy"
                className="text-accent-primary hover:underline"
              >
                Privacy Policy
              </Link>{' '}
              or contact us at{' '}
              <a
                href="mailto:info@deepterm.net"
                className="text-accent-primary hover:underline"
              >
                info@deepterm.net
              </a>
              .
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
