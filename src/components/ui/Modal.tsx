'use client';

import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { HTMLAttributes, forwardRef, useEffect } from 'react';
import { Button } from './Button';

export interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
}

const Modal = forwardRef<HTMLDivElement, ModalProps>(
  ({ className, isOpen, onClose, title, description, size = 'md', children, ...props }, ref) => {
    const sizes = {
      sm: 'max-w-md',
      md: 'max-w-lg',
      lg: 'max-w-2xl',
    };

    useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };

      if (isOpen) {
        document.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';
      }

      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';
      };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
        
        {/* Modal */}
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
          aria-describedby={description ? 'modal-description' : undefined}
          className={cn(
            'relative bg-background-secondary border border-border rounded-card p-6 w-full mx-4',
            'animate-fade-in',
            sizes[size],
            className
          )}
          {...props}
        >
          {/* Close Button */}
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-4 right-4 p-2"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </Button>

          {/* Header */}
          {(title || description) && (
            <div className="mb-6">
              {title && (
                <h2 id="modal-title" className="text-xl font-semibold text-text-primary">
                  {title}
                </h2>
              )}
              {description && (
                <p id="modal-description" className="mt-2 text-text-secondary">
                  {description}
                </p>
              )}
            </div>
          )}

          {/* Content */}
          {children}
        </div>
      </div>
    );
  }
);

Modal.displayName = 'Modal';

export { Modal };
