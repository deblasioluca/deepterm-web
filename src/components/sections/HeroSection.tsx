'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button, TerminalWindow, TerminalLine, TerminalCursor, AIAssistantPanel } from '@/components/ui';
import { Apple, Monitor, Smartphone } from 'lucide-react';
import { useLocale } from '@/components/i18n/LocaleProvider';

export function HeroSection() {
  const { messages } = useLocale();

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-24 pb-16 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 grid-pattern opacity-50" />
      
      {/* Gradient Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-primary/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-secondary/20 rounded-full blur-3xl" />

      <div className="relative max-w-content mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-4xl md:text-h1 font-bold mb-6"
          >
            {messages.home.heroTitle}{' '}
            <span className="gradient-text">{messages.home.heroTitleAccent}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-8"
          >
            {messages.home.heroSubtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8"
          >
            <Link href="/register">
              <Button variant="primary" size="lg">
                {messages.home.getStartedFree}
              </Button>
            </Link>
            <Link href="/enterprise">
              <Button variant="secondary" size="lg">
                {messages.home.requestDemo}
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex items-center justify-center gap-6 text-text-tertiary text-sm"
          >
            <div className="flex items-center gap-2">
              <Apple className="w-4 h-4" />
              <span>macOS (Apple Silicon)</span>
            </div>
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              <span>Windows</span>
            </div>
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              <span>Linux</span>
            </div>
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              <span>iOS</span>
            </div>
          </motion.div>
        </div>

        {/* Terminal Window Demo */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="max-w-4xl mx-auto"
        >
          <TerminalWindow title="DeepTerm — user@prod-server">
            <TerminalLine prompt="$" command="ssh deploy@10.0.1.42" />
            <TerminalLine output="Welcome to Ubuntu 24.04 LTS (GNU/Linux 6.5.0-1016-aws x86_64)" />
            <TerminalLine output="" />
            <TerminalLine prompt="deploy@prod:~$" command="top -bn1 | head -5" />
            <TerminalLine output="top - 14:32:01 up 45 days, 3:22, 1 user, load average: 2.15, 1.89, 1.72" />
            <TerminalLine output="Tasks: 142 total,   3 running, 139 sleeping,   0 stopped,   0 zombie" />
            <TerminalLine output="%Cpu(s): 94.2 us,  3.1 sy,  0.0 ni,  2.4 id,  0.0 wa,  0.3 hi" />
            
            <AIAssistantPanel
              message={messages.home.aiMessage}
              suggestion={messages.home.aiSuggestion}
            />
            
            <div className="mt-4 flex items-center gap-2">
              <span className="text-accent-secondary">deploy@prod:~$</span>
              <TerminalCursor />
            </div>
          </TerminalWindow>
        </motion.div>

        {/* Trust Indicators */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-6 mt-12 text-text-tertiary text-sm"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-accent-secondary rounded-full" />
            {messages.home.noSubscription}
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-accent-secondary rounded-full" />
            {messages.home.oneTimePurchase}
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-accent-secondary rounded-full" />
            {messages.home.macosNative}
          </span>
        </motion.div>
      </div>
    </section>
  );
}
