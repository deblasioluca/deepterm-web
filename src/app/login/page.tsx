'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { signIn } from 'next-auth/react';
import { Terminal, Mail, Lock, AlertCircle, Shield, ArrowLeft, Fingerprint } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get('callbackUrl');
  // Only allow relative paths to prevent open redirect attacks
  const callbackUrl = rawCallbackUrl?.startsWith('/') && !rawCallbackUrl.startsWith('//') ? rawCallbackUrl : null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [webAuthnSupported, setWebAuthnSupported] = useState(true);

  useEffect(() => {
    // Check if WebAuthn is supported (requires HTTPS or localhost)
    setWebAuthnSupported(browserSupportsWebAuthn());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // If 2FA is already required, proceed with full login
      if (requires2FA) {
        const result = await signIn('credentials', {
          email,
          password,
          twoFactorCode,
          redirect: false,
        });

        if (result?.error) {
          setError('Invalid verification code');
        } else {
          router.push(callbackUrl || '/dashboard');
          router.refresh();
        }
        return;
      }

      // First, check if 2FA is required via pre-login endpoint
      const preLoginResponse = await fetch('/api/auth/pre-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const preLoginData = await preLoginResponse.json();

      if (!preLoginResponse.ok) {
        setError(preLoginData.error || 'Invalid email or password');
        return;
      }

      // Check if 2FA is required
      if (preLoginData.requires2FA) {
        setUserId(preLoginData.userId);
        setRequires2FA(true);
        setError('');
        return;
      }

      // No 2FA required, proceed with login
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
      } else {
        router.push(callbackUrl || '/dashboard');
        router.refresh();
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setRequires2FA(false);
    setTwoFactorCode('');
    setUserId(null);
    setError('');
  };

  const handleGitHubLogin = () => signIn('github', { callbackUrl: callbackUrl || '/dashboard' });
  const handleAppleLogin  = () => signIn('apple',  { callbackUrl: callbackUrl || '/dashboard' });

  const handlePasskeyLogin = async () => {
    setError('');
    setIsLoading(true);

    try {
      // Get authentication options from server
      const optionsRes = await fetch('/api/auth/passkey/login/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // No email needed for discoverable credentials
      });

      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || 'Failed to get passkey options');
      }

      const options = await optionsRes.json();

      // Start WebAuthn authentication
      const authResponse = await startAuthentication({ optionsJSON: options });

      // Verify with server
      const verifyRes = await fetch('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authResponse }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || 'Passkey verification failed');
      }

      // Success! Redirect to callback or dashboard
      router.push(callbackUrl || '/dashboard');
      router.refresh();
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
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-primary/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-secondary/20 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <Terminal className="w-10 h-10 text-accent-primary" />
          <span className="text-2xl font-bold text-text-primary">Deep</span>
          <span className="text-2xl font-bold text-accent-secondary">Term</span>
        </Link>

        <Card className="p-8">
          <AnimatePresence mode="wait">
            {!requires2FA ? (
              <motion.div
                key="login"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="text-center mb-8">
                  <h1 className="text-2xl font-bold text-text-primary mb-2">Welcome back</h1>
                  <p className="text-text-secondary">Sign in to your account</p>
                </div>

                {error && (
                  <div className="mb-6 p-4 bg-accent-danger/10 border border-accent-danger/30 rounded-lg flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-accent-danger flex-shrink-0" />
                    <p className="text-sm text-accent-danger">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <Input
                    label="Email"
                    type="email"
                    placeholder="you@example.com"
                    icon={<Mail className="w-5 h-5" />}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />

                  <Input
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    icon={<Lock className="w-5 h-5" />}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-border bg-background-tertiary text-accent-primary focus:ring-accent-primary"
                      />
                      <span className="text-sm text-text-secondary">Remember me</span>
                    </label>
                    <Link
                      href="#"
                      className="text-sm text-accent-primary hover:text-accent-primary-hover transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Signing in...' : 'Log In'}
                  </Button>
                </form>

                <div className="my-6 flex items-center gap-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-sm text-text-tertiary">or continue with</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="space-y-3">
                  {webAuthnSupported ? (
                    <Button
                      variant="secondary"
                      className="w-full flex items-center justify-center gap-2"
                      onClick={handlePasskeyLogin}
                      disabled={isLoading}
                    >
                      <Fingerprint className="w-5 h-5" />
                      Sign in with Passkey
                    </Button>
                  ) : (
                    <div className="p-3 bg-background-tertiary rounded-lg border border-border">
                      <div className="flex items-center gap-2 text-text-tertiary text-sm">
                        <Fingerprint className="w-4 h-4" />
                        <span>Passkeys require HTTPS. Enable SSL to use passkeys.</span>
                      </div>
                    </div>
                  )}

                  <Button variant="secondary" className="w-full flex items-center justify-center gap-2" onClick={handleGitHubLogin} disabled={isLoading}>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.113.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" /></svg>
                    Continue with GitHub
                  </Button>

                  <Button variant="secondary" className="w-full flex items-center justify-center gap-2" onClick={handleAppleLogin} disabled={isLoading}>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.37c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.56-1.32 3.1-2.53 4.02zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" /></svg>
                    Continue with Apple
                  </Button>

                  <Button variant="secondary" className="w-full">
                    Continue with Enterprise SSO
                  </Button>
                </div>

                <p className="mt-6 text-center text-text-secondary">
                  Don&apos;t have an account?{' '}
                  <Link
                    href={callbackUrl ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/register'}
                    className="text-accent-primary hover:text-accent-primary-hover transition-colors font-medium"
                  >
                    Register
                  </Link>
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="2fa"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <button
                  onClick={handleBackToLogin}
                  className="flex items-center gap-2 text-text-secondary hover:text-text-primary mb-6 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to login
                </button>

                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-primary/20 rounded-full mb-4">
                    <Shield className="w-8 h-8 text-accent-primary" />
                  </div>
                  <h1 className="text-2xl font-bold text-text-primary mb-2">
                    Two-Factor Authentication
                  </h1>
                  <p className="text-text-secondary">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </div>

                {error && (
                  <div className="mb-6 p-4 bg-accent-danger/10 border border-accent-danger/30 rounded-lg flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-accent-danger flex-shrink-0" />
                    <p className="text-sm text-accent-danger">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <input
                      type="text"
                      placeholder="000000"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full px-4 py-4 text-center text-3xl font-mono tracking-[0.5em] bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
                      maxLength={6}
                      autoFocus
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    disabled={isLoading || twoFactorCode.length !== 6}
                  >
                    {isLoading ? 'Verifying...' : 'Verify'}
                  </Button>
                </form>

                <p className="mt-6 text-center text-text-tertiary text-sm">
                  You can also use a backup code
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
