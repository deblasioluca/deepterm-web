'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { ArrowRight } from 'lucide-react';
import { useLocale } from '@/components/i18n/LocaleProvider';

export function CTASection() {
  const { messages } = useLocale();

  return (
    <section className="py-section relative overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-accent-primary/10 to-accent-secondary/10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-primary/20 rounded-full blur-3xl" />

      <div className="relative max-w-content mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-3xl md:text-h2 font-bold text-text-primary mb-4">
            {messages.home.ctaTitle}
          </h2>
          <p className="text-lg text-text-secondary max-w-xl mx-auto mb-8">
            {messages.home.ctaSubtitle}
          </p>
          <Link href="/register">
            <Button variant="primary" size="lg" className="group">
              {messages.home.ctaButton}
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
