'use client';

import { useState, useEffect } from 'react';
import { Card, Button, Input } from '@/components/ui';
import { Loader2, AlertCircle, Check, Save, Upload } from 'lucide-react';

type Release = {
  platform: string;
  version: string;
  publishedAt: string;
  filePath: string;
  createdBy: string | null;
  releaseNotes?: string;
};

export default function ReleasesTab() {
  const [releaseFile, setReleaseFile] = useState<File | null>(null);
  const [releasePlatform, setReleasePlatform] = useState<'macos' | 'windows' | 'linux' | 'ios'>('macos');
  const [releaseVersion, setReleaseVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [isUploadingRelease, setIsUploadingRelease] = useState(false);
  const [releasesList, setReleasesList] = useState<Release[]>([]);

  const [editReleasePlatform, setEditReleasePlatform] = useState<'macos' | 'windows' | 'linux' | 'ios'>('macos');
  const [editReleaseVersion, setEditReleaseVersion] = useState('');
  const [editReleaseNotes, setEditReleaseNotes] = useState('');
  const [isSavingReleaseNotes, setIsSavingReleaseNotes] = useState(false);

  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchReleasesList = async () => {
    try {
      const res = await fetch('/api/admin/releases');
      if (!res.ok) return;
      const data = await res.json();
      setReleasesList(Array.isArray(data?.releases) ? data.releases : []);
    } catch (err) {
      console.error('Failed to fetch releases list:', err);
    }
  };

  useEffect(() => { fetchReleasesList(); }, []);

  const uploadRelease = async () => {
    try {
      setIsUploadingRelease(true);
      setError(null);
      if (!releaseFile) throw new Error('Please choose a release file');
      const fd = new FormData();
      fd.set('platform', releasePlatform);
      fd.set('file', releaseFile);
      if (releaseVersion.trim()) fd.set('version', releaseVersion.trim());
      if (releaseNotes.trim()) fd.set('releaseNotes', releaseNotes.trim());
      const res = await fetch('/api/admin/downloads/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload release');
      setSuccess(`Release uploaded: v${data.version}`);
      setTimeout(() => setSuccess(null), 5000);
      setReleaseFile(null);
      setReleasePlatform('macos');
      setReleaseVersion('');
      setReleaseNotes('');
      await fetchReleasesList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload release');
    } finally {
      setIsUploadingRelease(false);
    }
  };

  const saveReleaseNotes = async () => {
    try {
      setIsSavingReleaseNotes(true);
      setError(null);
      const version = editReleaseVersion.trim();
      if (!version) throw new Error('Choose a version to update');
      const res = await fetch('/api/admin/releases/update-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: editReleasePlatform, version, releaseNotes: editReleaseNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update release notes');
      setSuccess(`Release notes updated: v${version}`);
      setTimeout(() => setSuccess(null), 5000);
      await fetchReleasesList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update release notes');
    } finally {
      setIsSavingReleaseNotes(false);
    }
  };

  return (
    <div className="space-y-6">
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-500" />
          <span className="text-green-500">{success}</span>
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-500">{error}</span>
        </div>
      )}

      {/* Upload New Release */}
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-accent-secondary/20 rounded-lg">
            <Upload className="w-5 h-5 text-accent-secondary" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">Upload New Release</h2>
        </div>

        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Platform</label>
              <select
                value={releasePlatform}
                onChange={(e) => setReleasePlatform(e.target.value as 'macos' | 'windows' | 'linux' | 'ios')}
                className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
              >
                <option value="macos">macOS</option>
                <option value="windows">Windows</option>
                <option value="linux">Linux</option>
                <option value="ios">iOS</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">File</label>
              <input
                type="file"
                accept="*/*"
                onChange={(e) => setReleaseFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
              />
            </div>
            <Input label="Version (optional)" value={releaseVersion} onChange={(e) => setReleaseVersion(e.target.value)} placeholder="(auto from release notes)" />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Release notes (Markdown/plain text)</label>
            <textarea
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              rows={6}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            />
          </div>

          <div className="flex items-center justify-between">
            <Button variant="primary" onClick={uploadRelease} disabled={isUploadingRelease}>
              {isUploadingRelease ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload New Version
            </Button>
            <Button variant="secondary" onClick={fetchReleasesList}>Refresh List</Button>
          </div>
        </div>
      </Card>

      {/* Release History */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Available Releases</h2>
        <div className="space-y-2">
          {releasesList.length === 0 ? (
            <p className="text-sm text-text-tertiary">No releases yet.</p>
          ) : (
            releasesList.map((r) => (
              <div key={`${r.platform}-${r.version}`} className="flex items-center justify-between bg-background-tertiary rounded-lg px-4 py-3">
                <div>
                  <p className="text-text-primary font-medium">{r.platform?.toUpperCase()} v{r.version}</p>
                  <p className="text-xs text-text-tertiary">{new Date(r.publishedAt).toLocaleString()} {r.createdBy ? `\u2022 ${r.createdBy}` : ''}</p>
                </div>
                <a href={r.filePath} className="inline-flex" download>
                  <Button variant="secondary">Download</Button>
                </a>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Edit Release Notes */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Edit Release Notes</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Platform</label>
            <select
              value={editReleasePlatform}
              onChange={(e) => {
                setEditReleasePlatform(e.target.value as 'macos' | 'windows' | 'linux' | 'ios');
                setEditReleaseVersion('');
                setEditReleaseNotes('');
              }}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="macos">macOS</option>
              <option value="windows">Windows</option>
              <option value="linux">Linux</option>
              <option value="ios">iOS</option>
            </select>

            <label className="block text-sm font-medium text-text-secondary mb-2 mt-4">Version</label>
            <select
              value={editReleaseVersion}
              onChange={(e) => {
                const v = e.target.value;
                setEditReleaseVersion(v);
                const match = releasesList.find(r => r.version === v && (r.platform || '').toLowerCase() === editReleasePlatform);
                setEditReleaseNotes(match?.releaseNotes || '');
              }}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="">Select version...</option>
              {releasesList
                .filter(r => (r.platform || '').toLowerCase() === editReleasePlatform)
                .map(r => (
                  <option key={`${r.platform}-${r.version}`} value={r.version}>{r.version}</option>
                ))}
            </select>
            <p className="text-xs text-text-tertiary mt-2">This updates the notes shown to users and stored alongside the archived release.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Release notes</label>
            <textarea
              value={editReleaseNotes}
              onChange={(e) => setEditReleaseNotes(e.target.value)}
              rows={6}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            />
          </div>
        </div>
        <div className="mt-4">
          <Button variant="secondary" onClick={saveReleaseNotes} disabled={isSavingReleaseNotes}>
            {isSavingReleaseNotes ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Notes
          </Button>
        </div>
      </Card>
    </div>
  );
}
