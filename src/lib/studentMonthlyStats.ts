import { Eleve, Note, Absence, Paiement, Observation } from '../types';
import { db } from './firebase';
import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';

export interface MonthlyStudentStat {
  id: string; // e.g., stat_2026_10_eleveId
  monthKey: string; // YYYY-MM
  monthLabel: string; // e.g. "Octobre 2026"
  eleveId: string;
  eleveNom: string;
  classe: string;
  parentUid?: string | null;
  parentNom?: string | null;
  
  // Grade Stats
  moyenneGenerale: number | null; // e.g. 15.2
  notesCount: number;
  highestNote: number | null;
  lowestNote: number | null;
  matieresCount: number;
  matiereAverages: { matiere: string; moyenne: number; count: number }[];

  // Attendance Stats
  absencesCount: number;
  retardsCount: number;
  justifiedAbsencesCount: number;
  tauxPresence: number; // Percentage, e.g. 96%

  // Financial Stats
  versementsMois: number;
  soldeRestant: number;
  scolariteTotal: number;
  scolaritePayeeTotal: number;
  statutFinancier: 'À jour' | 'Paiement partiel' | 'En retard' | 'Scolarité réglée';

  // Behavior & Observations Stats
  felicitationsCount: number;
  encouragementsCount: number;
  avertissementsCount: number;
  remarquesCount: number;

  // Synthesis
  appreciationGlobale: string;
  createdAt: string;
  updatedAt: string;
}

const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

export function formatMonthLabel(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split('-');
  const monthIdx = parseInt(monthStr, 10) - 1;
  if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return yearMonth;
  return `${MONTH_NAMES_FR[monthIdx]} ${yearStr}`;
}

export function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Calculates real-time monthly statistics for a student
 */
