import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Eleve, Note, UserProfile } from '../types';
import { Award, Printer, Download, BookOpen, User, Sparkles } from 'lucide-react';

interface BulletinViewProps {
  currentUser: UserProfile;
  studentsList: Eleve[];
  showToast: (msg: string) => void;
}

export default function BulletinView({ currentUser, studentsList, showToast }: BulletinViewProps) {
  const [selectedStudentId, setSelectedStudentId] = useState<string>(studentsList[0]?.id || '');
  const [selectedTrimestre, setSelectedTrimestre] = useState<string>('Trimestre 1');
  const [allNotes, setAllNotes] = useState<Note[]>([]);

  useEffect(() => {
    if (studentsList.length > 0 && (!selectedStudentId || !studentsList.some((s) => s.id === selectedStudentId))) {
      setSelectedStudentId(studentsList[0].id);
    }
  }, [studentsList]);

  // Fetch real notes from Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'notes'),
      (snap) => {
        const list: Note[] = [];
        snap.forEach((d) => list.push(d.data() as Note));
        setAllNotes(list);
      },
      (err) => console.warn('Bulletin notes listener error:', err)
    );
    return () => unsub();
  }, []);

  const selectedStudent = studentsList.find((s) => s.id === selectedStudentId);

  // Filter notes for the selected student & trimestre
  const studentNotes = allNotes.filter(
    (n) => n.eleveId === selectedStudentId && n.trimestre === selectedTrimestre
  );

  // Calculate subject average: (devoir1 + devoir2 + 2*compo) / 4
  const calculatedRows = studentNotes.map((n) => {
    const d1 = n.devoir1 !== undefined ? n.devoir1 : null;
    const d2 = n.devoir2 !== undefined ? n.devoir2 : null;
    const comp = n.compo !== undefined ? n.compo : null;

    let totalPoints = 0;
    let totalCoef = 0;

    if (d1 !== null) {
      totalPoints += d1;
      totalCoef += 1;
    }
    if (d2 !== null) {
      totalPoints += d2;
      totalCoef += 1;
    }
    if (comp !== null) {
      totalPoints += comp * 2;
      totalCoef += 2;
    }

    const moyVal = totalCoef > 0 ? totalPoints / totalCoef : null;
    const moyStr = moyVal !== null ? `${moyVal.toFixed(1)}/20` : '—';

    let app = 'En attente';
    if (moyVal !== null) {
      if (moyVal >= 16) app = 'Très Bien';
      else if (moyVal >= 14) app = 'Bien';
      else if (moyVal >= 12) app = 'Assez Bien';
      else if (moyVal >= 10) app = 'Passable';
      else app = 'Insuffisant';
    }

    return {
      id: n.id,
      matiere: n.matiere,
      devoir1: d1 !== null ? d1 : '—',
      devoir2: d2 !== null ? d2 : '—',
      compo: comp !== null ? comp : '—',
      moyVal,
      moyStr,
      app,
    };
  });

  // Calculate overall average
  const validMoyennes = calculatedRows.filter((r) => r.moyVal !== null).map((r) => r.moyVal!);
  const overallAverageVal =
    validMoyennes.length > 0 ? validMoyennes.reduce((a, b) => a + b, 0) / validMoyennes.length : null;

  const overallAverageStr = overallAverageVal !== null ? `${overallAverageVal.toFixed(2)}/20` : '—';

  let overallMention = 'Non calculé';
  if (overallAverageVal !== null) {
    if (overallAverageVal >= 16) overallMention = 'EXCELLENT — FÉLICITATIONS';
    else if (overallAverageVal >= 14) overallMention = 'TRÈS BIEN — ENCOURAGEMENTS';
    else if (overallAverageVal >= 12) overallMention = 'BIEN — TABLEAU D\'HONNEUR';
    else if (overallAverageVal >= 10) overallMention = 'PASSABLE — PEUT MIEUX FAIRE';
    else overallMention = 'INSUFFISANT — TRAVAIL À REVOIR';
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-5 shadow-sm flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Sélectionner un Élève</label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
            >
              {studentsList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom} ({s.classe}) — {s.code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Période / Trimestre</label>
            <select
              value={selectedTrimestre}
              onChange={(e) => setSelectedTrimestre(e.target.value)}
              className="px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
            >
              <option value="Trimestre 1">1er Trimestre</option>
              <option value="Trimestre 2">2ème Trimestre</option>
              <option value="Trimestre 3">3ème Trimestre</option>
            </select>
          </div>
        </div>

        <button
          onClick={handlePrint}
          className="bg-[#1a1a1a] hover:bg-black text-white font-bold py-2.5 px-5 rounded-xl text-xs flex items-center gap-2 cursor-pointer uppercase tracking-widest transition-all shadow-2xs"
        >
          <Printer size={15} /> Imprimer le Bulletin
        </button>
      </div>

      {/* Official Bulletin Document Card */}
      <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden print:shadow-none print:border-none">
        {/* Banner */}
        <div className="bg-[#1a1a1a] text-white p-6 sm:p-8 flex justify-between items-start flex-wrap gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e]">
              REPUBLIQUE DE COTE D'IVOIRE · ECOLEPLUS
            </span>
            <h2 className="font-sans font-bold text-2xl mt-1 tracking-tight">Bulletin Trimestriel de Notes</h2>
            <p className="text-xs text-[#9e9e9e] mt-1 font-medium">Relevé officiel des résultats scolaires en direct</p>
          </div>

          {selectedStudent && (
            <div className="bg-[#2a2a2a] p-4 rounded-2xl border border-white/10 text-right space-y-1">
              <div className="text-sm font-bold text-white">{selectedStudent.nom}</div>
              <div className="text-xs text-[#9e9e9e]">Classe : <strong className="text-white">{selectedStudent.classe}</strong></div>
              <div className="text-[10px] text-[#9e9e9e] font-mono">Code : {selectedStudent.code}</div>
            </div>
          )}
        </div>

        {/* Notes Table */}
        <div className="p-6 sm:p-8 space-y-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] bg-[#f5f5f5]/30">
                <th className="py-3 px-4">Matière Enseignée</th>
                <th className="py-3 px-4">Devoir 1</th>
                <th className="py-3 px-4">Devoir 2</th>
                <th className="py-3 px-4">Compo / Exam</th>
                <th className="py-3 px-4">Moyenne /20</th>
                <th className="py-3 px-4">Appréciation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
              {calculatedRows.map((row) => (
                <tr key={row.id} className="hover:bg-[#f5f5f5]/20">
                  <td className="py-3.5 px-4 font-bold text-[#1a1a1a]">{row.matiere}</td>
                  <td className="py-3.5 px-4 font-medium text-[#1a1a1a]">{row.devoir1}</td>
                  <td className="py-3.5 px-4 font-medium text-[#1a1a1a]">{row.devoir2}</td>
                  <td className="py-3.5 px-4 font-medium text-[#1a1a1a]">{row.compo}</td>
                  <td className="py-3.5 px-4 font-bold text-[#1a1a1a] text-sm">{row.moyStr}</td>
                  <td className="py-3.5 px-4">
                    <span className="bg-[#1a1a1a] text-white text-[9px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider">
                      {row.app}
                    </span>
                  </td>
                </tr>
              ))}

              {calculatedRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-xs text-[#9e9e9e]">
                    Aucune note enregistrée pour cet élève au {selectedTrimestre}.<br />
                    <span className="text-[11px]">Les enseignants peuvent saisir les notes depuis leur espace "Saisie des notes".</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Bulletin Footer Summary */}
          {calculatedRows.length > 0 && (
            <div className="bg-[#f5f5f5] rounded-2xl p-6 border border-[#e0e0e0] flex flex-wrap justify-between items-center gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] block">Bilan général de l'élève</span>
                <div className="text-sm font-bold text-[#1a1a1a] mt-0.5">{overallMention}</div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] block">Moyenne Générale</span>
                <div className="text-2xl font-bold font-sans text-[#1a1a1a]">{overallAverageStr}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
