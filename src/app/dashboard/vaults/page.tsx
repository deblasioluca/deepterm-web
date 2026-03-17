'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, Badge } from '@/components/ui';
import {
  Loader2,
  Users,
  User,
  ShieldCheck,
  Lock,
  Smartphone,
  KeyRound,
  FileKey2,
  ShieldAlert,
  Fingerprint,
  FolderTree,
  HelpCircle,
} from 'lucide-react';

const TYPE_META: Record<string, { label: string; icon: typeof KeyRound; color: string }> = {
  '0':  { label: 'SSH Passwords',   icon: Lock,        color: 'text-blue-400' },
  '1':  { label: 'SSH Keys',        icon: KeyRound,    color: 'text-emerald-400' },
  '2':  { label: 'Certificates',    icon: FileKey2,    color: 'text-amber-400' },
  '10': { label: 'Managed Keys',    icon: ShieldAlert,  color: 'text-purple-400' },
  '11': { label: 'Identities',      icon: Fingerprint, color: 'text-cyan-400' },
  '12': { label: 'Host Groups',     icon: FolderTree,  color: 'text-orange-400' },
  'unknown': { label: 'Unclassified', icon: HelpCircle, color: 'text-text-tertiary' },
};

interface Vault {
  id: string;
  name: string;
  type: string;
  ownerId: string;
  ownerName: string;
  teamId: string | null;
  isOwner: boolean;
  totalItems: number;
  typeCounts: Record<string, number>;
  createdAt: string;
}

export default function VaultsPage() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVaults();
  }, []);

  const fetchVaults = async () => {
    try {
      const response = await fetch('/api/vaults');
      if (response.ok) {
        const data = await response.json();
        setVaults(data.vaults || []);
      }
    } catch (err) {
      console.error('Failed to fetch vaults:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Vaults</h1>
          <p className="text-text-secondary">
            Your end-to-end encrypted credential vaults, synced from the DeepTerm app
          </p>
        </div>

        {vaults.length === 0 ? (
          <Card className="text-center py-12">
            <ShieldCheck className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              No vaults yet
            </h3>
            <p className="text-text-secondary mb-2">
              Vaults are created and managed in the DeepTerm app
            </p>
            <p className="text-sm text-text-tertiary flex items-center justify-center gap-1">
              <Smartphone className="w-4 h-4" />
              Open the DeepTerm app to create vaults and add credentials
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {vaults.map((vault) => {
              const typeEntries = Object.entries(vault.typeCounts)
                .sort(([a], [b]) => Number(a) - Number(b));

              return (
                <Card key={vault.id} className="p-0 overflow-hidden">
                  {/* Vault header */}
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="w-5 h-5 text-green-500" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-text-primary">{vault.name}</h3>
                          <Badge variant="default" className="text-xs !bg-green-500/10 !text-green-500">
                            <Lock className="w-3 h-3 mr-1" />
                            E2E Encrypted
                          </Badge>
                          {vault.type === 'team' ? (
                            <Badge variant="secondary" className="text-xs">
                              <Users className="w-3 h-3 mr-1" />
                              Team
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-xs">
                              <User className="w-3 h-3 mr-1" />
                              Personal
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-text-tertiary">
                          <Smartphone className="w-3 h-3 inline mr-1" />
                          Synced from DeepTerm app
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">
                      {vault.totalItems} item{vault.totalItems !== 1 ? 's' : ''}
                    </Badge>
                  </div>

                  {/* Type statistics */}
                  {vault.totalItems > 0 && (
                    <div className="border-t border-border px-4 py-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {typeEntries.map(([typeKey, count]) => {
                          const meta = TYPE_META[typeKey] || TYPE_META['unknown'];
                          const Icon = meta.icon;
                          return (
                            <div
                              key={typeKey}
                              className="flex items-center gap-3 py-2 px-3 rounded-lg bg-background-tertiary/30"
                            >
                              <Icon className={`w-4 h-4 shrink-0 ${meta.color}`} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-text-primary">{count}</p>
                                <p className="text-xs text-text-tertiary truncate">{meta.label}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-text-tertiary mt-3 flex items-center gap-1">
                        <Smartphone className="w-3 h-3" />
                        Open the DeepTerm app to view, edit, or use these credentials
                      </p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
