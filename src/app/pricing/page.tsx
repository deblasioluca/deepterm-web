'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Navbar, Footer } from '@/components/layout';
import {
  Button,
  Badge,
  Card,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui';
import { Check, X, Star } from 'lucide-react';

const plans = [
  {
    name: 'Starter',
    price: 'Free',
    period: '',
    subtitle: 'available for commercial usage',
    tagline: 'For home lab enthusiasts seeking a modern SSH client.',
    highlights: ['SSH and SFTP', 'Local vault', 'AI-powered autocomplete', 'Port Forwarding'],
    cta: 'Get Started',
    ctaVariant: 'secondary' as const,
    popular: false,
    showQuoteLink: false,
  },
  {
    name: 'Pro',
    price: '$10',
    period: '/month',
    billing: 'when paid annually',
    tagline: 'For individuals responsible for keeping the infrastructure up and running 24/7.',
    highlights: [
      'All Starter features',
      'Personal vault',
      'Sync across mobile and desktop',
      'Snippets Automation',
    ],
    cta: 'Try for Free',
    ctaVariant: 'primary' as const,
    popular: true,
    showQuoteLink: false,
  },
  {
    name: 'Team',
    price: '$20',
    period: '/user/month',
    billing: 'when paid annually',
    tagline: 'For teams that need to manage infrastructure together and stay on the same page.',
    highlights: [
      'All Pro features',
      'Team vault for simple, secure sharing',
      'Real-time collaboration',
      'Consolidated billing',
    ],
    cta: 'Try for Free',
    ctaVariant: 'primary' as const,
    popular: false,
    showQuoteLink: true,
  },
  {
    name: 'Business',
    price: '$30',
    period: '/user/month',
    billing: 'when paid annually',
    tagline: 'For companies requiring access control and advanced security.',
    highlights: [
      'All Team features',
      'Multiple vaults with granular permissions',
      'SOC2 Type II report',
      'SAML SSO',
    ],
    cta: 'Try for Free',
    ctaVariant: 'primary' as const,
    popular: false,
    showQuoteLink: true,
  },
];

type LiveOffering = {
  key: string;
  interval: 'monthly' | 'yearly';
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
};

function formatUsdFromCents(cents: number): string {
  const dollars = cents / 100;
  const fixed = dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2);
  return `$${fixed}`;
}

const featureComparison = [
  {
    category: 'Protocols',
    features: [
      { name: 'SSH', starter: true, pro: true, team: true, business: true },
      { name: 'SFTP', starter: true, pro: true, team: true, business: true },
      { name: 'Telnet', starter: true, pro: true, team: true, business: true },
      { name: 'Serial', starter: true, pro: true, team: true, business: true },
    ],
  },
  {
    category: 'Terminal',
    features: [
      { name: 'Split View', starter: true, pro: true, team: true, business: true },
      { name: 'Unlimited Tabs', starter: true, pro: true, team: true, business: true },
      { name: 'Command Snippets', starter: true, pro: true, team: true, business: true },
      { name: 'AI-powered autocomplete', starter: true, pro: true, team: true, business: true },
      { name: 'AI Chat Assistant', starter: false, pro: true, team: true, business: true },
      { name: 'Snippets Automation', starter: false, pro: true, team: true, business: true },
    ],
  },
  {
    category: 'Sync & Sharing',
    features: [
      { name: 'Local Vault', starter: true, pro: true, team: true, business: true },
      { name: 'Personal Vault (Cloud)', starter: false, pro: true, team: true, business: true },
      { name: 'Sync across mobile and desktop', starter: false, pro: true, team: true, business: true },
      { name: 'Team Vault', starter: false, pro: false, team: true, business: true },
      { name: 'Multiple Vaults with granular permissions', starter: false, pro: false, team: false, business: true },
    ],
  },
  {
    category: 'Integrations',
    features: [
      { name: 'AWS', starter: false, pro: true, team: true, business: true },
      { name: 'DigitalOcean', starter: false, pro: true, team: true, business: true },
    ],
  },
  {
    category: 'Security',
    features: [
      { name: 'macOS Keychain Storage', starter: true, pro: true, team: true, business: true },
      { name: 'Biometric Keys (TouchID/FaceID)', starter: true, pro: true, team: true, business: true },
      { name: 'PIN Lock', starter: true, pro: true, team: true, business: true },
      { name: 'Session Logs', starter: false, pro: true, team: true, business: true },
      { name: 'SSH Certificates', starter: false, pro: false, team: true, business: true },
      { name: 'FIDO2', starter: false, pro: false, team: true, business: true },
      { name: 'SAML SSO', starter: false, pro: false, team: false, business: true },
      { name: 'SOC 2 Type II Report', starter: false, pro: false, team: false, business: true },
    ],
  },
];

