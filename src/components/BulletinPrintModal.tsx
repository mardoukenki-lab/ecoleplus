import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Eleve, Note, Absence } from '../types';
import {
  generateBulletinPDF,
  printBulletinViaIframe,
  getSubjectCoefficient,
  CalculatedBulletinRow,
  BulletinExportData
} from '../lib/bulletinExport';
import { X, Printer, Download, Award, ShieldCheck, Calendar, BookOpen, AlertCircle } from 'lucide-react';

interface BulletinPrintModalProps {
  student: Eleve;
  allStudents?: Eleve[];
  initialTrimestre?: string;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export default function BulletinPrintModal({
  student,
  allStudents = [],
  initialTrimestre = 'Trimestre 1',
  onClose,
  showToast
}: BulletinPrintModalProps) {
  const [selectedTrimestre, setSelectedTrimestre] = useState<string>(initialTrimestre);
  const [notes, setNotes] = useState<Note[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Real-time listener for notes
  useEffect(() => {
    const unsubNotes = onSnapshot(
      collection(db, 'notes'),
      (snap) => {
        const list: Note[] = [];
        snap.forEach((d) => list.push(d.data() as Note));
        setNotes(list);
      },
      (err) => console.warn('BulletinPrintModal notes error:', err)
    );

    const unsubAbs = onSnapshot(
      collection(db, 'absences'),
      (snap) => {
        const list: Absence[] = [];
        snap.forEach((d) => list.push(d.data() as Absence));
        setAbsences(list);
      },
      (err) => console.warn('BulletinPrintModal absences error:', err)
    );

    return () => {
      unsubNotes();
      unsubAbs();
    };
  }, []);

  // Filter student notes for selected trimester
  const studentNotes = notes.filter(
    (n) => n.eleveId === student.id && n.trimestre === selectedTrimestre
  );

  // Filter student absences
  const studentAbsences = absences.filter(
    (a) => a.eleveId === student.id && (a.statut === 'absent' || a.statut === 'retard')
  );
  const absencesCount = studentAbsences.filter((a) => a.statut === 'absent').length;
  const retardsCount = studentAbsences.filter((a) => a.statut === 'retard').length;

  // Find class peers for ranking
  const classPeers = allStudents.filter((s) => s.classe === student.classe);
  const classSize = classPeers.length > 0 ? classPeers.length : 1;

  // Calculate subject rows
  const calculatedRows: CalculatedBulletinRow[] = studentNotes.map((n) => {
    const d1 = n.devoir1 !== undefined && n.devoir1 !== null ? n.devoir1 : null;
    const d2 = n.devoir2 !== undefined && n.devoir2 !== null ? n.devoir2 : null;
    const comp = n.compo !== undefined && n.compo !== null ? n.compo : null;

    let pts = 0;
    let div = 0;
    if (d1 !== null) {
      pts += d1;
      div += 1;
    }
    if (d2 !== null) {
      pts += d2;
      div += 1;
    }
    if (comp !== null) {
      pts += comp * 2;
      div += 2;
    }

    const moyVal = div > 0 ? pts / div : null;
    const coef = getSubjectCoefficient(n.matiere);
    const pointsCoefVal = moyVal !== null ? moyVal * coef : null;

    let app = 'En attente';
    if (moyVal !== null) {
      if (moyVal >= 16) app = 'Très Bien';
      else if (moyVal >= 14) app = 'Bien';
      else if (moyVal >= 12) app = 'Assez Bien';
      else if (moyVal >= 10) app = 'Passable';
      else app = 'Insuffisant';
    }

    return {
      matiere: n.matiere,
      coef,
      devoir1: d1 !== null ? d1 : '—',
      devoir2: d2 !== null ? d2 : '—',
      compo: comp !== null ? comp : '—',
      moyVal,
      moyStr: moyVal !== null ? `${moyVal.toFixed(2)}/20` : '—',
      pointsCoefVal,
      pointsCoefStr: pointsCoefVal !== null ? pointsCoefVal.toFixed(2) : '—',
      rangMatiere: '—',
      app
    };
  });

  // Calculate total coefficients and points
  let totalCoef = 0;
  let totalPoints = 0;
  calculatedRows.forEach((r) => {
    const c = r.coef || 1;
    if (r.moyVal !== null && r.moyVal !== undefined) {
      totalCoef += c;
      totalPoints += r.moyVal * c;
    }
  });

  const overallAverageVal = totalCoef > 0 ? totalPoints / totalCoef : null;
  const overallAverageStr = overallAverageVal !== null ? `${overallAverageVal.toFixed(2)}/20` : '—';

  // Overall mention
  let overallMention = 'Non calculé';
  if (overallAverageVal !== null) {
    if (overallAverageVal >= 16) overallMention = 'EXCELLENT — TABLEAU D\'HONNEUR & FÉLICITATIONS';
    else if (overallAverageVal >= 14) overallMention = 'TRÈS BIEN — TABLEAU D\'HONNEUR & ENCOURAGEMENTS';
    else if (overallAverageVal >= 12) overallMention = 'BIEN — TABLEAU D\'HONNEUR';
    else if (overallAverageVal >= 10) overallMention = 'PASSABLE — PEUT MIEUX FAIRE';
    else overallMention = 'INSUFFISANT — TRAVAIL ET EFFORT À REVOIR';
  }

  // Class ranking calculation across class peers
  const peerAverages: { studentId: string; avg: number }[] = [];
  classPeers.forEach((peer) => {
    const pNotes = notes.filter((n) => n.eleveId === peer.id && n.trimestre === selectedTrimestre);
    let pPts = 0;
    let pCoefs = 0;
    pNotes.forEach((n) => {
      const d1 = n.devoir1 !== null && n.devoir1 !== undefined ? n.devoir1 : null;
      const d2 = n.devoir2 !== null && n.devoir2 !== undefined ? n.devoir2 : null;
      const comp = n.compo !== null && n.compo !== undefined ? n.compo : null;
      let sPts = 0;
      let sDiv = 0;
      if (d1 !== null) {
        sPts += d1;
        sDiv += 1;
      }
      if (d2 !== null) {
        sPts += d2;
        sDiv += 1;
      }
      if (comp !== null) {
        sPts += comp * 2;
        sDiv += 2;
      }
      if (sDiv > 0) {
        const sMoy = sPts / sDiv;
        const c = getSubjectCoefficient(n.matiere);
        pPts += sMoy * c;
        pCoefs += c;
      }
    });
    if (pCoefs > 0) {
      peerAverages.push({ studentId: peer.id, avg: pPts / pCoefs });
    }
  });

  peerAverages.sort((a, b) => b.avg - a.avg);
  const myIndex = peerAverages.findIndex((p) => p.studentId === student.id);
  const classRank = myIndex !== -1 ? `${myIndex + 1}${myIndex === 0 ? 'er' : 'e'}` : '—';
  const highestAverage = peerAverages.length > 0 ? `${peerAverages[0].avg.toFixed(2)}/20` : '—';
  const lowestAverage =
    peerAverages.length > 0 ? `${peerAverages[peerAverages.length - 1].avg.toFixed(2)}/20` : '—';
  const classAvgNum =
    peerAverages.length > 0 ? peerAverages.reduce((acc, p) => acc + p.avg, 0) / peerAverages.length : null;
  const classAverage = classAvgNum !== null ? `${classAvgNum.toFixed(2)}/20` : '—';

  const exportData: BulletinExportData = {
    student,
    trimestre: selectedTrimestre,
    anneeScolaire: '2025 - 2026',
    rows: calculatedRows,
    totalCoef: totalCoef > 0 ? totalCoef : calculatedRows.length,
    totalPoints,
    overallAverageVal,
    overallAverageStr,
    overallMention,
    classRank,
    classSize,
    classAverage,
    highestAverage,
    lowestAverage,
    absencesCount,
    retardsCount,
    schoolName: 'AKPANY SCHOOL'
  };

  const handleDownloadPDF = () => {
    try {
      setIsGeneratingPDF(true);
      generateBulletinPDF(exportData);
      showToast(`📥 Téléchargement du Bulletin PDF pour ${student.nom} (${selectedTrimestre})`);
    } catch (err) {
      console.error('PDF generation error:', err);
      showToast('❌ Erreur lors de la création du fichier PDF.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handlePrint = () => {
    try {
      printBulletinViaIframe(exportData);
      showToast(`🖨️ Préparation de l'impression du bulletin pour ${student.nom}...`);
    } catch (err) {
      console.error('Print error:', err);
      showToast('❌ Échec du lancement de l\'impression.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-[24px] shadow-2xl border border-[#e0e0e0] w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header Toolbar */}
        <div className="bg-[#1a1a1a] text-white p-4 sm:p-5 flex items-center justify-between gap-4 flex-wrap border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-lg font-bold">
              📄
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
                Bulletin Scolaire Officiel
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
                  Prêt à imprimer
                </span>
              </h2>
              <p className="text-xs text-[#9e9e9e]">
                {student.nom} · {student.classe} · Matricule : {student.code || '—'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Trimester Select */}
            <select
              value={selectedTrimestre}
              onChange={(e) => setSelectedTrimestre(e.target.value)}
              className="bg-[#2a2a2a] text-white text-xs font-bold px-3 py-2 rounded-xl border border-white/20 focus:outline-none focus:border-white"
            >
              <option value="Trimestre 1">1er Trimestre</option>
              <option value="Trimestre 2">2ème Trimestre</option>
              <option value="Trimestre 3">3ème Trimestre</option>
            </select>

            {/* Direct PDF Download */}
            <button
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className="bg-white hover:bg-[#f5f5f5] text-[#1a1a1a] font-bold py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer uppercase tracking-widest transition-all shadow-sm active:scale-95"
            >
              <Download size={14} />
              {isGeneratingPDF ? 'Génération...' : 'Télécharger PDF'}
            </button>

            {/* Direct Print */}
            <button
              onClick={handlePrint}
              className="bg-[#2a2a2a] hover:bg-[#333333] text-white font-bold py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer uppercase tracking-widest transition-all border border-white/20 active:scale-95"
            >
              <Printer size={14} /> Imprimer
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Printable Bulletin Document Preview Card */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-[#f5f5f5]/60 space-y-4">
          <div className="bg-white rounded-2xl border border-[#e0e0e0] shadow-sm p-6 sm:p-8 space-y-6 max-w-3xl mx-auto">
            {/* National Header */}
            <div className="flex justify-between items-start border-b border-[#e0e0e0] pb-4 flex-wrap gap-2 text-xs">
              <div>
                <span className="font-bold text-[#1a1a1a] uppercase text-[10px] tracking-wider block">
                  RÉPUBLIQUE DE CÔTE D'IVOIRE
                </span>
                <span className="text-[9px] text-[#9e9e9e] italic block">Union - Discipline - Travail</span>
                <span className="text-[9px] text-[#616161] font-bold mt-1 block">
                  MINISTÈRE DE L'ÉDUCATION NATIONALE ET DE L'ALPHABÉTISATION
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold text-[#1a1a1a] text-[10px] block">Année Scolaire : 2025 - 2026</span>
                <span className="text-[9px] text-[#9e9e9e] block">
                  Édité le : {new Date().toLocaleDateString('fr-FR')}
                </span>
                <span className="text-[9px] text-[#9e9e9e] font-mono block">Portail : demo.akpanyschool.store</span>
              </div>
            </div>

            {/* School Banner */}
            <div className="bg-[#1a1a1a] text-white p-5 rounded-2xl flex justify-between items-center flex-wrap gap-3">
              <div>
                <h3 className="font-sans font-bold text-lg text-white tracking-tight">🏫 AKPANY SCHOOL</h3>
                <p className="text-xs text-[#9e9e9e] mt-0.5">
                  Bulletin Trimestriel Officiel — <strong className="text-white">{selectedTrimestre}</strong>
                </p>
              </div>
              <div className="bg-[#2a2a2a] px-3.5 py-2 rounded-xl border border-white/10 text-right">
                <span className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-wider block">Classe</span>
                <span className="text-xs font-bold text-white">{student.classe}</span>
              </div>
            </div>

            {/* Student Info Box */}
            <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider min-w-[85px]">
                    Élève :
                  </span>
                  <span className="font-bold text-[#0f172a]">{student.nom}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider min-w-[85px]">
                    Matricule :
                  </span>
                  <span className="font-mono text-[#0f172a] font-bold">{student.code || 'NON ATTRIBUÉ'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider min-w-[85px]">
                    Assiduité :
                  </span>
                  <span className="text-[#0f172a] font-semibold">
                    {absencesCount} absence(s) · {retardsCount} retard(s)
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider min-w-[85px]">
                    Classe :
                  </span>
                  <span className="font-bold text-[#0f172a]">
                    {student.classe} (Effectif : {classSize} élèves)
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider min-w-[85px]">
                    Rang :
                  </span>
                  <span className="font-bold text-indigo-700">{classRank} sur {classSize}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider min-w-[85px]">
                    Statut :
                  </span>
                  <span className="text-emerald-700 font-bold">Inscrit(e) régulier(ère)</span>
                </div>
              </div>
            </div>

            {/* Notes Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#1a1a1a] bg-[#1a1a1a] text-white text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Matière Enseignée</th>
                    <th className="py-2.5 px-2 text-center">Coef</th>
                    <th className="py-2.5 px-2 text-center">Devoir 1</th>
                    <th className="py-2.5 px-2 text-center">Devoir 2</th>
                    <th className="py-2.5 px-2 text-center">Compo</th>
                    <th className="py-2.5 px-2 text-center">Moy /20</th>
                    <th className="py-2.5 px-2 text-center">Points</th>
                    <th className="py-2.5 px-3 text-center">Appréciation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0e0e0]/60">
                  {calculatedRows.map((row, i) => (
                    <tr key={i} className="hover:bg-[#f5f5f5]/30">
                      <td className="py-2.5 px-3 font-bold text-[#1a1a1a]">{row.matiere}</td>
                      <td className="py-2.5 px-2 text-center font-bold text-[#616161]">{row.coef}</td>
                      <td className="py-2.5 px-2 text-center text-[#1a1a1a]">{row.devoir1}</td>
                      <td className="py-2.5 px-2 text-center text-[#1a1a1a]">{row.devoir2}</td>
                      <td className="py-2.5 px-2 text-center text-[#1a1a1a]">{row.compo}</td>
                      <td className="py-2.5 px-2 text-center font-bold text-[#1a1a1a]">{row.moyStr}</td>
                      <td className="py-2.5 px-2 text-center font-semibold text-[#1a1a1a]">{row.pointsCoefStr}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="bg-[#1a1a1a] text-white text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                          {row.app}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {calculatedRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-[#9e9e9e]">
                        Aucune note renseignée pour cet élève au {selectedTrimestre}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary Box */}
            <div className="bg-[#f8fafc] border border-[#cbd5e1] rounded-xl p-4 flex flex-wrap justify-between items-center gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] block">
                  Bilan du Conseil de Classe
                </span>
                <div className="text-xs font-bold text-[#0f172a]">{overallMention}</div>
                <div className="text-[10px] text-[#64748b]">
                  Total Coefs : <strong>{totalCoef}</strong> · Points : <strong>{totalPoints.toFixed(2)}</strong> ·
                  Moy. Classe : <strong>{classAverage}</strong>
                </div>
              </div>

              <div className="bg-[#1a1a1a] text-white px-5 py-3 rounded-xl text-center">
                <span className="text-[9px] uppercase tracking-wider text-[#9e9e9e] block">Moyenne Générale</span>
                <div className="text-xl font-black text-white">{overallAverageStr}</div>
                <span className="text-[9px] text-[#9e9e9e] block mt-0.5">Rang : {classRank} / {classSize}</span>
              </div>
            </div>

            {/* Signatures Area */}
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#e0e0e0]">
              <div className="border border-dashed border-[#94a3b8] rounded-xl p-3 h-24 flex flex-col justify-between text-[9px]">
                <span className="font-bold text-[#334155] uppercase">Le Professeur Principal</span>
                <span className="text-[#94a3b8] italic">Visa & Remarques</span>
              </div>
              <div className="border border-dashed border-[#94a3b8] rounded-xl p-3 h-24 flex flex-col justify-between text-[9px]">
                <span className="font-bold text-[#334155] uppercase">Les Parents d'Élève</span>
                <span className="text-[#94a3b8] italic">Signature & Date</span>
              </div>
              <div className="border border-dashed border-[#94a3b8] rounded-xl p-3 h-24 flex flex-col justify-between text-[9px] relative overflow-hidden">
                <span className="font-bold text-[#334155] uppercase">Le Chef d'Établissement</span>
                <div className="absolute right-2 bottom-2 border-2 border-blue-600 rounded-full w-10 h-10 flex flex-col items-center justify-center text-blue-600 text-[6px] font-black rotate-[-12deg] opacity-80">
                  <span>AKPANY</span>
                  <span>SCEAU</span>
                </div>
              </div>
            </div>

            {/* Footer Notice */}
            <div className="text-center text-[9px] text-[#9e9e9e] pt-2">
              Document officiel édité par le portail AKPANY SCHOOL (demo.akpanyschool.store).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
