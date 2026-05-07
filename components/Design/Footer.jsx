'use client';

export default function Footer({ objective, keyFindings, actions }) {
  return (
    <footer className="bg-white border-t border-slate-200 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Objective Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-all">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-blue-600 text-lg">🎯</span>
              <h3 className="text-sm font-700 text-blue-600 uppercase tracking-tight">
                Objective
              </h3>
            </div>
            <p className="text-slate-700 font-400 text-sm leading-relaxed">
              {objective || 'Understand the evolving preferences of target audience to effectively capture market share and optimize product communication strategies.'}
            </p>
          </div>

          {/* Key Findings Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-all">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-green-600 text-lg">📊</span>
              <h3 className="text-sm font-700 text-green-600 uppercase tracking-tight">
                Key Findings
              </h3>
            </div>
            <ul className="space-y-2">
              {keyFindings && keyFindings.length > 0 ? (
                keyFindings.map((finding, index) => (
                  <li key={index} className="flex gap-2 text-slate-700 text-sm font-400">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span>{finding}</span>
                  </li>
                ))
              ) : (
                <>
                  <li className="flex gap-2 text-slate-700 text-sm font-400">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span>Market insights show significant growth potential in target demographics</span>
                  </li>
                  <li className="flex gap-2 text-slate-700 text-sm font-400">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span>Brand preference metrics indicate strong positioning opportunities</span>
                  </li>
                  <li className="flex gap-2 text-slate-700 text-sm font-400">
                    <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                    <span>Consumer engagement trends point to emerging market needs</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Actions Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-all">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-orange-600 text-lg">⚡</span>
              <h3 className="text-sm font-700 text-orange-600 uppercase tracking-tight">
                Actions
              </h3>
            </div>
            <ul className="space-y-2">
              {actions && actions.length > 0 ? (
                actions.map((action, index) => (
                  <li key={index} className="flex gap-2 text-slate-700 text-sm font-400">
                    <span className="text-orange-600 flex-shrink-0 mt-0.5">→</span>
                    <span>{action}</span>
                  </li>
                ))
              ) : (
                <>
                  <li className="flex gap-2 text-slate-700 text-sm font-400">
                    <span className="text-orange-600 flex-shrink-0 mt-0.5">→</span>
                    <span>Develop targeted content strategy addressing identified market gaps</span>
                  </li>
                  <li className="flex gap-2 text-slate-700 text-sm font-400">
                    <span className="text-orange-600 flex-shrink-0 mt-0.5">→</span>
                    <span>Implement multi-channel campaign across high-engagement platforms</span>
                  </li>
                  <li className="flex gap-2 text-slate-700 text-sm font-400">
                    <span className="text-orange-600 flex-shrink-0 mt-0.5">→</span>
                    <span>Launch A/B testing to optimize messaging and positioning</span>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="mt-12 pt-8 border-t border-slate-200 flex items-center justify-between">
          <p className="text-slate-500 text-xs font-400">
            © 2026 PRISM. All rights reserved.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-slate-500 hover:text-slate-700 text-xs font-500 transition-colors">
              Privacy
            </a>
            <a href="#" className="text-slate-500 hover:text-slate-700 text-xs font-500 transition-colors">
              Terms
            </a>
            <a href="#" className="text-slate-500 hover:text-slate-700 text-xs font-500 transition-colors">
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
