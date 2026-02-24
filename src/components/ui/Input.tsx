import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  helperText?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, helperText, type = 'text', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            type={type}
            className={cn(
              'w-full bg-background-tertiary border border-border rounded-button px-4 py-2.5',
              'text-text-primary placeholder:text-text-tertiary',
              'focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary',
              'transition-colors duration-200',
              icon && 'pl-10',
              error && 'border-accent-danger focus:border-accent-danger focus:ring-accent-danger',
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-accent-danger">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-text-tertiary">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
