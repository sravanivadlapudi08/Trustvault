'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  Trash2,
  Sparkles,
  ShieldAlert,
  CheckCircle,
  AlertCircle,
  Lock,
  UserCheck,
  Bot,
  Shield,
  Key,
  ShieldCheck,
  ShieldX,
  Share2,
} from 'lucide-react';

interface PermissionModalProps {
  isOpen: boolean;
  document: {
    id: string;
    title: string;
    category: string;
    ownerId: string;
  } | null;
  currentUser: {
    id: string;
    role: string;
  };
  onClose: () => void;
  onUpdated: () => void;
}

interface PermissionEntry {
  id: string;
  userId: string;
  canRead: boolean;
  canDownload: boolean;
  canEdit: boolean;
  canShare: boolean;
  grantedBy?: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

interface UserOption {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AiSuggestion {
  userId: string;
  name: string;
  email: string;
  role: string;
  suggestedPermission: 'read' | 'edit';
  confidence: number;
  reason: string;
}

export default function PermissionModal({
  isOpen,
  document,
  currentUser,
  onClose,
  onUpdated,
}: PermissionModalProps) {
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [canRead, setCanRead] = useState(true);
  const [canDownload, setCanDownload] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [hasDelegationRights, setHasDelegationRights] = useState(false);
  const [adminScope, setAdminScope] = useState<{ canEdit: boolean; canDownload: boolean } | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // AI Suggestions State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiActive, setAiActive] = useState(false);

  useEffect(() => {
    if (isOpen && document) {
      loadPermissions();
      loadUsers();
      setAiSuggestions([]);
      setAiActive(false);
      setFeedback(null);
      setSelectedUserId('');
      setCanRead(true);
      setCanDownload(true);
      setCanEdit(false);
      setCanShare(false);
    }
  }, [isOpen, document]);

  if (!isOpen || !document) return null;

  const loadPermissions = async () => {
    try {
      const res = await fetch(`/api/documents/${document.id}/permissions`);
      const data = await res.json();
      if (res.ok) {
        setPermissions(data.permissions || []);
        setIsOwner(data.isOwner);
        setHasDelegationRights(Boolean(data.canShare));
        setAdminScope(data.delegatingScope || null);
        setAccessDenied(false);
      } else {
        setAccessDenied(true);
        setFeedback({ type: 'error', message: data.error || 'Access denied to permission management.' });
      }
    } catch (err: any) {
      console.error(err);
      setAccessDenied(true);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (res.ok) {
        setAllUsers(data.users || []);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const selectedUser = allUsers.find((u) => u.id === selectedUserId);
  const isSelectedUserAdmin = selectedUser?.role === 'admin';

  const handleGrantPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/documents/${document.id}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          canRead,
          canDownload,
          canEdit,
          canShare: isOwner && isSelectedUserAdmin ? canShare : false,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to grant permission');

      const roleLabel = isSelectedUserAdmin ? 'Admin authorization' : 'Viewer access';
      setFeedback({
        type: 'success',
        message: `${roleLabel} granted and permanently recorded in audit trail.`,
      });
      setSelectedUserId('');
      setCanShare(false);
      loadPermissions();
      onUpdated();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRevokePermission = async (userId: string, email: string, targetRole: string) => {
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/documents/${document.id}/permissions?userId=${userId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke permission');

      setFeedback({
        type: 'success',
        message: `Immediate Revocation Active: Access for ${targetRole.toUpperCase()} (${email}) has been severed instantly. Subsequent requests will return 403 Forbidden.`,
      });
      loadPermissions();
      onUpdated();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAiSuggestions = async () => {
    setAiLoading(true);
    setAiActive(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/ai/suggest-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: document.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get suggestions');

      setAiSuggestions(data.suggestions || []);
      setFeedback({
        type: 'success',
        message: 'AI analyzed document metadata. Suggestions ready for human review.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setAiLoading(false);
    }
  };

  const handleConfirmAiSuggestion = async (suggestion: AiSuggestion) => {
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/ai/suggest-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document.id,
          targetUserId: suggestion.userId,
          canRead: true,
          canEdit: suggestion.suggestedPermission === 'edit',
          rationale: suggestion.reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to confirm AI suggestion');

      setFeedback({
        type: 'success',
        message: `Human Confirmation Recorded: Granted access to ${suggestion.email}. Dual audit logged.`,
      });

      setAiSuggestions((prev) => prev.filter((s) => s.userId !== suggestion.userId));
      loadPermissions();
      onUpdated();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Filter available users who don't already have active permissions and aren't the owner
  const existingUserIds = new Set(permissions.map((p) => p.userId));
  existingUserIds.add(document.ownerId);

  // If caller is an Admin, they can ONLY grant to Viewers.
  // If caller is an Owner, they can grant to both Admins and Viewers.
  const eligibleUsers = allUsers.filter((u) => {
    if (existingUserIds.has(u.id)) return false;
    if (!isOwner && u.role !== 'viewer') return false;
    return true;
  });

  const adminPermissions = permissions.filter((p) => p.user.role === 'admin');
  const viewerPermissions = permissions.filter((p) => p.user.role !== 'admin');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-shield-900 border border-slate-700/80 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div>
            <div className="flex items-center space-x-2">
              <Lock className="h-4 w-4 text-emerald-400" />
              <h2 className="text-base font-bold text-slate-100">
                {isOwner ? 'Owner-Controlled Access Management' : 'Delegated Access Management'}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-md font-mono">
              Document: <span className="text-emerald-300 font-semibold">{document.title}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Feedback banner */}
          {feedback && (
            <div
              className={`p-3 rounded-lg text-xs flex items-start space-x-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300'
                  : 'bg-rose-950/60 border border-rose-800/80 text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Access Denied State (For Admins without canShare or unauthorized Viewers) */}
          {accessDenied && !isOwner && !hasDelegationRights ? (
            <div className="p-8 text-center space-y-3 bg-slate-950/80 rounded-xl border border-rose-900/60">
              <ShieldX className="h-10 w-10 text-rose-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-100">Access Denied: Delegation Authorization Required</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Admins do not receive automatic document management authority. The Document Owner must explicitly
                grant delegation rights (<code className="text-purple-300">canShare=true</code>) before an Admin can
                view or manage access for this document.
              </p>
            </div>
          ) : (
            <>
              {/* Delegation Context Banner for Authorized Admins */}
              {!isOwner && hasDelegationRights && (
                <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/60 text-xs text-purple-200 flex items-start space-x-2.5">
                  <Share2 className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Authorized Admin Delegation Mode:</span>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      The Document Owner has authorized you to delegate access to Viewers.
                      {adminScope?.canEdit ? ' You have Read & Edit delegation scope.' : ' You have Read-Only delegation scope.'}
                      {' '}You cannot grant access to other Admins or exceed your authorized scope.
                    </p>
                  </div>
                </div>
              )}

              {/* SECTION A: Authorized Administrators (Visible to Owner) */}
              {isOwner && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-purple-400" />
                      Authorized Administrators ({adminPermissions.length})
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      Admins require explicit Owner approval
                    </span>
                  </h3>

                  {adminPermissions.length === 0 ? (
                    <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-400 italic">
                      No Administrators authorized. Admins are strictly blocked from accessing this document.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg bg-slate-950/40 overflow-hidden">
                      {adminPermissions.map((perm) => (
                        <div key={perm.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-900/50 transition-colors">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-slate-200">{perm.user.name}</span>
                              <span className="text-[10px] font-mono text-slate-400">{perm.user.email}</span>
                              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-700/60">
                                ADMIN
                              </span>
                            </div>
                            <div className="flex items-center space-x-3 text-[11px] font-mono">
                              <span className={perm.canRead ? 'text-emerald-400' : 'text-slate-500'}>● Read</span>
                              <span className={perm.canDownload ? 'text-emerald-400' : 'text-slate-500'}>● Download</span>
                              <span className={perm.canEdit ? 'text-emerald-400' : 'text-slate-500'}>● Edit</span>
                              <span className={perm.canShare ? 'text-purple-400 font-bold' : 'text-slate-500'}>
                                {perm.canShare ? '★ Delegation: ALLOWED' : '○ Delegation: NONE'}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRevokePermission(perm.userId, perm.user.email, 'admin')}
                            disabled={loading}
                            className="px-2.5 py-1.5 rounded-md bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 font-medium text-[11px] transition-colors flex items-center gap-1"
                            title="Instantly terminate Admin access and delegation rights"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Revoke Admin
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION B: Authorized Viewers */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-emerald-400" />
                  Authorized Viewers ({viewerPermissions.length})
                </h3>

                {viewerPermissions.length === 0 ? (
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                    No external Viewers authorized.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg bg-slate-950/40 overflow-hidden">
                    {viewerPermissions.map((perm) => (
                      <div key={perm.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-900/50 transition-colors">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-slate-200">{perm.user.name}</span>
                            <span className="text-[10px] font-mono text-slate-400">{perm.user.email}</span>
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/60">
                              VIEWER
                            </span>
                          </div>
                          <div className="flex items-center space-x-3 text-[11px] font-mono text-slate-400">
                            <span className={perm.canRead ? 'text-emerald-400' : 'text-slate-500'}>● Read</span>
                            <span className={perm.canDownload ? 'text-emerald-400' : 'text-slate-500'}>● Download</span>
                            <span className={perm.canEdit ? 'text-emerald-400' : 'text-slate-500'}>● Edit</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRevokePermission(perm.userId, perm.user.email, 'viewer')}
                          disabled={loading}
                          className="px-2.5 py-1.5 rounded-md bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 font-medium text-[11px] transition-colors flex items-center gap-1"
                          title="Instant Revocation: Terminate Viewer access immediately"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Revoke Viewer
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION C: AI-Assisted Permission Helper Section */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/40 border border-purple-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Bot className="h-5 w-5 text-purple-400" />
                    <h3 className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                      AI-Assisted Access Suggester (Human-in-the-Loop)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleRequestAiSuggestions}
                    disabled={aiLoading}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-purple-950"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {aiLoading ? 'Analyzing...' : 'Generate AI Suggestions'}
                  </button>
                </div>

                <p className="text-[11px] text-slate-300">
                  Scans metadata to recommend candidate reviewers.
                  <span className="font-semibold text-amber-300 block mt-0.5">
                    Strict Constraint: The AI cannot auto-grant access. Explicit human confirmation is required.
                  </span>
                </p>

                {aiActive && (
                  <div className="pt-2 space-y-2">
                    {aiSuggestions.length === 0 && !aiLoading ? (
                      <p className="text-xs text-slate-400 italic">No additional role matches suggested for this document.</p>
                    ) : (
                      aiSuggestions.map((sug) => (
                        <div
                          key={sug.userId}
                          className="p-3 bg-slate-950/80 rounded-lg border border-purple-900/60 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-slate-200">{sug.name}</span>
                              <span className="text-[10px] font-mono text-slate-400">{sug.email}</span>
                              <span className="text-[10px] bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded border border-purple-700/50 font-mono">
                                {sug.role.toUpperCase()}
                              </span>
                              <span className="text-[10px] bg-slate-800 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
                                {Math.round(sug.confidence * 100)}% match
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300">{sug.reason}</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleConfirmAiSuggestion(sug)}
                            disabled={loading}
                            className="px-2.5 py-1.5 rounded-md bg-emerald-600/90 hover:bg-emerald-500 text-white font-medium text-[11px] shrink-0 transition-colors flex items-center gap-1 shadow-sm"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            Confirm & Grant
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* SECTION D: Explicit Access Grant Form */}
              <form onSubmit={handleGrantPermission} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <UserPlus className="h-4 w-4 text-emerald-400" />
                  {isOwner ? 'Authorize Admin or Viewer Access' : 'Delegate Access to Viewer'}
                </h3>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Select Target User {!isOwner && '(Viewers Only)'}
                  </label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                    required
                  >
                    <option value="">-- Choose User --</option>
                    {eligibleUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        [{u.role.toUpperCase()}] {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Permissions checkboxes */}
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={canRead}
                        onChange={(e) => setCanRead(e.target.checked)}
                        className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span>Allow Read</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={canDownload}
                        onChange={(e) => setCanDownload(e.target.checked)}
                        disabled={!isOwner && !adminScope?.canDownload}
                        className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span>Allow Download</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={canEdit}
                        onChange={(e) => setCanEdit(e.target.checked)}
                        disabled={!isOwner && !adminScope?.canEdit}
                        className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 disabled:opacity-50"
                      />
                      <span>Allow Edit Metadata</span>
                    </label>
                  </div>

                  {/* Owner Delegation Control for Admins */}
                  {isOwner && isSelectedUserAdmin && (
                    <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-800/60 text-xs">
                      <label className="flex items-start space-x-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canShare}
                          onChange={(e) => setCanShare(e.target.checked)}
                          className="rounded border-purple-700 text-purple-600 focus:ring-purple-500 mt-0.5"
                        />
                        <div>
                          <span className="font-bold text-purple-300 flex items-center gap-1">
                            <Share2 className="h-3.5 w-3.5" />
                            Allow Admin to Delegate Access (Manage Viewers)
                          </span>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            If enabled, this Admin will be authorized to grant and revoke access for Viewers within
                            the scope of their permissions. If disabled, the Admin receives only direct read access.
                          </p>
                        </div>
                      </label>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={loading || !selectedUserId}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {isSelectedUserAdmin ? 'Authorize Admin' : 'Grant Viewer Access'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex justify-between items-center text-[11px] text-slate-400">
          <span>Owner-Controlled Access Model actively enforced.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
