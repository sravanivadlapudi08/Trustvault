'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import UploadModal from '@/components/UploadModal';
import PermissionModal from '@/components/PermissionModal';
import DocumentViewModal from '@/components/DocumentViewModal';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  Download,
  Lock,
  Users,
  Upload,
  Calendar,
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  RefreshCw,
  Eye,
  Key,
  ShieldX,
  Share2,
  History,
  BarChart3,
  Hash,
  Code,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  UserCheck,
  Database,
  Tag,
  HardDrive,
  Activity,
} from 'lucide-react';

interface DocumentItem {
  id: string;
  title: string;
  category: string;
  fileSize: number;
  mimeType: string;
  ownerId: string;
  createdAt: string;
  owner: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  permissions: Array<{
    id: string;
    userId: string;
    canRead: boolean;
    canDownload: boolean;
    canEdit: boolean;
    canShare: boolean;
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
    };
  }>;
}

interface AuditLogItem {
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
    actionCounts: Record<string, number>;
  };
  timeline: Array<{ date: string; uploads: number; downloads: number; views: number; blocked: number; total: number }>;
  documentAccessHistory: Array<{
    documentId: string;
    title: string;
    category: string;
    fileSize: number;
    createdAt: string;
    totalAccesses: number;
    downloads: number;
    views: number;
    shares: number;
    blockedProbes: number;
    uniqueUsersCount: number;
    lastAccessedAt: string | null;
    recentLogs: Array<{ action: string; actorName: string; timestamp: string; status: string }>;
  }>;
  downloadActivity: Array<{
    id: string;
    timestamp: string;
    actorId: string;
    actorName: string;
    actorEmail: string;
    actorRole: string;
    documentId: string;
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
  compliance: {
    cryptographicChain: VerificationResult;
    blockedViolations: number;
    activeDelegations: number;
    zeroLeakStatus: string;
  };
}

const CATEGORIES = ['All', 'Finance', 'Security', 'Legal', 'Engineering', 'Executive', 'General'];

const AUDIT_ACTIONS = [
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
];

