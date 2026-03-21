'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';

interface InviteDetails {
  email: string;
  role: string;
  teamName: string;
  expiresAt: string;
}

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const token = params.token as string;

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!token) return;
    fetchInviteDetails();
  }, [token]);

  const fetchInviteDetails = async () => {
    try {
      const res = await fetch(`/api/team/invitations/accept?token=${encodeURIComponent(token)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid invitation');
        setLoading(false);
        return;
      }

      setInvite(data);
    } catch {
      setError('Failed to load invitation details');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    setAccepting(true);
    setError('');

    try {
      const res = await fetch('/api/team/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to accept invitation');
        setAccepting(false);
        return;
      }

      setSuccess(data.message || `You have joined ${invite?.teamName}`);
      setTimeout(() => router.push('/dashboard/team'), 2000);
    } catch {
      setError('Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-primary p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00ffc6] to-[#7b61ff] bg-clip-text text-transparent">
            DeepTerm
          </h1>
        </div>

        <div className="bg-background-secondary border border-border rounded-xl p-8 shadow-lg">
          {loading ? (
            <div className="flex flex-col items-center py-8">
              <div className="w-8 h-8 border-2 border-[#00ffc6] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-text-secondary">Loading invitation...</p>
            </div>
          ) : error && !invite ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-text-primary mb-2">Invalid Invitation</h2>
              <p className="text-text-secondary mb-6">{error}</p>
              <a
                href="/"
                className="inline-block px-6 py-2 rounded-lg bg-gradient-to-r from-[#00ffc6] to-[#7b61ff] text-[#0a0b0d] font-semibold hover:opacity-90 transition-opacity"
              >
                Go to Homepage
              </a>
            </div>
          ) : success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-text-primary mb-2">Welcome!</h2>
              <p className="text-text-secondary mb-2">{success}</p>
              <p className="text-text-tertiary text-sm">Redirecting to your team dashboard...</p>
            </div>
          ) : invite ? (
            <div>
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#7b61ff]/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-[#7b61ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-text-primary mb-1">Team Invitation</h2>
                <p className="text-text-secondary">
                  You&apos;ve been invited to join a team on DeepTerm
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center p-3 bg-background-tertiary rounded-lg">
                  <span className="text-text-secondary text-sm">Team</span>
                  <span className="text-text-primary font-medium">{invite.teamName}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-background-tertiary rounded-lg">
                  <span className="text-text-secondary text-sm">Role</span>
                  <span className="text-text-primary font-medium capitalize">{invite.role}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-background-tertiary rounded-lg">
                  <span className="text-text-secondary text-sm">Invited as</span>
                  <span className="text-text-primary font-medium">{invite.email}</span>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-500 text-sm">{error}</p>
                </div>
              )}

              {authStatus === 'loading' ? (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-[#00ffc6] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : authStatus === 'authenticated' ? (
                <div className="space-y-3">
                  <p className="text-text-secondary text-sm text-center">
                    Signed in as <span className="text-text-primary font-medium">{session?.user?.email}</span>
                  </p>
                  <button
                    onClick={handleAccept}
                    disabled={accepting}
                    className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-[#00ffc6] to-[#7b61ff] text-[#0a0b0d] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {accepting ? 'Joining...' : 'Accept Invitation'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-text-secondary text-sm text-center">
                    Sign in to accept this invitation
                  </p>
                  <button
                    onClick={() => signIn(undefined, { callbackUrl: `/invite/${token}` })}
                    className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-[#00ffc6] to-[#7b61ff] text-[#0a0b0d] font-semibold hover:opacity-90 transition-opacity"
                  >
                    Sign In
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <p className="text-center text-text-tertiary text-xs mt-6">
          DeepTerm &mdash; Secure SSH Client
        </p>
      </div>
    </div>
  );
}
