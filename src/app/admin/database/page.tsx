'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Modal } from '@/components/ui';
import {
  Database,
  Search,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  X,
  Columns,
} from 'lucide-react';
import ModelSelector from './components/ModelSelector';
import DataTable from './components/DataTable';
import RecordForm from './components/RecordForm';
import DeleteConfirmation from './components/DeleteConfirmation';
import type { ModelFieldInfo } from '@/lib/database-explorer';

interface ModelListItem {
  name: string;
  fieldCount: number;
  recordCount: number;
  isProtected: boolean;
}

interface ModelSchema {
  name: string;
  scalarFields: ModelFieldInfo[];
  idField: string;
  isProtected: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminDatabasePage() {
  // Models list
  const [models, setModels] = useState<ModelListItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  // Selected model data
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [schema, setSchema] = useState<ModelSchema | null>(null);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Column visibility
  const [visibleFields, setVisibleFields] = useState<string[]>([]);
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<Record<string, unknown> | null>(null);

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch models list
  const fetchModels = useCallback(async () => {
    try {
      setModelsLoading(true);
      const res = await fetch('/api/admin/database/models');
      if (!res.ok) throw new Error('Failed to fetch models');
      const data = await res.json();
      setModels(data.models);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setModelsLoading(false);
    }
  }, []);

  // Fetch records for selected model
  const fetchRecords = useCallback(async (modelName: string, page = 1) => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
      });
      if (searchQuery) params.set('search', searchQuery);
      if (sortBy) {
        params.set('sortBy', sortBy);
        params.set('sortOrder', sortOrder);
      }

      const res = await fetch(`/api/admin/database/${modelName}?${params}`);
      if (!res.ok) throw new Error('Failed to fetch records');
      const data = await res.json();

      setRecords(data.records);
      setSchema(data.schema);
      setPagination(data.pagination);

