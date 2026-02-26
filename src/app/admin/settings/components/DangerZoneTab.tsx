'use client';

import { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { AlertCircle } from 'lucide-react';

const DANGER_ACTIONS = [
  {
    key: 'clear-sessions',
    label: 'Clear All Sessions',
    description: 'Log out all users from all devices',
  },
  {
    key: 'purge-deleted',
    label: 'Purge Deleted Data',
    description: 'Permanently remove all soft-deleted data',
  },
];

export default function DangerZoneTab() {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{ msg: string; ok: boolean } | null>(null);

  const executeAction = async (key: string) => {
    setIsRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/settings/danger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: key }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ msg: data.message || 'Action completed', ok: true });
      } else {
        setResult({ msg: data.error || 'Action failed', ok: false });
      }
      setConfirming(null);
    } catch (err) {
      setResult({ msg: err instanceof Error ? err.message : 'Action failed', ok: false });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {result && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${result.ok ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
          <span className={result.ok ? 'text-green-500' : 'text-red-500'}>{result.msg}</span>
        </div>
      )}

      <Card className="border-red-500/30">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-red-500/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-red-500">Danger Zone</h2>
        </div>

        <p className="text-sm text-text-secondary mb-6">
          These actions cannot be undone. Proceed with caution.
        </p>

        <div className="space-y-4">
          {DANGER_ACTIONS.map(action => (
            <div key={action.key} className="flex items-center justify-between p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
              <div>
                <p className="font-medium text-text-primary">{action.label}</p>
                <p className="text-sm text-text-secondary">{action.description}</p>
              </div>
              {confirming === action.key ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="border-red-500 text-red-500"
                    onClick={() => executeAction(action.key)}
                    disabled={isRunning}
                  >
                    {isRunning ? 'Running...' : 'Confirm'}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  className="border-red-500 text-red-500"
                  onClick={() => setConfirming(action.key)}
                >
                  {action.label}
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
