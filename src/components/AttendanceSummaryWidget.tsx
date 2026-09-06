import React from 'react';
import { Absence, Eleve } from '../types';
import { 
  AlertTriangle, 
  Clock, 
  ShieldCheck, 
  CheckCircle2, 
  ChevronRight, 
  MessageSquare, 
  Calendar,
  AlertCircle,
  TrendingDown
} from 'lucide-react';

interface AttendanceSummaryWidgetProps {
  student: Eleve;
  absences: Absence[];
  onNavigateToPresence: () => void;
  onNavigateToMessagerie: () => void;
}

// Critical thresholds established by AKPANY SCHOOL internal regulation
const THRESHOLD_WARNING_ABSENCES = 3;
const THRESHOLD_CRITICAL_ABSENCES = 5;
const THRESHOLD_CRITICAL_UNJUSTIFIED = 3;
const THRESHOLD_CRITICAL_RETARDS = 4;

export default function AttendanceSummaryWidget({
  student,
  absences,
  onNavigateToPresence,
  onNavigateToMessagerie,
}: AttendanceSummaryWidgetProps) {
  // Normalize status calculations
  const nonJustifiees = absences.filter(a => {
    const s = (a.statut || '').toLowerCase();
    return s === 'absent' || s === 'non_justifie' || s.includes('non');
  });

  const justifiees = absences.filter(a => {
    const s = (a.statut || '').toLowerCase();
    return s === 'justifie' || s.includes('justifi');
  });

  const retards = absences.filter(a => {
    const s = (a.statut || '').toLowerCase();
    return s === 'retard' || s.includes('retard');
  });

  const totalAbsencesCount = nonJustifiees.length + justifiees.length;
  const nonJustifieesCount = nonJustifiees.length;
  const justifieesCount = justifiees.length;
  const retardsCount = retards.length;

  // Determine criticality
  const isCritical = 
    nonJustifieesCount >= THRESHOLD_CRITICAL_UNJUSTIFIED || 
    totalAbsencesCount >= THRESHOLD_CRITICAL_ABSENCES || 
    retardsCount >= THRESHOLD_CRITICAL_RETARDS;

  const isWarning = 
    !isCritical && (
      nonJustifieesCount >= 1 || 
      totalAbsencesCount >= THRESHOLD_WARNING_ABSENCES || 
      retardsCount >= 2
    );

  // Assiduity score calculation (out of 100%)
  const penalty = (nonJustifieesCount * 5) + (justifieesCount * 1.5) + (retardsCount * 2);
  const attendanceRate = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  // Gauge calculation: 0 to 5 scale where 5+ is full gauge
  const gaugePercent = Math.min(100, Math.round((totalAbsencesCount / THRESHOLD_CRITICAL_ABSENCES) * 100));

  // Recent 3 records
  const recentEvents = absences.slice(0, 3);

  return (
    <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-5 md:p-6 shadow-sm space-y-5">
      {/* Header section with diagnostic pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
            isCritical ? 'bg-red-50 text-red-600' : isWarning ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
          }`}>
            {isCritical ? <AlertTriangle size={20} /> : isWarning ? <Clock size={20} /> : <ShieldCheck size={20} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-[#1a1a1a]">Bilan d'Assiduité & Ponctualité</h3>
              <span className="text-[10px] font-bold text-[#9e9e9e]">Trimestre en cours</span>
            </div>
            <p className="text-xs text-[#9e9e9e] font-medium">
              Suivi officiel de la présence en classe de <span className="font-semibold text-[#1a1a1a]">{student.nom}</span>
            </p>
          </div>
        </div>

        {/* Status indicator badge */}
        <div>
          {isCritical ? (
            <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider animate-pulse">
              <span className="w-2 h-2 rounded-full bg-red-600"></span>
              Seuil Critique Dépassé
            </span>
          ) : isWarning ? (
            <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Vigilance Requise
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 size={13} className="text-emerald-600" />
              Assiduité Normale
            </span>
          )}
        </div>
      </div>

      {/* CRITICAL ALERT BANNER if threshold is reached */}
      {isCritical && (
        <div className="bg-gradient-to-r from-red-950 to-red-900 text-white rounded-2xl p-4 md:p-5 border-2 border-red-700 shadow-md space-y-3">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-red-600/40 rounded-xl text-red-300 flex-shrink-0 mt-0.5">
              <AlertTriangle size={24} className="text-red-300 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-red-600 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-md">
                  Alerte Administrative
                </span>
                <h4 className="text-sm md:text-base font-extrabold text-white">
                  Seuil critique d'absentéisme atteint ({totalAbsencesCount} absence{totalAbsencesCount > 1 ? 's' : ''}, dont {nonJustifieesCount} non justifiée{nonJustifieesCount > 1 ? 's' : ''})
                </h4>
              </div>
              <p className="text-xs text-red-100 mt-1.5 leading-relaxed">
                L'élève a dépassé le quota de tolérance fixé à <strong className="text-white">{THRESHOLD_CRITICAL_ABSENCES} absences</strong> ou <strong className="text-white">{THRESHOLD_CRITICAL_UNJUSTIFIED} non justifiées</strong>. Conformément aux dispositions du règlement scolaire, ce manquement est susceptible d'entraîner une <strong className="text-white">convocation des parents</strong>, une <strong className="text-white">retenue disciplinaire</strong> et une mention défavorable sur le bulletin trimestriel.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1 border-t border-red-800/80">
            <button
              onClick={onNavigateToMessagerie}
              className="bg-white hover:bg-neutral-100 text-red-950 font-bold px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <MessageSquare size={14} /> Justifier auprès de la Vie Scolaire
            </button>
            <button
              onClick={onNavigateToPresence}
              className="bg-red-700 hover:bg-red-600 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              Consulter le registre complet <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* WARNING ALERT BANNER if in warning state */}
      {isWarning && !isCritical && (
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-xs font-bold text-amber-900">
                Seuil de vigilance atteint : {totalAbsencesCount} absence(s) et {retardsCount} retard(s) enregistrés.
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Veuillez régulariser les motifs d'absence rapidement pour éviter d'atteindre le seuil critique ({THRESHOLD_CRITICAL_ABSENCES} absences max).
              </p>
            </div>
          </div>
          <button
            onClick={onNavigateToMessagerie}
            className="bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 self-start sm:self-auto flex-shrink-0"
          >
            <MessageSquare size={13} /> Envoyer un justificatif
          </button>
        </div>
      )}

      {/* Visual Tolerance Gauge (Progress Bar) */}
      <div className="bg-[#f5f5f5]/60 rounded-2xl p-4 border border-[#e0e0e0]/80 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#1a1a1a]">Niveau d'absentéisme</span>
            <span className="text-[10px] text-[#9e9e9e] font-medium">
              ({totalAbsencesCount} / {THRESHOLD_CRITICAL_ABSENCES} absences avant convocation)
            </span>
          </div>
          <span className={`font-black text-xs ${
            isCritical ? 'text-red-600' : isWarning ? 'text-amber-700' : 'text-emerald-700'
          }`}>
            {gaugePercent}% du seuil maximal
          </span>
        </div>

        {/* Multi-segment visual bar */}
        <div className="w-full bg-[#e0e0e0] h-3 rounded-full overflow-hidden flex relative">
          <div 
            className={`h-full transition-all duration-500 rounded-full ${
              isCritical 
                ? 'bg-red-600' 
                : isWarning 
                ? 'bg-amber-500' 
                : 'bg-emerald-500'
            }`}
            style={{ width: `${gaugePercent}%` }}
          />
        </div>

        {/* Milestone labels */}
        <div className="flex justify-between items-center text-[10px] font-semibold text-[#9e9e9e] pt-0.5">
          <span>0 absence (Idéal)</span>
          <span className="text-amber-700">Seuil alerte (3)</span>
          <span className="text-red-600 font-bold">Seuil critique (5+)</span>
        </div>
      </div>

      {/* 4 Stat Breakdown Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Non Justified */}
        <div className={`p-3.5 rounded-2xl border transition-all ${
          nonJustifieesCount > 0 
            ? 'bg-red-50/60 border-red-200' 
            : 'bg-[#f5f5f5]/40 border-[#e0e0e0]'
        }`}>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e]">
              Non Justifiées
            </span>
            {nonJustifieesCount > 0 && (
              <span className="text-[9px] font-extrabold bg-red-600 text-white px-1.5 py-0.5 rounded">
                À justifier
              </span>
            )}
          </div>
          <div className="text-2xl font-black text-red-600 mt-1">
            {nonJustifieesCount}
          </div>
          <p className="text-[10px] text-[#9e9e9e] mt-0.5">
            Absence{nonJustifieesCount > 1 ? 's' : ''} sans motif validé
          </p>
        </div>

        {/* Justified */}
        <div className="p-3.5 rounded-2xl border bg-[#f5f5f5]/40 border-[#e0e0e0]">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e]">
              Justifiées
            </span>
            {justifieesCount > 0 && (
              <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                Validées ✓
              </span>
            )}
          </div>
          <div className="text-2xl font-black text-[#1a1a1a] mt-1">
            {justifieesCount}
          </div>
          <p className="text-[10px] text-[#9e9e9e] mt-0.5">
            Certificats ou motifs acceptés
          </p>
        </div>

        {/* Retards */}
        <div className={`p-3.5 rounded-2xl border transition-all ${
          retardsCount >= THRESHOLD_CRITICAL_RETARDS
            ? 'bg-amber-50/80 border-amber-300'
            : 'bg-[#f5f5f5]/40 border-[#e0e0e0]'
        }`}>
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e]">
              Retards
            </span>
            {retardsCount >= THRESHOLD_CRITICAL_RETARDS && (
              <span className="text-[9px] font-bold bg-amber-600 text-white px-1.5 py-0.5 rounded">
                Excès
              </span>
            )}
          </div>
          <div className="text-2xl font-black text-amber-700 mt-1">
            {retardsCount}
          </div>
          <p className="text-[10px] text-[#9e9e9e] mt-0.5">
            Signalements de retards en cours
          </p>
        </div>

        {/* Taux de présence */}
        <div className="p-3.5 rounded-2xl border bg-[#f5f5f5]/40 border-[#e0e0e0]">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e]">
              Taux Présence
            </span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
              attendanceRate >= 90 
                ? 'bg-emerald-100 text-emerald-800' 
                : attendanceRate >= 75 
                ? 'bg-amber-100 text-amber-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {attendanceRate >= 90 ? 'Bon' : attendanceRate >= 75 ? 'Moyen' : 'Critique'}
            </span>
          </div>
          <div className={`text-2xl font-black mt-1 ${
            attendanceRate >= 90 ? 'text-emerald-700' : attendanceRate >= 75 ? 'text-amber-700' : 'text-red-600'
          }`}>
            {attendanceRate}%
          </div>
          <p className="text-[10px] text-[#9e9e9e] mt-0.5">
            Estimation globale ce trimestre
          </p>
        </div>
      </div>

      {/* Recent Activity List / Preview */}
      {recentEvents.length > 0 ? (
        <div className="space-y-2 pt-1">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-[10px] uppercase tracking-widest text-[#9e9e9e]">
              Derniers signalements d'assiduité
            </span>
            <button
              onClick={onNavigateToPresence}
              className="text-[10px] font-extrabold text-[#1a1a1a] hover:underline flex items-center gap-1 cursor-pointer"
            >
              Historique complet ({absences.length}) ➔
            </button>
          </div>

          <div className="divide-y divide-[#e0e0e0]/60 border border-[#e0e0e0] rounded-xl overflow-hidden bg-white">
            {recentEvents.map((item, idx) => {
              const s = (item.statut || '').toLowerCase();
              const isItemAbsent = s === 'absent' || s === 'non_justifie';
              const isItemRetard = s === 'retard';
              const isItemJustifie = s === 'justifie';

              return (
                <div key={item.id || idx} className="p-3 flex items-center justify-between gap-3 hover:bg-[#f5f5f5]/30 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm">
                      {isItemAbsent ? '🚨' : isItemRetard ? '⏱' : '✓'}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#1a1a1a] truncate">
                        {item.matiere}
                      </div>
                      <div className="text-[10px] text-[#9e9e9e] flex items-center gap-2">
                        <span>{item.date} à {item.heure}</span>
                        {item.profNom && <span>• Prof. {item.profNom}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                      isItemAbsent 
                        ? 'bg-red-50 text-red-700 border border-red-200' 
                        : isItemRetard 
                        ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {isItemAbsent ? 'Absent (Non justifié)' : isItemRetard ? 'Retard' : 'Justifié'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
            ✓
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-900">
              Assiduité exemplaire
            </div>
            <p className="text-[11px] text-emerald-700 mt-0.5">
              Aucune absence ni retard enregistré pour {student.nom}. Félicitations !
            </p>
          </div>
        </div>
      )}

      {/* Footer Navigation Bar */}
      <div className="flex items-center justify-between pt-2 border-t border-[#e0e0e0]/60 text-xs">
        <button
          onClick={onNavigateToMessagerie}
          className="text-[#9e9e9e] hover:text-[#1a1a1a] text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <MessageSquare size={13} /> Contacter la Vie Scolaire
        </button>

        <button
          onClick={onNavigateToPresence}
          className="bg-[#1a1a1a] hover:bg-black text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs active:scale-95"
        >
          Ouvrir le registre de ponctualité <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