const testimonials = [
  {
    quote: "DeepTerm has become essential for our DevOps team. The split terminal views alone save us hours every week.",
    author: 'Michael Torres',
    title: 'VP of Engineering',
    company: 'CloudOps Solutions',
  },
  {
    quote: "Finally, an SSH client that takes security seriously. The Keychain integration gives us peace of mind.",
    author: 'Amanda Lee',
    title: 'Security Architect',
    company: 'FinSecure Inc.',
  },
];

const faqs = [
  {
    q: 'What payment methods do you accept?',
    a: 'Credit card on our website, or purchase order with invoice payable by check or bank transfer for annual plans.',
  },
  {
    q: 'Can I switch plans later?',
    a: 'Yes, you can upgrade or downgrade at any time. Changes are prorated.',
  },
  {
    q: 'Is there a discount for annual billing?',
    a: 'Yes, all listed prices reflect annual billing. Monthly billing is available at a higher rate.',
  },
  {
    q: 'Do you offer academic/student pricing?',
    a: 'Yes! Eligible students get DeepTerm Pro for free through our student program. Verify your student status in the dashboard.',
  },
  {
    q: 'Does DeepTerm require a subscription?',
    a: 'The Starter plan is completely free. Pro, Team, and Business are subscription-based. We also offer a one-time purchase option for the macOS desktop app at $19.99.',
  },
  {
    q: 'Can I try before I buy?',
    a: 'Absolutely. All paid plans include a free trial period. No credit card required to start.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'Your data remains in your local vault. Cloud vault data can be exported before cancellation.',
  },
];

