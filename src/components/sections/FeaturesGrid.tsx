'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui';
import {
  Brain,
  Shield,
  Smartphone,
  LayoutGrid,
  Code2,
  Layers,
} from 'lucide-react';
import { useLocale } from '@/components/i18n/LocaleProvider';

const features = [
  {
    icon: Brain,
    title: 'AI-Powered Chat Assistant',
    description:
      'Integrated AI chat in the sidebar — get help with terminal commands, server administration, and troubleshooting. Context-aware suggestions based on your current workflow.',
  },
  {
    icon: Shield,
    title: 'Encrypted Vaults & Keychain',
    description:
      'All credentials stored exclusively in macOS Keychain — the same secure storage used by Safari and Apple apps. No passwords in plain text, ever.',
  },
  {
    icon: Smartphone,
    title: 'Cross-Platform Sync',
    description:
      'Sync hosts, snippets, and sessions across devices. Currently available on macOS — Windows, Linux, and iOS coming soon.',
  },
  {
    icon: LayoutGrid,
    title: 'Advanced Split Terminal',
    description:
      'Split your terminal horizontally to view multiple sessions simultaneously. Add unlimited panes, resize freely, and navigate with keyboard shortcuts.',
  },
  {
    icon: Code2,
    title: 'Command Snippets',
    description:
      'Save frequently used commands for instant one-click execution. Organize snippets into categories. Build your personal command library.',
  },
  {
    icon: Layers,
    title: 'Multi-Tab Sessions',
    description:
      'Open unlimited SSH sessions in separate tabs. Switch instantly with ⌘1-9. Each tab shows real-time connection status. Drag-and-drop reordering.',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

export function FeaturesGrid() {
  const { messages } = useLocale();

  const localizedFeatures = features.map((feature, index) => ({
    ...feature,
    title: messages.home.features[index]?.title ?? feature.title,
    description: messages.home.features[index]?.description ?? feature.description,
  }));

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
            {messages.home.featuresTitle}
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            {messages.home.featuresSubtitle}
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {localizedFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <motion.div key={feature.title} variants={itemVariants}>
                <Card hover className="h-full">
                  <CardContent>
                    <div className="w-12 h-12 bg-accent-primary/10 rounded-lg flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6 text-accent-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-text-secondary">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
