import { cn } from '@/lib/utils';
import { HTMLAttributes, forwardRef } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'warning' | 'success' | 'danger';
  size?: 'sm' | 'md';
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'sm', children, ...props }, ref) => {
    const variants = {
      default: 'bg-background-tertiary text-text-secondary border-border',
      primary: 'bg-accent-primary/20 text-accent-primary border-accent-primary/30',
      secondary: 'bg-accent-secondary/20 text-accent-secondary border-accent-secondary/30',
      warning: 'bg-accent-warning/20 text-accent-warning border-accent-warning/30',
      success: 'bg-accent-secondary/20 text-accent-secondary border-accent-secondary/30',
      danger: 'bg-accent-danger/20 text-accent-danger border-accent-danger/30',
    };

    const sizes = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-3 py-1 text-sm',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium rounded-full border',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };
