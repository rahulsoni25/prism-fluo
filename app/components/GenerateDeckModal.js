'use client';

import React, { useState } from 'react';
import TemplateGallery from './TemplateGallery';

export default function GenerateDeckModal({ analysisId, onClose, onSuccess }) {
  const [step, setStep] = useState('gallery'); // 'gallery' or 'success'
  const [generatedDeck, setGeneratedDeck] = useState(null);

  const handleSelectTemplate = (deckData) => {
    setGeneratedDeck(deckData);
    setStep('success');
  };

  const handleClose = () => {
    onClose?.();
  };

  const handleStartOver = () => {
    setStep('gallery');
    setGeneratedDeck(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 text-2xl"
        >
          ✕
        </button>

        {/* Content */}
        <div className="p-8">
          {step === 'gallery' && (
            <>
              <TemplateGallery
                analysisId={analysisId}
                onSelectTemplate={handleSelectTemplate}
              />
            </>
          )}

          {step === 'success' && generatedDeck && (
            <div className="text-center py-12">
              {/* Success Icon */}
              <div className="text-6xl mb-6">🎉</div>

              <h2 className="text-3xl font-bold text-slate-900 mb-4">
                Presentation Created!
              </h2>

              <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 mb-8">
                <p className="text-slate-700 text-lg mb-2">
                  <strong>Template:</strong> {generatedDeck.templateName}
                </p>
                <p className="text-slate-700 text-lg">
                  <strong>Title:</strong> {generatedDeck.briefName}
                </p>
              </div>

              <div className="space-y-4">
                <div className="text-slate-600 mb-8">
                  <p className="mb-2">✓ All your insights have been automatically organized</p>
                  <p className="mb-2">✓ Professional layout and styling applied</p>
                  <p>✓ Ready to share or present</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={() => {
                      onSuccess?.(generatedDeck);
                      handleClose();
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-colors"
                  >
                    View Presentation
                  </button>
                  <button
                    onClick={handleStartOver}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-900 font-bold py-3 px-8 rounded-lg transition-colors"
                  >
                    Try Another Template
                  </button>
                </div>

                <button
                  onClick={handleClose}
                  className="text-slate-500 hover:text-slate-700 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
