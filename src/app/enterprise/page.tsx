'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Navbar, Footer } from '@/components/layout';
import { Button, Card, Input, Modal } from '@/components/ui';
import {
  Zap,
  Users,
  Lock,
  Shield,
  TrendingUp,
  Clock,
  Building,
  CheckCircle,
} from 'lucide-react';

const enterpriseFeatures = [
  {
    icon: Zap,
    title: 'Instant Incident Response',
    description:
      'Connection details and credentials stored in shared vaults. One-click access eliminates scrambling during outages. Reduce Mean Time to Recovery.',
  },
  {
    icon: Users,
    title: 'Frictionless Onboarding',
    description:
      'New engineers get access to organized vaults on day one. No more days spent chasing scattered infrastructure knowledge across wikis and Slack threads.',
  },
  {
    icon: Lock,
    title: 'Centralized Credential Management',
    description:
      'No more credentials scattered across devices, untracked and unprotected. Every key, password, and config is in encrypted vaults with full audit trails.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security & Compliance',
    description:
      'SAML SSO with 30+ identity providers, SOC 2 Type II certification, FIDO2 authentication, session logging, and role-based access control.',
  },
  {
    icon: TrendingUp,
    title: 'Scale with Confidence',
    description:
      'From 10 engineers to 10,000. Per-department vaults, granular permissions, and usage analytics.',
  },
];

const securityBadges = [
  'SAML SSO',
  'SOC 2 Type II',
  'FIDO2/WebAuthn',
  'Session Logging',
  'Audit Trails',
  'Role-Based Access',
  'SSH Certificates',
  'Dedicated Support',
];

export default function EnterprisePage() {
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    teamSize: '',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would submit to an API
    console.log('Form submitted:', formData);
    setIsContactModalOpen(false);
    setFormData({ name: '', email: '', company: '', teamSize: '', message: '' });
  };

  return (
    <>
      <Navbar />
      <main>
        {/* Hero Section */}
        <section className="pt-32 pb-16 relative overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 grid-pattern opacity-30" />
          <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-accent-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/3 right-1/4 w-[500px] h-[500px] bg-accent-secondary/10 rounded-full blur-3xl" />

          <div className="relative max-w-content mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex items-center justify-center gap-2 mb-6">
                <Building className="w-8 h-8 text-accent-primary" />
              </div>
              <h1 className="text-4xl md:text-h1 font-bold mb-6">
                Modern SSH Client with AI Capabilities
                <br />
                <span className="gradient-text">Built for Enterprise</span>
              </h1>
              <p className="text-xl text-text-secondary max-w-2xl mx-auto mb-8">
                Simplify infrastructure management across departments with secure credentials,
                standardized workflows, and seamless collaboration.
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={() => setIsContactModalOpen(true)}
              >
                Contact Sales
              </Button>
            </motion.div>
          </div>
        </section>

        {/* Enterprise Features */}
        <section className="py-section">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {enterpriseFeatures.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Card hover className="h-full">
                      <div className="w-12 h-12 bg-accent-primary/10 rounded-lg flex items-center justify-center mb-4">
                        <Icon className="w-6 h-6 text-accent-primary" />
                      </div>
                      <h3 className="text-xl font-semibold text-text-primary mb-3">
                        {feature.title}
                      </h3>
                      <p className="text-text-secondary">{feature.description}</p>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Security Badges */}
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
                Enterprise-grade security
              </h2>
              <p className="text-lg text-text-secondary max-w-xl mx-auto">
                Built from the ground up with security and compliance in mind.
              </p>
            </motion.div>

            <div className="flex flex-wrap justify-center gap-4">
              {securityBadges.map((badge, index) => (
                <motion.div
                  key={badge}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="flex items-center gap-2 px-4 py-2 bg-background-tertiary border border-border rounded-full"
                >
                  <CheckCircle className="w-4 h-4 text-accent-secondary" />
                  <span className="text-text-primary text-sm font-medium">{badge}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-section">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { value: '99.99%', label: 'Uptime SLA' },
                { value: '30+', label: 'SSO Providers' },
                { value: '24/7', label: 'Dedicated Support' },
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="text-center"
                >
                  <div className="text-4xl md:text-5xl font-bold gradient-text mb-2">
                    {stat.value}
                  </div>
                  <p className="text-text-secondary">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-section bg-gradient-to-r from-accent-primary/10 to-accent-secondary/10">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <Clock className="w-12 h-12 text-accent-primary mx-auto mb-6" />
              <h2 className="text-2xl md:text-h2 font-bold text-text-primary mb-4">
                Ready to transform your team&apos;s workflow?
              </h2>
              <p className="text-lg text-text-secondary max-w-xl mx-auto mb-8">
                Schedule a demo to see how DeepTerm Enterprise can help your organization.
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={() => setIsContactModalOpen(true)}
              >
                Schedule a Demo
              </Button>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />

      {/* Contact Modal */}
      <Modal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        title="Contact Sales"
        description="Tell us about your team and we'll get back to you within 24 hours."
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Full Name"
            placeholder="John Smith"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Input
            label="Work Email"
            type="email"
            placeholder="john@company.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
          <Input
            label="Company"
            placeholder="Acme Inc."
            value={formData.company}
            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            required
          />
          <Input
            label="Team Size"
            placeholder="e.g., 50-100 engineers"
            value={formData.teamSize}
            onChange={(e) => setFormData({ ...formData, teamSize: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              How can we help?
            </label>
            <textarea
              className="w-full bg-background-tertiary border border-border rounded-button px-4 py-2.5 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors duration-200 min-h-[100px]"
              placeholder="Tell us about your use case..."
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setIsContactModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="flex-1">
              Send Message
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
