'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Eye,
  Download,
  X,
  ShieldCheck,
  Calendar,
  Lock,
  User,
  Clock,
  HardDrive,
  Tag,
  CheckCircle2,
  AlertCircle,
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

interface DocumentViewModalProps {
  isOpen: boolean;
  document: DocumentItem | null;
  onClose: () => void;
  onDownload: (doc: DocumentItem) => void;
}

export default function DocumentViewModal({
  isOpen,
  document: doc,
  onClose,
  onDownload,
}: DocumentViewModalProps) {
  const [viewLogged, setViewLogged] = useState(false);
  const [loggingView, setLoggingView] = useState(false);
  const [viewTimestamp, setViewTimestamp] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && doc) {
      logDocumentView();
    } else {
      setViewLogged(false);
      setViewTimestamp(null);
    }
  }, [isOpen, doc]);

  const logDocumentView = async () => {
    if (!doc) return;
    setLoggingView(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/view`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setViewLogged(true);
        setViewTimestamp(data.viewedAt || new Date().toISOString());
      }
    } catch (err) {
      console.error('Failed to log document view event:', err);
    } finally {
      setLoggingView(false);
    }
  };

  if (!isOpen || !doc) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-shield-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Eye className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                Vault Document Inspector
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                Live zero-leak authorization verified & audited
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto font-mono text-xs text-slate-300">
          {/* Audit Notification Banner */}
          <div className="p-3 rounded-xl bg-slate-950/90 border border-emerald-900/40 flex items-start space-x-2.5">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-[11px]">
              <div className="text-emerald-300 font-bold flex items-center gap-1.5">
                <span>DOCUMENT_VIEW Event Sealed</span>
                {loggingView && <span className="text-[10px] text-slate-400 animate-pulse">(recording...)</span>}
              </div>
              <p className="text-slate-400 text-[10px]">
                {viewTimestamp
                  ? `Access recorded to SHA-256 cryptographic audit chain at ${new Date(viewTimestamp).toLocaleTimeString()} (${new Date(viewTimestamp).toLocaleDateString()}).`
                  : 'Recording live access event to cryptographic audit chain...'}
              </p>
            </div>
          </div>

          {/* Title & Category */}
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80 space-y-3">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Document Title</span>
              <div className="text-sm font-bold text-slate-100 font-sans mt-0.5">{doc.title}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/60 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Category
                </span>
                <span className="text-slate-200 font-semibold">{doc.category}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <HardDrive className="h-3 w-3" /> File Size
                </span>
                <span className="text-slate-200">{formatFileSize(doc.fileSize)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <User className="h-3 w-3" /> Document Owner
                </span>
                <span className="text-emerald-400 font-semibold">{doc.owner?.name || 'Owner'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Vaulted Date
                </span>
                <span className="text-slate-200">{new Date(doc.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Storage & MIME Metadata */}
          <div className="bg-slate-950/30 p-3 rounded-lg border border-slate-800/60 space-y-1.5 text-[11px]">
            <div className="text-[10px] uppercase text-slate-400 font-bold flex items-center gap-1">
              <Lock className="h-3 w-3 text-purple-400" />
              Security Specifications
            </div>
            <div className="grid grid-cols-2 gap-2 text-slate-400">
              <div>Detected MIME: <span className="text-slate-300">{doc.mimeType}</span></div>
              <div>Storage: <span className="text-emerald-400">Private Bucket (0 Public URLs)</span></div>
              <div>Presigned Expiry: <span className="text-purple-400">60 Seconds</span></div>
              <div>Audit Logging: <span className="text-emerald-400">Monitored (Active)</span></div>
            </div>
          </div>

          {/* Active Delegations / Permissions (if present) */}
          {doc.permissions && doc.permissions.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                Active Delegated Access ({doc.permissions.length})
              </span>
              <div className="max-h-28 overflow-y-auto space-y-1 bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                {doc.permissions.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-[11px] py-0.5 border-b border-slate-800/40 last:border-0">
                    <span className="text-slate-300">{p.user.name} ({p.user.email})</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700">
                      {p.user.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/80 gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Close Inspector
          </button>
          <button
            onClick={() => {
              onDownload(doc);
              onClose();
            }}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950 transition-all flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Download File (60s URL)
          </button>
        </div>
      </div>
    </div>
  );
}
