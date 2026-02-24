'use client';

import { useEffect, useState, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Input } from '@/components/ui';
import { Shield, AlertCircle, Loader2, Fingerprint } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale } from '@/components/i18n/LocaleProvider';
import { LanguageSelector } from '@/components/i18n/LanguageSelector';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';

function AdminLoginForm() {
  const { messages } = useLocale();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [error, setError] = useState('');
  const [webAuthnSupported, setWebAuthnSupported] = useState(true);

  useEffect(() => {
    setWebAuthnSupported(browserSupportsWebAuthn());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (requires2FA && !twoFactorCode.trim() && !backupCode.trim()) {
      setIsLoading(false);
      setError('Enter your 2FA code or a backup code');
      return;
    }

    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          twoFactorCode: requires2FA ? twoFactorCode : undefined,
          backupCode: requires2FA ? backupCode : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data?.error === '2FA_REQUIRED') {
          setRequires2FA(true);
          setIsLoading(false);
          return;
        }

        if (data?.error === 'INVALID_2FA_CODE') {
          throw new Error('Invalid verification code');
        }

        throw new Error(data.error || messages.adminLogin.loginFailed);
      }

      window.location.href = callbackUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.adminLogin.loginFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setIsLoading(true);
    setError('');

    try {
      const optionsRes = await fetch('/api/admin/auth/passkey/login/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() || undefined }),
      });

      const optionsData = await optionsRes.json();
      if (!optionsRes.ok) {
        throw new Error(optionsData.error || 'Failed to get passkey options');
      }

      const authResponse = await startAuthentication({ optionsJSON: optionsData });

      const verifyRes = await fetch('/api/admin/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authResponse }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || 'Passkey verification failed');
      }

      window.location.href = callbackUrl;
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Passkey authentication was cancelled');
        } else {
          setError(err.message || 'Passkey authentication failed');
        }
      } else {
        setError('Passkey authentication failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <LanguageSelector className="w-full" />

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-red-500 text-sm">{error}</span>
          </div>
        )}

        <Input
          label={messages.adminLogin.emailLabel}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          required
        />

        <Input
          label={messages.adminLogin.passwordLabel}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={messages.adminLogin.passwordPlaceholder}
          required
        />

        {requires2FA && (
          <>
            <Input
              label="2FA Code"
              type="text"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              placeholder="123456"
            />
            <Input
              label="Backup Code (optional)"
              type="text"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value)}
              placeholder="AB12CD34"
            />
          </>
        )}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {messages.adminLogin.signingIn}
            </>
          ) : (
            messages.adminLogin.signIn
          )}
        </Button>

        {webAuthnSupported && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={handlePasskeyLogin}
            disabled={isLoading}
          >
            <Fingerprint className="w-4 h-4 mr-2" />
            Sign in with Passkey
          </Button>
        )}
      </form>
    </Card>
  );
}

function AdminLoginContent() {
  const { messages } = useLocale();

  return (
    <div className="min-h-screen bg-background-primary flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-primary/20 rounded-xl mb-4">
            <Shield className="w-8 h-8 text-accent-primary" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">{messages.adminLogin.pageTitle}</h1>
          <p className="text-text-secondary">{messages.adminLogin.pageSubtitle}</p>
        </div>

        <AdminLoginForm />

        <p className="text-center text-text-tertiary text-sm mt-6">
          {messages.adminLogin.footerNotice}
        </p>
      </motion.div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background-primary flex items-center justify-center p-4">
        <Card>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
          </div>
        </Card>
      </div>
    }>
      <AdminLoginContent />
    </Suspense>
  );
}
