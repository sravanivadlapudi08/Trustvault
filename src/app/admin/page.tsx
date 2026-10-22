'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  Hash,
  Database,
  Lock,
  FileText,
  UserCheck,
  Code,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  BarChart3,
  Download,
  Users,
} from 'lucide-react';

interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  targetId: string;
  ipAddress: string;
  status: string;
  metadata: string | null;
  previousHash: string;
  currentHash: string;
  timestamp: string;
  documentTitle?: string;
  actorUser?: { id: string; name: string; email: string; role: string } | null;
  document?: { id: string; title: string; category: string; ownerId: string } | null;
  parsedMetadata?: any;
}

interface VerificationResult {
  isValid: boolean;
  totalRecords: number;
  genesisHash: string;
  latestHash?: string;
  corruptedAt?: number;
  corruptedRecordId?: string;
  reason?: string;
  details?: string;
}

interface ComplianceReport {
  summary: {
    totalAuditRecords: number;
    totalDocuments: number;
    totalUploads: number;
    totalDownloads: number;
    totalViews: number;
    totalPermissionGrants: number;
    totalPermissionRevokes: number;
    totalSecurityViolationsBlocked: number;
    activePermissionsCount: number;
  };
  documentAccessHistory: Array<{
    documentId: string;
    title: string;
    category: string;
    totalAccesses: number;
    downloads: number;
    views: number;
    shares: number;
    blockedProbes: number;
    uniqueUsersCount: number;
    lastAccessedAt: string | null;
  }>;
  downloadActivity: Array<{
    id: string;
    timestamp: string;
    actorName: string;
    actorEmail: string;
    actorRole: string;
    documentTitle: string;
    ipAddress: string;
    status: string;
  }>;
  userActivity: Array<{
    userId: string;
    name: string;
    email: string;
    role: string;
    totalEvents: number;
    downloads: number;
    views: number;
    shares: number;
    blocked: number;
    lastActive: string;
  }>;
}

const ACTION_OPTIONS = [
  'ALL',
  'DOCUMENT_VIEW',
  'DOCUMENT_DOWNLOAD_INITIATED',
  'DOCUMENT_UPLOAD',
  'PERMISSION_GRANT',
  'PERMISSION_REVOKE',
  'PERMISSION_DELEGATED_BY_ADMIN',
  'PERMISSION_REVOKED_BY_ADMIN',
  'UNAUTHORIZED_ACCESS_BLOCKED',
  'AI_PERMISSION_SUGGESTION_GENERATED',
  'AI_PERMISSION_CONFIRMED_BY_HUMAN',
  'AUTH_LOGIN_SUCCESS',
  'AUTH_LOGIN_FAILURE',
];

