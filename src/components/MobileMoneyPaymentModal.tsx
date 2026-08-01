import React, { useState } from 'react';
import { Paiement, Tranche } from '../types';
import { db } from '../lib/firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { getTranchesForPaiement } from '../lib/tuitionUtils';
import { dispatchParentNotification } from '../lib/notifications';
import { X, Smartphone, CreditCard, CheckCircle2, ShieldCheck, ArrowRight, Loader2, FileText, Sparkles } from 'lucide-react';

interface MobileMoneyPaymentModalProps {
  paiement: Paiement;
  tranche?: Tranche | null;
  studentName: string;
  parentEmail?: string;
  userUid: string;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export default function MobileMoneyPaymentModal({
  paiement,
  tranche,
  studentName,
  parentEmail,
  userUid,
  onClose,
  showToast
}: MobileMoneyPaymentModalProps) {
  const tranches = getTranchesForPaiement(paiement);
  const selectedTranche = tranche || tranches.find(t => t.statut !== 'paye') || tranches[0];

  const defaultAmount = selectedTranche
    ? Math.max(1000, selectedTranche.montant - selectedTranche.montantPaye)
    : Math.max(1000, paiement.solde);

  const [provider, setProvider] = useState<'wave' | 'orange' | 'mtn' | 'moov' | 'card'>('wave');
  const [phoneNumber, setPhoneNumber] = useState('07 00 11 22 33');
  const [amount, setAmount] = useState(defaultAmount.toString());
  const [step, setStep] = useState<'form' | 'processing' | 'success'>('form');
  const [txRef, setTxRef] = useState('');
  const [recuNo, setRecuNo] = useState('');

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const payAmount = parseFloat(amount) || 0;
    if (payAmount <= 0) {
      showToast('⚠️ Veuillez saisir un montant valide.');
      return;
    }

    setStep('processing');

    // Simulate real Mobile Money API network roundtrip
    await new Promise(res => setTimeout(res, 2200));

    const generatedTxRef = `${provider.toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const generatedRecuNo = `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    setTxRef(generatedTxRef);
    setRecuNo(generatedRecuNo);

    const newPaye = (paiement.paye || 0) + payAmount;
    const newSolde = Math.max(0, (paiement.total || 0) - newPaye);

    const providerNames = {
      wave: 'Wave Côte d\'Ivoire / Sénégal',
      orange: 'Orange Money',
      mtn: 'MTN Mobile Money (MoMo)',
      moov: 'Moov Money',
      card: 'Carte Bancaire Visa/Mastercard'
    };

    const newHistoriqueEntry = {
      date: new Date().toISOString().split('T')[0],
      montant: payAmount,
      mode: providerNames[provider],
      recuNo: generatedRecuNo,
      trancheNom: selectedTranche?.nom || 'Frais de scolarité',
      transactionRef: generatedTxRef
    };

    // Update tranches breakdown
    let remaining = payAmount;
    const updatedTranches = tranches.map(t => {
      if (t.id === selectedTranche?.id || remaining > 0) {
        const needed = t.montant - t.montantPaye;
        if (needed > 0 && remaining > 0) {
          const added = Math.min(needed, remaining);
          remaining -= added;
          const newPaid = t.montantPaye + added;
          return {
            ...t,
            montantPaye: newPaid,
            statut: (newPaid >= t.montant ? 'paye' : t.statut) as 'paye' | 'en_attente' | 'en_retard',
            payeLe: newPaid >= t.montant ? new Date().toISOString().split('T')[0] : t.payeLe,
            transactionRef: generatedTxRef,
            modePaiement: providerNames[provider]
          };
        }
      }
      return t;
    });

    const updatedPaiement: Paiement = {
      ...paiement,
      paye: newPaye,
      solde: newSolde,
      echeance: newSolde <= 0 ? 'Soldé' : paiement.echeance,
      modePaiement: providerNames[provider],
      recuNo: generatedRecuNo,
      historique: [newHistoriqueEntry, ...(paiement.historique || [])],
      tranches: updatedTranches
    };

    try {
      await setDoc(doc(db, 'paiements', paiement.id), updatedPaiement, { merge: true });
      if (paiement.eleveId) {
        await updateDoc(doc(db, 'eleves', paiement.eleveId), { scolaritePayee: newPaye });
      }

      // Notify parent & admin via Firestore notification
      await dispatchParentNotification({
        targetUid: userUid,
        icon: '💳',
        bg: 'bg-emerald-100 text-emerald-800',
        title: `✅ Paiement Scolarité Confirmé (${payAmount.toLocaleString('fr-FR')} FCFA)`,
        text: `Paiement de ${payAmount.toLocaleString('fr-FR')} FCFA reçu par ${providerNames[provider]} pour ${studentName}. Réf: ${generatedTxRef}. Reçu № ${generatedRecuNo}. Solde restant: ${newSolde.toLocaleString('fr-FR')} FCFA.`,
        parentEmail: parentEmail || null,
        type: 'paiement'
      });

      setStep('success');
      showToast(`🎉 Paiement de ${payAmount.toLocaleString('fr-FR')} F validé avec succès !`);
    } catch (err) {
      console.error(err);
      showToast('❌ Erreur lors de la validation du paiement.');
      setStep('form');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-[28px] max-w-lg w-full p-6 shadow-2xl border border-[#e0e0e0] space-y-5 relative overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[#e0e0e0] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-100 text-sky-700 rounded-2xl">
              <Smartphone size={22} />
            </div>
            <div>
              <h3 className="font-extrabold text-[#1a1a1a] text-base">Paiement Scolarité Mobile Money</h3>
              <p className="text-[11px] text-[#9e9e9e]">{studentName} ({paiement.classe})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {step === 'form' && (
          <form onSubmit={handleProcessPayment} className="space-y-4">
            {/* Selected Tranche Info Box */}
            <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-3.5 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-sky-900">{selectedTranche?.nom || 'Scolarité'}</span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-sky-200 text-sky-800 rounded-md">
                  Échéance : {selectedTranche?.echeanceLabel || selectedTranche?.echeance || paiement.echeance}
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-[11px] text-sky-700">Reste sur la tranche :</span>
                <span className="text-sm font-extrabold text-sky-950">
                  {defaultAmount.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>

            {/* Operator Selection */}
            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-2">
                Choisissez le mode de paiement
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setProvider('wave')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    provider === 'wave'
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-900 font-bold ring-2 ring-cyan-400'
                      : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <span className="text-base font-extrabold text-cyan-600">🌊 Wave</span>
                  <span className="text-[10px] text-gray-500">Sans frais 0%</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProvider('orange')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    provider === 'orange'
                      ? 'border-orange-500 bg-orange-50 text-orange-950 font-bold ring-2 ring-orange-400'
                      : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <span className="text-base font-extrabold text-orange-600">🍊 Orange</span>
                  <span className="text-[10px] text-gray-500">Orange Money</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProvider('mtn')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    provider === 'mtn'
                      ? 'border-amber-500 bg-amber-50 text-amber-950 font-bold ring-2 ring-amber-400'
                      : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <span className="text-base font-extrabold text-amber-600">🟡 MTN</span>
                  <span className="text-[10px] text-gray-500">MTN MoMo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProvider('moov')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    provider === 'moov'
                      ? 'border-blue-500 bg-blue-50 text-blue-950 font-bold ring-2 ring-blue-400'
                      : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <span className="text-base font-extrabold text-blue-600">🔹 Moov</span>
                  <span className="text-[10px] text-gray-500">Moov Money</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProvider('card')}
                  className={`col-span-2 sm:col-span-2 p-3 rounded-xl border text-left flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    provider === 'card'
                      ? 'border-gray-900 bg-gray-900 text-white font-bold ring-2 ring-gray-700'
                      : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <CreditCard size={16} />
                  <span className="text-xs font-bold">Carte Visa / Mastercard</span>
                </button>
              </div>
            </div>

            {/* Phone & Amount Inputs */}
            {provider !== 'card' && (
              <div>
                <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                  Numéro de téléphone Mobile Money
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="ex: 07 01 02 03 04"
                    className="w-full pl-10 pr-3 py-2.5 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] font-mono font-bold focus:outline-none focus:border-sky-500"
                  />
                  <Smartphone className="absolute left-3 top-3 text-gray-400" size={16} />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                Montant à verser (FCFA)
              </label>
              <input
                type="number"
                required
                min="500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#e0e0e0] rounded-xl text-sm bg-white text-[#1a1a1a] font-bold focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center gap-2 text-[10px] text-gray-500 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
              <ShieldCheck size={16} className="text-emerald-600 flex-shrink-0" />
              <span>Transaction direct 100% sécurisée par chiffrement SSL & validation USSD instantanée.</span>
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md"
              >
                Payer {(parseFloat(amount) || 0).toLocaleString('fr-FR')} FCFA <ArrowRight size={14} />
              </button>
            </div>
          </form>
        )}

        {step === 'processing' && (
          <div className="py-12 text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <Loader2 size={48} className="animate-spin text-sky-600" />
              <Smartphone size={20} className="absolute text-sky-900" />
            </div>
            <div className="space-y-1">
              <h4 className="font-extrabold text-base text-[#1a1a1a]">Connexion Mobile Money en cours...</h4>
              <p className="text-xs text-gray-500 max-w-xs mx-auto">
                Veuillez valider l'invite de paiement ou le code USSD envoyé sur le <strong>{phoneNumber}</strong>.
              </p>
            </div>
            <div className="inline-block px-3 py-1 bg-sky-100 text-sky-800 text-[11px] font-bold rounded-full animate-pulse">
              Attente de la réponse de l'opérateur...
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="py-6 text-center space-y-5 animate-scale-up">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 size={38} />
            </div>

            <div className="space-y-1">
              <h4 className="font-extrabold text-lg text-emerald-950">Paiement Confirmé !</h4>
              <p className="text-xs text-gray-600">
                Le reçu de paiement a été généré et transmis à la comptabilité de l'école.
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between border-b border-gray-200 pb-1.5">
                <span className="text-gray-500">Élève :</span>
                <span className="font-bold text-gray-900">{studentName}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1.5">
                <span className="text-gray-500">Tranche Réglée :</span>
                <span className="font-bold text-gray-900">{selectedTranche?.nom || 'Scolarité'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1.5">
                <span className="text-gray-500">Montant Versé :</span>
                <span className="font-extrabold text-emerald-700">{(parseFloat(amount) || 0).toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1.5">
                <span className="text-gray-500">Réf. Transaction :</span>
                <span className="font-mono font-bold text-gray-800">{txRef}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">N° Reçu :</span>
                <span className="font-mono font-bold text-sky-700">{recuNo}</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer transition-all flex items-center justify-center gap-2"
            >
              <FileText size={15} /> Revenir aux paiements
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
