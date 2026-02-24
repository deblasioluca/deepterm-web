'use client';

import { motion } from 'framer-motion';
import { useLocale } from '@/components/i18n/LocaleProvider';

const logos = [
  { name: 'Company 1', width: 120 },
  { name: 'Company 2', width: 100 },
  { name: 'Company 3', width: 130 },
  { name: 'Company 4', width: 110 },
  { name: 'Company 5', width: 125 },
  { name: 'Company 6', width: 115 },
  { name: 'Company 7', width: 105 },
  { name: 'Company 8', width: 135 },
];

export function TrustBar() {
  const { messages } = useLocale();

  return (
    <section className="py-16 border-y border-border bg-background-secondary/50">
      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-text-secondary mb-8"
        >
          {messages.home.trustByline}
        </motion.p>

        <div className="relative overflow-hidden">
          {/* Gradient Masks */}
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background-primary to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background-primary to-transparent z-10" />

          {/* Scrolling Logos */}
          <motion.div
            animate={{ x: [0, -1000] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className="flex items-center gap-16"
          >
            {[...logos, ...logos].map((logo, index) => (
              <div
                key={index}
                className="flex-shrink-0 h-8 bg-text-tertiary/20 rounded flex items-center justify-center px-6"
                style={{ width: logo.width }}
              >
                <span className="text-text-tertiary text-sm font-medium">{logo.name}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
