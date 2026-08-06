import React, { useState, useMemo } from 'react';
import { Eleve, Note, Absence, Paiement, Observation } from '../types';
import {
  calculateStudentMonthlyStat,
  exportMonthlyStatsToCSV,
  printIndividualMonthlyReport,
  saveMonthlyStatsToFirestore,
  formatMonthLabel,
  getCurrentYearMonth,
  MonthlyStudentStat
} from '../lib/studentMonthlyStats';
import {
  BarChart3,
  Download,
  Printer,
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Award,
  Users,
  FileSpreadsheet,
  Save,
  ChevronRight,
  TrendingUp,
  Sparkles,
  FileText
} from 'lucide-react';

interface StudentMonthlyStatsViewProps {
  studentsList: Eleve[];
  notesList: Note[];
  absencesList: Absence[];
  paiementsList: Paiement[];
  observationsList: Observation[];
  classesList: string[];
  userRole?: 'admin' | 'prof' | 'parent';
  showToast: (msg: string) => void;
  defaultStudentId?: string;
}

export default function StudentMonthlyStatsView({
  studentsList,
  notesList,
  absencesList,
  paiementsList,
  observationsList,
  classesList,
  userRole = 'admin',
  showToast,
  defaultStudentId
}: StudentMonthlyStatsViewProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentYearMonth());
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchStudent, setSearchStudent] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(defaultStudentId || null);
  const [isSaving, setIsSaving] = useState(false);

  // Available month options (past 12 months)
  const availableMonths = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      months.push({ key, label: formatMonthLabel(key) });
    }
    return months;
  }, []);

  // Filter students based on role/class/search
  const filteredStudents = useMemo(() => {
    return studentsList.filter((s) => {
      if (s.statut === 'archive') return false;
      if (selectedClass !== 'all' && s.classe !== selectedClass) return false;
      if (searchStudent.trim() && !s.nom.toLowerCase().includes(searchStudent.toLowerCase().trim())) {
        return false;
      }
      return true;
    });
  }, [studentsList, selectedClass, searchStudent]);

  // Compute stats for filtered students
  const monthlyStatsList: MonthlyStudentStat[] = useMemo(() => {
    return filteredStudents.map((student) =>
      calculateStudentMonthlyStat(
        student,
        selectedMonth,
        notesList,
        absencesList,
        paiementsList,
        observationsList
      )
    );
  }, [filteredStudents, selectedMonth, notesList, absencesList, paiementsList, observationsList]);

  // Selected student's detailed stat
  const activeStudentStat = useMemo(() => {
    if (!selectedStudentId) return monthlyStatsList[0] || null;
    return monthlyStatsList.find((s) => s.eleveId === selectedStudentId) || monthlyStatsList[0] || null;
  }, [monthlyStatsList, selectedStudentId]);

  // Summary Metrics for the selection
  const classSummary = useMemo(() => {
    if (monthlyStatsList.length === 0) {
      return { classAvg: 'N/A', totalAbsences: 0, totalPayments: 0, countWithGrades: 0 };
    }
    const statsWithGrades = monthlyStatsList.filter((s) => s.moyenneGenerale !== null);
    const sumAvg = statsWithGrades.reduce((acc, curr) => acc + (curr.moyenneGenerale || 0), 0);
    const classAvg = statsWithGrades.length > 0 ? (sumAvg / statsWithGrades.length).toFixed(2) : 'N/A';
    const totalAbsences = monthlyStatsList.reduce((acc, curr) => acc + curr.absencesCount, 0);
    const totalPayments = monthlyStatsList.reduce((acc, curr) => acc + curr.versementsMois, 0);

    return {
      classAvg,
      totalAbsences,
      totalPayments,
      countWithGrades: statsWithGrades.length
    };
  }, [monthlyStatsList]);

  const handleExportCSV = () => {
    if (monthlyStatsList.length === 0) {
      showToast('⚠️ Aucun élève à exporter.');
      return;
    }
    const suffix = `${selectedClass !== 'all' ? selectedClass.replace(/\s+/g, '_') : 'Toutes_Classes'}_${selectedMonth}`;
    exportMonthlyStatsToCSV(monthlyStatsList, suffix);
    showToast(`📥 Exportation CSV réussie (${monthlyStatsList.length} élèves) !`);
  };

  const handleSaveToDatabase = async () => {
    if (monthlyStatsList.length === 0) {
      showToast('⚠️ Aucune donnée à sauvegarder.');
      return;
    }
    setIsSaving(true);
    try {
      const savedCount = await saveMonthlyStatsToFirestore(monthlyStatsList);
      showToast(`💾 ${savedCount} rapport(s) statistique(s) mensuel(s) enregistré(s) dans la base de données !`);
    } catch (e) {
      showToast('❌ Erreur lors de la sauvegarde des statistiques.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#1a1a1a] via-[#2d2d2d] to-[#1a1a1a] text-white p-6 rounded-[28px] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-widest mb-1">
            <BarChart3 size={16} /> Bilan & Analyses de Performance
          </div>
          <h2 className="text-xl font-extrabold tracking-tight">Statistiques Mensuelles des Élèves</h2>
          <p className="text-xs text-gray-300 mt-1">
            Suivi automatisé des moyennes, de l'assiduité, de la scolarité et de la discipline par mois.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {activeStudentStat && (
            <button
              onClick={() => printIndividualMonthlyReport(activeStudentStat)}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <FileText size={15} /> Exporter PDF
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Download size={15} /> Exporter CSV
          </button>
          {userRole === 'admin' && (
            <button
              onClick={handleSaveToDatabase}
              disabled={isSaving}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save size={15} /> {isSaving ? 'Enregistrement...' : 'Archiver le Mois'}
            </button>
          )}
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="bg-white p-4 rounded-[24px] border border-[#e0e0e0] shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Month Selector */}
          <div className="flex items-center gap-2 bg-[#f8f9fa] border border-[#e0e0e0] px-3 py-1.5 rounded-xl">
            <Calendar size={15} className="text-[#9e9e9e]" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-[#1a1a1a] focus:outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  📅 {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Class Filter */}
          <div className="flex items-center gap-2 bg-[#f8f9fa] border border-[#e0e0e0] px-3 py-1.5 rounded-xl">
            <Filter size={15} className="text-[#9e9e9e]" />
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="bg-transparent text-xs font-bold text-[#1a1a1a] focus:outline-none cursor-pointer"
            >
              <option value="all">Toutes les classes</option>
              {classesList.map((c) => (
                <option key={c} value={c}>
                  Classe {c}
                </option>
              ))}
            </select>
          </div>

          {/* Search Student */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-2.5 text-[#9e9e9e]" />
            <input
              type="text"
              placeholder="Rechercher un élève..."
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
            />
          </div>
        </div>

        <div className="text-xs text-[#9e9e9e] font-semibold">
          Affichage : <strong className="text-[#1a1a1a]">{monthlyStatsList.length} élève(s)</strong>
        </div>
      </div>

      {/* Global Class Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-[20px] p-4 border border-[#e0e0e0] shadow-2xs">
          <div className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1 flex items-center justify-between">
            <span>Moyenne de la sélection</span>
            <TrendingUp size={14} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-[#1a1a1a]">
            {classSummary.classAvg !== 'N/A' ? `${classSummary.classAvg} / 20` : 'N/A'}
          </div>
          <div className="text-[11px] text-[#9e9e9e] mt-1 font-medium">
            Basé sur {classSummary.countWithGrades} élève(s) noté(s)
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-4 border border-[#e0e0e0] shadow-2xs">
          <div className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1 flex items-center justify-between">
            <span>Absences cumulées</span>
            <Clock size={14} className="text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-[#1a1a1a]">
            {classSummary.totalAbsences} <span className="text-xs font-normal text-[#9e9e9e]">absence(s)</span>
          </div>
          <div className="text-[11px] text-[#9e9e9e] mt-1 font-medium">Pour le mois sélectionné</div>
        </div>

        <div className="bg-white rounded-[20px] p-4 border border-[#e0e0e0] shadow-2xs">
          <div className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1 flex items-center justify-between">
            <span>Recouvrement mensuel</span>
            <Award size={14} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700">
            {classSummary.totalPayments.toLocaleString('fr-FR')} FCFA
          </div>
          <div className="text-[11px] text-[#9e9e9e] mt-1 font-medium">Paiements encaissés</div>
        </div>

        <div className="bg-white rounded-[20px] p-4 border border-[#e0e0e0] shadow-2xs">
          <div className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1 flex items-center justify-between">
            <span>Période active</span>
            <Sparkles size={14} className="text-blue-500" />
          </div>
          <div className="text-lg font-bold text-[#1a1a1a] truncate">
            {formatMonthLabel(selectedMonth)}
          </div>
          <div className="text-[11px] text-[#9e9e9e] mt-1 font-medium">Mois en cours de consultation</div>
        </div>
      </div>

      {/* Main Split Layout: Student Table & Active Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table list of students */}
        <div className="lg:col-span-2 bg-white rounded-[24px] border border-[#e0e0e0] shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-[#e0e0e0] flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-[#9e9e9e] flex items-center gap-1.5">
              <Users size={15} /> Tableau des Statistiques Élèves
            </span>
            <button
              onClick={handleExportCSV}
              className="text-[11px] font-bold text-[#1a1a1a] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <FileSpreadsheet size={13} /> Télécharger CSV
            </button>
          </div>

          <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8f9fa] border-b border-[#e0e0e0] text-[#9e9e9e] uppercase font-bold text-[10px] tracking-wider sticky top-0">
                <tr>
                  <th className="py-3 px-4">Élève & Classe</th>
                  <th className="py-3 px-3 text-center">Moyenne</th>
                  <th className="py-3 px-3 text-center">Présence</th>
                  <th className="py-3 px-3 text-center">Finances</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f0]">
                {monthlyStatsList.map((stat) => {
                  const isSelected = activeStudentStat?.eleveId === stat.eleveId;
                  const avgVal = stat.moyenneGenerale;

                  let avgBadgeClass = 'bg-gray-100 text-gray-700';
                  if (avgVal !== null) {
                    if (avgVal >= 14) avgBadgeClass = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
                    else if (avgVal >= 10) avgBadgeClass = 'bg-blue-50 text-blue-800 border border-blue-200';
                    else avgBadgeClass = 'bg-red-50 text-red-800 border border-red-200';
                  }

                  return (
                    <tr
                      key={stat.eleveId}
                      onClick={() => setSelectedStudentId(stat.eleveId)}
                      className={`hover:bg-[#f8f9fa] transition-colors cursor-pointer ${
                        isSelected ? 'bg-amber-50/60 font-semibold' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-[#1a1a1a] text-xs">{stat.eleveNom}</div>
                        <div className="text-[10px] text-[#9e9e9e]">
                          Classe : {stat.classe} · ID : {stat.eleveId.substring(0, 8)}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-block ${avgBadgeClass}`}>
                          {avgVal !== null ? `${avgVal} / 20` : '—'}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className="text-xs font-bold text-[#1a1a1a]">
                          {stat.tauxPresence}%
                        </span>
                        <div className="text-[9px] text-[#9e9e9e]">
                          {stat.absencesCount} abs.
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            stat.soldeRestant <= 0
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : stat.versementsMois > 0
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {stat.statutFinancier}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            printIndividualMonthlyReport(stat);
                          }}
                          title="Imprimer / Exporter Fiche Mensuelle PDF"
                          className="p-1.5 text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white rounded-lg transition-all cursor-pointer"
                        >
                          <Printer size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {monthlyStatsList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-[#9e9e9e]">
                      Aucun élève correspondant aux critères pour ce mois.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Individual Student Card Preview */}
        <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-2xs p-5 space-y-5 flex flex-col justify-between">
          {activeStudentStat ? (
            <div className="space-y-4">
              <div className="flex justify-between items-start pb-3 border-b border-[#e0e0e0]">
                <div>
                  <span className="text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest">
                    Aperçu Fiche Mensuelle
                  </span>
                  <h3 className="text-base font-extrabold text-[#1a1a1a]">{activeStudentStat.eleveNom}</h3>
                  <p className="text-xs text-[#9e9e9e]">
                    Classe {activeStudentStat.classe} · {activeStudentStat.monthLabel}
                  </p>
                </div>
                <button
                  onClick={() => printIndividualMonthlyReport(activeStudentStat)}
                  className="bg-[#1a1a1a] hover:bg-black text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                >
                  <FileText size={14} /> Exporter PDF
                </button>
              </div>

              {/* Grades Section */}
              <div className="bg-[#f8f9fa] rounded-2xl p-3.5 space-y-2 border border-[#e0e0e0]">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-[#9e9e9e] uppercase text-[10px]">Pôle Académique</span>
                  <span className="font-bold text-[#1a1a1a]">{activeStudentStat.notesCount} note(s)</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-[#1a1a1a]">
                    {activeStudentStat.moyenneGenerale !== null
                      ? `${activeStudentStat.moyenneGenerale} / 20`
                      : 'N/A'}
                  </span>
                  {activeStudentStat.highestNote !== null && (
                    <span className="text-[11px] text-emerald-600 font-bold">
                      Max: {activeStudentStat.highestNote}/20
                    </span>
                  )}
                </div>

                {activeStudentStat.matiereAverages.length > 0 && (
                  <div className="pt-2 border-t border-[#e0e0e0] space-y-1">
                    {activeStudentStat.matiereAverages.slice(0, 4).map((m) => (
                      <div key={m.matiere} className="flex justify-between text-[11px]">
                        <span className="text-[#6c757d] font-medium">{m.matiere}</span>
                        <strong className="text-[#1a1a1a]">{m.moyenne} / 20</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Attendance & Finance Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-[#e0e0e0] rounded-2xl p-3 space-y-1">
                  <div className="text-[9px] font-bold text-[#9e9e9e] uppercase">Présence</div>
                  <div className="text-base font-black text-[#1a1a1a]">{activeStudentStat.tauxPresence}%</div>
                  <div className="text-[10px] text-[#9e9e9e]">
                    {activeStudentStat.absencesCount} abs. · {activeStudentStat.retardsCount} ret.
                  </div>
                </div>

                <div className="border border-[#e0e0e0] rounded-2xl p-3 space-y-1">
                  <div className="text-[9px] font-bold text-[#9e9e9e] uppercase">Scolarité Mois</div>
                  <div className="text-xs font-black text-emerald-700">
                    +{activeStudentStat.versementsMois.toLocaleString('fr-FR')} F
                  </div>
                  <div className="text-[10px] text-[#9e9e9e]">
                    Reste : {activeStudentStat.soldeRestant.toLocaleString('fr-FR')} F
                  </div>
                </div>
              </div>

              {/* Synthetic Evaluation */}
              <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 space-y-1">
                <div className="text-[10px] font-bold text-amber-900 uppercase flex items-center gap-1">
                  <Sparkles size={12} /> Appréciation Synthétique
                </div>
                <p className="text-xs text-amber-950 leading-relaxed italic">
                  "{activeStudentStat.appreciationGlobale}"
                </p>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-[#9e9e9e]">
              Sélectionnez un élève dans le tableau pour consulter son bilan mensuel détaillé.
            </div>
          )}

          <div className="pt-3 border-t border-[#e0e0e0] text-[11px] text-[#9e9e9e] flex justify-between items-center">
            <span>AKPANY SCHOOL — Statistiques v2.0</span>
            <button
              onClick={handleExportCSV}
              className="font-bold text-[#1a1a1a] hover:underline flex items-center gap-1 cursor-pointer"
            >
              Export Global CSV <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
