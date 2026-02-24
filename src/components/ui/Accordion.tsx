'use client';

import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { createContext, useContext, useState, ReactNode } from 'react';

interface AccordionContextValue {
  openItems: string[];
  toggleItem: (value: string) => void;
  multiple: boolean;
}

const AccordionContext = createContext<AccordionContextValue | undefined>(undefined);

interface AccordionProps {
  children: ReactNode;
  className?: string;
  multiple?: boolean;
  defaultOpen?: string[];
}

export function Accordion({ children, className, multiple = false, defaultOpen = [] }: AccordionProps) {
  const [openItems, setOpenItems] = useState<string[]>(defaultOpen);

  const toggleItem = (value: string) => {
    if (multiple) {
      setOpenItems(prev =>
        prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value]
      );
    } else {
      setOpenItems(prev => (prev.includes(value) ? [] : [value]));
    }
  };

  return (
    <AccordionContext.Provider value={{ openItems, toggleItem, multiple }}>
      <div className={cn('space-y-2', className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function AccordionItem({ value, children, className }: AccordionItemProps) {
  return (
    <div
      className={cn(
        'bg-background-secondary border border-border rounded-lg overflow-hidden',
        className
      )}
      data-value={value}
    >
      {children}
    </div>
  );
}

interface AccordionTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function AccordionTrigger({ value, children, className }: AccordionTriggerProps) {
  const context = useContext(AccordionContext);
  if (!context) throw new Error('AccordionTrigger must be used within Accordion');

  const { openItems, toggleItem } = context;
  const isOpen = openItems.includes(value);

  return (
    <button
      onClick={() => toggleItem(value)}
      className={cn(
        'flex items-center justify-between w-full px-4 py-4 text-left text-text-primary font-medium',
        'hover:bg-background-tertiary transition-colors',
        className
      )}
      aria-expanded={isOpen}
    >
      {children}
      <ChevronDown
        className={cn(
          'w-5 h-5 text-text-secondary transition-transform duration-200',
          isOpen && 'rotate-180'
        )}
      />
    </button>
  );
}

interface AccordionContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function AccordionContent({ value, children, className }: AccordionContentProps) {
  const context = useContext(AccordionContext);
  if (!context) throw new Error('AccordionContent must be used within Accordion');

  const { openItems } = context;
  const isOpen = openItems.includes(value);

  if (!isOpen) return null;

  return (
    <div className={cn('px-4 pb-4 text-text-secondary', className)}>
      {children}
    </div>
  );
}
