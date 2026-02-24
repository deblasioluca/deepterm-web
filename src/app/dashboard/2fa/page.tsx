'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Button, Input, Badge } from '@/components/ui';
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Key,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  QrCode,
} from 'lucide-react';

interface TwoFactorStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

export default function TwoFactorPage() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState<'idle' | 'setup' | 'verify' | 'backup' | 'disable'>('idle');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/auth/2fa/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      } else {
        // If unauthorized or error, set default status
        console.error('Failed to fetch 2FA status:', response.status);
        setStatus({ enabled: false, backupCodesRemaining: 0 });
      }
    } catch (err) {
      console.error('Failed to fetch 2FA status:', err);
      setStatus({ enabled: false, backupCodesRemaining: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  const startSetup = async () => {
    try {
      setIsProcessing(true);
      setError(null);

      const response = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start setup');
      }

      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep('setup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start setup');
    } finally {
      setIsProcessing(false);
    }
  };

  const enableTwoFactor = async () => {
    if (verifyCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      const response = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to enable 2FA');
      }

      setBackupCodes(data.backupCodes);
      setStep('backup');
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable 2FA');
    } finally {
      setIsProcessing(false);
    }
  };

  const disableTwoFactor = async () => {
    if (verifyCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      const response = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to disable 2FA');
      }

      setStep('idle');
      setVerifyCode('');
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setIsProcessing(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const copyAllCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopiedCode('all');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            Two-Factor Authentication
          </h1>
          <p className="text-text-secondary">
            Add an extra layer of security to your account
          </p>
        </div>

        {/* Current Status */}
        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`p-3 rounded-lg ${
                  status?.enabled
                    ? 'bg-green-500/20'
                    : 'bg-amber-500/20'
                }`}
              >
                {status?.enabled ? (
                  <ShieldCheck className="w-6 h-6 text-green-500" />
                ) : (
                  <ShieldOff className="w-6 h-6 text-amber-500" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {status?.enabled ? '2FA is Enabled' : '2FA is Disabled'}
                </h2>
                <p className="text-sm text-text-secondary">
                  {status?.enabled
                    ? `${status.backupCodesRemaining} backup codes remaining`
                    : 'Protect your account with an authenticator app'}
                </p>
              </div>
            </div>
            {step === 'idle' && (
              <Button
                variant={status?.enabled ? 'secondary' : 'primary'}
                onClick={async () => {
                  setError(null);
                  setVerifyCode('');
                  if (status?.enabled) {
                    setStep('disable');
                  } else {
                    await startSetup();
                  }
                }}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : status?.enabled ? (
                  'Disable 2FA'
                ) : (
                  'Enable 2FA'
                )}
              </Button>
            )}
          </div>
        </Card>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <span className="text-red-500">{error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Setup Step */}
        <AnimatePresence mode="wait">
          {step === 'setup' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card>
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                  Step 1: Scan QR Code
                </h3>
                <p className="text-text-secondary mb-6">
                  Scan this QR code with your authenticator app (Microsoft Authenticator, 
                  Google Authenticator, Authy, etc.)
                </p>

                <div className="flex flex-col items-center mb-6">
                  {qrCode && (
                    <div className="p-4 bg-white rounded-lg mb-4">
                      <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                    </div>
                  )}
                  <p className="text-xs text-text-tertiary mb-2">
                    Can&apos;t scan? Enter this code manually:
                  </p>
                  <div className="flex items-center gap-2 p-3 bg-background-tertiary rounded-lg">
                    <code className="text-sm font-mono text-text-primary">
                      {secret}
                    </code>
                    <button
                      onClick={() => secret && copyCode(secret)}
                      className="p-1 hover:bg-background-secondary rounded"
                    >
                      {copiedCode === secret ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-text-tertiary" />
                      )}
                    </button>
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-text-primary mb-4">
                  Step 2: Enter Verification Code
                </h3>
                <p className="text-text-secondary mb-4">
                  Enter the 6-digit code from your authenticator app
                </p>

                <div className="flex gap-3">
                  <Input
                    placeholder="000000"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="flex-1 text-center text-2xl tracking-widest font-mono"
                    maxLength={6}
                  />
                  <Button
                    variant="primary"
                    onClick={enableTwoFactor}
                    disabled={isProcessing || verifyCode.length !== 6}
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Verify & Enable'
                    )}
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  className="w-full mt-4"
                  onClick={() => setStep('idle')}
                >
                  Cancel
                </Button>
              </Card>
            </motion.div>
          )}

          {/* Backup Codes Step */}
          {step === 'backup' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <ShieldCheck className="w-5 h-5 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary">
                    2FA Enabled Successfully!
                  </h3>
                </div>

                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-500">Save Your Backup Codes</p>
                      <p className="text-sm text-amber-500/80">
                        These codes can be used to access your account if you lose your phone. 
                        Each code can only be used once. Store them somewhere safe!
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-6">
                  {backupCodes.map((code, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg"
                    >
                      <code className="font-mono text-text-primary">{code}</code>
                      <button
                        onClick={() => copyCode(code)}
                        className="p-1 hover:bg-background-secondary rounded"
                      >
                        {copiedCode === code ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-text-tertiary" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button variant="secondary" onClick={copyAllCodes} className="flex-1">
                    {copiedCode === 'all' ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy All Codes
                      </>
                    )}
                  </Button>
                  <Button variant="primary" onClick={() => setStep('idle')} className="flex-1">
                    Done
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {/* Disable Step */}
          {step === 'disable' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-500/20 rounded-lg">
                    <ShieldOff className="w-5 h-5 text-red-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary">
                    Disable Two-Factor Authentication
                  </h3>
                </div>

                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg mb-6">
                  <p className="text-sm text-red-500">
                    <strong>Warning:</strong> Disabling 2FA will make your account less secure. 
                    Anyone with your password will be able to access your account.
                  </p>
                </div>

                <p className="text-text-secondary mb-4">
                  Enter your current authenticator code to confirm:
                </p>

                <div className="flex gap-3">
                  <Input
                    placeholder="000000"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="flex-1 text-center text-2xl tracking-widest font-mono"
                    maxLength={6}
                  />
                  <Button
                    variant="primary"
                    onClick={disableTwoFactor}
                    disabled={isProcessing || verifyCode.length !== 6}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Disable 2FA'
                    )}
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  className="w-full mt-4"
                  onClick={() => {
                    setStep('idle');
                    setVerifyCode('');
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info Cards */}
        {step === 'idle' && (
          <div className="grid md:grid-cols-2 gap-4 mt-6">
            <Card>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-accent-primary/20 rounded-lg">
                  <Smartphone className="w-5 h-5 text-accent-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-text-primary mb-1">
                    Authenticator Apps
                  </h3>
                  <p className="text-sm text-text-secondary">
                    Works with Microsoft Authenticator, Google Authenticator, Authy, 1Password, and more
                  </p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Key className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <h3 className="font-medium text-text-primary mb-1">
                    Backup Codes
                  </h3>
                  <p className="text-sm text-text-secondary">
                    Get 10 backup codes to use if you lose access to your authenticator
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </motion.div>
    </div>
  );
}