export function calculateStudentMonthlyStat(
  student: Eleve,
  monthKey: string, // YYYY-MM
  allNotes: Note[],
  allAbsences: Absence[],
  allPaiements: Paiement[],
  allObservations: Observation[]
): MonthlyStudentStat {
  const [yearStr, monthStr] = monthKey.split('-');
  const monthLabel = formatMonthLabel(monthKey);

  // 1. Filter Notes for this student and month
  // Note can have createdAt date or trimestre. We check createdAt YYYY-MM
  const studentNotes = allNotes.filter((n) => {
    if (n.eleveId !== student.id) return false;
    if (!n.createdAt) return true; // fallback to include if date missing
    const dateStr = n.createdAt.substring(0, 7);
    return dateStr === monthKey;
  });

  let sumGrades = 0;
  let gradeEntriesCount = 0;
  let highestNote: number | null = null;
  let lowestNote: number | null = null;
  const matiereMap = new Map<string, number[]>();

  studentNotes.forEach((note) => {
    const values: number[] = [];
    if (note.devoir1 !== null && note.devoir1 !== undefined) values.push(note.devoir1);
    if (note.devoir2 !== null && note.devoir2 !== undefined) values.push(note.devoir2);
    if (note.compo !== null && note.compo !== undefined) values.push(note.compo);

    values.forEach((v) => {
      sumGrades += v;
      gradeEntriesCount++;
      if (highestNote === null || v > highestNote) highestNote = v;
      if (lowestNote === null || v < lowestNote) lowestNote = v;

      if (!matiereMap.has(note.matiere)) {
        matiereMap.set(note.matiere, []);
      }
      matiereMap.get(note.matiere)!.push(v);
    });
  });

  const moyenneGenerale = gradeEntriesCount > 0 ? Number((sumGrades / gradeEntriesCount).toFixed(2)) : null;

  const matiereAverages = Array.from(matiereMap.entries()).map(([matiere, vals]) => {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return {
      matiere,
      moyenne: Number(avg.toFixed(2)),
      count: vals.length
    };
  });

  // 2. Filter Absences for this student and month
  const studentAbsences = allAbsences.filter((a) => {
    if (a.eleveId !== student.id) return false;
    if (!a.date) return false;
    return a.date.startsWith(monthKey);
  });

  const absencesCount = studentAbsences.filter((a) => a.statut === 'absent').length;
  const retardsCount = studentAbsences.filter((a) => a.statut === 'retard').length;
  const justifiedAbsencesCount = studentAbsences.filter((a) => a.statut === 'justifie').length;

  // Assuming ~20 school days per month
  const totalDays = 20;
  const unjustifiedAbsences = Math.max(0, absencesCount - justifiedAbsencesCount);
  const presenceRatio = Math.max(0, Math.min(100, Math.round(((totalDays - unjustifiedAbsences) / totalDays) * 100)));

  // 3. Filter Payments for this student and month
  const studentPaiement = allPaiements.find((p) => p.eleveId === student.id);
  let versementsMois = 0;
  let scolariteTotal = studentPaiement ? studentPaiement.total : 0;
  let scolaritePayeeTotal = studentPaiement ? studentPaiement.paye : (student.scolaritePayee || 0);
  let soldeRestant = studentPaiement ? studentPaiement.solde : Math.max(0, scolariteTotal - scolaritePayeeTotal);

  if (studentPaiement && studentPaiement.historique) {
    versementsMois = studentPaiement.historique
      .filter((h) => h.date && h.date.startsWith(monthKey))
      .reduce((sum, h) => sum + (h.montant || 0), 0);
  }

  let statutFinancier: MonthlyStudentStat['statutFinancier'] = 'Paiement partiel';
  if (soldeRestant <= 0) {
    statutFinancier = 'Scolarité réglée';
  } else if (versementsMois > 0 && soldeRestant > 0) {
    statutFinancier = 'Paiement partiel';
  } else if (versementsMois === 0 && soldeRestant > 0) {
    statutFinancier = 'En retard';
  }

  // 4. Filter Observations
  const studentObs = allObservations.filter((o) => {
    if (o.eleveId !== student.id) return false;
    const dateStr = o.date || o.createdAt;
    return dateStr && dateStr.startsWith(monthKey);
  });

  const felicitationsCount = studentObs.filter((o) => o.type === 'felicitation').length;
  const encouragementsCount = studentObs.filter((o) => o.type === 'encouragement').length;
  const avertissementsCount = studentObs.filter((o) => o.type === 'avertissement').length;
  const remarquesCount = studentObs.filter((o) => o.type === 'remarque').length;

  // 5. Generate Automatic Synthetic Evaluation
  let appreciationGlobale = '';
  if (moyenneGenerale !== null) {
    if (moyenneGenerale >= 16) {
      appreciationGlobale = 'Excellent travail ce mois-ci ! Élève très rigoureux et assidu.';
    } else if (moyenneGenerale >= 14) {
      appreciationGlobale = 'Très bon mois. Résultats satisfaisants et régularité exemplaire.';
    } else if (moyenneGenerale >= 12) {
      appreciationGlobale = 'Mois satisfaisant. Bon niveau d\'ensemble, continuez les efforts.';
    } else if (moyenneGenerale >= 10) {
      appreciationGlobale = 'Résultats passables ce mois-ci. Des efforts supplémentaires sont requis.';
    } else {
      appreciationGlobale = 'Mois difficile. Travail insuffisant, un soutien scolaire est fortement recommandé.';
    }
  } else {
    appreciationGlobale = 'Aucune note enregistrée pour ce mois.';
  }

  if (absencesCount > 3) {
    appreciationGlobale += ` Attention au nombre d'absences (${absencesCount}).`;
  }
  if (felicitationsCount > 0) {
    appreciationGlobale += ' FÉLICITATIONS du conseil de classe.';
  } else if (avertissementsCount > 0) {
    appreciationGlobale += ' AVERTISSEMENT pour la discipline/assiduité.';
  }

  return {
    id: `stat_${monthKey.replace('-', '_')}_${student.id}`,
    monthKey,
    monthLabel,
    eleveId: student.id,
    eleveNom: student.nom,
    classe: student.classe,
    parentUid: student.parentUid || null,
    parentNom: student.parentNom || null,
    moyenneGenerale,
    notesCount: gradeEntriesCount,
    highestNote,
    lowestNote,
    matieresCount: matiereAverages.length,
    matiereAverages,
    absencesCount,
    retardsCount,
    justifiedAbsencesCount,
    tauxPresence: presenceRatio,
    versementsMois,
    soldeRestant,
    scolariteTotal,
    scolaritePayeeTotal,
    statutFinancier,
    felicitationsCount,
    encouragementsCount,
    avertissementsCount,
    remarquesCount,
    appreciationGlobale,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Persists calculated monthly stats to Firestore collection 'statistiques_mensuelles'
 */
export async function saveMonthlyStatsToFirestore(statsList: MonthlyStudentStat[]): Promise<number> {
  let saved = 0;
  for (const stat of statsList) {
    try {
      await setDoc(doc(db, 'statistiques_mensuelles', stat.id), stat, { merge: true });
      saved++;
    } catch (e) {
      console.error('Error saving monthly stat:', e);
    }
  }
  return saved;
}

/**
 * Export array of monthly student stats to CSV format
 */
export function exportMonthlyStatsToCSV(stats: MonthlyStudentStat[], filenameSuffix = 'Export'): void {
  const headers = [
    'Mois',
    'ID Élève',
    'Nom Élève',
    'Classe',
    'Parent',
    'Moyenne Mensuelle (/20)',
    'Nb Notes Saisies',
    'Note Maximale',
    'Note Minimale',
    'Nb Absences',
    'Nb Retards',
    'Taux Présence (%)',
    'Versements du Mois (FCFA)',
    'Solde Restant (FCFA)',
    'Statut Financier',
    'Félicitations',
    'Avertissements',
    'Appréciation Globale'
  ];

  const rows = stats.map((s) => [
    `"${s.monthLabel}"`,
    `"${s.eleveId}"`,
    `"${s.eleveNom.replace(/"/g, '""')}"`,
    `"${s.classe.replace(/"/g, '""')}"`,
    `"${(s.parentNom || 'N/A').replace(/"/g, '""')}"`,
    s.moyenneGenerale !== null ? s.moyenneGenerale.toString() : 'N/A',
    s.notesCount.toString(),
    s.highestNote !== null ? s.highestNote.toString() : 'N/A',
    s.lowestNote !== null ? s.lowestNote.toString() : 'N/A',
    s.absencesCount.toString(),
    s.retardsCount.toString(),
    `${s.tauxPresence}%`,
    s.versementsMois.toString(),
    s.soldeRestant.toString(),
    `"${s.statutFinancier}"`,
    s.felicitationsCount.toString(),
    s.avertissementsCount.toString(),
    `"${s.appreciationGlobale.replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `Statistiques_Mensuelles_Eleves_${filenameSuffix}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportMonthlyReportToPDF(stat: MonthlyStudentStat, schoolName = 'ÉCOLEPLUS'): void {
  printIndividualMonthlyReport(stat, schoolName);
}

/**
 * Print/Export individual monthly student report card (Fiche Mensuelle de l'Élève)
 */
export function printIndividualMonthlyReport(stat: MonthlyStudentStat, schoolName = 'ÉCOLEPLUS'): void {
  const printWindow = window.open('', '_blank', 'width=850,height=1100');
  if (!printWindow) return;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8" />
      <title>Fiche Mensuelle - ${stat.eleveNom} (${stat.monthLabel})</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          margin: 0;
          padding: 24px;
          color: #1a1a1a;
          background: #fff;
        }
        .no-print-toolbar {
          background: #1a1a1a;
          color: #fff;
          padding: 12px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: -24px -24px 24px -24px;
          border-bottom: 1px solid #333;
        }
        .no-print-toolbar button {
          background: #2563eb;
          color: #fff;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: bold;
          font-size: 13px;
          cursor: pointer;
        }
        .report-card {
          border: 2px solid #1a1a1a;
          border-radius: 16px;
          padding: 28px;
          max-width: 800px;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #f0f0f0;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .logo {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .badge-month {
          background: #1a1a1a;
          color: #fff;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .student-info {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          background: #f8f9fa;
          padding: 16px;
          border-radius: 12px;
          margin-bottom: 20px;
        }
        .info-label {
          font-size: 10px;
          text-transform: uppercase;
          color: #6c757d;
          font-weight: 700;
        }
        .info-val {
          font-size: 14px;
          font-weight: 700;
          color: #1a1a1a;
          margin-top: 2px;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }
        .stat-box {
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          padding: 16px;
        }
        .stat-box-title {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #6c757d;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .big-number {
          font-size: 28px;
          font-weight: 800;
          color: #1a1a1a;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }
        th, td {
          text-align: left;
          padding: 8px 10px;
          border-bottom: 1px solid #eee;
          font-size: 12px;
        }
        th {
          font-weight: 700;
          color: #6c757d;
          text-transform: uppercase;
          font-size: 10px;
        }
        .appreciation-box {
          background: #f4f6f8;
          border-left: 4px solid #1a1a1a;
          padding: 14px;
          border-radius: 6px;
          font-size: 13px;
          line-height: 1.5;
          margin-bottom: 24px;
        }
        .footer-signatures {
          display: flex;
          justify-content: space-between;
          margin-top: 40px;
          padding-top: 16px;
          border-top: 1px dashed #ccc;
          font-size: 11px;
          color: #666;
        }
        @media print {
          body { padding: 0; }
          .report-card { border: none; padding: 0; }
          .no-print-toolbar { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="no-print-toolbar">
        <span>📄 Fiche Mensuelle PDF — <strong>${stat.eleveNom}</strong> (${stat.monthLabel})</span>
        <button onclick="window.print()">📥 Enregistrer en PDF / Imprimer</button>
      </div>
      <div class="report-card">
        <div class="header">
          <div>
            <div class="logo">🎓 ${schoolName}</div>
            <div style="font-size:12px; color:#666; margin-top:2px;">Bilan & Statistiques Mensuelles d'Élève</div>
          </div>
          <div class="badge-month">${stat.monthLabel}</div>
        </div>

        <div class="student-info">
          <div>
            <div class="info-label">Élève</div>
            <div class="info-val">${stat.eleveNom}</div>
          </div>
          <div>
            <div class="info-label">Classe</div>
            <div class="info-val">${stat.classe}</div>
          </div>
          <div>
            <div class="info-label">Parent Référent</div>
            <div class="info-val">${stat.parentNom || 'Non assigné'}</div>
          </div>
        </div>

        <div class="grid-2">
          <!-- ACADEMIC STATS -->
          <div class="stat-box">
            <div class="stat-box-title">
              <span>📚 Performance Académique</span>
              <span>${stat.notesCount} note(s)</span>
            </div>
            <div class="big-number">
              ${stat.moyenneGenerale !== null ? `${stat.moyenneGenerale} / 20` : 'N/A'}
            </div>
            ${
              stat.matiereAverages.length > 0
                ? `
              <table>
                <thead>
                  <tr>
                    <th>Matière</th>
                    <th>Moyenne</th>
                  </tr>
                </thead>
                <tbody>
                  ${stat.matiereAverages
                    .map(
                      (m) => `
                    <tr>
                      <td>${m.matiere}</td>
                      <td><strong>${m.moyenne} / 20</strong></td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            `
                : '<p style="font-size:11px; color:#888;">Aucune matière renseignée ce mois.</p>'
            }
          </div>

          <!-- ATTENDANCE & FINANCES -->
          <div>
            <div class="stat-box" style="margin-bottom:12px;">
              <div class="stat-box-title">
                <span>⏰ Assiduité & Discipline</span>
                <span>${stat.tauxPresence}% Présence</span>
              </div>
              <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:13px;">
                <div>Absences : <strong>${stat.absencesCount}</strong></div>
                <div>Retards : <strong>${stat.retardsCount}</strong></div>
                <div>Justifiées : <strong>${stat.justifiedAbsencesCount}</strong></div>
              </div>
            </div>

            <div class="stat-box">
              <div class="stat-box-title">
                <span>💳 Situation Financière du Mois</span>
                <span style="font-weight:700;">${stat.statutFinancier}</span>
              </div>
              <div style="font-size:13px; line-height:1.6;">
                <div>Versements ce mois : <strong>${stat.versementsMois.toLocaleString('fr-FR')} FCFA</strong></div>
                <div>Solde de scolarité restant : <strong style="color:${stat.soldeRestant > 0 ? '#d97706' : '#059669'};">${stat.soldeRestant.toLocaleString('fr-FR')} FCFA</strong></div>
              </div>
            </div>
          </div>
        </div>

        <div class="stat-box-title" style="margin-top:16px;">💬 Appréciation Synthetique du Mois</div>
        <div class="appreciation-box">
          "${stat.appreciationGlobale}"
        </div>

        <div class="footer-signatures">
          <div>Cachet de l'Établissement</div>
          <div>Signature de la Direction / Professeur Titulaire</div>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
