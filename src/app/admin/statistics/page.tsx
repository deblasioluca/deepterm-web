'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, Badge } from '@/components/ui';
import {
  Eye,
  Users,
  Globe2,
  MapPin,
  Loader2,
  Bot,
  ExternalLink,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { useAdminAI } from '@/components/admin/AdminAIContext';

// ── Types ────────────────────────────────────────────────────────────────────

interface StatsData {
  overview: {
    totalViews: number;
    uniqueVisitors: number;
    botCount: number;
    period: string;
    days: number;
  };
  topPages: { path: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
  topCountries: { countryCode: string; count: number }[];
  viewsByDay: { date: string; count: number }[];
  topCities: { city: string; countryCode: string; count: number }[];
  geoPoints: { lat: number; lon: number; countryCode: string; city: string; count: number }[];
  recentViews: {
    id: string;
    path: string;
    countryCode: string | null;
    city: string | null;
    referrer: string | null;
    isBot: boolean;
    createdAt: string;
  }[];
}

// ── Country code → flag emoji ────────────────────────────────────────────────

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return '';
  const offset = 0x1f1e6;
  const a = code.charCodeAt(0) - 65 + offset;
  const b = code.charCodeAt(1) - 65 + offset;
  return String.fromCodePoint(a, b);
}

// ── Country code → name (top 30 + fallback) ──────────────────────────────────

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', DE: 'Germany', GB: 'United Kingdom', FR: 'France',
  IT: 'Italy', ES: 'Spain', NL: 'Netherlands', CA: 'Canada', AU: 'Australia',
  JP: 'Japan', KR: 'South Korea', BR: 'Brazil', IN: 'India', CN: 'China',
  RU: 'Russia', SE: 'Sweden', NO: 'Norway', FI: 'Finland', DK: 'Denmark',
  CH: 'Switzerland', AT: 'Austria', PL: 'Poland', CZ: 'Czechia', PT: 'Portugal',
  BE: 'Belgium', IE: 'Ireland', NZ: 'New Zealand', MX: 'Mexico', AR: 'Argentina',
  ZA: 'South Africa', SG: 'Singapore', HK: 'Hong Kong', TW: 'Taiwan',
  IL: 'Israel', TR: 'Turkey', UA: 'Ukraine', RO: 'Romania', HU: 'Hungary',
};

function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

// ── Simple SVG world map (equirectangular projection) ────────────────────────

