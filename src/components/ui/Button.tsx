import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-200 rounded-button focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variants = {
      primary: 'bg-accent-primary hover:bg-accent-primary-hover text-white btn-glow',
      secondary: 'border border-border hover:border-border-hover bg-transparent text-text-primary hover:bg-background-tertiary',
      ghost: 'bg-transparent hover:bg-background-tertiary text-text-primary',
      danger: 'bg-accent-danger hover:bg-red-600 text-white',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-5 py-2.5 text-base',
      lg: 'px-8 py-3 text-lg',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