      // Set default visible fields (first 8 scalar fields)
      if (data.schema && visibleFields.length === 0) {
        setVisibleFields(data.schema.scalarFields.slice(0, 8).map((f: ModelFieldInfo) => f.name));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch records');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, sortBy, sortOrder]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (selectedModel) {
      fetchRecords(selectedModel, 1);
    }
  }, [selectedModel, fetchRecords]);

  const handleSelectModel = (modelName: string) => {
    setSelectedModel(modelName);
    setSearchQuery('');
    setSortBy('');
    setSortOrder('desc');
    setVisibleFields([]);
    setRecords([]);
    setSchema(null);
    setPagination({ page: 1, limit: 50, total: 0, totalPages: 0 });
  };

  const handleSort = (fieldName: string) => {
    if (sortBy === fieldName) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(fieldName);
      setSortOrder('desc');
    }
  };

  const handleSearch = () => {
    if (selectedModel) fetchRecords(selectedModel, 1);
  };

  const handlePageChange = (newPage: number) => {
    if (selectedModel) fetchRecords(selectedModel, newPage);
  };

  // CRUD handlers
  const handleCreate = async (data: Record<string, unknown>) => {
    if (!selectedModel) return;
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/admin/database/${selectedModel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create record');
      }
      setIsCreateModalOpen(false);
      fetchRecords(selectedModel, pagination.page);
      fetchModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create record');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (data: Record<string, unknown>) => {
    if (!selectedModel || !selectedRecord || !schema) return;
    const id = selectedRecord[schema.idField];
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/admin/database/${selectedModel}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update record');
      }
      setIsEditModalOpen(false);
      setSelectedRecord(null);
      fetchRecords(selectedModel, pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update record');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedModel || !selectedRecord || !schema) return;
    const id = selectedRecord[schema.idField];
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/admin/database/${selectedModel}/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to delete record');
      }
      setIsDeleteModalOpen(false);
      setSelectedRecord(null);
      fetchRecords(selectedModel, pagination.page);
      fetchModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete record');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleField = (fieldName: string) => {
    setVisibleFields((prev) =>
      prev.includes(fieldName) ? prev.filter((f) => f !== fieldName) : [...prev, fieldName]
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Database className="w-7 h-7 text-accent-primary" />
          <h1 className="text-2xl font-bold text-text-primary">Database Explorer</h1>
        </div>
        <p className="text-text-secondary">Browse and manage database tables</p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-accent-danger/10 border border-accent-danger/20 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-accent-danger shrink-0" />
          <span className="text-sm text-accent-danger flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-accent-danger hover:text-accent-danger/80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 gap-0 border border-border rounded-lg overflow-hidden bg-background-secondary min-h-0">
        {/* Sidebar - Model list */}
        <div className="w-56 shrink-0 border-r border-border bg-background-primary">
          <ModelSelector
            models={models}
            selectedModel={selectedModel}
            onSelect={handleSelectModel}
            isLoading={modelsLoading}
          />
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedModel ? (
            <div className="flex-1 flex items-center justify-center text-text-tertiary">
              <div className="text-center">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Select a table to browse its records</p>
              </div>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-2 p-3 border-b border-border">
                <h2 className="text-sm font-semibold text-text-primary mr-2">{selectedModel}</h2>
                <div className="flex-1 flex items-center gap-2">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
                    <input
                      type="text"
                      placeholder="Search records..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="w-full bg-background-primary border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    className="px-3 py-1.5 text-sm bg-background-primary border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent-primary transition-colors"
                  >
                    Search
                  </button>
                </div>

                {/* Column picker */}
                <div className="relative">
                  <button
                    onClick={() => setShowColumnPicker(!showColumnPicker)}
                    className="p-1.5 text-text-tertiary hover:text-text-primary border border-border rounded-lg hover:border-accent-primary transition-colors"
                    title="Toggle columns"
                  >
                    <Columns className="w-4 h-4" />
                  </button>
                  {showColumnPicker && schema && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowColumnPicker(false)} />
                      <div className="absolute right-0 top-full mt-1 z-40 bg-background-secondary border border-border rounded-lg shadow-lg p-2 w-56 max-h-64 overflow-y-auto">
                        {schema.scalarFields.map((f) => (
                          <label key={f.name} className="flex items-center gap-2 px-2 py-1 text-sm text-text-secondary hover:bg-background-tertiary rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={visibleFields.includes(f.name)}
                              onChange={() => toggleField(f.name)}
                              className="rounded"
                            />
                            <span className="truncate">{f.name}</span>
                            <span className="text-xs text-text-tertiary ml-auto">{f.type}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={() => selectedModel && fetchRecords(selectedModel, pagination.page)}
                  className="p-1.5 text-text-tertiary hover:text-text-primary border border-border rounded-lg hover:border-accent-primary transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>

                {schema && !schema.isProtected && (
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-primary-hover transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New
                  </button>
                )}
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
                  </div>
                ) : schema ? (
                  <DataTable
                    records={records}
                    schema={schema}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                    onEdit={(record) => {
                      setSelectedRecord(record);
                      setIsEditModalOpen(true);
                    }}
                    onDelete={(record) => {
                      setSelectedRecord(record);
                      setIsDeleteModalOpen(true);
                    }}
                    visibleFields={visibleFields}
                  />
                ) : null}
              </div>

              {/* Pagination */}
              {pagination.totalPages > 0 && (
                <div className="flex items-center justify-between px-3 py-2 border-t border-border text-sm">
                  <span className="text-text-tertiary">
                    {pagination.total} records · Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                      className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                      className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={`Create ${selectedModel} Record`}
        size="lg"
      >
        {schema && (
          <RecordForm
            schema={schema}
            mode="create"
            onSubmit={handleCreate}
            onCancel={() => setIsCreateModalOpen(false)}
            isSubmitting={isSubmitting}
          />
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => { setIsEditModalOpen(false); setSelectedRecord(null); }}
        title={`Edit ${selectedModel} Record`}
        size="lg"
      >
        {schema && selectedRecord && (
          <RecordForm
            schema={schema}
            mode="edit"
            initialData={selectedRecord}
            onSubmit={handleEdit}
            onCancel={() => { setIsEditModalOpen(false); setSelectedRecord(null); }}
            isSubmitting={isSubmitting}
          />
        )}
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setSelectedRecord(null); }}
        title="Delete Record"
      >
        {schema && selectedRecord && (
          <DeleteConfirmation
            recordId={String(selectedRecord[schema.idField])}
            modelName={selectedModel || ''}
            onConfirm={handleDelete}
            onCancel={() => { setIsDeleteModalOpen(false); setSelectedRecord(null); }}
            isSubmitting={isSubmitting}
          />
        )}
      </Modal>
    </motion.div>
  );
}
