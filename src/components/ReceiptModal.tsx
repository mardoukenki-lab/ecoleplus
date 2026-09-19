import React, { useRef } from 'react';
import { Paiement } from '../types';
import { X, Printer, CheckCircle2, Building2, ShieldCheck } from 'lucide-react';

interface ReceiptModalProps {
  receipt: {
    date: string;
    montant: number;
    mode: string;
    recuNo?: string;
    trancheNom?: string;
    transactionRef?: string;
  };
  studentName: string;
  studentClass: string;
  totalTuition: number;
  totalPaid: number;
  remainingBalance: number;
  schoolName?: string;
  onClose: () => void;
}

export default function ReceiptModal({
  receipt,
  studentName,
  studentClass,
  totalTuition,
  totalPaid,
  remainingBalance,
  schoolName = 'Complexe Scolaire Akpany',
  onClose
}: ReceiptModalProps) {
  const receiptNumber = receipt.recuNo || receipt.transactionRef || `REC-${Date.now().toString().slice(-6)}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-[24px] max-w-lg w-full border border-[#e0e0e0] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header (hidden on print) */}
        <div className="px-6 py-4 border-b border-[#e0e0e0] flex items-center justify-between bg-[#fcfcfc] print:hidden">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-700" />
            <div>
              <h3 className="font-bold text-sm text-[#1a1a1a]">Reçu de Paiement à la Caisse</h3>
              <p className="text-[11px] text-[#9e9e9e]">Justificatif officiel d'encaissement délivré par l'école</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors cursor-pointer"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Printable Receipt Body */}
        <div id="printable-receipt" className="p-6 sm:p-8 space-y-6 overflow-y-auto bg-white">
          {/* School Header */}
          <div className="border-b-2 border-[#1a1a1a] pb-4 flex justify-between items-start">
            <div>
              <h2 className="font-black text-base text-[#1a1a1a] uppercase tracking-wide">{schoolName}</h2>
              <p className="text-[11px] text-gray-600 font-medium">Service Comptabilité & Caisse</p>
              <p className="text-[10px] text-gray-500">Règlement direct des frais de scolarité</p>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-md text-[10px] font-extrabold uppercase tracking-wider">
                Reçu de Caisse
              </span>
              <p className="font-mono text-xs font-bold text-[#1a1a1a] mt-1.5">{receiptNumber}</p>
              <p className="text-[10px] text-gray-500">Date : {receipt.date}</p>
            </div>
          </div>

          {/* Student & Class Info Box */}
          <div className="bg-[#f9f9f9] border border-[#e0e0e0] rounded-xl p-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Élève</span>
              <span className="font-bold text-[#1a1a1a] text-sm">{studentName}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Classe</span>
              <span className="font-bold text-[#1a1a1a] text-sm">{studentClass}</span>
            </div>
            <div className="col-span-2 border-t border-[#e5e5e5] pt-2 flex justify-between items-center text-[11px]">
              <span className="text-gray-600 font-medium">Motif du versement :</span>
              <span className="font-bold text-[#1a1a1a]">{receipt.trancheNom || 'Frais de scolarité'}</span>
            </div>
          </div>

          {/* Payment Amount Highlight */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-900 block">Montant encaissé</span>
                <span className="text-xs text-emerald-800 font-medium">Mode : <strong>{receipt.mode}</strong></span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl sm:text-2xl font-black text-emerald-700 font-mono">
                {receipt.montant.toLocaleString('fr-FR')} <span className="text-sm font-bold">FCFA</span>
              </span>
            </div>
          </div>

          {/* Financial Breakdown Summary */}
          <div className="border border-[#e0e0e0] rounded-xl p-4 space-y-2 text-xs">
            <div className="flex justify-between text-gray-600 font-medium">
              <span>Scolarité totale due :</span>
              <span className="font-semibold text-[#1a1a1a]">{totalTuition.toLocaleString('fr-FR')} FCFA</span>
            </div>
            <div className="flex justify-between text-gray-600 font-medium">
              <span>Cumul réglé à la caisse :</span>
              <span className="font-bold text-emerald-600">{totalPaid.toLocaleString('fr-FR')} FCFA</span>
            </div>
            <div className="border-t border-[#e0e0e0] pt-2 flex justify-between font-bold">
              <span className="text-gray-700">Solde restant après ce versement :</span>
              <span className={remainingBalance > 0 ? 'text-amber-800 font-extrabold' : 'text-emerald-700'}>
                {remainingBalance <= 0 ? '0 FCFA (Soldé)' : `${remainingBalance.toLocaleString('fr-FR')} FCFA`}
              </span>
            </div>
          </div>

          {/* Signature & Stamp Section */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-dashed border-[#e0e0e0] text-center text-xs">
            <div className="p-3 border border-[#f0f0f0] rounded-xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-8">
                Signature du déposant / parent
              </span>
              <span className="text-[10px] text-gray-400 italic">Lu et approuvé</span>
            </div>
            <div className="p-3 border border-[#f0f0f0] rounded-xl bg-gray-50/50">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Cachet & Signature Caisse
              </span>
              <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full mb-4">
                <ShieldCheck size={11} /> Reçu délivré à la caisse
              </div>
              <p className="text-[9px] text-gray-400">Pour la Direction de l'établissement</p>
            </div>
          </div>

          {/* Legal Note */}
          <p className="text-[10px] text-gray-400 text-center italic">
            Ce document atteste du versement effectué à la caisse centrale de l'établissement. Conservez précieusement ce reçu comme justificatif de paiement.
          </p>
        </div>

        {/* Modal Actions Footer (hidden on print) */}
        <div className="px-6 py-4 border-t border-[#e0e0e0] flex items-center justify-between bg-[#fcfcfc] print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-black hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
          >
            Fermer
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-5 py-2.5 bg-[#1a1a1a] hover:bg-black text-white text-xs font-extrabold rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
          >
            <Printer size={15} /> Imprimer / Sauvegarder en PDF
          </button>
        </div>
      </div>
    </div>
  );
}
