'use client';

import React, { useState } from 'react';
import { X, UploadCloud, AlertCircle, CheckCircle2, Shield, FileCheck } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES = ['Finance', 'Security', 'Legal', 'Engineering', 'Executive', 'General'];
const ALLOWED_EXTS = ['.pdf', '.docx', '.xlsx', '.png', '.jpg', '.jpeg', '.txt', '.csv'];

export default function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    const ext = '.' + selected.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      setError(`File type "${ext}" is not permitted. Allowed: ${ALLOWED_EXTS.join(', ')}`);
      setFile(null);
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setError(`File exceeds the 10MB maximum limit (${(selected.size / (1024 * 1024)).toFixed(2)} MB).`);
      setFile(null);
      return;
    }

    setFile(selected);
    if (!title) {
      // Auto-fill title from clean filename
      const cleanName = selected.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setTitle(cleanName);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a valid document to upload.');
      return;
    }
    if (!title.trim()) {
      setError('Document title is required.');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      formData.append('category', category);

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setSuccessMsg('Document securely vaulted and verified via magic-byte inspection.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-shield-900 border border-slate-700/80 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-bold text-slate-100">Deposit Encrypted Document</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Document Title <span className="text-emerald-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q4 Financial Audit Report"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Classification Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              File Attachment (PDF, DOCX, XLSX, PNG, JPG, CSV, TXT - Max 10MB)
            </label>
            <div className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 rounded-xl p-4 text-center cursor-pointer bg-slate-950/50 transition-colors relative">
              <input
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt,.csv"
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center justify-center space-y-2">
                <UploadCloud className="h-8 w-8 text-emerald-400" />
                {file ? (
                  <div className="flex items-center space-x-2 text-xs text-emerald-300 font-mono">
                    <FileCheck className="h-4 w-4" />
                    <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-slate-300 font-medium">Click to select or drag and drop</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Validated with server-side magic byte sniffing</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300 flex items-center gap-1">
              <Shield className="h-3.5 w-3.5 text-emerald-400" />
              Private Storage Security Policy:
            </p>
            <p>
              Direct public URLs are strictly blocked (403 Forbidden). Files are served exclusively through 60-second timed presigned URLs or signed streaming after live database authorization checks.
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {uploading ? 'Validating & Vaulting...' : 'Vault Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