export default function PricingPage() {
  const [offerings, setOfferings] = useState<LiveOffering[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/billing/offerings');
        if (!res.ok) return;
        const data = await res.json();
        setOfferings((data?.offerings || []) as LiveOffering[]);
      } catch {
        // ignore
      }
    })();
  }, []);

  const displayPlans = useMemo(() => {
    const proYearly = offerings.find((o) => o.key === 'pro' && o.interval === 'yearly');
    const teamYearly = offerings.find((o) => o.key === 'team' && o.interval === 'yearly');
    const businessYearly = offerings.find((o) => o.key === 'business' && o.interval === 'yearly');

    return plans.map((p) => {
      if (p.name === 'Pro' && proYearly) {
        return {
          ...p,
          price: formatUsdFromCents(proYearly.priceCents),
        };
      }
      if (p.name === 'Team' && teamYearly) {
        return {
          ...p,
          price: formatUsdFromCents(teamYearly.priceCents),
        };
      }
      if (p.name === 'Business' && businessYearly) {
        return {
          ...p,
          price: formatUsdFromCents(businessYearly.priceCents),
        };
      }
      return p;
    });
  }, [offerings]);

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
                Simple, <span className="gradient-text">transparent</span> pricing
              </h1>
              <p className="text-xl text-text-secondary max-w-2xl mx-auto">
                Choose the plan that fits your needs. All plans include core terminal features.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="pb-section">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {displayPlans.map((plan, index) => (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Card
                    className={`h-full relative flex flex-col ${
                      plan.popular ? 'border-accent-primary' : ''
                    }`}
                  >
                    {plan.popular && (
                      <Badge
                        variant="primary"
                        className="absolute -top-3 left-1/2 -translate-x-1/2"
                      >
                        Most Popular
                      </Badge>
                    )}

                    <div className="mb-6">
                      <h3 className="text-xl font-semibold text-text-primary mb-2">
                        {plan.name}
                      </h3>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-text-primary">
                          {plan.price}
                        </span>
                        {plan.period && (
                          <span className="text-text-secondary text-sm">
                            {plan.period}
                          </span>
                        )}
                      </div>
                      {plan.subtitle && (
                        <p className="text-xs text-text-tertiary mt-1">{plan.subtitle}</p>
                      )}
                      {plan.billing && (
                        <p className="text-sm text-text-tertiary mt-1">{plan.billing}</p>
                      )}
                      <p className="mt-3 text-sm text-text-secondary">
                        {plan.tagline}
                      </p>
                    </div>

                    <ul className="space-y-3 mb-8 flex-1">
                      {plan.highlights.map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <Check className="w-5 h-5 text-accent-secondary flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-text-secondary">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <div>
                      <Link href='/register'>
                        <Button
                          variant={plan.ctaVariant}
                          className="w-full"
                        >
                          {plan.cta}
                        </Button>
                      </Link>
                      {plan.showQuoteLink && (
                        <p className="text-center mt-2 text-sm text-text-secondary">
                          or{' '}
                          <Link href="/enterprise" className="text-accent-primary underline hover:text-accent-primary/80">
                            get a quote
                          </Link>
                        </p>
                      )}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Comparison Table */}
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
                Compare all features
              </h2>
            </motion.div>

            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-4 px-4 text-text-primary font-semibold">
                      Feature
                    </th>
                    <th className="text-center py-4 px-4 text-text-primary font-semibold">
                      Starter
                    </th>
                    <th className="text-center py-4 px-4 text-text-primary font-semibold">
                      Pro
                    </th>
                    <th className="text-center py-4 px-4 text-text-primary font-semibold">
                      Team
                    </th>
                    <th className="text-center py-4 px-4 text-text-primary font-semibold">
                      Business
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {featureComparison.map((category) => (
                    <>
                      <tr key={category.category} className="bg-background-tertiary/50">
                        <td
                          colSpan={5}
                          className="py-3 px-4 text-sm font-semibold text-text-primary"
                        >
                          {category.category}
                        </td>
                      </tr>
                      {category.features.map((feature) => (
                        <tr key={feature.name} className="border-b border-border/50">
                          <td className="py-3 px-4 text-text-secondary">{feature.name}</td>
                          <td className="text-center py-3 px-4">
                            {feature.starter ? (
                              <Check className="w-5 h-5 text-accent-secondary mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-text-tertiary mx-auto" />
                            )}
                          </td>
                          <td className="text-center py-3 px-4">
                            {feature.pro ? (
                              <Check className="w-5 h-5 text-accent-secondary mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-text-tertiary mx-auto" />
                            )}
                          </td>
                          <td className="text-center py-3 px-4">
                            {feature.team ? (
                              <Check className="w-5 h-5 text-accent-secondary mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-text-tertiary mx-auto" />
                            )}
                          </td>
                          <td className="text-center py-3 px-4">
                            {feature.business ? (
                              <Check className="w-5 h-5 text-accent-secondary mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-text-tertiary mx-auto" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Accordion */}
            <div className="lg:hidden">
              <Accordion multiple>
                {featureComparison.map((category) => (
                  <AccordionItem key={category.category} value={category.category}>
                    <AccordionTrigger value={category.category}>
                      {category.category}
                    </AccordionTrigger>
                    <AccordionContent value={category.category}>
                      <div className="space-y-3">
                        {category.features.map((feature) => (
                          <div
                            key={feature.name}
                            className="flex items-center justify-between py-2 border-b border-border/50"
                          >
                            <span className="text-text-secondary text-sm">{feature.name}</span>
                            <div className="flex gap-4">
                              <div className="text-center w-12">
                                <span className="text-[10px] text-text-tertiary block">S</span>
                                {feature.starter ? (
                                  <Check className="w-4 h-4 text-accent-secondary mx-auto" />
                                ) : (
                                  <X className="w-4 h-4 text-text-tertiary mx-auto" />
                                )}
                              </div>
                              <div className="text-center w-12">
                                <span className="text-[10px] text-text-tertiary block">P</span>
                                {feature.pro ? (
                                  <Check className="w-4 h-4 text-accent-secondary mx-auto" />
                                ) : (
                                  <X className="w-4 h-4 text-text-tertiary mx-auto" />
                                )}
                              </div>
                              <div className="text-center w-12">
                                <span className="text-[10px] text-text-tertiary block">T</span>
                                {feature.team ? (
                                  <Check className="w-4 h-4 text-accent-secondary mx-auto" />
                                ) : (
                                  <X className="w-4 h-4 text-text-tertiary mx-auto" />
                                )}
                              </div>
                              <div className="text-center w-12">
                                <span className="text-[10px] text-text-tertiary block">B</span>
                                {feature.business ? (
                                  <Check className="w-4 h-4 text-accent-secondary mx-auto" />
                                ) : (
                                  <X className="w-4 h-4 text-text-tertiary mx-auto" />
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-section">
          <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {testimonials.map((testimonial, index) => (
                <motion.div
                  key={testimonial.author}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Card className="h-full">
                    <div className="flex gap-1 mb-4">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-accent-warning text-accent-warning" />
                      ))}
                    </div>
                    <blockquote className="text-text-primary mb-6">
                      &ldquo;{testimonial.quote}&rdquo;
                    </blockquote>
                    <div>
                      <p className="font-semibold text-text-primary">{testimonial.author}</p>
                      <p className="text-sm text-text-secondary">
                        {testimonial.title}, {testimonial.company}
                      </p>
                    </div>
                  </Card>
                </motion.div>
              ))}
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
