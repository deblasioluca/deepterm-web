'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, Badge } from '@/components/ui';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Users,
  User,
  ShieldCheck,
  Lock,
  Smartphone,
} from 'lucide-react';

interface Credential {
  id: string;
  encrypted: boolean;
  createdAt: string;
}

interface Vault {
  id: string;
  name: string;
  type: string;
  ownerId: string;
  ownerName: string;
  teamId: string | null;
  isOwner: boolean;
  credentials: Credential[];
  createdAt: string;
}

export default function VaultsPage() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedVaults, setExpandedVaults] = useState<string[]>([]);

  useEffect(() => {
    fetchVaults();
  }, []);

  const fetchVaults = async () => {
    try {
      const response = await fetch('/api/vaults');
      if (response.ok) {
        const data = await response.json();
        setVaults(data.vaults || []);
        // Auto-expand first vault
        if (data.vaults?.length > 0 && expandedVaults.length === 0) {
          setExpandedVaults([data.vaults[0].id]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch vaults:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleVault = (id: string) => {
    setExpandedVaults((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
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
            {vaults.map((vault) => (
              <Card key={vault.id} className="p-0 overflow-hidden">
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-background-tertiary/50 transition-colors"
                  onClick={() => toggleVault(vault.id)}
                >
                  <div className="flex items-center gap-3">
                    {expandedVaults.includes(vault.id) ? (
                      <ChevronDown className="w-5 h-5 text-text-tertiary" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-text-tertiary" />
                    )}
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
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">
                      {vault.credentials.length} credential
                      {vault.credentials.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </div>

                {expandedVaults.includes(vault.id) && (
                  <div className="border-t border-border">
                    <div className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                          <ShieldCheck className="w-5 h-5 text-green-500" />
                        </div>
                        <div>
                          <p className="font-medium text-text-primary">
                            {vault.credentials.length} encrypted credential{vault.credentials.length !== 1 ? 's' : ''} synced
                          </p>
                          <p className="text-sm text-text-secondary">
                            End-to-end encrypted — only accessible from the DeepTerm app
                          </p>
                        </div>
                      </div>
                      {vault.credentials.length > 0 && (
                        <div className="space-y-2">
                          {vault.credentials.map((cred, index) => (
                            <div
                              key={cred.id}
                              className="flex items-center gap-3 py-2 px-3 rounded-lg bg-background-tertiary/30"
                            >
                              <Lock className="w-4 h-4 text-green-500 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-text-primary">
                                  Credential {index + 1}
                                </p>
                                <p className="text-xs text-text-tertiary">
                                  Added {new Date(cred.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                              <Badge variant="default" className="text-xs !bg-green-500/10 !text-green-500">
                                <Lock className="w-3 h-3 mr-1" />
                                Encrypted
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-text-tertiary mt-4 flex items-center gap-1">
                        <Smartphone className="w-3 h-3" />
                        Open the DeepTerm app to view, edit, or use these credentials
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