export default function DashboardPage() {
  const [user, setUser] = useState<{ id: string; email: string; name: string; role: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'documents' | 'audit' | 'compliance' | 'reports'>('documents');

  // Redirect legacy or external ?tab query params to unified Audit & Compliance Center
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const tabParam = p.get('tab');
      if (tabParam === 'audit' || tabParam === 'compliance') {
        window.location.href = '/admin';
      } else if (tabParam === 'reports') {
        window.location.href = '/admin?tab=reports';
      }
    }
  }, []);

  // Documents state
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals
  const [uploadOpen, setUploadOpen] = useState(false);
  const [permissionDoc, setPermissionDoc] = useState<DocumentItem | null>(null);
  const [viewDoc, setViewDoc] = useState<DocumentItem | null>(null);

  // Downloads & IDOR test state
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [activeDownload, setActiveDownload] = useState<{
    docId: string;
    url: string;
    expiresIn: number;
    title: string;
  } | null>(null);
  const [idorFeedback, setIdorFeedback] = useState<{ type: 'blocked' | 'success'; message: string } | null>(null);

  // Audit Logs state (for Owner)
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditAction, setAuditAction] = useState('ALL');
  const [auditStatus, setAuditStatus] = useState('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Compliance state (for Owner)
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);

  // Reports state (for Owner)
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportTimeframe, setReportTimeframe] = useState<number>(30);

  useEffect(() => {
    fetchSession();
  }, []);

  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user, search, category, startDate, endDate]);

  useEffect(() => {
    if (user && user.role === 'owner') {
      if (activeTab === 'audit') {
        loadAuditLogs();
      } else if (activeTab === 'compliance') {
        handleVerifyChain();
      } else if (activeTab === 'reports') {
        loadReports();
      }
    }
  }, [user, activeTab, auditAction, auditStatus, auditSearch, reportTimeframe]);

  // Countdown timer for 60s short-lived presigned URL
  useEffect(() => {
    if (!activeDownload) return;
    const interval = setInterval(() => {
      setActiveDownload((prev) => {
        if (!prev) return null;
        if (prev.expiresIn <= 1) {
          return null; // Expired
        }
        return { ...prev, expiresIn: prev.expiresIn - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeDownload]);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        window.location.href = '/login';
      }
    } catch {
      window.location.href = '/login';
    }
  };

  const loadDocuments = async () => {
    setLoadingDocs(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (category && category !== 'All') params.append('category', category);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetch(`/api/documents?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const loadAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      const params = new URLSearchParams();
      if (auditAction && auditAction !== 'ALL') params.append('action', auditAction);
      if (auditStatus && auditStatus !== 'ALL') params.append('status', auditStatus);
      if (auditSearch) params.append('search', auditSearch);

      const res = await fetch(`/api/audit?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifyingChain(true);
    try {
      const res = await fetch('/api/audit/verify', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setVerificationResult(data.verification);
      }
    } catch (err) {
      console.error('Failed to verify chain:', err);
    } finally {
      setVerifyingChain(false);
    }
  };

  const loadReports = async () => {
    setLoadingReport(true);
    try {
      const res = await fetch(`/api/reports?days=${reportTimeframe}`);
      const data = await res.json();
      if (res.ok) {
        setReport(data);
      }
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleDownload = async (doc: DocumentItem) => {
    setDownloadingDocId(doc.id);
    setIdorFeedback(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}/download`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Download failed (Access Denied)');
      }

      setActiveDownload({
        docId: doc.id,
        url: data.downloadUrl,
        expiresIn: data.expiresIn || 60,
        title: doc.title,
      });

      const a = document.createElement('a');
      a.href = data.downloadUrl;
      a.download = doc.title;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      setIdorFeedback({
        type: 'blocked',
        message: err.message,
      });
    } finally {
      setDownloadingDocId(null);
    }
  };

  const handleSimulateIdorAttack = async () => {
    setIdorFeedback(null);
    try {
      const targetId = 'doc-classified-keys-or-arbitrary-uuid-idor-target';
      const res = await fetch(`/api/documents/${targetId}/download`);

      if (!res.ok) {
        setIdorFeedback({
          type: 'blocked',
          message: `Zero-Leak Security Boundary Verified: Server blocked unauthorized IDOR access attempt on ${targetId}. Status: ${res.status} Forbidden. Incident recorded to cryptographic audit chain!`,
        });
      } else {
        setIdorFeedback({
          type: 'success',
          message: 'Warning: Request unexpectedly succeeded.',
        });
      }
    } catch (err: any) {
      setIdorFeedback({
        type: 'blocked',
        message: 'Security Guard Enforced: ' + err.message,
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

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

  const switchTab = (tab: 'documents' | 'audit' | 'compliance' | 'reports') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.pushState({}, '', url.toString());
    }
  };

  const isOwner = user?.role === 'owner';

  return (
    <div className="min-h-screen flex flex-col bg-shield-950">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        {/* Security Architecture Posture Banner */}
        <div className="bg-shield-900/90 border border-slate-800 rounded-xl p-4 shadow-xl grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
          <div className="flex items-center space-x-3 p-2 bg-slate-950/60 rounded-lg border border-slate-800/80">
            <div className="h-8 w-8 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Owner Control</div>
              <div className="text-emerald-400 font-bold">Explicit Zero-Trust</div>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-2 bg-slate-950/60 rounded-lg border border-slate-800/80">
            <div className="h-8 w-8 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Instant Revocation</div>
              <div className="text-emerald-400 font-bold">Zero Cached Tokens</div>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-2 bg-slate-950/60 rounded-lg border border-slate-800/80">
            <div className="h-8 w-8 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Admin Access</div>
              <div className="text-purple-400 font-bold">Requires Owner Approval</div>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-2 bg-slate-950/60 rounded-lg border border-slate-800/80">
            <div className="h-8 w-8 rounded-md bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Audit Immutability</div>
              <div className="text-purple-400 font-bold">SHA-256 Hash Chained</div>
            </div>
          </div>
        </div>

        {/* Owner Command Center Navigation Tabs (Only for Owner) */}
        {isOwner && (
          <div className="flex items-center space-x-2 border-b border-slate-800/90 pb-2 overflow-x-auto">
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 font-mono bg-slate-800 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-950/50"
            >
              <FileText className="h-4 w-4" />
              <span>Vault Documents ({documents.length})</span>
            </Link>

            <Link
              href="/admin"
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 font-mono bg-purple-950/70 text-purple-300 border border-purple-700/60 shadow-lg shadow-purple-950/50 hover:bg-purple-900/80 hover:text-white"
              title="Open full interactive Audit & Compliance Center"
            >
              <Activity className="h-4 w-4 text-purple-400" />
              <span>Audit & Compliance Center</span>
            </Link>

            <Link
              href="/admin?tab=audit"
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 font-mono text-slate-400 hover:text-purple-300 hover:bg-slate-900 border border-transparent"
              title="Inspect cryptographic audit logs"
            >
              <History className="h-4 w-4 text-purple-400" />
              <span>Audit Logs</span>
            </Link>

            <Link
              href="/admin?tab=audit"
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 font-mono text-slate-400 hover:text-emerald-300 hover:bg-slate-900 border border-transparent"
              title="Verify cryptographic SHA-256 chain immutability"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Compliance & Verification</span>
            </Link>

            <Link
              href="/admin?tab=reports"
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 font-mono text-slate-400 hover:text-blue-300 hover:bg-slate-900 border border-transparent"
              title="View document activity and user reports"
            >
              <BarChart3 className="h-4 w-4 text-blue-400" />
              <span>Reports & Activity</span>
            </Link>
          </div>
        )}

        {/* Active Presigned URL Expiration Countdown Banner */}
        {activeDownload && (
          <div className="p-3 bg-emerald-950/70 border border-emerald-600/60 rounded-xl text-xs flex items-center justify-between text-emerald-200 animate-fadeIn">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-emerald-400 animate-pulse" />
              <span>
                Presigned download token generated for <strong className="text-white">{activeDownload.title}</strong>.
                Expiring in <span className="font-mono text-emerald-300 font-bold">{activeDownload.expiresIn} seconds</span>.
              </span>
            </div>
            <a
              href={activeDownload.url}
              download
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
            >
              <Download className="h-3 w-3" />
              Re-download ({activeDownload.expiresIn}s left)
            </a>
          </div>
        )}

        {/* IDOR / Violation Feedback Banner */}
        {idorFeedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-start space-x-2 animate-fadeIn ${
              idorFeedback.type === 'blocked'
                ? 'bg-rose-950/70 border border-rose-800 text-rose-200'
                : 'bg-emerald-950/70 border border-emerald-800 text-emerald-200'
            }`}
          >
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="space-y-0.5">
              <div className="font-semibold text-rose-300">Security Guard Response:</div>
              <div>{idorFeedback.message}</div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: VAULT DOCUMENTS VIEW                                               */}
        {/* ========================================================================= */}
        {activeTab === 'documents' && (
          <div className="space-y-6">
            {/* Search, Filter & Action Toolbar */}
            <div className="bg-shield-900 border border-slate-800/80 rounded-xl p-4 shadow-xl flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="flex flex-1 flex-wrap gap-2.5 items-center w-full">
                {/* Search Input */}
                <div className="relative min-w-[220px] flex-1">
                  <Search className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search authorized documents..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Category Filter */}
                <div className="flex items-center space-x-1.5">
                  <Filter className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        Category: {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Filters */}
                <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    title="Start Date"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    title="End Date"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 shrink-0 w-full md:w-auto justify-end">
                <button
                  onClick={handleSimulateIdorAttack}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/70 transition-colors flex items-center gap-1.5"
                  title="Test IDOR: Probes an unauthorized document ID to demonstrate 403 Forbidden enforcement"
                >
                  <ShieldX className="h-3.5 w-3.5 text-rose-400" />
                  Test IDOR Probe
                </button>

                {isOwner && (
                  <button
                    onClick={() => setUploadOpen(true)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950 transition-all flex items-center gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Deposit Document
                  </button>
                )}
              </div>
            </div>

            {/* Document Listings */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-emerald-400" />
                  Authorized Vault Files ({documents.length})
                </h2>
                <button
                  onClick={loadDocuments}
                  className="text-xs text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingDocs ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {loadingDocs ? (
                <div className="p-12 text-center text-xs text-slate-400 font-mono animate-pulse">
                  Querying live database-backed authorization engine...
                </div>
              ) : documents.length === 0 ? (
                <div className="p-12 bg-shield-900 border border-slate-800 rounded-xl text-center space-y-3">
                  <div className="inline-flex p-3 rounded-full bg-slate-950 border border-slate-800 text-slate-400">
                    <Lock className="h-6 w-6 text-emerald-500/70" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-200">
                    {user?.role === 'admin' ? 'No Owner-Authorized Documents' : 'Zero-Leak Boundary Enforced'}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    {user?.role === 'admin' ? (
                      <>
                        <strong className="text-purple-300">Strict Zero-Trust Enforced:</strong> As an Administrator,
                        you do not automatically receive access to private documents. A Document Owner must explicitly
                        authorize your account through the access management portal.
                      </>
                    ) : (
                      <>
                        No documents match your query or have been explicitly granted to your account.
                        Per <strong className="text-slate-300">Rule One</strong>, private documents remain strictly invisible
                        without explicit Owner authorization.
                      </>
                    )}
                  </p>
                  {user?.role !== 'owner' && (
                    <div className="pt-2">
                      <span className="text-[11px] font-mono bg-slate-950 px-3 py-1 rounded border border-slate-800 text-slate-400">
                        Switch to "Owner" (Sravani Vadlapudi) using the top bar to deposit documents and delegate access.
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {documents.map((doc) => {
                    const isDocOwner = user?.id === doc.ownerId;
                    const userPerm = doc.permissions.find((p) => p.userId === user?.id);
                    const isDelegatedAdmin = user?.role === 'admin' && Boolean(userPerm?.canShare);
                    const canManage = isDocOwner || isDelegatedAdmin;

                    const authorizedAdmins = doc.permissions.filter((p) => p.user.role === 'admin');
                    const authorizedViewers = doc.permissions.filter((p) => p.user.role !== 'admin');

                    return (
                      <div
                        key={doc.id}
                        className="bg-shield-900/90 border border-slate-800 hover:border-slate-700/80 rounded-xl p-4 shadow-xl flex flex-col justify-between space-y-4 transition-all hover:shadow-2xl"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-slate-950 text-slate-300 border border-slate-800">
                              {doc.category}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              {formatFileSize(doc.fileSize)}
                            </span>
                          </div>

                          <h3 className="text-sm font-bold text-slate-100 line-clamp-2" title={doc.title}>
                            {doc.title}
                          </h3>

                          <div className="text-[11px] text-slate-400 space-y-0.5 font-mono">
                            <div>Owner: <span className="text-slate-300 font-semibold">{doc.owner.name}</span></div>
                            <div className="text-[10px] text-slate-500">
                              Vaulted: {new Date(doc.createdAt).toLocaleDateString()}
                            </div>
                          </div>

                          {/* Clear Role / Clearance Badges */}
                          <div className="pt-1 flex flex-wrap gap-1.5 text-[10px] font-mono">
                            {isDocOwner ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                                ★ DOCUMENT OWNER
                              </span>
                            ) : user?.role === 'admin' ? (
                              <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1">
                                <Key className="h-3 w-3" />
                                {userPerm?.canShare ? 'ADMIN: DELEGATION AUTHORIZED' : 'ADMIN: READ ONLY'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                                VIEWER ACCESS
                              </span>
                            )}
                          </div>

                          {/* Active Delegations Pill */}
                          {isDocOwner && (
                            <div className="pt-1 text-[11px] text-slate-400 space-y-1">
                              <div className="flex items-center space-x-1.5">
                                <Key className="h-3 w-3 text-purple-400" />
                                <span>
                                  {authorizedAdmins.length === 0
                                    ? 'No Admins Authorized'
                                    : `${authorizedAdmins.length} Admin(s) Authorized`}
                                </span>
                              </div>
                              <div className="flex items-center space-x-1.5">
                                <Users className="h-3 w-3 text-emerald-400" />
                                <span>
                                  {authorizedViewers.length === 0
                                    ? 'No Viewers Granted'
                                    : `${authorizedViewers.length} Viewer(s) Granted`}
                                </span>
                              </div>
                            </div>
                          )}

                          {!isDocOwner && isDelegatedAdmin && (
                            <div className="pt-1 text-[11px] text-purple-300 flex items-center gap-1.5">
                              <Share2 className="h-3 w-3" />
                              <span>Authorized by Owner to manage Viewers</span>
                            </div>
                          )}
                        </div>

                        {/* Card Actions */}
                        <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-1.5">
                          <button
                            onClick={() => setViewDoc(doc)}
                            className="py-1.5 px-2.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1"
                            title="Inspect document metadata & log view event"
                          >
                            <Eye className="h-3.5 w-3.5 text-cyan-400" />
                            <span>View</span>
                          </button>

                          <button
                            onClick={() => handleDownload(doc)}
                            disabled={downloadingDocId === doc.id}
                            className="flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white transition-colors flex items-center justify-center gap-1 shadow-md shadow-emerald-950 disabled:opacity-50"
                            title="Download via 60-second presigned URL after live server authorization"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>{downloadingDocId === doc.id ? 'Authorizing...' : 'Download (60s)'}</span>
                          </button>

                          {canManage && (
                            <button
                              onClick={() => setPermissionDoc(doc)}
                              className="py-1.5 px-2.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1"
                              title={isDocOwner ? 'Manage Admin & Viewer permissions' : 'Delegate Viewer access'}
                            >
                              {isDocOwner ? <Users className="h-3.5 w-3.5 text-purple-400" /> : <Share2 className="h-3.5 w-3.5 text-purple-400" />}
                              <span>{isDocOwner ? 'Access' : 'Delegate'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: AUDIT LOGS VIEW (OWNER SCOPED)                                     */}
        {/* ========================================================================= */}
        {isOwner && activeTab === 'audit' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <History className="h-6 w-6 text-purple-400" />
                  <h1 className="text-xl font-extrabold text-slate-100 tracking-tight">
                    Owner Workspace Audit Trail
                  </h1>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Verifiable document security logs • Scoped to your owned assets & workspace actions
                </p>
              </div>

              <button
                onClick={loadAuditLogs}
                disabled={loadingAudit}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-950 transition-all flex items-center gap-2 self-start md:self-auto disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
                Refresh Logs
              </button>
            </div>

            {/* Filters Bar */}
            <div className="bg-shield-900 border border-slate-800/80 rounded-xl p-4 shadow-xl flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="flex flex-1 flex-wrap gap-2.5 items-center w-full">
                {/* Search */}
                <div className="relative min-w-[200px] flex-1">
                  <Search className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search actor, document, metadata..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* Action Filter */}
                <div className="flex items-center space-x-1.5">
                  <Filter className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={auditAction}
                    onChange={(e) => setAuditAction(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    {AUDIT_ACTIONS.map((act) => (
                      <option key={act} value={act}>
                        Action: {act}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <select
                  value={auditStatus}
                  onChange={(e) => setAuditStatus(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  <option value="ALL">Status: All</option>
                  <option value="SUCCESS">Status: SUCCESS</option>
                  <option value="BLOCKED">Status: BLOCKED</option>
                  <option value="FAILURE">Status: FAILURE</option>
                </select>
              </div>
            </div>

            {/* Audit Log Table */}
            <div className="bg-shield-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <History className="h-4 w-4 text-purple-400" />
                  Audit Entries ({auditLogs.length})
                </h2>
                <span className="text-[11px] text-slate-500 font-mono">
                  Click any row to inspect cryptographic hash linkage
                </span>
              </div>

              {loadingAudit ? (
                <div className="p-12 text-center text-xs text-slate-400 font-mono animate-pulse">
                  Loading cryptographic audit logs...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 font-mono">
                  No audit logs found matching criteria for your documents.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Date & Time</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Document</th>
                        <th className="py-3 px-4">User Details</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">IP Address</th>
                        <th className="py-3 px-4 text-right">Chain Inspector</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 font-mono">
                      {auditLogs.map((log) => {
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
                              <td className="py-3 px-4 text-slate-200 max-w-[200px] truncate" title={log.documentTitle}>
                                <div className="font-sans font-semibold text-white truncate">{log.documentTitle}</div>
                                {log.document?.category && (
                                  <span className="text-[10px] text-slate-400 font-mono">[{log.document.category}]</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-slate-300 max-w-[200px] truncate" title={actorDisplay}>
                                <div className="truncate">{actorDisplay}</div>
                                {actor && (
                                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">
                                    {actor.role}
                                  </span>
                                )}
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
                                  <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </button>
                              </td>
                            </tr>

                            {/* Expanded Cryptographic Hash & Context Inspector */}
                            {isExpanded && (
                              <tr className="bg-slate-950/90 text-xs">
                                <td colSpan={7} className="p-4 space-y-3 border-y border-purple-900/40">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5 bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                                      <div className="text-[10px] uppercase text-purple-400 font-bold flex items-center gap-1">
                                        <Hash className="h-3 w-3" />
                                        Cryptographic SHA-256 Linkage
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

                                    <div className="space-y-1.5 bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                                      <div className="text-[10px] uppercase text-purple-400 font-bold flex items-center gap-1">
                                        <Code className="h-3 w-3" />
                                        Audit Context Metadata
                                      </div>
                                      <pre className="text-[11px] text-slate-300 bg-slate-950 p-2 rounded border border-slate-800/80 overflow-x-auto max-h-32">
                                        {log.parsedMetadata ? JSON.stringify(log.parsedMetadata, null, 2) : 'No extra metadata'}
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
        {/* TAB 3: COMPLIANCE & CRYPTOGRAPHIC VERIFICATION                            */}
        {/* ========================================================================= */}
        {isOwner && activeTab === 'compliance' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="h-6 w-6 text-emerald-400" />
                  <h1 className="text-xl font-extrabold text-slate-100 tracking-tight">
                    Document Security & Compliance Verification
                  </h1>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Cryptographic chain integrity verification • Zero-Leak posture • Real-time violation audits
                </p>
              </div>

              <button
                onClick={handleVerifyChain}
                disabled={verifyingChain}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950 transition-all flex items-center gap-2 self-start md:self-auto disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${verifyingChain ? 'animate-spin' : ''}`} />
                {verifyingChain ? 'Calculating Proofs...' : 'Verify Cryptographic Chain'}
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
                  <span className="text-slate-400">Integrity: </span>
                  <span className={verificationResult.isValid ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {verificationResult.isValid ? '100% IMMUTABLE' : 'CHAIN COMPROMISED'}
                  </span>
                </div>
              </div>
            )}

            {/* Compliance Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-shield-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center justify-between">
                  <span>Owned Documents</span>
                  <Database className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-extrabold text-slate-100 font-mono mt-1">{documents.length}</div>
                <div className="text-[10px] text-slate-500 mt-1">Sovereign Owner controlled files</div>
              </div>

              <div className="bg-shield-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center justify-between">
                  <span>Security Violations Blocked</span>
                  <ShieldAlert className="h-4 w-4 text-rose-400" />
                </div>
                <div className="text-2xl font-extrabold text-rose-400 font-mono mt-1">
                  {report?.summary.totalSecurityViolationsBlocked ?? 0}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">IDOR, unauth probes & bad requests</div>
              </div>

              <div className="bg-shield-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center justify-between">
                  <span>Active Delegations</span>
                  <UserCheck className="h-4 w-4 text-blue-400" />
                </div>
                <div className="text-2xl font-extrabold text-blue-400 font-mono mt-1">
                  {report?.summary.activePermissionsCount ?? 0}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Authorized Admins & Viewers</div>
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

            {/* Compliance Standards Checklist */}
            <div className="bg-shield-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                TrustVault Zero-Trust Compliance Controls
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg flex items-start space-x-2.5">
                  <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-200">Rule One: Live Server DB Verification</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      No client-side authorization trust. Every document download and view triggers server query.
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg flex items-start space-x-2.5">
                  <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-200">Rule Two: Instant Permission Revocation</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Revoking permission invalidates access instantly. Subsequent attempts return 403 Forbidden.
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg flex items-start space-x-2.5">
                  <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-200">Rule Three: Timed 60-Second Presigned URLs</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Private storage buckets; 0 public direct URLs. Expire automatically within 60 seconds.
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg flex items-start space-x-2.5">
                  <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-200">Rule Four: Owner Sovereign Authority</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Admins receive zero automatic access. Owner explicitly controls Admin access and delegation.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: REPORTS & ACTIVITY (OWNER SCOPED)                                  */}
        {/* ========================================================================= */}
        {isOwner && activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <BarChart3 className="h-6 w-6 text-blue-400" />
                  <h1 className="text-xl font-extrabold text-slate-100 tracking-tight">
                    Document Activity & Compliance Reports
                  </h1>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Real-time database analytics • Access history, download records, and user engagement
                </p>
              </div>

              <div className="flex items-center space-x-2 self-start md:self-auto">
                <select
                  value={reportTimeframe}
                  onChange={(e) => setReportTimeframe(parseInt(e.target.value, 10))}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                >
                  <option value={7}>Timeframe: Last 7 Days</option>
                  <option value={30}>Timeframe: Last 30 Days</option>
                  <option value={90}>Timeframe: Last 90 Days</option>
                  <option value={365}>Timeframe: Last 1 Year</option>
                </select>

                <button
                  onClick={loadReports}
                  disabled={loadingReport}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-950 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingReport ? 'animate-spin' : ''}`} />
                  Refresh Report
                </button>
              </div>
            </div>

            {loadingReport ? (
              <div className="p-12 text-center text-xs text-slate-400 font-mono animate-pulse">
                Aggregating real database audit logs and access histories...
              </div>
            ) : !report ? (
              <div className="p-12 text-center text-xs text-slate-400 font-mono">
                No report data available.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Activity Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-shield-900 border border-slate-800 rounded-xl p-3 shadow-md">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Total Events</span>
                    <div className="text-xl font-bold font-mono text-slate-100 mt-1">
                      {report.summary.totalAuditRecords}
                    </div>
                  </div>

                  <div className="bg-shield-900 border border-slate-800 rounded-xl p-3 shadow-md">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Uploads</span>
                    <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                      {report.summary.totalUploads}
                    </div>
                  </div>

                  <div className="bg-shield-900 border border-slate-800 rounded-xl p-3 shadow-md">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Downloads</span>
                    <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                      {report.summary.totalDownloads}
                    </div>
                  </div>

                  <div className="bg-shield-900 border border-slate-800 rounded-xl p-3 shadow-md">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Views</span>
                    <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                      {report.summary.totalViews}
                    </div>
                  </div>

                  <div className="bg-shield-900 border border-slate-800 rounded-xl p-3 shadow-md">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Permissions</span>
                    <div className="text-xl font-bold font-mono text-purple-400 mt-1">
                      {report.summary.totalPermissionGrants + report.summary.totalPermissionRevokes}
                    </div>
                  </div>

                  <div className="bg-shield-900 border border-slate-800 rounded-xl p-3 shadow-md">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Violations Blocked</span>
                    <div className="text-xl font-bold font-mono text-rose-400 mt-1">
                      {report.summary.totalSecurityViolationsBlocked}
                    </div>
                  </div>
                </div>

                {/* Section: Document Access History */}
                <div className="bg-shield-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-emerald-400" />
                      Document Access History ({report.documentAccessHistory.length})
                    </h2>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Per-document aggregate views, downloads, and delegations
                    </span>
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
                          <th className="py-3 px-4">Shares</th>
                          <th className="py-3 px-4">Blocked Probes</th>
                          <th className="py-3 px-4">Unique Users</th>
                          <th className="py-3 px-4">Last Accessed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 font-mono">
                        {report.documentAccessHistory.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="p-6 text-center text-slate-500">
                              No document activity recorded in this timeframe.
                            </td>
                          </tr>
                        ) : (
                          report.documentAccessHistory.map((d) => (
                            <tr key={d.documentId} className="hover:bg-slate-800/30">
                              <td className="py-3 px-4 font-sans font-bold text-white max-w-[220px] truncate" title={d.title}>
                                {d.title}
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                                  {d.category}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-100">{d.totalAccesses}</td>
                              <td className="py-3 px-4 text-blue-400 font-bold">{d.downloads}</td>
                              <td className="py-3 px-4 text-cyan-400 font-bold">{d.views}</td>
                              <td className="py-3 px-4 text-purple-400 font-bold">{d.shares}</td>
                              <td className="py-3 px-4 text-rose-400 font-bold">{d.blockedProbes}</td>
                              <td className="py-3 px-4 text-slate-300">{d.uniqueUsersCount}</td>
                              <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                                {d.lastAccessedAt ? new Date(d.lastAccessedAt).toLocaleString() : 'Never'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section: Download Activity */}
                <div className="bg-shield-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                      <Download className="h-4 w-4 text-blue-400" />
                      Download Activity Log ({report.downloadActivity.length})
                    </h2>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Timestamped presigned URL generations
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Timestamp</th>
                          <th className="py-3 px-4">Document Title</th>
                          <th className="py-3 px-4">User</th>
                          <th className="py-3 px-4">Role</th>
                          <th className="py-3 px-4">IP Address</th>
                          <th className="py-3 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 font-mono">
                        {report.downloadActivity.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-slate-500">
                              No download activity recorded.
                            </td>
                          </tr>
                        ) : (
                          report.downloadActivity.map((dl) => (
                            <tr key={dl.id} className="hover:bg-slate-800/30">
                              <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                                {new Date(dl.timestamp).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 font-sans font-semibold text-white max-w-[200px] truncate" title={dl.documentTitle}>
                                {dl.documentTitle}
                              </td>
                              <td className="py-3 px-4 text-slate-200">
                                {dl.actorName} <span className="text-slate-500 text-[10px]">({dl.actorEmail})</span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                                  {dl.actorRole}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-400">{dl.ipAddress}</td>
                              <td className="py-3 px-4 text-emerald-400 font-bold">{dl.status}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section: User Activity Breakdown */}
                <div className="bg-shield-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                      <Users className="h-4 w-4 text-purple-400" />
                      User Engagement & Access Breakdown ({report.userActivity.length})
                    </h2>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Users interacting with your documents
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">User Name</th>
                          <th className="py-3 px-4">Email</th>
                          <th className="py-3 px-4">Role</th>
                          <th className="py-3 px-4">Total Actions</th>
                          <th className="py-3 px-4">Downloads</th>
                          <th className="py-3 px-4">Views</th>
                          <th className="py-3 px-4">Shares / Grants</th>
                          <th className="py-3 px-4">Blocked</th>
                          <th className="py-3 px-4">Last Active</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 font-mono">
                        {report.userActivity.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="p-6 text-center text-slate-500">
                              No user activity recorded.
                            </td>
                          </tr>
                        ) : (
                          report.userActivity.map((u) => (
                            <tr key={u.userId} className="hover:bg-slate-800/30">
                              <td className="py-3 px-4 font-sans font-bold text-white">{u.name}</td>
                              <td className="py-3 px-4 text-slate-400">{u.email}</td>
                              <td className="py-3 px-4">
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                                  {u.role}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-100">{u.totalEvents}</td>
                              <td className="py-3 px-4 text-blue-400 font-bold">{u.downloads}</td>
                              <td className="py-3 px-4 text-cyan-400 font-bold">{u.views}</td>
                              <td className="py-3 px-4 text-purple-400 font-bold">{u.shares}</td>
                              <td className="py-3 px-4 text-rose-400 font-bold">{u.blocked}</td>
                              <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                                {new Date(u.lastActive).toLocaleString()}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Upload Modal */}
      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => {
          loadDocuments();
        }}
      />

      {/* Permission Management Modal */}
      {permissionDoc && (
        <PermissionModal
          isOpen={!!permissionDoc}
          document={permissionDoc}
          currentUser={user!}
          onClose={() => setPermissionDoc(null)}
          onUpdated={() => {
            loadDocuments();
          }}
        />
      )}

      {/* Document View / Inspection Modal */}
      {viewDoc && (
        <DocumentViewModal
          isOpen={!!viewDoc}
          document={viewDoc}
          onClose={() => setViewDoc(null)}
          onDownload={(doc) => handleDownload(doc)}
        />
      )}
    </div>
  );
}
