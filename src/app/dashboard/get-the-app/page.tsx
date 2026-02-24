'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Card,
  Button,
  Badge,
  Modal,
} from '@/components/ui';
import {
  Apple,
  Download,
  CheckCircle,
  FileText,
  Clock,
  HardDrive,
} from 'lucide-react';

interface DownloadInfo {
  version: string;
  size: string;
  lastModified: string;
  exists: boolean;
  downloadUrl?: string;
}

type Release = {
  platform: string;
  version: string;
  releaseNotes: string;
  filePath: string;
  fileFilename: string;
  sizeBytes: number | null;
  publishedAt: string;
};

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function GetTheAppPage() {
  const [downloadInfo, setDownloadInfo] = useState<Record<string, DownloadInfo>>({});
  const [releases, setReleases] = useState<Release[]>([]);
  const [notesModalRelease, setNotesModalRelease] = useState<Release | null>(null);

  useEffect(() => {
    async function fetchDownloadInfo() {
      try {
        const response = await fetch('/api/downloads/info');
        if (response.ok) {
          const data = await response.json();
          setDownloadInfo(data);
        }

        const releasesRes = await fetch('/api/downloads/releases');
        if (releasesRes.ok) {
          const data = await releasesRes.json();
          setReleases((data?.releases || []) as Release[]);
        }
      } catch (error) {
        console.error('Failed to fetch download info:', error);
      }
    }
    fetchDownloadInfo();
  }, []);

  const closeNotesModal = useCallback(() => setNotesModalRelease(null), []);

  // Filter to macOS releases, sorted newest first (API already returns this order)
  const macReleases = releases.filter(
    (r) => (r.platform || '').toLowerCase() === 'macos'
  );

  const latestRelease = macReleases[0] ?? null;

  // Merge static platform info with dynamic download info
  const macInfo = downloadInfo['macOS'];
  const currentVersion = macInfo?.version || latestRelease?.version || '-';
  const currentSize = macInfo?.size || formatSize(latestRelease?.sizeBytes ?? null) || '-';
  const downloadUrl = macInfo?.downloadUrl || '/downloads/DeepTerm.dmg';
  const isAvailable = macInfo?.exists ?? true;

  return (
    <div className="max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            Get the App
          </h1>
          <p className="text-text-secondary">
            Download DeepTerm for your platform
          </p>
        </div>

        {/* Sync Info */}
        <Card className="mb-8 bg-gradient-to-r from-accent-primary/10 to-accent-secondary/10 border-accent-primary/30">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent-primary/20 rounded-xl">
              <CheckCircle className="w-6 h-6 text-accent-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary mb-1">
                Seamless Sync
              </h3>
              <p className="text-text-secondary">
                Your hosts, credentials, and preferences sync automatically
                across all your devices with end-to-end encryption.
              </p>
            </div>
          </div>
        </Card>

        {/* Latest Version Card */}
        <Card className="border-accent-primary/50 bg-gradient-to-br from-accent-primary/5 to-transparent">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent-primary/20">
                <Apple className="w-6 h-6 text-accent-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-text-primary">
                    DeepTerm for macOS
                  </h3>
                  <Badge variant="primary" className="text-xs">
                    Latest
                  </Badge>
                </div>
                <p className="text-sm text-text-tertiary">
                  v{currentVersion} &middot; {currentSize}
                </p>
              </div>
            </div>
          </div>

          <p className="text-text-secondary mb-4">
            Native SwiftUI app for Apple Silicon Macs (M1/M2/M3)
          </p>

          <div className="space-y-2 mb-4">
            {['Native Apple Silicon performance', 'Touch Bar support', 'Keychain integration'].map(
              (feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-3.5 h-3.5 text-accent-secondary" />
                  <span className="text-text-secondary">{feature}</span>
                </div>
              )
            )}
          </div>

          <p className="text-xs text-text-tertiary mb-4">
            Requires: Apple Silicon Mac (M1/M2/M3), macOS 12.0 or later
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <a href={isAvailable ? downloadUrl : undefined} className="flex-1">
              <Button
                variant={isAvailable ? 'primary' : 'secondary'}
                className={`w-full ${!isAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!isAvailable}
              >
                <Download className="w-4 h-4 mr-2" />
                {isAvailable ? 'Download for macOS' : 'Coming Soon'}
              </Button>
            </a>

            {latestRelease && (
              <Button
                variant="secondary"
                onClick={() => setNotesModalRelease(latestRelease)}
              >
                <FileText className="w-4 h-4 mr-2" />
                Release Notes
              </Button>
            )}
          </div>
        </Card>

        {/* Version History */}
        <Card className="mt-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-text-primary">
              Version History
            </h2>
            <p className="text-sm text-text-secondary">
              Download previous versions or view their release notes
            </p>
          </div>

          {macReleases.length > 0 ? (
            <div className="space-y-3">
              {macReleases.map((rel, idx) => (
                <div
                  key={`${rel.platform}-${rel.version}`}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg ${
                    idx === 0
                      ? 'bg-accent-primary/5 border border-accent-primary/20'
                      : 'bg-background-tertiary'
                  }`}
                >
                  {/* Version info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary">
                          v{rel.version}
                        </span>
                        {idx === 0 && (
                          <Badge variant="primary" className="text-xs">
                            Current
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-tertiary mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(rel.publishedAt)}
                        </span>
                        {rel.sizeBytes ? (
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-3 h-3" />
                            {formatSize(rel.sizeBytes)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {rel.releaseNotes ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setNotesModalRelease(rel)}
                      >
                        <FileText className="w-4 h-4 mr-1.5" />
                        Notes
                      </Button>
                    ) : null}
                    <a href={rel.filePath} download>
                      <Button variant="secondary" size="sm">
                        <Download className="w-4 h-4 mr-1.5" />
                        Download
                      </Button>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">
              No releases available yet.
            </p>
          )}
        </Card>

        {/* CLI Tool */}
        <Card className="mt-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-2.5 bg-background-tertiary rounded-xl">
              <Apple className="w-6 h-6 text-text-secondary" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">DeepTerm CLI</h3>
              <p className="text-sm text-text-secondary">
                Command-line tool for automation and scripting
              </p>
            </div>
          </div>

          <div className="p-4 bg-background-primary rounded-lg font-mono text-sm mb-4">
            <p className="text-text-tertiary mb-2"># Install via Homebrew</p>
            <p className="text-accent-secondary">brew install deepterm</p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary">v1.2.0</Badge>
            <span className="text-sm text-text-tertiary">
              Apple Silicon Macs (M1/M2/M3) only
            </span>
          </div>
        </Card>
      </motion.div>

      {/* Release Notes Modal */}
      <Modal
        isOpen={notesModalRelease !== null}
        onClose={closeNotesModal}
        title={
          notesModalRelease
            ? `Release Notes — v${notesModalRelease.version}`
            : 'Release Notes'
        }
        description={
          notesModalRelease
            ? formatDate(notesModalRelease.publishedAt)
            : undefined
        }
        size="lg"
      >
        {notesModalRelease && (
          <div>
            {notesModalRelease.releaseNotes ? (
              <pre className="whitespace-pre-wrap text-sm text-text-secondary bg-background-tertiary rounded-lg p-4 max-h-[60vh] overflow-y-auto">
                {notesModalRelease.releaseNotes}
              </pre>
            ) : (
              <p className="text-text-tertiary text-sm">
                No release notes provided for this version.
              </p>
            )}

            <div className="flex justify-end mt-6">
              <a href={notesModalRelease.filePath} download>
                <Button variant="primary">
                  <Download className="w-4 h-4 mr-2" />
                  Download v{notesModalRelease.version}
                  {notesModalRelease.sizeBytes
                    ? ` (${formatSize(notesModalRelease.sizeBytes)})`
                    : ''}
                </Button>
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