function WorldMap({ points }: { points: StatsData['geoPoints'] }) {
  const maxCount = Math.max(...points.map((p) => p.count), 1);

  // Equirectangular projection: lon → x, lat → y
  const project = (lat: number, lon: number): [number, number] => {
    const x = ((lon + 180) / 360) * 1000;
    const y = ((90 - lat) / 180) * 500;
    return [x, y];
  };

  return (
    <div className="relative w-full aspect-[2/1] bg-background-tertiary rounded-xl overflow-hidden">
      <svg viewBox="0 0 1000 500" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {[-60, -30, 0, 30, 60].map((lat) => {
          const [, y] = project(lat, 0);
          return <line key={`lat-${lat}`} x1="0" y1={y} x2="1000" y2={y} stroke="currentColor" strokeOpacity="0.08" />;
        })}
        {[-120, -60, 0, 60, 120].map((lon) => {
          const [x] = project(0, lon);
          return <line key={`lon-${lon}`} x1={x} y1="0" x2={x} y2="500" stroke="currentColor" strokeOpacity="0.08" />;
        })}

        {/* Equator */}
        <line x1="0" y1="250" x2="1000" y2="250" stroke="currentColor" strokeOpacity="0.15" strokeDasharray="4,4" />

        {/* Data points */}
        {points.map((point, i) => {
          const [x, y] = project(point.lat, point.lon);
          const size = 3 + (point.count / maxCount) * 12;
          const opacity = 0.3 + (point.count / maxCount) * 0.7;
          return (
            <g key={i}>
              {/* Glow */}
              <circle cx={x} cy={y} r={size * 2} fill="var(--accent-primary)" opacity={opacity * 0.15} />
              {/* Point */}
              <circle cx={x} cy={y} r={size} fill="var(--accent-primary)" opacity={opacity} />
              {/* Label on hover (via SVG title) */}
              <title>{`${point.city}, ${point.countryCode}: ${point.count} views`}</title>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      {points.length > 0 && (
        <div className="absolute bottom-3 right-3 bg-background-secondary/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-text-secondary">
          {points.length} locations
        </div>
      )}
      {points.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-text-tertiary">
          No geographic data yet
        </div>
      )}
    </div>
  );
}

// ── Time-series sparkline bar chart ──────────────────────────────────────────

function TimeSeriesChart({ data }: { data: StatsData['viewsByDay'] }) {
  if (!data.length) {
    return <div className="h-48 flex items-center justify-center text-text-secondary">No data yet</div>;
  }

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div>
      <div className="h-48 flex items-end gap-[2px]">
        {data.map((item, i) => {
          const pct = Math.max((item.count / max) * 100, 2);
          return (
            <div
              key={i}
              className="flex-1 bg-accent-primary/30 hover:bg-accent-primary/60 rounded-t transition-colors relative group cursor-default"
              style={{ height: `${pct}%` }}
            >
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-background-tertiary px-2 py-1 rounded text-xs text-text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                {item.count} views &middot; {item.date}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs text-text-tertiary">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AdminStatisticsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [showBots, setShowBots] = useState(false);

  const { setPageContext } = useAdminAI();
  useEffect(() => {
    setPageContext({
      page: 'Statistics',
      summary: `Web app traffic statistics for ${period}`,
      data: { period, overview: data?.overview ?? null },
    });
    return () => setPageContext(null);
  }, [data, period, setPageContext]);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/admin/statistics?period=${period}&bots=${showBots}`);
        if (res.ok) setData(await res.json());
      } catch (error) {
        console.error('Failed to fetch statistics:', error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [period, showBots]);

  const avgDailyViews = useMemo(() => {
    if (!data) return 0;
    const total = data.viewsByDay.reduce((s, d) => s + d.count, 0);
    return data.viewsByDay.length > 0 ? Math.round(total / data.viewsByDay.length) : 0;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  const o = data?.overview;

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Statistics</h1>
            <p className="text-text-secondary">Page views, visitors, and geographic distribution</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Bot toggle */}
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={showBots}
                onChange={(e) => setShowBots(e.target.checked)}
                className="rounded border-border"
              />
              <Bot className="w-4 h-4" />
              Include bots
            </label>

            {/* Period selector */}
            <div className="flex bg-background-tertiary rounded-lg p-1">
              {(['7d', '30d', '90d'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    period === p
                      ? 'bg-accent-primary text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Eye} color="blue" label="Page Views" value={o?.totalViews ?? 0} />
          <StatCard icon={Users} color="green" label="Unique Visitors" value={o?.uniqueVisitors ?? 0} />
          <StatCard icon={TrendingUp} color="purple" label="Avg Daily Views" value={avgDailyViews} />
          <StatCard icon={Bot} color="amber" label="Bot Requests" value={o?.botCount ?? 0} />
        </div>

        {/* World Map */}
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Globe2 className="w-5 h-5 text-accent-primary" />
              Visitor Origins
            </h2>
            <span className="text-sm text-text-secondary">
              {data?.topCountries?.length ?? 0} countries
            </span>
          </div>
          <WorldMap points={data?.geoPoints ?? []} />
        </Card>

        {/* Charts + Tables Row */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Page Views Over Time */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent-primary" />
              Views Over Time
            </h2>
            <TimeSeriesChart data={data?.viewsByDay ?? []} />
          </Card>

          {/* Top Pages */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-4">Top Pages</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data?.topPages?.length ? (
                data.topPages.map((page, i) => {
                  const maxViews = data.topPages[0]?.count ?? 1;
                  const pct = (page.count / maxViews) * 100;
                  return (
                    <div key={i} className="relative">
                      <div
                        className="absolute inset-0 bg-accent-primary/10 rounded"
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative flex items-center justify-between px-3 py-2">
                        <span className="text-sm text-text-primary font-mono truncate flex-1 mr-3">
                          {page.path}
                        </span>
                        <span className="text-sm font-medium text-text-secondary whitespace-nowrap">
                          {page.count.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-text-secondary text-center py-8">No data</p>
              )}
            </div>
          </Card>
        </div>

        {/* Countries + Referrers + Cities */}
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          {/* Top Countries */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Globe2 className="w-5 h-5" />
              Top Countries
            </h2>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {data?.topCountries?.length ? (
                data.topCountries.map((c, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{countryFlag(c.countryCode)}</span>
                      <span className="text-sm text-text-primary">{countryName(c.countryCode)}</span>
                    </div>
                    <Badge variant="secondary">{c.count}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-text-secondary text-center py-8">No data</p>
              )}
            </div>
          </Card>

          {/* Top Cities */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Top Cities
            </h2>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {data?.topCities?.length ? (
                data.topCities.map((c, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{countryFlag(c.countryCode)}</span>
                      <span className="text-sm text-text-primary">{c.city}</span>
                    </div>
                    <Badge variant="secondary">{c.count}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-text-secondary text-center py-8">No data</p>
              )}
            </div>
          </Card>

          {/* Top Referrers */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <ExternalLink className="w-5 h-5" />
              Top Referrers
            </h2>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {data?.topReferrers?.length ? (
                data.topReferrers.map((r, i) => {
                  let displayUrl = r.referrer;
                  try {
                    const url = new URL(r.referrer);
                    displayUrl = url.hostname + (url.pathname !== '/' ? url.pathname : '');
                  } catch {
                    // keep original
                  }
                  return (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-text-primary truncate flex-1 mr-3" title={r.referrer}>
                        {displayUrl}
                      </span>
                      <Badge variant="secondary">{r.count}</Badge>
                    </div>
                  );
                })
              ) : (
                <p className="text-text-secondary text-center py-8">No data</p>
              )}
            </div>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent-primary" />
            Recent Page Views
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="text-left py-2 px-3 font-medium">Page</th>
                  <th className="text-left py-2 px-3 font-medium">Location</th>
                  <th className="text-left py-2 px-3 font-medium">Referrer</th>
                  <th className="text-left py-2 px-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentViews?.length ? (
                  data.recentViews.map((view) => (
                    <tr key={view.id} className="border-b border-border/50 hover:bg-background-tertiary/50">
                      <td className="py-2 px-3 font-mono text-text-primary">{view.path}</td>
                      <td className="py-2 px-3 text-text-secondary whitespace-nowrap">
                        {view.countryCode ? (
                          <span>
                            {countryFlag(view.countryCode)}{' '}
                            {view.city ? `${view.city}, ` : ''}
                            {view.countryCode}
                          </span>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-text-secondary truncate max-w-[200px]" title={view.referrer ?? ''}>
                        {view.referrer ? (
                          (() => {
                            try {
                              return new URL(view.referrer).hostname;
                            } catch {
                              return view.referrer;
                            }
                          })()
                        ) : (
                          <span className="text-text-tertiary">direct</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-text-tertiary whitespace-nowrap">
                        {new Date(view.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-text-secondary">
                      No page views recorded yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  color,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className={`p-2.5 bg-${color}-500/10 rounded-xl`}>
          <Icon className={`w-5 h-5 text-${color}-500`} />
        </div>
        <div>
          <p className="text-xs text-text-secondary">{label}</p>
          <p className="text-xl font-bold text-text-primary">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {sub && <p className="text-[11px] text-text-tertiary">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}
