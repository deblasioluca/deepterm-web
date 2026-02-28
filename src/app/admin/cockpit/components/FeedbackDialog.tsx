'use client';

import { useState } from 'react';
import { X, Send, AlertTriangle, ArrowLeft, Trash2 } from 'lucide-react';

export type FeedbackTarget = 'implement' | 'deliberation' | 'abandon';

interface FeedbackDialogProps {
  isOpen: boolean;
  target: FeedbackTarget;
  storyTitle: string;
  onSubmit: (feedback: string, target: FeedbackTarget) => void;
  onCancel: () => void;
}

const TARGET_CONFIG: Record<FeedbackTarget, {
  title: string;
  description: string;
  placeholder: string;
  submitLabel: string;
  submitColor: string;
  icon: typeof ArrowLeft;
  warning?: string;
}> = {
  implement: {
    title: 'Request Changes → Implement',
    description: 'Send feedback to the AI agent. It will revise the code based on your comments.',
    placeholder: 'Describe what needs to change (e.g., "The dark mode toggle should persist preference in localStorage, not just state")...',
    submitLabel: 'Send to Agent',
    submitColor: 'bg-amber-600 hover:bg-amber-500',
    icon: ArrowLeft,
  },
  deliberation: {
    title: 'Back to Deliberation',
    description: 'The current implementation approach is fundamentally wrong. The AI team will re-architect from scratch.',
    placeholder: 'Explain why the approach needs to change (e.g., "Using CSS variables won\'t work with our theming system, need a ThemeProvider context")...',
    submitLabel: 'Re-Architect',
    submitColor: 'bg-orange-600 hover:bg-orange-500',
    icon: ArrowLeft,
    warning: 'This will close the current PR and start a new deliberation cycle.',
  },
  abandon: {
    title: 'Abandon Implementation',
    description: 'Close the PR, delete the branch, and return this story to Planning for re-evaluation.',
    placeholder: 'Why is this implementation being abandoned? (e.g., "Scope changed, no longer needed")...',
    submitLabel: 'Abandon & Close PR',
    submitColor: 'bg-red-600 hover:bg-red-500',
    icon: Trash2,
    warning: 'This will close the PR and delete the feature branch on GitHub. This cannot be undone.',
  },
};

export default function FeedbackDialog({ isOpen, target, storyTitle, onSubmit, onCancel }: FeedbackDialogProps) {
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const config = TARGET_CONFIG[target];

  const handleSubmit = async () => {
    if (!feedback.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(feedback.trim(), target);
    } finally {
      setSubmitting(false);
      setFeedback('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <config.icon className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-zinc-100">{config.title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <p className="text-xs text-zinc-400">{config.description}</p>

          <div className="text-[10px] text-zinc-600 bg-zinc-800/50 px-2 py-1.5 rounded">
            Story: <span className="text-zinc-400">{storyTitle}</span>
          </div>

          {config.warning && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-500/8 border border-amber-500/20 text-[11px] text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{config.warning}</span>
            </div>
          )}

          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={config.placeholder}
            rows={4}
            autoFocus
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none"
          />

          <p className="text-[10px] text-zinc-600">
            {feedback.trim().length > 0 ? `${feedback.trim().length} characters` : 'Feedback is required to proceed'}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-800">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!feedback.trim() || submitting}
            className={`px-3 py-1.5 rounded-md text-xs font-medium text-white ${config.submitColor} transition disabled:opacity-50 flex items-center gap-1.5`}
          >
            {submitting ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-3 h-3" />
                {config.submitLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
