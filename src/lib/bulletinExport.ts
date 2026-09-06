import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Eleve } from '../types';

export interface CalculatedBulletinRow {
  matiere: string;
  coef?: number;
  devoir1: string | number;
  devoir2: string | number;
  compo: string | number;
  moyVal?: number | null;
  moyStr: string;
  pointsCoefVal?: number | null;
  pointsCoefStr?: string;
  rangMatiere?: string;
  app: string;
}

export interface BulletinExportData {
  student: Eleve;
  trimestre: string;
  anneeScolaire?: string;
  rows: CalculatedBulletinRow[];
  totalCoef: number;
  totalPoints: number;
  overallAverageVal: number | null;
  overallAverageStr: string;
  overallMention: string;
  classRank?: string;
  classSize?: number;
  classAverage?: string;
  highestAverage?: string;
  lowestAverage?: string;
  absencesCount?: number;
  retardsCount?: number;
  schoolName?: string;
}

export const DEFAULT_SUBJECT_COEFFICIENTS: Record<string, number> = {
  'Français': 3,
  'Mathématiques': 3,
  'Anglais': 2,
  'Physique-Chimie': 2,
  'Sciences de la Vie et de la Terre (SVT)': 2,
  'SVT': 2,
  'Histoire-Géographie': 2,
  'Histoire-Géo': 2,
  'Philosophie': 3,
  'EDHC': 1,
  'Éducation aux Droits de l\'Homme': 1,
  'Arts Plastiques': 1,
  'Musique': 1,
  'EPS': 1,
  'Éducation Physique': 1,
  'Informatique': 1,
  'TICE': 1,
  'Allemand': 2,
  'Espagnol': 2
};

export function getSubjectCoefficient(matiere: string): number {
  if (!matiere) return 1;
  const match = Object.keys(DEFAULT_SUBJECT_COEFFICIENTS).find(
    (k) => k.toLowerCase() === matiere.toLowerCase() || matiere.toLowerCase().includes(k.toLowerCase())
  );
  return match ? DEFAULT_SUBJECT_COEFFICIENTS[match] : 1;
}

/**
 * Generates and downloads a clean, official PDF of the student report card.
 */
