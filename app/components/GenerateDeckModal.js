'use client';

import React, { useState } from 'react';
import TemplateGallery from './TemplateGallery';

export default function GenerateDeckModal({ analysisId, onClose, onSuccess }) {
  const [step, setStep] = useState('gallery'); // 'gallery', 'generating', or 'success'
  const [generatedDeck, setGeneratedDeck] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

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

  const handleDownload = async () => {
    if (!generatedDeck?.downloadUrl) return;

    setIsDownloading(true);
    try {
      const response = await fetch(generatedDeck.downloadUrl);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${generatedDeck.briefName.replace(/\s+/g, '_')}_presentation.pptx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download presentation. Try opening it in your browser instead.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 text-2xl z-10"
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

          {step === 'generating' && (
            <div className="text-center py-16">
              <div className="inline-block">
                <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mb-6"></div>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                Creating Your Presentation...
              </h2>
              <p className="text-slate-600">
                Generating professional slides from your analysis insights
              </p>
            </div>
          )}

          {step === 'success' && generatedDeck && (
            <div className="text-center py-12">
              {/* Success Icon */}
              <div className="text-6xl mb-6">✨</div>

              <h2 className="text-3xl font-bold text-slate-900 mb-2">
                Presentation Ready!
              </h2>
              <p className="text-slate-600 mb-8 text-lg">
                Your presentation has been generated with all your insights
              </p>

              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl p-8 mb-8">
                <div className="text-left">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Template</p>
                    <p className="text-xl font-bold text-slate-900">{generatedDeck.templateName}</p>
                  </div>
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Title</p>
                    <p className="text-lg text-slate-900">{generatedDeck.briefName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Headline</p>
                    <p className="text-slate-700 line-clamp-2">{generatedDeck.headline}</p>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-8 text-left">
                <p className="text-green-900 font-medium">✓ Your presentation is ready to use!</p>
                <ul className="text-sm text-green-800 mt-2 space-y-1 ml-4">
                  <li>✓ All insights automatically organized</li>
                  <li>✓ Professional design applied</li>
                  <li>✓ Ready to share and present</li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-8 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isDownloading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Downloading...
                    </>
                  ) : (
                    <>⬇ Download PPT</>
                  )}
                </button>

                {generatedDeck.gammaUrl && generatedDeck.gammaUrl !== '#' && (
                  <a
                    href={generatedDeck.gammaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-lg transition-colors"
                  >
                    🌐 View Online
                  </a>
                )}

                <button
                  onClick={() => {
                    onSuccess?.(generatedDeck);
                    handleClose();
                  }}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-900 font-bold py-3 px-8 rounded-lg transition-colors"
                >
                  Go to Library
                </button>
              </div>

              <button
                onClick={handleStartOver}
                className="text-slate-600 hover:text-slate-900 font-medium text-sm"
              >
                ← Try Another Template
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
