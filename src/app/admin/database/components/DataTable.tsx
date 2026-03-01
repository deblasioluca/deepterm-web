'use client';

import { ChevronUp, ChevronDown, Edit, Trash2 } from 'lucide-react';
import type { ModelFieldInfo } from '@/lib/database-explorer';

interface ModelInfo {
  name: string;
  scalarFields: ModelFieldInfo[];
  idField: string;
  isProtected: boolean;
}

interface DataTableProps {
  records: Record<string, unknown>[];
  schema: ModelInfo;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (fieldName: string) => void;
  onEdit: (record: Record<string, unknown>) => void;
  onDelete: (record: Record<string, unknown>) => void;
  visibleFields: string[];
}

function formatCellValue(value: unknown, field: ModelFieldInfo): string {
  if (value === null || value === undefined) return '—';
  if (value === '[REDACTED]') return '[REDACTED]';

  if (field.type === 'Boolean') return value ? 'true' : 'false';

  if (field.type === 'DateTime') {
    try {
      return new Date(String(value)).toLocaleString();
    } catch {
      return String(value);
    }
  }

  const str = String(value);
  if (str.length > 80) return str.slice(0, 80) + '...';
  return str;
}

export default function DataTable({
  records,
  schema,
  sortBy,
  sortOrder,
  onSort,
  onEdit,
  onDelete,
  visibleFields,
}: DataTableProps) {
  const columns = schema.scalarFields.filter((f) => visibleFields.includes(f.name));

  if (records.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-text-tertiary text-sm">
        No records found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((field) => (
              <th
                key={field.name}
                onClick={() => onSort(field.name)}
                className="text-left px-3 py-2 text-text-tertiary font-medium cursor-pointer hover:text-text-primary select-none whitespace-nowrap"
              >
                <span className="inline-flex items-center gap-1">
                  {field.name}
                  {sortBy === field.name && (
                    sortOrder === 'asc'
                      ? <ChevronUp className="w-3 h-3" />
                      : <ChevronDown className="w-3 h-3" />
                  )}
                </span>
              </th>
            ))}
            {!schema.isProtected && (
              <th className="text-right px-3 py-2 text-text-tertiary font-medium whitespace-nowrap">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {records.map((record, i) => (
            <tr
              key={String(record[schema.idField] ?? i)}
              className="border-b border-border/50 hover:bg-background-tertiary/50 transition-colors"
            >
              {columns.map((field) => {
                const val = record[field.name];
                const display = formatCellValue(val, field);
                const isId = field.isId;
                const isRedacted = val === '[REDACTED]';
                const isBool = field.type === 'Boolean';

                return (
                  <td
                    key={field.name}
                    className={`px-3 py-2 max-w-[200px] truncate ${
                      isId ? 'font-mono text-xs text-text-tertiary' : 'text-text-secondary'
                    } ${isRedacted ? 'italic text-accent-warning/70' : ''}`}
                    title={typeof val === 'string' && val.length > 80 ? val : undefined}
                  >
                    {isBool && !isRedacted ? (
                      <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${val ? 'bg-accent-secondary' : 'bg-accent-danger'}`} />
                    ) : null}
                    {display}
                  </td>
                );
              })}
              {!schema.isProtected && (
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => onEdit(record)}
                    className="p-1 text-text-tertiary hover:text-accent-primary transition-colors"
                    title="Edit"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(record)}
                    className="p-1 text-text-tertiary hover:text-accent-danger transition-colors ml-1"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
