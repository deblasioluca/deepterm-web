'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button, Badge, Card } from '@/components/ui';
import { Check, X } from 'lucide-react';
import { PLANS, displayPrice } from '@/lib/pricing';

export function PricingCards() {
  return (
    <section className="py-section">
      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-h2 font-bold text-text-primary mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Choose the plan that fits your needs. All plans include core terminal features.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card
                className={`h-full relative ${
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
                      {displayPrice(plan.key)}
                    </span>
                    {plan.period && (
                      <span className="text-text-secondary text-sm">
                        {plan.period}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-tertiary mt-1">{plan.billingNote}</p>
                  <p className="mt-3 text-sm text-text-secondary">
                    {plan.tagline}
                  </p>
                </div>

                <ul className="space-y-3 mb-8">
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
  );
}
