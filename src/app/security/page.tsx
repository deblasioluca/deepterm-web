'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { Button, Card } from '@/components/ui';
import {
  Shield,
  Key,
  Lock,
  Eye,
  Server,
  FileCheck,
  Users,
  Globe,
  Check,
  X,
} from 'lucide-react';

const securityFeatures = [
  {
    icon: Key,
    title: 'macOS Keychain Integration',
    description:
      'All credentials — passwords, SSH private keys, passphrases — are stored exclusively in macOS Keychain, the same secure storage used by Safari, Mail, and other Apple apps. No passwords are ever stored in plain text. No separate password database to manage or protect.',
  },
  {
    icon: Eye,
    title: 'Zero-Knowledge, Zero-Collection Architecture',
    description:
      'DeepTerm collects no user data whatsoever. No analytics, no tracking, no usage statistics, no third-party services. All operations are entirely local. Your connection history, saved commands, and server details never leave your Mac.',
  },
  {
    icon: Lock,
    title: 'End-to-End Encryption',
    description:
      'Data encrypted before leaving your device with AES-256. Private keys are encrypted with your master password on the client side. Even DeepTerm staff cannot access your credentials. The encrypted key is stored on DeepTerm servers only for cloud vault features — without your master password, the data is unreadable.',
  },
  {
    icon: Shield,
    title: 'Sandboxed Application',
    description:
      'DeepTerm runs in a macOS sandbox, limiting its access to only what\'s needed. This provides an additional layer of protection against potential security vulnerabilities, following Apple\'s security best practices.',
  },
  {
    icon: Server,
    title: 'Industry-Standard SSH Library',
    description:
      'Built on libssh2, the battle-tested, open-source SSH library used by thousands of applications worldwide. Support for encrypted SSH private keys with passphrase protection. Full SSH key authentication alongside password-based auth.',
  },
  {
    icon: FileCheck,
    title: 'SOC 2 Type II Compliance',
    description:
      'DeepTerm undergoes annual SOC 2 Type II audits. Request our latest report from the security assessment page.',
  },
  {
    icon: Users,
    title: 'Enterprise-Grade Controls',
    description:
      'SAML SSO with 30+ identity providers, FIDO2/WebAuthn support, biometric authentication (TouchID / FaceID), PIN lock, SSH certificates, session logging, and audit trails.',
  },
  {
    icon: Globe,
    title: 'Secure Infrastructure',
    description:
      'Cloud services hosted on AWS with redundant architecture. Penetration testing performed quarterly. Responsible disclosure program in place.',
  },
];

export default function SecurityPage() {
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
              <div className="w-16 h-16 bg-accent-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Shield className="w-8 h-8 text-accent-primary" />
              </div>
              <h1 className="text-4xl md:text-h1 font-bold mb-6">
                Security at <span className="gradient-text">DeepTerm</span>
              </h1>
              <p className="text-xl text-text-secondary max-w-2xl mx-auto mb-4">
                Your infrastructure access, encrypted end-to-end.
              </p>
              <p className="text-lg text-text-secondary max-w-2xl mx-auto">
                Your credentials never leave your Mac.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Security Features Grid */}
        <section className="py-section">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {securityFeatures.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Card className="h-full">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-accent-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Icon className="w-6 h-6 text-accent-primary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-text-primary mb-2">
                            {feature.title}
                          </h3>
                          <p className="text-text-secondary">{feature.description}</p>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Privacy Promise */}
        <section className="py-section">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <Card className="max-w-3xl mx-auto bg-background-tertiary border-accent-primary/30">
                <div className="flex items-center gap-3 mb-6">
                  <Lock className="w-6 h-6 text-accent-primary" />
                  <h2 className="text-xl font-semibold text-text-primary">
                    DeepTerm Privacy Promise
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* What We Don't Do */}
                  <div>
                    <div className="space-y-3">
                      {[
                        'No data collection',
                        'No analytics',
                        'No third-party tracking',
                        'No cloud sync required',
                        'No browsing history',
                        'No usage statistics',
                      ].map((item) => (
                        <div key={item} className="flex items-center gap-2">
                          <X className="w-5 h-5 text-accent-danger flex-shrink-0" />
                          <span className="text-text-secondary">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* What We Do */}
                  <div>
                    <div className="space-y-3">
                      {[
                        'Credentials in macOS Keychain only',
                        'All data stays on your Mac',
                        'Sandboxed for maximum security',
                        'Built on open-source libssh2',
                      ].map((item) => (
                        <div key={item} className="flex items-center gap-2">
                          <Check className="w-5 h-5 text-accent-secondary flex-shrink-0" />
                          <span className="text-text-primary">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-section bg-background-secondary/30">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl md:text-h2 font-bold text-text-primary mb-4">
                Need more information?
              </h2>
              <p className="text-lg text-text-secondary max-w-xl mx-auto mb-8">
                Request our security assessment reports or contact our security team.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/dashboard/security-assessment">
                  <Button variant="primary">Request Security Assessment</Button>
                </Link>
                <Link href="#">
                  <Button variant="secondary">View Privacy Policy</Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
