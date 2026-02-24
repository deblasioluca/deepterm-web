'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Button, Input, Badge } from '@/components/ui';
import {
  Fingerprint,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  AlertCircle,
  Smartphone,
  Laptop,
  Key,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';

interface Passkey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceType: string;
  backedUp: boolean;
}

export default function PasskeysPage() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [webAuthnSupported, setWebAuthnSupported] = useState(true);

  useEffect(() => {
    fetchPasskeys();
    setWebAuthnSupported(browserSupportsWebAuthn());
  }, []);

  const fetchPasskeys = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/auth/passkey');
      if (response.ok) {
        const data = await response.json();
        setPasskeys(data.passkeys || []);
      }
    } catch (err) {
      console.error('Failed to fetch passkeys:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPasskey = async () => {
    if (!newPasskeyName.trim()) {
      setError('Please enter a name for your passkey');
      return;
    }

    setError(null);
    setIsAdding(true);

    try {
      // Get registration options
      const optionsRes = await fetch('/api/auth/passkey/register/options', {
        method: 'POST',
      });

      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || 'Failed to get registration options');
      }

      const options = await optionsRes.json();
      console.log('WebAuthn options received:', options);

      // Start WebAuthn registration
      const regResponse = await startRegistration({ optionsJSON: options });
      console.log('WebAuthn registration response:', regResponse);

      // Verify with server
      const verifyRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationResponse: regResponse,
          name: newPasskeyName.trim(),
        }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || 'Failed to register passkey');
      }

      setSuccess('Passkey added successfully!');
      setNewPasskeyName('');
      setShowAddForm(false);
      fetchPasskeys();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      console.error('Passkey registration error:', err);
      if (err instanceof Error) {
        // Show more detailed error message
        const errorDetails = `${err.name}: ${err.message}`;
        console.error('Error details:', errorDetails);
        
        if (err.name === 'NotAllowedError') {
          setError('Passkey registration was cancelled or not allowed. Make sure you have a passkey provider available (Touch ID, Face ID, Windows Hello, or a security key).');
        } else if (err.name === 'InvalidStateError') {
          setError('This passkey is already registered on your account.');
        } else if (err.name === 'NotSupportedError') {
          setError('Your browser or device does not support passkeys.');
        } else {
          setError(err.message || 'Failed to add passkey');
        }
      } else {
        setError('Failed to add passkey');
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) {
      return;
    }

    try {
      const response = await fetch('/api/auth/passkey', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkeyId: id, name: editName.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to rename passkey');
      }

      setEditingId(null);
      setEditName('');
      fetchPasskeys();
      setSuccess('Passkey renamed successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename passkey');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      const response = await fetch('/api/auth/passkey', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkeyId: id }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete passkey');
      }

      fetchPasskeys();
      setSuccess('Passkey deleted successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete passkey');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDeviceIcon = (deviceType: string) => {
    if (deviceType === 'singleDevice') {
      return <Smartphone className="w-5 h-5 text-text-secondary" />;
    }
    if (deviceType === 'multiDevice') {
      return <Key className="w-5 h-5 text-accent-primary" />;
    }
    return <Laptop className="w-5 h-5 text-text-secondary" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <Fingerprint className="w-8 h-8 text-accent-primary" />
            Passkeys
          </h1>
          <p className="text-text-secondary mt-1">
            Manage your passkeys for passwordless sign-in
          </p>
        </div>
      </div>

      {/* HTTPS Warning */}
      {!webAuthnSupported && (
        <Card className="p-6 bg-accent-warning/10 border-accent-warning/30">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-accent-warning/20 rounded-lg">
              <ShieldAlert className="w-6 h-6 text-accent-warning" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary mb-2">
                HTTPS Required
              </h3>
              <p className="text-text-secondary text-sm">
                Passkeys require a secure connection (HTTPS) to work. You&apos;re currently 
                accessing this site over HTTP. To use passkeys, please enable SSL/TLS 
                on your server and access the site via HTTPS.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Info Card */}
      <Card className="p-6 bg-accent-primary/10 border-accent-primary/30">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-accent-primary/20 rounded-lg">
            <Fingerprint className="w-6 h-6 text-accent-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary mb-2">
              What are Passkeys?
            </h3>
            <p className="text-text-secondary text-sm">
              Passkeys are a more secure and convenient way to sign in. They use your device&apos;s 
              biometric authentication (Face ID, Touch ID, Windows Hello) or a security key. 
              Passkeys are phishing-resistant and can&apos;t be stolen like passwords.
            </p>
          </div>
        </div>
      </Card>

      {/* Success/Error Messages */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-accent-danger/10 border border-accent-danger/30 rounded-lg flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-accent-danger flex-shrink-0" />
            <p className="text-sm text-accent-danger">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-accent-danger hover:text-accent-danger/80"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-accent-success/10 border border-accent-success/30 rounded-lg flex items-center gap-3"
          >
            <Check className="w-5 h-5 text-accent-success flex-shrink-0" />
            <p className="text-sm text-accent-success">{success}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Passkey Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Your Passkeys</h2>
          {!showAddForm && webAuthnSupported && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Passkey
            </Button>
          )}
        </div>

        <AnimatePresence>
          {showAddForm && webAuthnSupported && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 p-4 bg-background-tertiary rounded-lg border border-border"
            >
              <h3 className="font-medium text-text-primary mb-4">Add a new passkey</h3>
              <div className="flex gap-3">
                <Input
                  placeholder="e.g., MacBook Pro, iPhone 15"
                  value={newPasskeyName}
                  onChange={(e) => setNewPasskeyName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="primary"
                  onClick={handleAddPasskey}
                  disabled={isAdding}
                  className="flex items-center gap-2"
                >
                  {isAdding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Fingerprint className="w-4 h-4" />
                      Create Passkey
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewPasskeyName('');
                    setError(null);
                  }}
                  disabled={isAdding}
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Passkeys List */}
        {passkeys.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-background-tertiary rounded-full mb-4">
              <Key className="w-8 h-8 text-text-tertiary" />
            </div>
            <h3 className="text-lg font-medium text-text-primary mb-2">No passkeys yet</h3>
            <p className="text-text-secondary mb-6 max-w-sm mx-auto">
              Add a passkey to sign in faster and more securely without a password.
            </p>
            {!showAddForm && (
              <Button
                variant="primary"
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 mx-auto"
              >
                <Plus className="w-4 h-4" />
                Add Your First Passkey
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {passkeys.map((passkey) => (
              <motion.div
                key={passkey.id}
                layout
                className="p-4 bg-background-tertiary rounded-lg border border-border"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {getDeviceIcon(passkey.deviceType)}
                    <div>
                      {editingId === passkey.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-48"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRename(passkey.id)}
                            className="p-1 text-accent-success hover:bg-accent-success/20 rounded"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditName('');
                            }}
                            className="p-1 text-text-secondary hover:bg-background-secondary rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary">
                              {passkey.name}
                            </span>
                            {passkey.backedUp && (
                              <Badge variant="success" size="sm">
                                Synced
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-text-tertiary mt-1">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Added {formatDate(passkey.createdAt)}
                            </span>
                            {passkey.lastUsedAt && (
                              <span>Last used {formatDate(passkey.lastUsedAt)}</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {editingId !== passkey.id && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingId(passkey.id);
                          setEditName(passkey.name);
                        }}
                        className="p-2 text-text-secondary hover:text-text-primary hover:bg-background-secondary rounded-lg transition-colors"
                        title="Rename"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(passkey.id)}
                        disabled={deletingId === passkey.id}
                        className="p-2 text-text-secondary hover:text-accent-danger hover:bg-accent-danger/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        {deletingId === passkey.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </Card>

      {/* Security Tips */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Security Tips</h2>
        <ul className="space-y-3 text-sm text-text-secondary">
          <li className="flex items-start gap-3">
            <Check className="w-4 h-4 text-accent-success mt-0.5 flex-shrink-0" />
            <span>
              <strong className="text-text-primary">Add multiple passkeys</strong> - Register 
              passkeys on multiple devices so you always have a backup way to sign in.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="w-4 h-4 text-accent-success mt-0.5 flex-shrink-0" />
            <span>
              <strong className="text-text-primary">Synced passkeys</strong> - Passkeys marked as 
              &quot;Synced&quot; are backed up to your cloud account (iCloud, Google, etc.) and can be used 
              across your devices.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Check className="w-4 h-4 text-accent-success mt-0.5 flex-shrink-0" />
            <span>
              <strong className="text-text-primary">Keep 2FA enabled</strong> - Even with passkeys, 
              we recommend keeping two-factor authentication enabled for additional security.
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
