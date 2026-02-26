'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  Globe,
  Shield,
  Database,
  Bell,
  Upload,
  Bot,
  Radio,
  AlertCircle,
} from 'lucide-react';

import GeneralTab from './components/GeneralTab';
import SecurityTab from './components/SecurityTab';
import BillingTab from './components/BillingTab';
import NotificationsTab from './components/NotificationsTab';
import ReleasesTab from './components/ReleasesTab';
import AISettingsTab from './components/AISettingsTab';
import IntegrationsTab from './components/IntegrationsTab';
import DangerZoneTab from './components/DangerZoneTab';

const TABS = [
  { key: 'general', label: 'General', icon: Globe },
  { key: 'security', label: 'Security', icon: Shield },
  { key: 'billing', label: 'Billing', icon: Database },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'releases', label: 'Releases', icon: Upload },
  { key: 'ai', label: 'AI', icon: Bot },
  { key: 'integrations', label: 'Integrations', icon: Radio },
  { key: 'danger', label: 'Danger Zone', icon: AlertCircle },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('general');

  return (
    <div className="min-h-screen bg-background-primary">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-accent-primary/20 rounded-lg">
            <Settings className="w-6 h-6 text-accent-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
            <p className="text-sm text-text-secondary">System configuration and administration</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-8 overflow-x-auto pb-1 border-b border-border">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'text-accent-primary border-b-2 border-accent-primary bg-accent-primary/5'
                  : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary'
              } ${tab.key === 'danger' ? 'text-red-500 hover:text-red-400' : ''}`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.key && tab.key === 'danger' ? 'text-red-500' : ''}`} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'general' && <GeneralTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'billing' && <BillingTab />}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'releases' && <ReleasesTab />}
          {activeTab === 'ai' && <AISettingsTab />}
          {activeTab === 'integrations' && <IntegrationsTab />}
          {activeTab === 'danger' && <DangerZoneTab />}
        </motion.div>
      </div>
    </div>
  );
}
