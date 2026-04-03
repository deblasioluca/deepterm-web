'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { Shield } from 'lucide-react';

export default function PrivacyPolicyPage() {
  const lastUpdated = 'April 3, 2026';

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
                <Shield className="w-8 h-8 text-accent-primary" />
              </div>
              <h1 className="text-4xl md:text-h1 font-bold mb-4">
                Privacy Policy
              </h1>
              <p className="text-text-secondary">
                Last updated: {lastUpdated}
              </p>
            </motion.div>
          </div>
        </section>

        {/* Content */}
        <section className="pb-24">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="max-w-none space-y-8"
            >
              {/* Introduction */}
              <div>
                <h2 className="text-2xl font-semibold text-text-primary mb-4">Introduction</h2>
                <p className="text-text-secondary leading-relaxed">
                  Luca De Blasio (&quot;we&quot;, &quot;our&quot;, or &quot;DeepTerm&quot;) is committed to protecting
                  your privacy. This Privacy Policy explains how we collect, use, disclose, and
                  safeguard your information when you use the DeepTerm macOS application and the
                  DeepTerm web services at deepterm.net (collectively, the &quot;Service&quot;).
                </p>
              </div>

              {/* Information We Collect */}
              <div>
                <h2 className="text-2xl font-semibold text-text-primary mb-4">Information We Collect</h2>

                <h3 className="text-lg font-semibold text-text-primary mt-6 mb-2">Account Information</h3>
                <p className="text-text-secondary leading-relaxed">
                  When you create an account, we collect your email address and a display name.
                  If you sign up via GitHub or Apple OAuth, we receive your email address and
                  public profile name from the identity provider. We do not store your OAuth
                  passwords.
                </p>

                <h3 className="text-lg font-semibold text-text-primary mt-6 mb-2">Zero-Knowledge Vault Data</h3>
                <p className="text-text-secondary leading-relaxed">
                  DeepTerm uses a zero-knowledge encryption architecture. Your vault data
                  (SSH credentials, keys, identities, snippets, port forwarding rules) is
                  encrypted on your device before being transmitted to our servers. We store
                  only the encrypted ciphertext. We do not have access to your master password,
                  encryption keys, or the plaintext contents of your vault. We cannot decrypt
                  your data, even if compelled by law.
                </p>

                <h3 className="text-lg font-semibold text-text-primary mt-6 mb-2">Subscription and Payment Data</h3>
                <p className="text-text-secondary leading-relaxed">
                  Payments are processed by Stripe (web) and Apple (App Store). We receive
                  confirmation of your subscription status, plan tier, and transaction identifiers.
                  We do not store credit card numbers or payment credentials.
                </p>

                <h3 className="text-lg font-semibold text-text-primary mt-6 mb-2">Collaboration Data</h3>
                <p className="text-text-secondary leading-relaxed">
                  When you use team collaboration features (shared terminal sessions, chat,
                  voice calls), messages and session metadata are transmitted through our
                  servers. Chat messages are stored to provide message history. Voice calls
                  use peer-to-peer WebRTC connections; audio streams do not pass through
                  our servers. Shared terminal data is relayed in real time and is not
                  persistently stored.
                </p>

                <h3 className="text-lg font-semibold text-text-primary mt-6 mb-2">Usage Analytics</h3>
                <p className="text-text-secondary leading-relaxed">
                  Our website may collect anonymous page-view data (page URL, timestamp,
                  approximate geographic region derived from IP address) to understand
                  how visitors use our site. We do not use third-party analytics services
                  such as Google Analytics. The macOS application does not collect any
                  analytics or telemetry data.
                </p>
              </div>

              {/* How We Use Your Information */}
              <div>
                <h2 className="text-2xl font-semibold text-text-primary mb-4">How We Use Your Information</h2>
                <ul className="list-disc pl-6 space-y-2 text-text-secondary">
                  <li>To provide and maintain the Service, including cloud vault synchronization</li>
                  <li>To process subscriptions and manage your account</li>
                  <li>To facilitate team collaboration features (chat, voice, shared sessions)</li>
                  <li>To send transactional emails (account verification, password resets, organization invitations)</li>
                  <li>To respond to support requests</li>
                  <li>To improve our website and documentation</li>
                </ul>
              </div>

              {/* Data Sharing */}
              <div>
                <h2 className="text-2xl font-semibold text-text-primary mb-4">Data Sharing and Disclosure</h2>
                <p className="text-text-secondary leading-relaxed mb-4">
                  We do not sell, rent, or trade your personal information. We share data only
                  in the following circumstances:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-text-secondary">
                  <li><strong className="text-text-primary">Payment processors:</strong> Stripe and Apple receive payment information to process subscriptions.</li>
                  <li><strong className="text-text-primary">Email delivery:</strong> Transactional emails are sent via Gmail API and ImprovMX for email forwarding.</li>
                  <li><strong className="text-text-primary">AI features:</strong> When you use AI-powered features, your terminal context or chat messages are sent to the LLM provider you have selected (e.g., Anthropic, OpenAI). No data is sent without your explicit action.</li>
                  <li><strong className="text-text-primary">Legal requirements:</strong> We may disclose information if required by law, provided that we cannot disclose your vault contents because they are encrypted with keys we do not possess.</li>
                </ul>
              </div>

              {/* Data Security */}
              <div>
                <h2 className="text-2xl font-semibold text-text-primary mb-4">Data Security</h2>
                <p className="text-text-secondary leading-relaxed">
                  We implement industry-standard security measures including TLS encryption
                  for all network traffic, bcrypt password hashing, AES-256 vault encryption,
                  and hardened server configurations. The macOS application runs in an App
                  Sandbox and uses macOS Keychain for local credential storage.
                </p>
              </div>

              {/* Data Retention */}
              <div>
                <h2 className="text-2xl font-semibold text-text-primary mb-4">Data Retention</h2>
                <p className="text-text-secondary leading-relaxed">
                  We retain your account data for as long as your account is active. If you
                  delete your account (available via the macOS app or the web dashboard),
                  all associated data is permanently removed, including your encrypted vault
                  items, organization memberships, chat history, and account information.
                </p>
              </div>

              {/* Your Rights */}
              <div>
                <h2 className="text-2xl font-semibold text-text-primary mb-4">Your Rights</h2>
                <p className="text-text-secondary leading-relaxed mb-4">You have the right to:</p>
                <ul className="list-disc pl-6 space-y-2 text-text-secondary">
                  <li>Access the personal data we hold about you</li>
                  <li>Request correction of inaccurate data</li>
                  <li>Request deletion of your account and all associated data</li>
                  <li>Export your vault data before account deletion</li>
                  <li>Opt out of non-essential communications</li>
                  <li>Manage your privacy choices at <Link href="/privacy-choices" className="text-accent-primary hover:underline">deepterm.net/privacy-choices</Link></li>
                </ul>
              </div>

              {/* Children's Privacy */}
              <div>
                <h2 className="text-2xl font-semibold text-text-primary mb-4">Children&apos;s Privacy</h2>
                <p className="text-text-secondary leading-relaxed">
                  The Service is not intended for children under 16. We do not knowingly
                  collect personal information from children under 16. If we become aware
                  that we have collected data from a child under 16, we will delete it promptly.
                </p>
              </div>

              {/* International Transfers */}
              <div>
                <h2 className="text-2xl font-semibold text-text-primary mb-4">International Data Transfers</h2>
                <p className="text-text-secondary leading-relaxed">
                  Our servers are located in Switzerland. If you access the Service from
                  outside Switzerland, your data may be transferred to and processed in
                  Switzerland. By using the Service, you consent to this transfer.
                  Your vault data remains encrypted at all times regardless of location.
                </p>
              </div>

              {/* Changes */}
              <div>
                <h2 className="text-2xl font-semibold text-text-primary mb-4">Changes to This Policy</h2>
                <p className="text-text-secondary leading-relaxed">
                  We may update this Privacy Policy from time to time. We will notify you
                  of material changes by posting the updated policy on this page and updating
                  the &quot;Last updated&quot; date. Your continued use of the Service after changes
                  constitutes acceptance of the updated policy.
                </p>
              </div>

              {/* Contact */}
              <div>
                <h2 className="text-2xl font-semibold text-text-primary mb-4">Contact Us</h2>
                <p className="text-text-secondary leading-relaxed">
                  If you have questions about this Privacy Policy or your personal data, contact us at:
                </p>
                <ul className="list-none pl-0 mt-4 space-y-1 text-text-secondary">
                  <li>Email: <a href="mailto:info@deepterm.net" className="text-accent-primary hover:underline">info@deepterm.net</a></li>
                  <li>Web: <Link href="/documentation" className="text-accent-primary hover:underline">deepterm.net/documentation</Link></li>
                </ul>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
