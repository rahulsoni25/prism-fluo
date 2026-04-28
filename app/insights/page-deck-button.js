// Add this code to app/insights/page.js in the AnalysisDetail component
// This shows the "Generate Presentation" button in the analysis header

'use client';

import React, { useState } from 'react';
import GenerateDeckModal from '@/app/components/GenerateDeckModal';

export function GenerateDeckButton({ analysisId }) {
  const [showModal, setShowModal] = useState(false);

  const handleSuccess = (deckData) => {
    // Navigate to presentations page or show deck viewer
    window.location.href = `/presentations/${deckData.presentationId}`;
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg transition-all hover:shadow-lg"
      >
        <span>🎨</span>
        Generate Presentation
      </button>

      {showModal && (
        <GenerateDeckModal
          analysisId={analysisId}
          onClose={() => setShowModal(false)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}

// Usage in AnalysisDetail component:
// <div className="flex gap-3 mb-6">
//   <button onClick={() => window.print()} className="...">Print</button>
//   <button onClick={handleExport} className="...">Export to Excel</button>
//   <GenerateDeckButton analysisId={analysisId} />
// </div>
