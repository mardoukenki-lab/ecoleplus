import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Eleve, Note, Absence, UserProfile } from '../types';
import {
  Award,
  Printer,
  Download,
  BookOpen,
  User,
  Sparkles,
  FileText,
  Eye,
  Filter,
  Search,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import {
  generateBulletinPDF,
  generateClassBulletinsPDF,
  printBulletinViaIframe,
  computeStudentBulletinData,
  CalculatedBulletinRow,
  BulletinExportData
} from '../lib/bulletinExport';
import BulletinPrintModal from './BulletinPrintModal';

interface BulletinViewProps {
  currentUser: UserProfile;
  studentsList: Eleve[];
  showToast: (msg: string) => void;
}

export default function BulletinView({ currentUser, studentsList, showToast }: BulletinViewProps) {
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(studentsList[0]?.id || '');
  const [selectedTrimestre, setSelectedTrimestre] = useState<string>('Trimestre 1');
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [allAbsences, setAllAbsences] = useState<Absence[]>([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isExportingClassPDF, setIsExportingClassPDF] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Extract distinct classes
  const availableClasses = useMemo(() => {
    const classes = Array.from(new Set(studentsList.map((s) => s.classe).filter(Boolean)));
    return classes.sort();
  }, [studentsList]);

  // Filter students based on class filter and search
  const filteredStudents = useMemo(() => {
    return studentsList.filter((s) => {
      const matchClass = selectedClassFilter === 'all' || s.classe === selectedClassFilter;
      const matchSearch =
        !searchQuery ||
        s.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.code && s.code.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchClass && matchSearch;
    });
  }, [studentsList, selectedClassFilter, searchQuery]);

  // Ensure an active student is always selected
  useEffect(() => {
    if (filteredStudents.length > 0 && (!selectedStudentId || !filteredStudents.some((s) => s.id === selectedStudentId))) {
      setSelectedStudentId(filteredStudents[0].id);
    }
  }, [filteredStudents, selectedStudentId]);

  // Fetch real notes from Firestore
  useEffect(() => {
    const unsubNotes = onSnapshot(
      collection(db, 'notes'),
      (snap) => {
        const list: Note[] = [];
        snap.forEach((d) => list.push(d.data() as Note));
        setAllNotes(list);
      },
      (err) => console.warn('Bulletin notes listener error:', err)
    );

    const unsubAbs = onSnapshot(
      collection(db, 'absences'),
      (snap) => {
        const list: Absence[] = [];
        snap.forEach((d) => list.push(d.data() as Absence));
        setAllAbsences(list);
      },
      (err) => console.warn('Bulletin absences listener error:', err)
    );

    return () => {
      unsubNotes();
      unsubAbs();
    };
  }, []);

  const selectedStudent = studentsList.find((s) => s.id === selectedStudentId);

  // Unified Bulletin Data for the currently selected student
  const exportData: BulletinExportData | null = useMemo(() => {
    if (!selectedStudent) return null;
    return computeStudentBulletinData(
      selectedStudent,
      selectedTrimestre,
      allNotes,
      allAbsences,
      studentsList,
      'AKPANY SCHOOL'
    );
  }, [selectedStudent, selectedTrimestre, allNotes, allAbsences, studentsList]);

  const calculatedRows = exportData?.rows || [];
  const totalCoef = exportData?.totalCoef || 0;
  const totalPoints = exportData?.totalPoints || 0;
  const overallAverageStr = exportData?.overallAverageStr || '—';
  const overallMention = exportData?.overallMention || 'Non calculé';
  const classRank = exportData?.classRank || '—';
  const classSize = exportData?.classSize || 1;
  const classAverage = exportData?.classAverage || '—';
  const absencesCount = exportData?.absencesCount || 0;
  const retardsCount = exportData?.retardsCount || 0;

  // Actions
  const handleExportPDF = () => {
    if (!selectedStudent || !exportData) {
      showToast('⚠️ Veuillez sélectionner un élève valide.');
      return;
    }
    try {
      setIsGeneratingPDF(true);
      generateBulletinPDF(exportData);
      showToast(`📥 Bulletin PDF généré et téléchargé pour ${selectedStudent.nom} (${selectedTrimestre}) !`);
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('❌ Erreur lors de la génération du bulletin PDF.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleExportClassPDF = async () => {
    if (filteredStudents.length === 0) {
      showToast('⚠️ Aucun élève trouvé pour cette sélection.');
      return;
    }

    try {
      setIsExportingClassPDF(true);
      const targetClass = selectedClassFilter !== 'all' ? selectedClassFilter : (filteredStudents[0]?.classe || 'Toutes_Classes');
      showToast(`⏳ Préparation de l'exportation PDF pour ${filteredStudents.length} élèves...`);

      // Yield for UI spinner
      await new Promise((resolve) => setTimeout(resolve, 60));

      const classDataList: BulletinExportData[] = filteredStudents.map((s) =>
        computeStudentBulletinData(s, selectedTrimestre, allNotes, allAbsences, studentsList, 'AKPANY SCHOOL')
      );

      generateClassBulletinsPDF(classDataList, {
        classe: targetClass,
        trimestre: selectedTrimestre,
        schoolName: 'AKPANY SCHOOL'
      });

      showToast(`✅ Livret PDF officiel (${classDataList.length} bulletins) généré avec succès pour ${targetClass} !`);
    } catch (err) {
      console.error('Batch class PDF error:', err);
      showToast('❌ Erreur lors de la création du livret PDF de la classe.');
    } finally {
      setIsExportingClassPDF(false);
    }
  };

  const handlePrint = () => {
    if (!selectedStudent || !exportData) {
      showToast('⚠️ Veuillez sélectionner un élève valide.');
      return;
    }
    try {
      printBulletinViaIframe(exportData);
      showToast(`🖨️ Préparation de l'impression du bulletin pour ${selectedStudent.nom}...`);
    } catch (err) {
      console.error('Print error:', err);
      showToast('❌ Erreur lors du lancement de l\'impression.');
    }
  };

  const handlePrint = () => {
    if (!selectedStudent || !exportData) {
      showToast('⚠️ Veuillez sélectionner un élève valide.');
      return;
    }
    try {
      printBulletinViaIframe(exportData);
      showToast(`🖨️ Préparation de l'impression du bulletin pour ${selectedStudent.nom}...`);
    } catch (err) {
      console.error('Print error:', err);
      showToast('❌ Erreur lors du lancement de l\'impression.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Printable Modal */}
      {showPrintModal && selectedStudent && (
        <BulletinPrintModal
          student={selectedStudent}
          allStudents={studentsList}
          initialTrimestre={selectedTrimestre}
          onClose={() => setShowPrintModal(false)}
          showToast={showToast}
        />
      )}

      {/* Control Bar */}
      <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap flex-1 min-w-[280px]">
            {/* Class filter if multiple classes */}
            {availableClasses.length > 1 && (
              <div>
                <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1 flex items-center gap-1">
                  <Filter size={10} /> Classe
                </label>
                <select
                  value={selectedClassFilter}
                  onChange={(e) => setSelectedClassFilter(e.target.value)}
                  className="px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
                >
                  <option value="all">Toutes les classes ({studentsList.length})</option>
                  {availableClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quick search input */}
            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1 flex items-center gap-1">
                <Search size={10} /> Recherche
              </label>
              <input
                type="text"
                placeholder="Nom ou code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a] w-32 sm:w-40"
              />
            </div>

            {/* Student Selector */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                Sélectionner un Élève
              </label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
              >
                {filteredStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom} ({s.classe}) — {s.code || 'Sans code'}
                  </option>
                ))}
                {filteredStudents.length === 0 && <option value="">Aucun élève correspondant</option>}
              </select>
            </div>

            {/* Trimester Select */}
            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                Période / Trimestre
              </label>
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

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Batch class export for administrators and teachers */}
            <button
              onClick={handleExportClassPDF}
              disabled={isExportingClassPDF || filteredStudents.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-2 cursor-pointer uppercase tracking-widest transition-all shadow-sm active:scale-95 disabled:opacity-50"
              title={`Télécharger le livret PDF officiel regroupant les bulletins de toute la classe (${filteredStudents.length} élèves)`}
            >
              <FileText size={15} />
              {isExportingClassPDF ? 'Exportation...' : `Exporter la classe (PDF)`}
            </button>

            <button
              onClick={() => setShowPrintModal(true)}
              className="bg-[#f5f5f5] hover:bg-[#e0e0e0] text-[#1a1a1a] font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-2 cursor-pointer uppercase tracking-widest transition-all border border-[#e0e0e0] active:scale-95"
            >
              <Eye size={15} /> Aperçu Papier
            </button>

            <button
              onClick={handleExportPDF}
              disabled={isGeneratingPDF || !selectedStudent}
              className="bg-[#1a1a1a] hover:bg-black text-white font-bold py-2.5 px-5 rounded-xl text-xs flex items-center gap-2 cursor-pointer uppercase tracking-widest transition-all shadow-sm active:scale-95 disabled:opacity-50"
              title="Télécharger le bulletin individuel de l'élève en PDF"
            >
              <Download size={15} />
              {isGeneratingPDF ? 'Génération...' : 'Télécharger PDF'}
            </button>

            <button
              onClick={handlePrint}
              disabled={!selectedStudent}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-2 cursor-pointer uppercase tracking-widest transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <Printer size={15} /> Imprimer
            </button>
          </div>
        </div>
      </div>

      {/* Official Bulletin Document Card */}
      <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden print:shadow-none print:border-none">
        {/* Banner */}
        <div className="bg-[#1a1a1a] text-white p-6 sm:p-8 flex justify-between items-start flex-wrap gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e]">
              RÉPUBLIQUE DE CÔTE D'IVOIRE · MINISTÈRE DE L'ÉDUCATION NATIONALE
            </span>
            <h2 className="font-sans font-bold text-2xl mt-1 tracking-tight">Bulletin Trimestriel de Notes</h2>
            <p className="text-xs text-[#9e9e9e] mt-1 font-medium">
              Relevé académique officiel en direct — <strong className="text-white">{selectedTrimestre}</strong>
            </p>
          </div>

          {selectedStudent && (
            <div className="bg-[#2a2a2a] p-4 rounded-2xl border border-white/10 text-right space-y-1">
              <div className="text-sm font-bold text-white">{selectedStudent.nom}</div>
              <div className="text-xs text-[#9e9e9e]">
                Classe : <strong className="text-white">{selectedStudent.classe}</strong> (Effectif : {classSize})
              </div>
              <div className="text-[10px] text-[#9e9e9e] font-mono">
                Code : <strong className="text-white">{selectedStudent.code || '—'}</strong>
              </div>
              <div className="text-[10px] text-emerald-400 font-semibold pt-0.5">
                Rang : {classRank} sur {classSize}
              </div>
            </div>
          )}
        </div>

        {/* Quick Attendance & Info Strip */}
        <div className="bg-[#f8fafc] border-b border-[#e0e0e0] px-6 sm:px-8 py-3 flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-4 text-[#64748b]">
            <span>
              Absences cumulées : <strong className="text-[#0f172a]">{absencesCount}</strong>
            </span>
            <span>·</span>
            <span>
              Retards : <strong className="text-[#0f172a]">{retardsCount}</strong>
            </span>
            <span>·</span>
            <span>
              Moyenne de classe : <strong className="text-[#0f172a]">{classAverage}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              ✓ Document Certifié Conforme
            </span>
          </div>
        </div>

        {/* Notes Table */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] bg-[#f5f5f5]/50">
                  <th className="py-3 px-4">Matière Enseignée</th>
                  <th className="py-3 px-3 text-center">Coef</th>
                  <th className="py-3 px-3 text-center">Devoir 1</th>
                  <th className="py-3 px-3 text-center">Devoir 2</th>
                  <th className="py-3 px-3 text-center">Compo / Exam</th>
                  <th className="py-3 px-3 text-center">Moyenne /20</th>
                  <th className="py-3 px-3 text-center">Points (Moy×Coef)</th>
                  <th className="py-3 px-4 text-center">Appréciation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e0e0e0]/60">
                {calculatedRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#f5f5f5]/30">
                    <td className="py-3.5 px-4 font-bold text-[#1a1a1a]">{row.matiere}</td>
                    <td className="py-3.5 px-3 text-center font-bold text-[#616161]">{row.coef}</td>
                    <td className="py-3.5 px-3 text-center font-medium text-[#1a1a1a]">{row.devoir1}</td>
                    <td className="py-3.5 px-3 text-center font-medium text-[#1a1a1a]">{row.devoir2}</td>
                    <td className="py-3.5 px-3 text-center font-medium text-[#1a1a1a]">{row.compo}</td>
                    <td className="py-3.5 px-3 text-center font-bold text-[#1a1a1a] text-sm">{row.moyStr}</td>
                    <td className="py-3.5 px-3 text-center font-bold text-indigo-700">{row.pointsCoefStr}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="bg-[#1a1a1a] text-white text-[9px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider">
                        {row.app}
                      </span>
                    </td>
                  </tr>
                ))}

                {calculatedRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-[#9e9e9e]">
                      Aucune note enregistrée pour cet élève au {selectedTrimestre}.<br />
                      <span className="text-[11px] text-[#757575] mt-1 block">
                        Les enseignants peuvent saisir les notes depuis leur espace "Saisie des notes".
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Bulletin Footer Summary */}
          {calculatedRows.length > 0 && (
            <div className="bg-[#f5f5f5] rounded-2xl p-6 border border-[#e0e0e0] flex flex-wrap justify-between items-center gap-6">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] block">
                  Bilan Général du Conseil de Classe
                </span>
                <div className="text-sm font-bold text-[#1a1a1a]">{overallMention}</div>
                <div className="text-xs text-[#616161] pt-1">
                  Total Coefs : <strong>{totalCoef}</strong> · Points cumulés : <strong>{totalPoints.toFixed(2)}</strong> · Rang : <strong>{classRank} / {classSize}</strong>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] block">
                  Moyenne Générale
                </span>
                <div className="text-2xl sm:text-3xl font-bold font-sans text-[#1a1a1a]">{overallAverageStr}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
