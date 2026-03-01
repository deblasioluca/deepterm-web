'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteConfirmationProps {
  recordId: string;
  modelName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export default function DeleteConfirmation({
  recordId,
  modelName,
  onConfirm,
  onCancel,
  isSubmitting,
}: DeleteConfirmationProps) {
  const [confirmText, setConfirmText] = useState('');
  const shortId = recordId.length > 12 ? recordId.slice(0, 12) + '...' : recordId;
  const isConfirmed = confirmText === recordId;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-accent-danger/10 border border-accent-danger/20">
        <AlertTriangle className="w-5 h-5 text-accent-danger shrink-0 mt-0.5" />
        <div className="text-sm text-text-secondary">
          <p>
            You are about to delete a record from <strong className="text-text-primary">{modelName}</strong>.
            This may cascade to related records and <strong className="text-accent-danger">cannot be undone</strong>.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-sm text-text-secondary mb-1">
          Type the record ID to confirm: <code className="text-accent-primary text-xs">{shortId}</code>
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Paste record ID here"
          className="w-full bg-background-primary border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-danger"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={onConfirm}
          disabled={!isConfirmed || isSubmitting}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Deleting...
            </span>
          ) : (
            'Delete Record'
          )}
        </Button>
      </div>
    </div>
  );
}
