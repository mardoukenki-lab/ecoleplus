import React, { useState, useEffect } from 'react';
import { Download, Smartphone, X, Check, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  useEffect(() => {
    // Check if app is already running as standalone PWA
    const isStandaloneMode = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    setIsStandalone(isStandaloneMode);

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Listen for beforeinstallprompt event (Android / Desktop Chrome / Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setInstalledSuccess(true);
      setDeferredPrompt(null);
      setTimeout(() => setInstalledSuccess(false), 5000);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalledSuccess(true);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSModal(true);
    }
  };

  if (isStandalone || dismissed) {
    return null;
  }

  // Show banner if deferredPrompt is available OR if on iOS Safari
  if (!deferredPrompt && !isIOS && !installedSuccess) {
    return null;
  }

  return (
    <>
      {/* Floating PWA Install Banner */}
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50 animate-bounce-short">
        <div className="bg-[#1a1a1a] text-white p-4 rounded-2xl shadow-2xl border border-white/10 flex items-center justify-between gap-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white text-[#1a1a1a] rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 shadow-sm">
              AS
            </div>
            <div>
              <div className="font-sans font-bold text-xs tracking-tight text-white flex items-center gap-1.5">
                AKPANY SCHOOL
                <span className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase">
                  PWA
                </span>
              </div>
              <p className="text-[11px] text-[#9e9e9e] leading-snug">
                Installer l'application sur votre écran d'accueil
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={handleInstallClick}
              className="bg-white hover:bg-[#f5f5f5] text-[#1a1a1a] font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-transform"
            >
              <Download size={13} />
              <span>Installer</span>
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1.5 text-[#9e9e9e] hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Fermer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* iOS Safari Instructions Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-[#e0e0e0] pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="text-[#1a1a1a]" size={20} />
                <h3 className="font-bold text-sm text-[#1a1a1a]">Installer sur iPhone / iPad</h3>
              </div>
              <button 
                onClick={() => setShowIOSModal(false)}
                className="text-[#9e9e9e] hover:text-[#1a1a1a] p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[#666666] leading-relaxed">
              Pour installer <strong>AKPANY SCHOOL</strong> sur Safari iOS comme une application native :
            </p>

            <ol className="space-y-3 text-xs text-[#1a1a1a]">
              <li className="flex items-start gap-2.5 bg-[#f5f5f5] p-3 rounded-xl border border-[#e0e0e0]">
                <span className="w-5 h-5 bg-[#1a1a1a] text-white rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0">1</span>
                <span>Appuyez sur le bouton <strong>Partager</strong> <Share size={14} className="inline ml-0.5 text-blue-600" /> au bas de Safari.</span>
              </li>
              <li className="flex items-start gap-2.5 bg-[#f5f5f5] p-3 rounded-xl border border-[#e0e0e0]">
                <span className="w-5 h-5 bg-[#1a1a1a] text-white rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0">2</span>
                <span>Faites défiler vers le bas et sélectionnez <strong>Sur l'écran d'accueil</strong>.</span>
              </li>
              <li className="flex items-start gap-2.5 bg-[#f5f5f5] p-3 rounded-xl border border-[#e0e0e0]">
                <span className="w-5 h-5 bg-[#1a1a1a] text-white rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0">3</span>
                <span>Validez en cliquant sur <strong>Ajouter</strong> en haut à droite.</span>
              </li>
            </ol>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full bg-[#1a1a1a] text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider hover:bg-black cursor-pointer"
            >
              J'ai compris
            </button>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {installedSuccess && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50">
          <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3">
            <div className="w-8 h-8 bg-white text-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
              <Check size={18} />
            </div>
            <div className="text-xs">
              <p className="font-bold">Application AKPANY SCHOOL installée !</p>
              <p className="text-emerald-100 text-[11px]">Accessible directement depuis votre écran d'accueil.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
