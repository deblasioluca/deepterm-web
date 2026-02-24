'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Terminal, User, Mail, Lock, AlertCircle, Check, Fingerprint } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { signIn } from 'next-auth/react';

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [webAuthnSupported, setWebAuthnSupported] = useState(true);

  useEffect(() => {
    setWebAuthnSupported(browserSupportsWebAuthn());
  }, []);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [addingPasskey, setAddingPasskey] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!agreeToTerms) {
      setError('You must agree to the Terms of Use and Privacy Policy');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Registration failed');
      }

      // Sign in the user automatically
      const signInResult = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (signInResult?.error) {
        // Registration succeeded but sign-in failed, redirect to login
        router.push('/login?registered=true');
        return;
      }

      // Show passkey option
      setRegistrationComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPasskey = async () => {
    setError('');
    setAddingPasskey(true);

    try {
      // Get registration options
      const optionsRes = await fetch('/api/auth/passkey/register/options', {
        method: 'POST',
      });

      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || 'Failed to get passkey options');
      }

      const options = await optionsRes.json();

      // Start WebAuthn registration
      const regResponse = await startRegistration({ optionsJSON: options });

      // Verify with server
      const verifyRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          registrationResponse: regResponse,
          name: `${formData.name}'s Passkey`,
        }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || 'Passkey registration failed');
      }

      // Success! Redirect to dashboard
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Passkey registration was cancelled');
        } else {
          setError(err.message || 'Passkey registration failed');
        }
      } else {
        setError('Passkey registration failed');
      }
    } finally {
      setAddingPasskey(false);
    }
  };

  const handleSkipPasskey = () => {
    router.push('/dashboard');
    router.refresh();
  };

  const updateFormData = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-accent-primary/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-accent-secondary/20 rounded-full blur-3xl" />

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
          {!registrationComplete ? (
            <>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-text-primary mb-2">
                  Create your account
                </h1>
                <p className="text-text-secondary">Start your free trial today</p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-accent-danger/10 border border-accent-danger/30 rounded-lg flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-accent-danger flex-shrink-0" />
                  <p className="text-sm text-accent-danger">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  label="Full Name"
                  type="text"
                  placeholder="John Smith"
                  icon={<User className="w-5 h-5" />}
                  value={formData.name}
                  onChange={(e) => updateFormData('name', e.target.value)}
                  required
                />

                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  icon={<Mail className="w-5 h-5" />}
                  value={formData.email}
                  onChange={(e) => updateFormData('email', e.target.value)}
                  required
                />

                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  icon={<Lock className="w-5 h-5" />}
                  value={formData.password}
                  onChange={(e) => updateFormData('password', e.target.value)}
                  required
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="••••••••"
                  icon={<Lock className="w-5 h-5" />}
                  value={formData.confirmPassword}
                  onChange={(e) => updateFormData('confirmPassword', e.target.value)}
                  required
                />

                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="relative mt-0.5">
                    <input
                      type="checkbox"
                      checked={agreeToTerms}
                      onChange={(e) => setAgreeToTerms(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        agreeToTerms
                          ? 'bg-accent-primary border-accent-primary'
                          : 'border-border bg-background-tertiary'
                      }`}
                    >
                      {agreeToTerms && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                  <span className="text-sm text-text-secondary">
                    I agree to the{' '}
                    <Link
                      href="#"
                      className="text-accent-primary hover:text-accent-primary-hover"
                    >
                      Terms of Use
                    </Link>{' '}
                    and{' '}
                    <Link
                      href="#"
                      className="text-accent-primary hover:text-accent-primary-hover"
                    >
                      Privacy Policy
                    </Link>
                  </span>
                </label>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>

              <p className="mt-6 text-center text-text-secondary">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="text-accent-primary hover:text-accent-primary-hover transition-colors font-medium"
                >
                  Log in
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-success/20 rounded-full mb-4">
                  <Check className="w-8 h-8 text-accent-success" />
                </div>
                <h1 className="text-2xl font-bold text-text-primary mb-2">
                  Welcome, {formData.name}!
                </h1>
                <p className="text-text-secondary">
                  Your account has been created. Would you like to set up a passkey for faster, more secure sign-in?
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-accent-danger/10 border border-accent-danger/30 rounded-lg flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-accent-danger flex-shrink-0" />
                  <p className="text-sm text-accent-danger">{error}</p>
                </div>
              )}

              <div className="space-y-4 mb-6">
                <div className="p-4 bg-background-tertiary rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <Fingerprint className="w-5 h-5 text-accent-primary" />
                    <span className="font-medium text-text-primary">What are Passkeys?</span>
                  </div>
                  <p className="text-sm text-text-secondary">
                    Passkeys are a secure, passwordless way to sign in using your device&apos;s 
                    biometrics (Face ID, Touch ID, Windows Hello) or security key.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {webAuthnSupported ? (
                  <Button
                    variant="primary"
                    className="w-full flex items-center justify-center gap-2"
                    onClick={handleAddPasskey}
                    disabled={addingPasskey}
                  >
                    <Fingerprint className="w-5 h-5" />
                    {addingPasskey ? 'Setting up passkey...' : 'Set Up Passkey'}
                  </Button>
                ) : (
                  <div className="p-4 bg-accent-warning/10 border border-accent-warning/30 rounded-lg">
                    <p className="text-sm text-text-secondary">
                      <strong className="text-text-primary">Passkeys require HTTPS.</strong>{' '}
                      You can set up a passkey later once SSL is enabled.
                    </p>
                  </div>
                )}

                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={handleSkipPasskey}
                  disabled={addingPasskey}
                >
                  {webAuthnSupported ? 'Skip for now' : 'Continue to Dashboard'}
                </Button>
              </div>

              <p className="mt-6 text-center text-text-tertiary text-sm">
                You can always add a passkey later in your account settings.
              </p>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