export function generateBulletinPDF(data: BulletinExportData): jsPDF {
  const {
    student,
    trimestre,
    anneeScolaire = '2025 - 2026',
    rows,
    totalCoef,
    totalPoints,
    overallAverageStr,
    overallMention,
    classRank = '—',
    classSize = 1,
    classAverage = '—',
    highestAverage = '—',
    lowestAverage = '—',
    absencesCount = 0,
    retardsCount = 0,
    schoolName = 'AKPANY SCHOOL'
  } = data;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // 1. Official National Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(55, 65, 81);
  doc.text("RÉPUBLIQUE DE CÔTE D'IVOIRE", margin, 14);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  doc.text("Union - Discipline - Travail", margin, 18);
  doc.setFont('helvetica', 'normal');
  doc.text("MINISTÈRE DE L'ÉDUCATION NATIONALE ET DE L'ALPHABÉTISATION", margin, 22);

  // Right side national info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(55, 65, 81);
  doc.text(`Année Scolaire : ${anneeScolaire}`, pageWidth - margin, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  doc.text(`Édité le : ${new Date().toLocaleDateString('fr-FR')}`, pageWidth - margin, 18, { align: 'right' });
  doc.text("Portail Officiel : demo.akpanyschool.store", pageWidth - margin, 22, { align: 'right' });

  // 2. School & Report Card Banner
  doc.setFillColor(26, 26, 26);
  doc.roundedRect(margin, 26, contentWidth, 18, 2, 2, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(`ÉTABLISSEMENT : ${schoolName.toUpperCase()}`, margin + 5, 33);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(209, 213, 219);
  doc.text(`BULLETIN OFFICIEL DE NOTES — ${trimestre.toUpperCase()}`, margin + 5, 40);

  // 3. Student Identification Card
  const studentCardY = 47;
  const studentCardHeight = 24;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, studentCardY, contentWidth, studentCardHeight, 2, 2, 'FD');

  // Left Column
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("NOM & PRÉNOMS :", margin + 4, studentCardY + 6);
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(student.nom.toUpperCase(), margin + 35, studentCardY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("MATRICULE :", margin + 4, studentCardY + 13);
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(student.code || 'NON ATTRIBUÉ', margin + 35, studentCardY + 13);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("ASSIDUITÉ :", margin + 4, studentCardY + 19);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`${absencesCount} absence(s)  ·  ${retardsCount} retard(s)`, margin + 35, studentCardY + 19);

  // Right Column
  const rightColX = margin + 110;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("CLASSE :", rightColX, studentCardY + 6);
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`${student.classe || '—'}  (Effectif : ${classSize} élèves)`, rightColX + 22, studentCardY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("RANG :", rightColX, studentCardY + 13);
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`${classRank} sur ${classSize}`, rightColX + 22, studentCardY + 13);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("STATUT :", rightColX, studentCardY + 19);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(16, 185, 129);
  doc.text("Inscrit(e) régulier(ère)", rightColX + 22, studentCardY + 19);

  // 4. Subjects Table with autoTable
  const tableBody = rows.map((r) => [
    r.matiere,
    r.coef !== undefined ? r.coef.toString() : '1',
    r.devoir1.toString(),
    r.devoir2.toString(),
    r.compo.toString(),
    r.moyStr,
    r.pointsCoefStr || (r.pointsCoefVal !== null && r.pointsCoefVal !== undefined ? r.pointsCoefVal.toFixed(2) : '—'),
    r.rangMatiere || '—',
    r.app
  ]);

  if (tableBody.length === 0) {
    tableBody.push(['Aucune note disponible pour cette période', '—', '—', '—', '—', '—', '—', '—', 'En attente']);
  }

  autoTable(doc, {
    startY: studentCardY + studentCardHeight + 3,
    head: [['Matière Enseignée', 'Coef', 'Devoir 1', 'Devoir 2', 'Compo', 'Moy /20', 'Points', 'Rang', 'Appréciation']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      cellPadding: 2
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', cellWidth: 42 },
      1: { halign: 'center', cellWidth: 12 },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
      6: { halign: 'center', cellWidth: 16 },
      7: { halign: 'center', cellWidth: 14 },
      8: { halign: 'center', fontStyle: 'bold', cellWidth: 32 }
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [31, 41, 55],
      lineColor: [229, 231, 235],
      lineWidth: 0.2
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251]
    }
  });

  // Get position after table
  const finalY = (doc as any).lastAutoTable.finalY + 4;

  // 5. Summary Statistics Box
  const summaryHeight = 26;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, finalY, contentWidth, summaryHeight, 2, 2, 'FD');

  // Left part: Total points & coef
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL COEFFICIENTS :", margin + 4, finalY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${totalCoef}`, margin + 42, finalY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL POINTS :", margin + 4, finalY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${totalPoints.toFixed(2)}`, margin + 42, finalY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text("CLASSE MOYENNE :", margin + 4, finalY + 18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${classAverage} (Min: ${lowestAverage} | Max: ${highestAverage})`, margin + 42, finalY + 18);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text("DÉCISION CONSEIL :", margin + 4, finalY + 23);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 26, 26);
  doc.text(overallMention, margin + 42, finalY + 23);

  // Right part: Overall Average & Rank
  const avgBoxX = pageWidth - margin - 52;
  doc.setFillColor(26, 26, 26);
  doc.roundedRect(avgBoxX, finalY + 3, 48, 20, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(209, 213, 219);
  doc.text("MOYENNE GÉNÉRALE", avgBoxX + 24, finalY + 8, { align: 'center' });
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(overallAverageStr, avgBoxX + 24, finalY + 15, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(156, 163, 175);
  doc.text(`Rang : ${classRank} / ${classSize}`, avgBoxX + 24, finalY + 20, { align: 'center' });

  // 6. Signatures and Official Stamp Section
  const sigY = finalY + summaryHeight + 5;
  const sigBoxWidth = (contentWidth - 6) / 3;
  const sigHeight = 24;

  // Box 1: Professeur Principal
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, sigY, sigBoxWidth, sigHeight, 2, 2, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("LE PROFESSEUR PRINCIPAL", margin + 4, sigY + 5);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text("Visa & Appréciation", margin + 4, sigY + 9);

  // Box 2: Les Parents
  doc.roundedRect(margin + sigBoxWidth + 3, sigY, sigBoxWidth, sigHeight, 2, 2, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("LES PARENTS D'ÉLÈVE", margin + sigBoxWidth + 7, sigY + 5);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text("Émargement & Date", margin + sigBoxWidth + 7, sigY + 9);

  // Box 3: Direction / Chef d'Établissement with Official Stamp simulation
  const dirBoxX = margin + (sigBoxWidth + 3) * 2;
  doc.roundedRect(dirBoxX, sigY, sigBoxWidth, sigHeight, 2, 2, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("LE CHEF D'ÉTABLISSEMENT", dirBoxX + 4, sigY + 5);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text("Signature & Sceau Officiel", dirBoxX + 4, sigY + 9);

  // Simulation of official stamp
  doc.setDrawColor(37, 99, 235);
  doc.setFillColor(239, 246, 255);
  doc.circle(dirBoxX + sigBoxWidth - 10, sigY + 14, 7, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(37, 99, 235);
  doc.text("AKPANY", dirBoxX + sigBoxWidth - 10, sigY + 13.5, { align: 'center' });
  doc.text("SCEAU", dirBoxX + sigBoxWidth - 10, sigY + 16, { align: 'center' });

  // 7. Footer Notice
  const footerY = 286;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(156, 163, 175);
  doc.text(
    `Document académique officiel généré via le portail numérique ${schoolName} (demo.akpanyschool.store). Tout duplicata non certifié est nul.`,
    pageWidth / 2,
    footerY,
    { align: 'center' }
  );

  // Save the file
  const safeNom = student.nom.replace(/[^a-zA-Z0-9]/g, '_');
  const safeTrimestre = trimestre.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Bulletin_${safeNom}_${safeTrimestre}.pdf`);

  return doc;
}

/**
 * Builds the standalone, printable HTML document for printing or embedding.
 */
export function getBulletinPrintHTML(data: BulletinExportData): string {
  const {
    student,
    trimestre,
    anneeScolaire = '2025 - 2026',
    rows,
    totalCoef,
    totalPoints,
    overallAverageStr,
    overallMention,
    classRank = '—',
    classSize = 1,
    classAverage = '—',
    highestAverage = '—',
    lowestAverage = '—',
    absencesCount = 0,
    retardsCount = 0,
    schoolName = 'AKPANY SCHOOL'
  } = data;

  const dateStr = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const tableRowsHtml = rows
    .map(
      (r, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${r.matiere}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: center; font-weight: 600;">${r.coef !== undefined ? r.coef : 1}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: center;">${r.devoir1}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: center;">${r.devoir2}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: center;">${r.compo}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: #111827; font-size: 13px;">${r.moyStr}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: center; font-weight: 600; color: #374151;">${r.pointsCoefStr || (r.pointsCoefVal !== null && r.pointsCoefVal !== undefined ? r.pointsCoefVal.toFixed(2) : '—')}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: center;">${r.rangMatiere || '—'}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: center;">
        <span style="display: inline-block; padding: 3px 8px; background: #111827; color: #ffffff; border-radius: 6px; font-size: 9px; font-weight: bold; text-transform: uppercase;">
          ${r.app}
        </span>
      </td>
    </tr>
  `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8" />
      <title>Bulletin_${student.nom.replace(/\s+/g, '_')}_${trimestre.replace(/\s+/g, '_')}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        * {
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          margin: 0;
          padding: 16px;
          color: #111827;
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .no-print-toolbar {
          background: #111827;
          color: #ffffff;
          padding: 12px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: -16px -16px 20px -16px;
          border-bottom: 2px solid #374151;
        }
        .btn-print {
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: bold;
          font-size: 12px;
          cursor: pointer;
        }
        .btn-print:hover {
          background: #1d4ed8;
        }
        .bulletin-container {
          max-width: 820px;
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
          padding: 20px;
        }
        .national-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 10px;
          margin-bottom: 14px;
        }
        .national-sub {
          font-size: 9px;
          color: #6b7280;
          line-height: 1.3;
        }
        .banner {
          background: #111827;
          color: #ffffff;
          padding: 16px 20px;
          border-radius: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }
        .banner-title {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .banner-subtitle {
          font-size: 11px;
          color: #9ca3af;
          margin-top: 2px;
        }
        .student-grid {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 14px 18px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
          font-size: 12px;
        }
        .student-item {
          display: flex;
          gap: 6px;
        }
        .student-label {
          color: #64748b;
          font-weight: 700;
          font-size: 10px;
          text-transform: uppercase;
          min-width: 90px;
        }
        .student-val {
          color: #0f172a;
          font-weight: 700;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
          font-size: 11px;
        }
        th {
          background-color: #111827;
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 8px 10px;
          border: 1px solid #374151;
        }
        .summary-panel {
          background: #f8fafc;
          border: 1.5px solid #cbd5e1;
          border-radius: 10px;
          padding: 14px 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .avg-badge {
          background: #111827;
          color: #ffffff;
          padding: 8px 16px;
          border-radius: 10px;
          text-align: center;
        }
        .signatures-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid #e5e7eb;
        }
        .sig-card {
          border: 1px dashed #94a3b8;
          border-radius: 8px;
          padding: 10px;
          min-height: 80px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          font-size: 9px;
        }
        .sig-title {
          font-weight: 800;
          text-transform: uppercase;
          color: #334155;
        }
        .official-seal {
          border: 1.5px solid #2563eb;
          border-radius: 50%;
          width: 44px;
          height: 44px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #2563eb;
          font-size: 7px;
          font-weight: 900;
          align-self: flex-end;
          transform: rotate(-12deg);
        }
        .footer-text {
          text-align: center;
          font-size: 9px;
          color: #94a3b8;
          margin-top: 16px;
        }
        @media print {
          .no-print-toolbar {
            display: none !important;
          }
          body {
            padding: 0;
          }
          .bulletin-container {
            border: none;
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="no-print-toolbar">
        <div>
          <strong>📄 Bulletin Trimestriel Imprimable</strong>
          <span style="font-size: 11px; color: #9ca3af; margin-left: 8px;">${student.nom} (${trimestre})</span>
        </div>
        <button class="btn-print" onclick="window.print()">
          🖨️ Imprimer / Enregistrer en PDF
        </button>
      </div>

      <div class="bulletin-container">
        <div class="national-header">
          <div>
            <div style="font-weight: 800; font-size: 11px; color: #1e293b;">RÉPUBLIQUE DE CÔTE D'IVOIRE</div>
            <div class="national-sub">Union - Discipline - Travail</div>
            <div class="national-sub" style="font-weight: 600; margin-top: 2px;">MINISTÈRE DE L'ÉDUCATION NATIONALE ET DE L'ALPHABÉTISATION</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 800; font-size: 11px; color: #1e293b;">Année Scolaire : ${anneeScolaire}</div>
            <div class="national-sub">Date d'édition : ${dateStr}</div>
            <div class="national-sub">Portail Officiel : demo.akpanyschool.store</div>
          </div>
        </div>

        <div class="banner">
          <div>
            <div class="banner-title">🏫 ${schoolName.toUpperCase()}</div>
            <div class="banner-subtitle">BULLETIN TRIMESTRIEL OFFICIEL DE NOTES — <strong>${trimestre.toUpperCase()}</strong></div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; font-weight: bold; background: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 6px;">
              CLASSE : ${student.classe || '—'}
            </div>
          </div>
        </div>

        <div class="student-grid">
          <div>
            <div class="student-item">
              <span class="student-label">ÉLÈVE :</span>
              <span class="student-val">${student.nom}</span>
            </div>
            <div class="student-item" style="margin-top: 4px;">
              <span class="student-label">MATRICULE :</span>
              <span class="student-val">${student.code || 'NON ATTRIBUÉ'}</span>
            </div>
            <div class="student-item" style="margin-top: 4px;">
              <span class="student-label">ASSIDUITÉ :</span>
              <span class="student-val">${absencesCount} absence(s) · ${retardsCount} retard(s)</span>
            </div>
          </div>
          <div>
            <div class="student-item">
              <span class="student-label">CLASSE :</span>
              <span class="student-val">${student.classe || '—'} (Effectif : ${classSize})</span>
            </div>
            <div class="student-item" style="margin-top: 4px;">
              <span class="student-label">RANG :</span>
              <span class="student-val">${classRank} sur ${classSize}</span>
            </div>
            <div class="student-item" style="margin-top: 4px;">
              <span class="student-label">STATUT :</span>
              <span class="student-val" style="color: #059669;">Inscrit(e) régulier(ère)</span>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="text-align: left;">Matière Enseignée</th>
              <th>Coef</th>
              <th>Devoir 1</th>
              <th>Devoir 2</th>
              <th>Compo</th>
              <th>Moy /20</th>
              <th>Points</th>
              <th>Rang</th>
              <th>Appréciation</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length > 0
                ? tableRowsHtml
                : `<tr><td colspan="9" style="padding: 20px; text-align: center; color: #6b7280;">Aucune note saisie pour ce trimestre.</td></tr>`
            }
          </tbody>
        </table>

        <div class="summary-panel">
          <div>
            <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Bilan Général du Conseil de Classe</div>
            <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 3px;">${overallMention}</div>
            <div style="font-size: 10px; color: #64748b; margin-top: 4px;">
              Total Coefs : <strong>${totalCoef}</strong> · Points cumulés : <strong>${totalPoints.toFixed(2)}</strong> · Moy. Classe : <strong>${classAverage}</strong>
            </div>
          </div>
          <div class="avg-badge">
            <div style="font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8;">Moyenne Générale</div>
            <div style="font-size: 20px; font-weight: 900;">${overallAverageStr}</div>
            <div style="font-size: 8px; opacity: 0.85;">Rang : ${classRank} / ${classSize}</div>
          </div>
        </div>

        <div class="signatures-grid">
          <div class="sig-card">
            <div class="sig-title">Le Professeur Principal</div>
            <div style="color: #64748b;">Visa & Observations :</div>
          </div>
          <div class="sig-card">
            <div class="sig-title">Les Parents d'Élève</div>
            <div style="color: #64748b;">Signature & Date :</div>
          </div>
          <div class="sig-card">
            <div class="sig-title">Le Chef d'Établissement</div>
            <div class="official-seal">
              <span>SCEAU</span>
              <span>OFFICIEL</span>
            </div>
          </div>
        </div>

        <div class="footer-text">
          Document généré officiellement sur la plateforme numérique <strong>${schoolName}</strong> le ${dateStr}. Toute falsification est passible de sanctions.
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Triggers reliable, isolated printing of the bulletin using a hidden iframe.
 * Avoids browser popup blockers in iframe environments.
 */
export function printBulletinViaIframe(data: BulletinExportData): void {
  const htmlContent = getBulletinPrintHTML(data);
  const existingFrame = document.getElementById('bulletin-print-iframe');
  if (existingFrame) {
    existingFrame.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'bulletin-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(htmlContent);
  doc.close();

  iframe.contentWindow?.focus();
  setTimeout(() => {
    try {
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('Iframe print fallback to window.print():', e);
      window.print();
    }
  }, 400);
}

/**
 * Backward compatibility wrapper for legacy code.
 */
export function exportBulletinToPDF(
  student: Eleve,
  trimestre: string,
  rows: CalculatedBulletinRow[],
  overallAverageStr: string,
  overallMention: string,
  schoolName = 'AKPANY SCHOOL'
): void {
  // Compute totals
  let totalCoef = 0;
  let totalPoints = 0;
  rows.forEach((r) => {
    const coef = r.coef !== undefined ? r.coef : 1;
    totalCoef += coef;
    if (r.moyVal !== null && r.moyVal !== undefined) {
      totalPoints += r.moyVal * coef;
    }
  });

  const exportData: BulletinExportData = {
    student,
    trimestre,
    rows,
    totalCoef: totalCoef > 0 ? totalCoef : rows.length,
    totalPoints,
    overallAverageVal: totalCoef > 0 ? totalPoints / totalCoef : null,
    overallAverageStr,
    overallMention,
    schoolName
  };

  // Generate the actual PDF file directly
  generateBulletinPDF(exportData);
}
