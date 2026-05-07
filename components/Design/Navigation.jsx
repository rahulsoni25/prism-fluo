'use client';

import { useState } from 'react';

export default function Navigation({ user, onSignOut }) {
  return (
    <nav className="sticky top-0 z-50 bg-slate-900 h-15 px-8 flex items-center gap-6 border-b border-slate-800">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-800 text-sm">
          P
        </div>
        <span className="text-white font-700 text-base tracking-tight">PRISM</span>
      </div>

      {/* Nav Links */}
      <div className="flex gap-1 flex-1">
        <button className="text-white text-sm font-500 px-3 py-1.5 rounded-md bg-white bg-opacity-10 hover:bg-opacity-18 transition-all">
          My Briefs
        </button>
        <button className="text-slate-400 text-sm font-500 px-3 py-1.5 rounded-md hover:text-white hover:bg-white hover:bg-opacity-10 transition-all">
          Templates
        </button>
        <button className="text-slate-400 text-sm font-500 px-3 py-1.5 rounded-md hover:text-white hover:bg-white hover:bg-opacity-10 transition-all">
          Team
        </button>
      </div>

      {/* User */}
      <div className="flex items-center gap-2.5">
        <div className="w-7.5 h-7.5 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-700 text-xs flex-shrink-0">
          {user?.initials || 'U'}
        </div>
        <span className="text-slate-300 text-sm">{user?.name || 'User'}</span>
        <button
          onClick={onSignOut}
          className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
        >
          · Sign out
        </button>
      </div>
    </nav>
  );
}