export default function AdminAuditPage() {
  const [user, setUser] = useState<{ id: string; email: string; name: string; role: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'audit' | 'reports'>('audit');

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [actionFilter, setActionFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // Cryptographic Verification State
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Reports State
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportTimeframe, setReportTimeframe] = useState<number>(30);

  useEffect(() => {
    fetchSession();
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const tabParam = p.get('tab');
      if (tabParam === 'reports') {
        setActiveTab('reports');
      } else if (tabParam === 'audit') {
        setActiveTab('audit');
      }
    }
  }, []);

  useEffect(() => {
    if (user) {
      if (activeTab === 'audit') {
        loadAuditLogs();
        handleVerifyChain();
      } else {
        loadReport();
      }
    }
  }, [user, activeTab, actionFilter, statusFilter, search, reportTimeframe]);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        // Allow both Administrator and Document Owner to inspect the Audit & Compliance Center
        if (data.user?.role !== 'admin' && data.user?.role !== 'owner') {
          window.location.href = '/dashboard';
          return;
        }
        setUser(data.user);
      } else {
        window.location.href = '/login';
      }
    } catch {
      window.location.href = '/login';
    }
  };

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter && actionFilter !== 'ALL') params.append('action', actionFilter);
      if (statusFilter && statusFilter !== 'ALL') params.append('status', statusFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/audit?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const res = await fetch('/api/audit/verify', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setVerificationResult(data.verification);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setVerifying(false);
    }
  };

  const loadReport = async () => {
    setLoadingReport(true);
    try {
      const res = await fetch(`/api/reports?days=${reportTimeframe}`);
      const data = await res.json();
      if (res.ok) {
        setReport(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReport(false);
    }
  };

  const blockedCount = logs.filter((l) => l.status === 'BLOCKED').length;
  const grantRevokeCount = logs.filter(
    (l) => l.action.includes('PERMISSION_')
  ).length;

  const getActionBadge = (action: string) => {
    if (action.includes('BLOCKED') || action.includes('FAILURE')) {
      return 'bg-rose-950/80 text-rose-300 border-rose-700/60';
    }
    if (action.includes('AI_')) {
      return 'bg-purple-950/80 text-purple-300 border-purple-700/60';
    }
    if (action.includes('PERMISSION_')) {
      return 'bg-blue-950/80 text-blue-300 border-blue-700/60';
    }
    if (action.includes('VIEW')) {
      return 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60';
    }
    if (action.includes('UPLOAD') || action.includes('SUCCESS')) {
      return 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60';
    }
    return 'bg-slate-900 text-slate-300 border-slate-700';
  };

  return (
    <div className="min-h-screen flex flex-col bg-shield-950">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Activity className="h-6 w-6 text-purple-400" />
              <h1 className="text-xl font-extrabold text-slate-100 tracking-tight">
                TrustVault Audit & Compliance Center
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Cryptographically chained append-only audit trail • Tamper-evident SHA-256 verification
            </p>
          </div>

          <div className="flex items-center space-x-2 self-start md:self-auto">
            <button
              onClick={handleVerifyChain}
              disabled={verifying}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-950 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${verifying ? 'animate-spin' : ''}`} />
              {verifying ? 'Calculating Chain Proofs...' : 'Verify Cryptographic Chain'}
            </button>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-800/90 pb-2">
          <button
            onClick={() => {
              setActiveTab('audit');
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set('tab', 'audit');
                window.history.pushState({}, '', url.toString());
              }
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 font-mono ${
              activeTab === 'audit'
                ? 'bg-purple-950/70 text-purple-300 border border-purple-700/60 shadow-lg shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Audit Trail & Hash Inspector ({logs.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('reports');
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set('tab', 'reports');
                window.history.pushState({}, '', url.toString());
              }
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 font-mono ${
              activeTab === 'reports'
                ? 'bg-blue-950/70 text-blue-300 border border-blue-700/60 shadow-lg shadow-blue-950/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
            }`}
          >
            <BarChart3 className="h-4 w-4 text-blue-400" />
            <span>Platform Activity Reports</span>
          </button>
        </div>

        {/* Cryptographic Proof Banner */}
        {verificationResult && (
          <div
            className={`p-4 rounded-xl border shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fadeIn ${
              verificationResult.isValid
                ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-200'
                : 'bg-rose-950/60 border-rose-600 text-rose-200'
            }`}
          >
            <div className="flex items-start space-x-3">
              {verificationResult.isValid ? (
                <ShieldCheck className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="h-6 w-6 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-bold text-sm tracking-tight flex items-center gap-2">
                  <span>
                    {verificationResult.isValid
                      ? 'Cryptographic Chain Integrity Verified (Tamper-Free)'
                      : 'SECURITY ALERT: AUDIT LOG TAMPERING DETECTED!'}
                  </span>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                    {verificationResult.totalRecords} Chained Blocks
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-mono">
                  {verificationResult.isValid
                    ? `Mathematical Proof Valid: Every row hash matches SHA-256(payload + previousHash) linked back to Genesis Block 00000000...`
                    : `Corruption detected at Row #${verificationResult.corruptedAt} (${verificationResult.corruptedRecordId}): ${verificationResult.reason}`}
                </p>
                {verificationResult.latestHash && (
                  <div className="text-[10px] font-mono text-slate-400 truncate max-w-xl">
                    Head Chain Hash: <span className="text-emerald-400">{verificationResult.latestHash}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="text-right text-[11px] font-mono shrink-0">
              <span className="text-slate-400">Status: </span>
              <span className={verificationResult.isValid ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {verificationResult.isValid ? '100% IMMUTABLE' : 'CHAIN COMPROMISED'}
              </span>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: AUDIT LOGS & COMPLIANCE                                           */}
        {/* ========================================================================= */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-shield-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center justify-between">
                  <span>Total Audit Records</span>
                  <Database className="h-4 w-4 text-purple-400" />
                </div>
                <div className="text-2xl font-extrabold text-slate-100 font-mono mt-1">{logs.length}</div>
                <div className="text-[10px] text-slate-500 mt-1">Append-only cryptographic rows</div>
              </div>

              <div className="bg-shield-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center justify-between">
                  <span>Security Violations Blocked</span>
                  <ShieldAlert className="h-4 w-4 text-rose-400" />
                </div>
                <div className="text-2xl font-extrabold text-rose-400 font-mono mt-1">{blockedCount}</div>
                <div className="text-[10px] text-slate-500 mt-1">IDOR, unauth probes & bad logins</div>
              </div>

              <div className="bg-shield-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center justify-between">
                  <span>Permission Lifecycle Events</span>
                  <UserCheck className="h-4 w-4 text-blue-400" />
                </div>
                <div className="text-2xl font-extrabold text-blue-400 font-mono mt-1">{grantRevokeCount}</div>
                <div className="text-[10px] text-slate-500 mt-1">Grants, revokes & AI confirmations</div>
              </div>

              <div className="bg-shield-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center justify-between">
                  <span>Zero-Leak Status</span>
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-extrabold text-emerald-400 font-mono mt-1">ENFORCED</div>
                <div className="text-[10px] text-slate-500 mt-1">Server-side live authorization</div>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-shield-900 border border-slate-800/80 rounded-xl p-4 shadow-xl flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="flex flex-1 flex-wrap gap-2.5 items-center w-full">
                {/* Search */}
                <div className="relative min-w-[200px] flex-1">
                  <Search className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search actor, document, metadata..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* Action Filter */}
                <div className="flex items-center space-x-1.5">
                  <Filter className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    {ACTION_OPTIONS.map((act) => (
                      <option key={act} value={act}>
                        Action: {act}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  <option value="ALL">Status: All</option>
                  <option value="SUCCESS">Status: SUCCESS</option>
                  <option value="BLOCKED">Status: BLOCKED</option>
                  <option value="FAILURE">Status: FAILURE</option>
                </select>
              </div>

              <button
                onClick={loadAuditLogs}
                className="text-xs text-slate-400 hover:text-purple-400 flex items-center gap-1 transition-colors self-end md:self-auto"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {/* Audit Log Table */}
            <div className="bg-shield-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-purple-400" />
                  Chained Audit Trail Entries ({logs.length})
                </h2>
                <span className="text-[11px] text-slate-500 font-mono">
                  Click any row to inspect cryptographic hash linkage
                </span>
              </div>

              {loading ? (
                <div className="p-12 text-center text-xs text-slate-400 font-mono animate-pulse">
                  Loading cryptographic audit logs...
                </div>
              ) : logs.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 font-mono">
                  No audit logs found matching criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Date & Time</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Actor</th>
                        <th className="py-3 px-4">Document / Resource</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">IP Address</th>
                        <th className="py-3 px-4 text-right">Chain Inspector</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 font-mono">
                      {logs.map((log) => {
                        const isExpanded = expandedLogId === log.id;
                        const actor = log.actorUser;
                        const actorDisplay = actor
                          ? `${actor.name} (${actor.email})`
                          : log.actorId === 'ANONYMOUS'
                          ? 'Anonymous Probe'
                          : log.actorId;

                        return (
                          <React.Fragment key={log.id}>
                            <tr
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                                isExpanded ? 'bg-slate-800/60' : ''
                              }`}
                            >
                              <td className="py-3 px-4 whitespace-nowrap text-slate-400">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${getActionBadge(
                                    log.action
                                  )}`}
                                >
                                  {log.action}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-200 truncate max-w-[150px]" title={actorDisplay}>
                                <div className="truncate">{actorDisplay}</div>
                                {actor && (
                                  <span className="text-[9px] uppercase px-1 rounded bg-slate-900 border border-slate-800 text-slate-400">
                                    {actor.role}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-slate-300 max-w-[180px] truncate" title={log.documentTitle || log.targetId}>
                                <div className="font-sans font-semibold text-white truncate">{log.documentTitle || log.targetId}</div>
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                    log.status === 'SUCCESS'
                                      ? 'text-emerald-400 bg-emerald-950/60'
                                      : 'text-rose-400 bg-rose-950/60'
                                  }`}
                                >
                                  {log.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-400">{log.ipAddress}</td>
                              <td className="py-3 px-4 text-right text-slate-400">
                                <button
                                  type="button"
                                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center justify-end gap-1 ml-auto"
                                >
                                  <span>{isExpanded ? 'Hide Hashes' : 'Inspect'}</span>
                                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </button>
                              </td>
                            </tr>

                            {/* Expanded Cryptographic Hash & Metadata Inspector */}
                            {isExpanded && (
                              <tr className="bg-slate-950/90 text-xs">
                                <td colSpan={7} className="p-4 space-y-3 border-y border-purple-900/40">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Hashes */}
                                    <div className="space-y-1.5 bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                                      <div className="text-[10px] uppercase text-purple-400 font-bold flex items-center gap-1">
                                        <Hash className="h-3 w-3" />
                                        Cryptographic Linkage
                                      </div>
                                      <div className="space-y-1 text-[11px]">
                                        <div>
                                          <span className="text-slate-400">Previous Hash (N-1):</span>
                                          <div className="font-mono text-slate-300 break-all select-all bg-slate-950 p-1 rounded mt-0.5 border border-slate-800/80">
                                            {log.previousHash}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-slate-400">Current Hash (N):</span>
                                          <div className="font-mono text-emerald-400 font-bold break-all select-all bg-slate-950 p-1 rounded mt-0.5 border border-slate-800/80">
                                            {log.currentHash}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Context Metadata */}
                                    <div className="space-y-1.5 bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                                      <div className="text-[10px] uppercase text-purple-400 font-bold flex items-center gap-1">
                                        <Code className="h-3 w-3" />
                                        Audit Context Metadata
                                      </div>
                                      <pre className="text-[11px] text-slate-300 bg-slate-950 p-2 rounded border border-slate-800/80 overflow-x-auto max-h-32">
                                        {log.metadata ? JSON.stringify(JSON.parse(log.metadata), null, 2) : 'No extra metadata'}
                                      </pre>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PLATFORM REPORTS                                                  */}
        {/* ========================================================================= */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                  System-Wide Activity & Access Reports
                </h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Aggregate download activity, document access history, and user interactions
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={reportTimeframe}
                  onChange={(e) => setReportTimeframe(parseInt(e.target.value, 10))}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={30}>Last 30 Days</option>
                  <option value={90}>Last 90 Days</option>
                </select>

                <button
                  onClick={loadReport}
                  disabled={loadingReport}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-950 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingReport ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            {loadingReport ? (
              <div className="p-12 text-center text-xs text-slate-400 font-mono animate-pulse">
                Generating global reports from database...
              </div>
            ) : !report ? (
              <div className="p-12 text-center text-xs text-slate-400 font-mono">
                No report data available.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-shield-900 border border-slate-800 rounded-xl p-3 shadow-md">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Total Records</span>
                    <div className="text-xl font-bold font-mono text-slate-100 mt-1">{report.summary.totalAuditRecords}</div>
                  </div>
                  <div className="bg-shield-900 border border-slate-800 rounded-xl p-3 shadow-md">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Total Documents</span>
                    <div className="text-xl font-bold font-mono text-slate-100 mt-1">{report.summary.totalDocuments}</div>
                  </div>
                  <div className="bg-shield-900 border border-slate-800 rounded-xl p-3 shadow-md">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Total Downloads</span>
                    <div className="text-xl font-bold font-mono text-blue-400 mt-1">{report.summary.totalDownloads}</div>
                  </div>
                  <div className="bg-shield-900 border border-slate-800 rounded-xl p-3 shadow-md">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Total Views</span>
                    <div className="text-xl font-bold font-mono text-cyan-400 mt-1">{report.summary.totalViews}</div>
                  </div>
                  <div className="bg-shield-900 border border-slate-800 rounded-xl p-3 shadow-md">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Active Delegations</span>
                    <div className="text-xl font-bold font-mono text-purple-400 mt-1">{report.summary.activePermissionsCount}</div>
                  </div>
                  <div className="bg-shield-900 border border-slate-800 rounded-xl p-3 shadow-md">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Violations Blocked</span>
                    <div className="text-xl font-bold font-mono text-rose-400 mt-1">{report.summary.totalSecurityViolationsBlocked}</div>
                  </div>
                </div>

                {/* Document Access History */}
                <div className="bg-shield-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-emerald-400" />
                      Document Access Summary ({report.documentAccessHistory.length})
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Document Title</th>
                          <th className="py-3 px-4">Category</th>
                          <th className="py-3 px-4">Total Accesses</th>
                          <th className="py-3 px-4">Downloads</th>
                          <th className="py-3 px-4">Views</th>
                          <th className="py-3 px-4">Unique Users</th>
                          <th className="py-3 px-4">Last Accessed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 font-mono">
                        {report.documentAccessHistory.map((d) => (
                          <tr key={d.documentId} className="hover:bg-slate-800/30">
                            <td className="py-3 px-4 font-sans font-bold text-white max-w-[220px] truncate">{d.title}</td>
                            <td className="py-3 px-4">{d.category}</td>
                            <td className="py-3 px-4 font-bold text-slate-100">{d.totalAccesses}</td>
                            <td className="py-3 px-4 text-blue-400">{d.downloads}</td>
                            <td className="py-3 px-4 text-cyan-400">{d.views}</td>
                            <td className="py-3 px-4 text-slate-300">{d.uniqueUsersCount}</td>
                            <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                              {d.lastAccessedAt ? new Date(d.lastAccessedAt).toLocaleString() : 'Never'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* User Activity */}
                <div className="bg-shield-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                      <Users className="h-4 w-4 text-purple-400" />
                      User Engagement ({report.userActivity.length})
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">User</th>
                          <th className="py-3 px-4">Email</th>
                          <th className="py-3 px-4">Role</th>
                          <th className="py-3 px-4">Total Events</th>
                          <th className="py-3 px-4">Downloads</th>
                          <th className="py-3 px-4">Views</th>
                          <th className="py-3 px-4">Last Active</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 font-mono">
                        {report.userActivity.map((u) => (
                          <tr key={u.userId} className="hover:bg-slate-800/30">
                            <td className="py-3 px-4 font-sans font-bold text-white">{u.name}</td>
                            <td className="py-3 px-4 text-slate-400">{u.email}</td>
                            <td className="py-3 px-4">
                              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                                {u.role}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-100">{u.totalEvents}</td>
                            <td className="py-3 px-4 text-blue-400">{u.downloads}</td>
                            <td className="py-3 px-4 text-cyan-400">{u.views}</td>
                            <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                              {new Date(u.lastActive).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
