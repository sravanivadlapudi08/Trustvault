'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ShieldCheck, ShieldAlert, LogOut, User, Key, RefreshCw, FileText, Activity, Shield, BarChart3, History } from 'lucide-react';

interface NavbarProps {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  } | null;
}

export default function Navbar({ user }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentTab, setCurrentTab] = useState('documents');
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const updateTab = () => {
      if (typeof window !== 'undefined') {
        const p = new URLSearchParams(window.location.search);
        setCurrentTab(p.get('tab') || 'documents');
      }
    };
    updateTab();
    window.addEventListener('popstate', updateTab);
    return () => window.removeEventListener('popstate', updateTab);
  }, [pathname]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const handleQuickSwitch = async (email: string, password: string) => {
    setSwitching(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        window.location.href = '/dashboard';
      }
    } finally {
      setSwitching(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-900/60 text-purple-300 border-purple-600/50';
      case 'owner':
        return 'bg-emerald-900/60 text-emerald-300 border-emerald-600/50';
      case 'viewer':
        return 'bg-blue-900/60 text-blue-300 border-blue-600/50';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <header className="border-b border-slate-800/80 bg-shield-900/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-6">
          <Link href="/dashboard" className="flex items-center space-x-3 group">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:border-emerald-400 transition-colors">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-lg text-slate-100 tracking-tight flex items-center gap-1.5">
                Trust<span className="text-emerald-400">Vault</span>
              </span>
              <span className="text-[10px] text-slate-400 tracking-wider font-mono block -mt-1 uppercase">
                Zero-Leak Cryptographic Storage
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          {user && (
            <nav className="hidden md:flex items-center space-x-1 pl-4 border-l border-slate-800">
              <Link
                href="/dashboard"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  pathname === '/dashboard' && (user.role !== 'owner' || currentTab === 'documents')
                    ? 'bg-slate-800 text-emerald-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <FileText className="h-4 w-4" />
                Vault Documents
              </Link>

              {(user.role === 'admin' || user.role === 'owner') && (
                <Link
                  href="/admin"
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    pathname === '/admin'
                      ? 'bg-purple-950/60 text-purple-300 border border-purple-800/40'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Activity className="h-4 w-4 text-purple-400" />
                  Audit & Compliance Center
                </Link>
              )}
            </nav>
          )}
        </div>

        {/* Right side controls */}
        {user ? (
          <div className="flex items-center space-x-4">
            {/* Quick Role Switcher for Test Scenarios */}
            <div className="hidden lg:flex items-center space-x-1.5 bg-slate-950/80 border border-slate-800 p-1 rounded-lg">
              <span className="text-[11px] text-slate-400 font-mono px-2 flex items-center gap-1">
                <RefreshCw className={`h-3 w-3 ${switching ? 'animate-spin text-emerald-400' : ''}`} />
                Test As:
              </span>
              <button
                onClick={() => handleQuickSwitch('admin@trustvault.internal', 'Admin123!@#')}
                className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${
                  user.email === 'admin@trustvault.internal'
                    ? 'bg-purple-900/80 text-purple-200 border border-purple-500/50 font-bold'
                    : 'text-slate-400 hover:text-purple-300'
                }`}
                title="Switch to Admin (Global visibility & audit chain verification)"
              >
                Admin
              </button>
              <button
                onClick={() => handleQuickSwitch('owner@trustvault.internal', 'Owner123!@#')}
                className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${
                  user.email === 'owner@trustvault.internal'
                    ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-500/50 font-bold'
                    : 'text-slate-400 hover:text-emerald-300'
                }`}
                title="Switch to Document Owner (Upload, grant/revoke permissions)"
              >
                Owner
              </button>
              <button
                onClick={() => handleQuickSwitch('viewer@trustvault.internal', 'Viewer123!@#')}
                className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${
                  user.email === 'viewer@trustvault.internal'
                    ? 'bg-blue-900/80 text-blue-200 border border-blue-500/50 font-bold'
                    : 'text-slate-400 hover:text-blue-300'
                }`}
                title="Switch to Permitted Viewer (Can only view granted documents)"
              >
                Viewer
              </button>
              <button
                onClick={() => handleQuickSwitch('unauthorized@trustvault.internal', 'Viewer123!@#')}
                className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${
                  user.email === 'unauthorized@trustvault.internal'
                    ? 'bg-rose-900/80 text-rose-200 border border-rose-500/50 font-bold'
                    : 'text-slate-400 hover:text-rose-300'
                }`}
                title="Switch to Unauthorized Viewer (Test IDOR boundary enforcement)"
              >
                Unauthorized
              </button>
            </div>

            {/* User Profile Pill */}
            <div className="flex items-center space-x-3 pl-3 border-l border-slate-800">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-slate-200">{user.name}</p>
                <p className="text-[11px] text-slate-400 font-mono truncate max-w-[140px]">{user.email}</p>
              </div>
              <span
                className={`text-[11px] font-mono uppercase px-2 py-0.5 rounded-full border ${getRoleBadge(
                  user.role
                )}`}
              >
                {user.role}
              </span>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <Link
            href="/login"
            className="text-xs font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-md hover:bg-emerald-500/20 transition-colors"
          >
            Access Vault
          </Link>
        )}
      </div>
    </header>
  );
}
