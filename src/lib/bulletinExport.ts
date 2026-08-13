import { Eleve } from '../types';

export interface CalculatedBulletinRow {
  matiere: string;
  devoir1: string | number;
  devoir2: string | number;
  compo: string | number;
  moyStr: string;
  app: string;
}

export function exportBulletinToPDF(
  student: Eleve,
  trimestre: string,
  rows: CalculatedBulletinRow[],
  overallAverageStr: string,
  overallMention: string,
  schoolName = 'AKPANY SCHOOL'
): void {
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) return;

  const dateStr = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const tableRowsHtml = rows.map((r, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
      <td style="padding: 10px 14px; border: 1px solid #e5e7eb; font-weight: bold; color: #111827;">${r.matiere}</td>
      <td style="padding: 10px 14px; border: 1px solid #e5e7eb; text-align: center;">${r.devoir1}</td>
      <td style="padding: 10px 14px; border: 1px solid #e5e7eb; text-align: center;">${r.devoir2}</td>
      <td style="padding: 10px 14px; border: 1px solid #e5e7eb; text-align: center;">${r.compo}</td>
      <td style="padding: 10px 14px; border: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: #111827; font-size: 14px;">${r.moyStr}</td>
      <td style="padding: 10px 14px; border: 1px solid #e5e7eb; text-align: center;">
        <span style="display: inline-block; padding: 4px 10px; background: #111827; color: #ffffff; border-radius: 6px; font-size: 10px; font-weight: bold; text-transform: uppercase;">
          ${r.app}
        </span>
      </td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8" />
      <title>Bulletin_${student.nom.replace(/\s+/g, '_')}_${trimestre.replace(/\s+/g, '_')}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          margin: 0;
          padding: 20px;
          color: #111827;
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .no-print-toolbar {
          background: #111827;
          color: #ffffff;
          padding: 14px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: -20px -20px 24px -20px;
          border-bottom: 2px solid #374151;
        }
        .no-print-toolbar button {
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 9px 18px;
          border-radius: 8px;
          font-weight: bold;
          font-size: 13px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .no-print-toolbar button:hover {
          background: #1d4ed8;
        }
        .bulletin-card {
          border: 2px solid #111827;
          border-radius: 16px;
          overflow: hidden;
          max-width: 850px;
          margin: 0 auto;
          background: #ffffff;
        }
        .header-banner {
          background: #111827;
          color: #ffffff;
          padding: 28px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 3px solid #2563eb;
        }
        .school-subtitle {
          color: #9ca3af;
          font-size: 10px;
          font-weight: bold;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }
        .school-title {
          font-size: 24px;
          font-weight: 800;
          margin: 4px 0 2px 0;
        }
        .bulletin-type {
          font-size: 13px;
          color: #d1d5db;
        }
        .student-badge {
          background: #1f2937;
          border: 1px solid #374151;
          padding: 12px 18px;
          border-radius: 12px;
          text-align: right;
        }
        .student-name {
          font-size: 16px;
          font-weight: bold;
          color: #ffffff;
        }
        .student-meta {
          font-size: 12px;
          color: #9ca3af;
          margin-top: 2px;
        }
        .content {
          padding: 28px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
          font-size: 13px;
        }
        th {
          background-color: #f3f4f6;
          color: #374151;
          font-[11px];
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 10px 14px;
          border: 1px solid #e5e7eb;
        }
        .summary-box {
          background: #f9fafb;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          padding: 18px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 28px;
        }
        .summary-title {
          font-size: 10px;
          font-weight: bold;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .summary-mention {
          font-size: 15px;
          font-weight: 800;
          color: #111827;
          margin-top: 4px;
        }
        .summary-avg {
          font-size: 26px;
          font-weight: 900;
          color: #111827;
        }
        .signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
        }
        .sig-box {
          border: 1px dashed #cbd5e1;
          border-radius: 10px;
          padding: 16px;
          height: 90px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .sig-label {
          font-size: 11px;
          font-weight: bold;
          color: #475569;
          text-transform: uppercase;
        }
        .footer-note {
          text-align: center;
          font-size: 10px;
          color: #9ca3af;
          margin-top: 20px;
        }

        @media print {
          .no-print-toolbar {
            display: none !important;
          }
          body {
            padding: 0;
            background: #ffffff;
          }
          .bulletin-card {
            border: 1px solid #000;
            border-radius: 0;
            max-width: 100%;
          }
        }
      </style>
    </head>
    <body>
      <div class="no-print-toolbar">
        <div>
          <strong>📄 Bulletin de Notes — PDF / Imprimable</strong>
          <span style="font-size: 11px; color: #9ca3af; margin-left: 10px;">${student.nom} (${trimestre})</span>
        </div>
        <button onclick="window.print()">
          💾 Enregistrer / Imprimer en PDF
        </button>
      </div>

      <div class="bulletin-card">
        <div class="header-banner">
          <div>
            <div class="school-subtitle">RÉPUBLIQUE DE CÔTE D'IVOIRE · MINISTÈRE DE L'ÉDUCATION NATIONALE</div>
            <div class="school-title">🏫 ${schoolName}</div>
            <div class="bulletin-type">Bulletin Officiel de Notes — <strong>${trimestre}</strong></div>
            <div style="font-size: 10px; color: #9ca3af; margin-top: 4px;">Portail Officiel : https://demo.akpanyschool.store/</div>
          </div>
          <div class="student-badge">
            <div class="student-name">${student.nom}</div>
            <div class="student-meta">Classe : <strong style="color:#fff;">${student.classe}</strong></div>
            <div class="student-meta">Matricule / Code : <strong style="color:#fff;">${student.code}</strong></div>
            <div class="student-meta" style="margin-top: 4px;">Édité le : ${dateStr}</div>
          </div>
        </div>

        <div class="content">
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Matière Enseignée</th>
                <th>Devoir 1</th>
                <th>Devoir 2</th>
                <th>Compo / Examen</th>
                <th>Moyenne /20</th>
                <th>Appréciation</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length > 0 ? tableRowsHtml : `
                <tr>
                  <td colspan="6" style="padding: 24px; text-align: center; color: #6b7280;">
                    Aucune note disponible pour ce trimestre.
                  </td>
                </tr>
              `}
            </tbody>
          </table>

          ${rows.length > 0 ? `
            <div class="summary-box">
              <div>
                <div class="summary-title">Bilan Général & Appréciation du Conseil</div>
                <div class="summary-mention">${overallMention}</div>
              </div>
              <div style="text-align: right;">
                <div class="summary-title">Moyenne Générale</div>
                <div class="summary-avg">${overallAverageStr}</div>
              </div>
            </div>
          ` : ''}

          <div class="signatures">
            <div class="sig-box">
              <div class="sig-label">Signature & Cachet du Chef d'Établissement</div>
            </div>
            <div class="sig-box">
              <div class="sig-label">Visa & Signature des Parents d'Élève</div>
            </div>
          </div>

          <div class="footer-note">
            Document généré officiellement sur la plateforme <strong>${schoolName}</strong> (demo.akpanyschool.store) le ${dateStr}.
          </div>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 300);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
