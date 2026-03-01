'use client';

import { useState } from 'react';
import { Search, Lock, Database } from 'lucide-react';

interface ModelListItem {
  name: string;
  fieldCount: number;
  recordCount: number;
  isProtected: boolean;
}

interface ModelSelectorProps {
  models: ModelListItem[];
  selectedModel: string | null;
  onSelect: (modelName: string) => void;
  isLoading: boolean;
}

export default function ModelSelector({ models, selectedModel, onSelect, isLoading }: ModelSelectorProps) {
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? models.filter((m) => m.name.toLowerCase().includes(filter.toLowerCase()))
    : models;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input
            type="text"
            placeholder="Filter tables..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-background-primary border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-text-tertiary text-sm">Loading tables...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-text-tertiary text-sm">No tables found</div>
        ) : (
          filtered.map((model) => (
            <button
              key={model.name}
              onClick={() => onSelect(model.name)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors hover:bg-background-tertiary ${
                selectedModel === model.name
                  ? 'bg-accent-primary/10 text-accent-primary border-r-2 border-accent-primary'
                  : 'text-text-secondary'
              }`}
            >
              <Database className="w-3.5 h-3.5 shrink-0 opacity-50" />
              <span className="truncate flex-1 font-medium">{model.name}</span>
              {model.isProtected && (
                <Lock className="w-3 h-3 shrink-0 text-accent-warning" />
              )}
              <span className="text-xs text-text-tertiary shrink-0">{model.recordCount}</span>
            </button>
          ))
        )}
      </div>
      <div className="p-3 border-t border-border text-xs text-text-tertiary">
        {models.length} tables
      </div>
    </div>
  );
}
