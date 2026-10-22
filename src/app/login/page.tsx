'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ShieldAlert, Lock, Mail, KeyRound, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPreset = (presetEmail: string, presetPass: string) => {
    setEmail(presetEmail);
    setPassword(presetPass);
    setError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-1">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight">
            Trust<span className="text-emerald-400">Vault</span> Access Portal
          </h1>
          <p className="text-xs text-slate-400 font-mono">
            Zero-Leak Enforced • Cryptographic Audit Chaining • Short-Lived Private URLs
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-shield-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start space-x-2 animate-shake">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@trustvault.internal"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
              <div className="relative">
                <Lock className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950 transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In to Security Vault'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Quick Presets for Pair-Programming & Evaluation */}
          <div className="pt-4 border-t border-slate-800/80">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1">
              <KeyRound className="h-3 w-3 text-emerald-400" />
              Evaluation Seed Accounts (One-Click):
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectPreset('admin@trustvault.internal', 'Admin123!@#')}
                className="p-2 rounded-lg bg-slate-950 hover:bg-purple-950/40 border border-slate-800 hover:border-purple-600/50 text-left transition-colors group"
              >
                <div className="text-[11px] font-bold text-purple-300">Admin Account</div>
                <div className="text-[10px] text-slate-500 font-mono truncate">admin@trustvault.internal</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset('owner@trustvault.internal', 'Owner123!@#')}
                className="p-2 rounded-lg bg-slate-950 hover:bg-emerald-950/40 border border-slate-800 hover:border-emerald-600/50 text-left transition-colors group"
              >
                <div className="text-[11px] font-bold text-emerald-300">Owner Account</div>
                <div className="text-[10px] text-slate-500 font-mono truncate">owner@trustvault.internal</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset('viewer@trustvault.internal', 'Viewer123!@#')}
                className="p-2 rounded-lg bg-slate-950 hover:bg-blue-950/40 border border-slate-800 hover:border-blue-600/50 text-left transition-colors group"
              >
                <div className="text-[11px] font-bold text-blue-300">Permitted Viewer</div>
                <div className="text-[10px] text-slate-500 font-mono truncate">viewer@trustvault.internal</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset('unauthorized@trustvault.internal', 'Viewer123!@#')}
                className="p-2 rounded-lg bg-slate-950 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-600/50 text-left transition-colors group"
              >
                <div className="text-[11px] font-bold text-rose-300">Unauthorized Viewer</div>
                <div className="text-[10px] text-slate-500 font-mono truncate">unauthorized@trustvault.internal</div>
              </button>
            </div>
          </div>
        </div>

        {/* Security Footer Notice */}
        <div className="text-center text-[11px] text-slate-500 font-mono">
          All sign-in attempts and access violations are permanently recorded with SHA-256 hash chaining.
        </div>
      </div>
    </div>
  );
}
