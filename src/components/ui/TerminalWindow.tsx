'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { forwardRef, ReactNode } from 'react';

export interface TerminalWindowProps {
  title?: string;
  showAIPanel?: boolean;
  className?: string;
  children?: ReactNode;
}

const TerminalWindow = forwardRef<HTMLDivElement, TerminalWindowProps>(
  ({ className, title = 'DeepTerm — user@server', showAIPanel = false, children }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={cn(
          'bg-[#0D0D14] rounded-xl border border-border overflow-hidden shadow-2xl',
          className
        )}
      >
        {/* Title Bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-background-tertiary border-b border-border">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
            <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
          </div>
          <span className="ml-4 text-sm text-text-secondary font-mono">{title}</span>
        </div>

        {/* Terminal Content */}
        <div className="p-4 font-mono text-sm">
          {children}
        </div>
      </motion.div>
    );
  }
);

TerminalWindow.displayName = 'TerminalWindow';

// Terminal Line Component
interface TerminalLineProps {
  prompt?: string;
  command?: string;
  output?: string;
  className?: string;
}

export function TerminalLine({ prompt = '$', command, output, className }: TerminalLineProps) {
  return (
    <div className={cn('mb-1', className)}>
      {command && (
        <div className="flex items-center gap-2">
          <span className="text-accent-secondary">{prompt}</span>
          <span className="text-text-primary">{command}</span>
        </div>
      )}
      {output && (
        <div className="text-text-secondary whitespace-pre-wrap">{output}</div>
      )}
    </div>
  );
}

// Blinking Cursor Component
export function TerminalCursor() {
  return (
    <span className="inline-block w-2.5 h-5 bg-accent-secondary animate-cursor-blink align-middle" />
  );
}

// AI Panel Component
interface AIAssistantPanelProps {
  message: string;
  suggestion?: string;
  className?: string;
}

export function AIAssistantPanel({ message, suggestion, className }: AIAssistantPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.5, duration: 0.3 }}
      className={cn(
        'mt-4 bg-background-secondary border border-accent-primary/30 rounded-lg p-3',
        className
      )}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg">🤖</span>
        <div className="flex-1">
          <p className="text-sm text-text-primary">{message}</p>
          {suggestion && (
            <code className="mt-2 block text-sm text-accent-secondary font-mono">
              {suggestion}
            </code>
          )}
          <div className="flex gap-2 mt-3">
            <button className="px-3 py-1 text-xs bg-accent-primary rounded hover:bg-accent-primary-hover transition-colors">
              Apply
            </button>
            <button className="px-3 py-1 text-xs bg-background-tertiary border border-border rounded hover:bg-background-tertiary/80 transition-colors">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export { TerminalWindow };
