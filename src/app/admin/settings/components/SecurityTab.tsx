'use client';

import { useState, useEffect } from 'react';
import { Card, Button, Input } from '@/components/ui';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { Shield, Fingerprint, Loader2, Check, AlertCircle, Save } from 'lucide-react';

type Admin2FAStatus = {
  enabled: boolean;
  backupCodesRemaining: number;
  passkeysCount: number;
};

type PasskeyRow = {
  id: string;
  name: string;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export default function SecurityTab() {
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [requireEmailVerification, setRequireEmailVerification] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [webAuthnSupported, setWebAuthnSupported] = useState(true);
  const [admin2fa, setAdmin2fa] = useState<Admin2FAStatus | null>(null);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrCode: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpDisableCode, setTotpDisableCode] = useState('');
  const [adminBackupCodes, setAdminBackupCodes] = useState<string[] | null>(null);
  const [adminPasskeys, setAdminPasskeys] = useState<PasskeyRow[]>([]);
  const [isSettingUpTotp, setIsSettingUpTotp] = useState(false);
  const [isEnablingTotp, setIsEnablingTotp] = useState(false);
  const [isDisablingTotp, setIsDisablingTotp] = useState(false);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [passkeyName, setPasskeyName] = useState('Admin Passkey');

  useEffect(() => {
    setWebAuthnSupported(browserSupportsWebAuthn());
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => {
        setAllowRegistration(data.allowRegistration ?? true);
        setRequireEmailVerification(data.requireEmailVerification ?? true);
      })
      .catch(console.error);
    fetchAdminSecurity();
  }, []);

  const fetchAdminSecurity = async () => {
    try {
      const [statusRes, passkeysRes] = await Promise.all([
        fetch('/api/admin/auth/2fa/status'),
        fetch('/api/admin/auth/passkey'),
      ]);
      if (statusRes.ok) setAdmin2fa(await statusRes.json() as Admin2FAStatus);
      if (passkeysRes.ok) {
        const data = await passkeysRes.json();
        setAdminPasskeys((data?.passkeys || []) as PasskeyRow[]);
      }
    } catch (err) {
      console.error('Failed to fetch admin security:', err);
    }
  };

  const saveSecuritySettings = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(false);
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowRegistration, requireEmailVerification }),
      });
      if (!response.ok) throw new Error('Failed to save settings');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const startTotpSetup = async () => {
    try {
      setIsSettingUpTotp(true);
      setError(null);
      setAdminBackupCodes(null);
      const res = await fetch('/api/admin/auth/2fa/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start 2FA setup');
      setTotpSetup({ secret: data.secret, qrCode: data.qrCode });
      setTotpCode('');
      await fetchAdminSecurity();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start 2FA setup');
    } finally {
      setIsSettingUpTotp(false);
    }
  };

  const enableTotp = async () => {
    try {
      setIsEnablingTotp(true);
      setError(null);
      setAdminBackupCodes(null);
      const res = await fetch('/api/admin/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to enable 2FA');
      setAdminBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : null);
      setTotpSetup(null);
      setTotpCode('');
      await fetchAdminSecurity();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable 2FA');
    } finally {
      setIsEnablingTotp(false);
    }
  };

  const disableTotp = async () => {
    try {
      setIsDisablingTotp(true);
      setError(null);
      const res = await fetch('/api/admin/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpDisableCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disable 2FA');
      setTotpSetup(null);
      setTotpDisableCode('');
      setAdminBackupCodes(null);
      await fetchAdminSecurity();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setIsDisablingTotp(false);
    }
  };

  const registerAdminPasskey = async () => {
    try {
      setIsRegisteringPasskey(true);
      setError(null);
      const optionsRes = await fetch('/api/admin/auth/passkey/register/options', { method: 'POST' });
      const options = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(options.error || 'Failed to get passkey options');
      const registrationResponse = await startRegistration({ optionsJSON: options });
      const verifyRes = await fetch('/api/admin/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationResponse, name: passkeyName }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || 'Failed to register passkey');
      await fetchAdminSecurity();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.name === 'NotAllowedError' ? 'Passkey registration was cancelled' : err.message || 'Failed to register passkey');
      } else {
        setError('Failed to register passkey');
      }
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const deleteAdminPasskey = async (id: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/admin/auth/passkey?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete passkey');
      await fetchAdminSecurity();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete passkey');
    }
  };

  return (
    <div className="space-y-6">
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-500" />
          <span className="text-green-500">Settings saved successfully!</span>
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-500">{error}</span>
        </div>
      )}

      {/* Registration & Security */}
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Shield className="w-5 h-5 text-purple-500" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">Registration & Security</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
            <div>
              <p className="font-medium text-text-primary">Allow New Registrations</p>
              <p className="text-sm text-text-secondary">Enable or disable new user sign-ups</p>
            </div>
            <button
              onClick={() => setAllowRegistration(!allowRegistration)}
              className={`relative w-12 h-6 rounded-full transition-colors ${allowRegistration ? 'bg-accent-primary' : 'bg-background-secondary'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${allowRegistration ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
            <div>
              <p className="font-medium text-text-primary">Require Email Verification</p>
              <p className="text-sm text-text-secondary">Users must verify their email before accessing the app</p>
            </div>
            <button
              onClick={() => setRequireEmailVerification(!requireEmailVerification)}
              className={`relative w-12 h-6 rounded-full transition-colors ${requireEmailVerification ? 'bg-accent-primary' : 'bg-background-secondary'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${requireEmailVerification ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          <div className="flex justify-end">
            <Button variant="primary" onClick={saveSecuritySettings} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </div>
        </div>
      </Card>

      {/* Admin 2FA */}
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Shield className="w-5 h-5 text-purple-500" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">Admin 2FA (Authenticator)</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
            <div>
              <p className="font-medium text-text-primary">Status</p>
              <p className="text-sm text-text-secondary">
                {admin2fa?.enabled
                  ? `Enabled \u2022 Backup codes remaining: ${admin2fa.backupCodesRemaining}`
                  : 'Disabled'}
              </p>
            </div>
            {!admin2fa?.enabled ? (
              <Button variant="secondary" onClick={startTotpSetup} disabled={isSettingUpTotp}>
                {isSettingUpTotp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                Set Up 2FA
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-40">
                  <Input label="" placeholder="123456" value={totpDisableCode} onChange={(e) => setTotpDisableCode(e.target.value)} />
                </div>
                <Button variant="secondary" onClick={disableTotp} disabled={isDisablingTotp}>
                  {isDisablingTotp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                  Disable 2FA
                </Button>
              </div>
            )}
          </div>

          {totpSetup && !admin2fa?.enabled && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-background-secondary rounded-lg p-4">
                <p className="text-sm text-text-secondary mb-3">Scan this QR code with your authenticator app.</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={totpSetup.qrCode} alt="2FA QR Code" className="w-48 h-48 bg-white rounded" />
              </div>
              <div className="bg-background-secondary rounded-lg p-4 space-y-3">
                <p className="text-sm text-text-secondary">Then enter the 6-digit code to enable 2FA.</p>
                <Input label="Verification code" placeholder="123456" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
                <Button variant="primary" onClick={enableTotp} disabled={isEnablingTotp}>
                  {isEnablingTotp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                  Enable 2FA
                </Button>
              </div>
            </div>
          )}

          {adminBackupCodes && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <p className="text-blue-500 font-medium mb-2">Backup Codes (save these now)</p>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm text-text-primary">
                {adminBackupCodes.map((c) => (
                  <div key={c} className="bg-background-secondary rounded px-3 py-2">{c}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Passkeys */}
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Fingerprint className="w-5 h-5 text-purple-500" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">Admin Passkeys</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-secondary">
              {webAuthnSupported
                ? `${adminPasskeys.length} registered`
                : 'WebAuthn not supported (requires HTTPS or localhost)'}
            </p>
            <div className="flex items-center gap-3">
              <div className="w-56">
                <Input label="" placeholder="Passkey name" value={passkeyName} onChange={(e) => setPasskeyName(e.target.value)} />
              </div>
              <Button variant="secondary" onClick={registerAdminPasskey} disabled={isRegisteringPasskey || !webAuthnSupported}>
                {isRegisteringPasskey ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Fingerprint className="w-4 h-4 mr-2" />}
                Add Passkey
              </Button>
            </div>
          </div>

          {adminPasskeys.length > 0 ? (
            <div className="space-y-2">
              {adminPasskeys.map((pk) => (
                <div key={pk.id} className="flex items-center justify-between bg-background-tertiary rounded-lg px-4 py-3">
                  <div>
                    <p className="text-text-primary font-medium">{pk.name}</p>
                    <p className="text-xs text-text-tertiary">Added {new Date(pk.createdAt).toLocaleString()}</p>
                  </div>
                  <Button variant="ghost" onClick={() => deleteAdminPasskey(pk.id)}>Remove</Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">No passkeys registered yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
