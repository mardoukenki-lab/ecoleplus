import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Eleve, Paiement } from '../types';
import { Upload, FileSpreadsheet, Download, Check, AlertTriangle, X, Plus, FileText, RefreshCw } from 'lucide-react';

interface StudentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
  onSuccess: () => void;
}

interface ParsedStudentRow {
  prenom?: string;
  nom?: string;
  nomComplet: string;
  classe: string;
  code?: string;
  isValid: boolean;
  error?: string;
}

export default function StudentImportModal({ isOpen, onClose, showToast, onSuccess }: StudentImportModalProps) {
  const [activeTab, setActiveTab] = useState<'excel' | 'manual'>('excel');
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [defaultClasse, setDefaultClasse] = useState('6e A');
  const [manualText, setManualText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const generateEleveCode = () => {
    return 'ELV-' + Math.floor(1000 + Math.random() * 9000);
  };

  const downloadExcelTemplate = () => {
    const templateData = [
      { 'Prénom': 'Koffi', 'Nom': 'YAO', 'Classe': '6e A' },
      { 'Prénom': 'Awa', 'Nom': 'KOUADIO', 'Classe': '6e A' },
      { 'Prénom': 'Jean', 'Nom': 'KONAN', 'Classe': '5e B' },
      { 'Prénom': 'Marie', 'Nom': 'BAMBA', 'Classe': '4e C' },
      { 'Prénom': 'Ibrahim', 'Nom': 'DIABATE', 'Classe': '3e A' },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Élèves');
    XLSX.writeFile(workbook, 'Modele_Import_Eleves_EcolePlus.xlsx');
    showToast('📥 Modèle Excel téléchargé avec succès !');
  };

  const downloadCsvTemplate = () => {
    const csvContent = "Prénom,Nom,Classe\nKoffi,YAO,6e A\nAwa,KOUADIO,6e A\nJean,KONAN,5e B\nMarie,BAMBA,4e C\nIbrahim,DIABATE,3e A";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Modele_Import_Eleves_EcolePlus.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('📥 Modèle CSV téléchargé avec succès !');
  };

  const parseFile = (fileToParse: File) => {
    setIsProcessing(true);
    setFile(fileToParse);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!jsonRows || jsonRows.length === 0) {
          showToast('⚠️ Le fichier est vide ou n\'a pas pu être lu.');
          setParsedRows([]);
          setIsProcessing(false);
          return;
        }

        const rows: ParsedStudentRow[] = jsonRows.map((row) => {
          let prenom = '';
          let nom = '';
          let nomComplet = '';
          let classe = defaultClasse;
          let code = '';

          // Look for matching keys flexibly
          Object.keys(row).forEach((key) => {
            const cleanKey = key.trim().toLowerCase();
            const val = String(row[key]).trim();

            if (['prenom', 'prénom', 'firstname', 'first name'].includes(cleanKey)) {
              prenom = val;
            } else if (['nom', 'lastname', 'last name', 'famille'].includes(cleanKey)) {
              nom = val;
            } else if (['nom complet', 'nom & prenom', 'nom et prenom', 'eleve', 'élève', 'étudiant', 'fullname', 'name'].includes(cleanKey)) {
              nomComplet = val;
            } else if (['classe', 'niveau', 'class', 'grade'].includes(cleanKey)) {
              if (val) classe = val;
            } else if (['code', 'matricule', 'id'].includes(cleanKey)) {
              if (val) code = val;
            }
          });

          // Compose full name if separate prenom/nom
          if (!nomComplet) {
            if (prenom || nom) {
              nomComplet = `${prenom} ${nom}`.trim();
            }
          }

          const isValid = nomComplet.length > 2;
          return {
            prenom,
            nom,
            nomComplet,
            classe: classe || defaultClasse,
            code: code || generateEleveCode(),
            isValid,
            error: isValid ? undefined : 'Nom d\'élève manquant ou trop court'
          };
        });

        setParsedRows(rows);
        showToast(`📊 Fichier analysé : ${rows.filter(r => r.isValid).length} élève(s) valide(s) trouvé(s).`);
      } catch (err) {
        console.error(err);
        showToast('❌ Erreur lors de la lecture du fichier Excel/CSV.');
      } finally {
        setIsProcessing(false);
      }
    };

    reader.readAsArrayBuffer(fileToParse);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      parseFile(droppedFile);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      parseFile(e.target.files[0]);
    }
  };

  const parseManualText = () => {
    if (!manualText.trim()) {
      showToast('⚠️ Veuillez saisir au moins une ligne de données.');
      return;
    }

    const lines = manualText.split('\n');
    const rows: ParsedStudentRow[] = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Split by comma, semicolon or tab
      const parts = trimmed.split(/[,;\t]+/);
      if (parts.length >= 1) {
        const nomComplet = parts[0].trim();
        const classe = parts[1] ? parts[1].trim() : defaultClasse;
        const code = parts[2] ? parts[2].trim() : generateEleveCode();

        const isValid = nomComplet.length > 2;
        rows.push({
          nomComplet,
          classe: classe || defaultClasse,
          code,
          isValid,
          error: isValid ? undefined : 'Nom invalide'
        });
      }
    });

    setParsedRows(rows);
    showToast(`📝 Saisie analysée : ${rows.filter(r => r.isValid).length} élève(s) prêt(s).`);
  };

  const handleImportStudents = async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      showToast('⚠️ Aucun élève valide à importer.');
      return;
    }

    setImporting(true);
    let importedCount = 0;

    try {
      for (const student of validRows) {
        const eleveId = 'elv_' + Math.random().toString(36).substring(2, 9);
        const code = student.code || generateEleveCode();

        const newEleve: Eleve = {
          id: eleveId,
          nom: student.nomComplet,
          classe: student.classe,
          code,
          createdAt: new Date().toISOString()
        };

        // Save student
        await setDoc(doc(db, 'eleves', eleveId), newEleve);

        // Initialize tuition record (paiement)
        const paiementId = 'pay_' + eleveId;
        const initialPaiement: Paiement = {
          id: paiementId,
          eleveId,
          eleveNom: newEleve.nom,
          classe: newEleve.classe,
          total: 95000,
          paye: 0,
          solde: 95000,
          echeance: '30 Janvier 2025',
          historique: []
        };
        await setDoc(doc(db, 'paiements', paiementId), initialPaiement);

        importedCount++;
      }

      showToast(`🎉 Importation réussie ! ${importedCount} élève(s) ajouté(s) à la base de données.`);
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      showToast('❌ Erreur lors de l\'importation en base de données.');
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedRows.filter(r => r.isValid).length;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-[32px] border border-[#e0e0e0] max-w-3xl w-full p-6 sm:p-8 shadow-2xl space-y-6 relative max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#1a1a1a] text-white flex items-center justify-center font-bold text-sm">
                <FileSpreadsheet size={18} />
              </div>
              <h3 className="font-sans font-bold text-lg text-[#1a1a1a] tracking-tight">
                Importation Massive d'Élèves
              </h3>
            </div>
            <p className="text-xs text-[#757575] font-medium mt-1">
              Importez vos listes d'élèves par fichier Excel (.xlsx, .xls), CSV ou par saisie texte rapide.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-[#9e9e9e] hover:text-[#1a1a1a] rounded-xl hover:bg-[#f5f5f5] transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex gap-2 p-1 bg-[#f5f5f5] rounded-2xl flex-shrink-0">
          <button
            onClick={() => setActiveTab('excel')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'excel' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#757575] hover:text-[#1a1a1a]'
            }`}
          >
            <FileSpreadsheet size={15} />
            Import Fichier Excel / CSV
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'manual' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#757575] hover:text-[#1a1a1a]'
            }`}
          >
            <FileText size={15} />
            Saisie Ligne par Ligne
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {activeTab === 'excel' ? (
            <div className="space-y-4">
              {/* Template Download Section */}
              <div className="bg-[#f5f5f5]/60 p-4 rounded-2xl border border-[#e0e0e0]/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-[#1a1a1a] flex items-center gap-1.5">
                    💡 Besoin d'un modèle de fichier ?
                  </span>
                  <p className="text-[11px] text-[#757575] mt-0.5">
                    Téléchargez notre modèle préformaté avec les colonnes (Prénom, Nom, Classe).
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={downloadExcelTemplate}
                    className="px-3 py-1.5 bg-white border border-[#e0e0e0] hover:border-[#1a1a1a] text-[#1a1a1a] text-[11px] font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Download size={13} /> Excel (.xlsx)
                  </button>
                  <button
                    onClick={downloadCsvTemplate}
                    className="px-3 py-1.5 bg-white border border-[#e0e0e0] hover:border-[#1a1a1a] text-[#1a1a1a] text-[11px] font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Download size={13} /> CSV (.csv)
                  </button>
                </div>
              </div>

              {/* Upload Drop Zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#e0e0e0] hover:border-[#1a1a1a] bg-[#fafafa] hover:bg-[#f5f5f5]/50 rounded-2xl p-8 text-center cursor-pointer transition-all space-y-3 group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  accept=".xlsx, .xls, .csv, .tsv, .ods"
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-full bg-white border border-[#e0e0e0] group-hover:border-[#1a1a1a] flex items-center justify-center mx-auto text-[#1a1a1a] transition-all">
                  <Upload size={22} />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#1a1a1a]">
                    Glissez-déposez votre fichier ici ou <span className="underline">parcourez</span>
                  </p>
                  <p className="text-[10px] text-[#9e9e9e] font-medium mt-1">
                    Formats acceptés : Excel (.xlsx, .xls), CSV, TSV, ODS
                  </p>
                </div>
                {file && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#1a1a1a] text-white text-[11px] font-mono rounded-lg">
                    <span>📄 {file.name}</span>
                    <span className="text-[10px] opacity-75">({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#1a1a1a] mb-1">
                  Collez ou saisissez la liste des élèves (1 par ligne)
                </label>
                <p className="text-[11px] text-[#757575] mb-2">
                  Format recommandé : <code>Nom Prénom, Classe</code> (ex: <code>Koffi YAO, 6e A</code>)
                </p>
                <textarea
                  className="w-full h-36 px-3.5 py-2.5 border border-[#e0e0e0] rounded-2xl text-xs font-mono focus:outline-none focus:border-[#1a1a1a] bg-white text-[#1a1a1a] leading-relaxed"
                  placeholder={`Koffi YAO, 6e A\nAwa KOUADIO, 6e A\nJean KONAN, 5e B\nMarie BAMBA, 4e C`}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                />
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#757575]">Classe par défaut :</span>
                  <select
                    value={defaultClasse}
                    onChange={(e) => setDefaultClasse(e.target.value)}
                    className="px-2.5 py-1 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] font-bold"
                  >
                    <option>6e A</option>
                    <option>6e B</option>
                    <option>5e B</option>
                    <option>5e C</option>
                    <option>4e C</option>
                    <option>3e A</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={parseManualText}
                  className="px-4 py-2 bg-[#1a1a1a] text-white text-xs font-bold rounded-xl hover:bg-black transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={14} /> Analyser le texte
                </button>
              </div>
            </div>
          )}

          {/* Parsed Preview Section */}
          {parsedRows.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1a1a1a] flex items-center gap-2">
                  📊 Aperçu des élèves à importer ({validCount} valides sur {parsedRows.length})
                </span>
                <span className="text-[10px] text-[#757575] font-semibold">
                  Codes d'association générés automatiquement
                </span>
              </div>

              <div className="max-h-52 overflow-y-auto border border-[#e0e0e0] rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#f5f5f5] sticky top-0 border-b border-[#e0e0e0]">
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-[#757575]">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Nom & Prénom</th>
                      <th className="py-2.5 px-3">Classe</th>
                      <th className="py-2.5 px-3">Code Unique</th>
                      <th className="py-2.5 px-3">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e0e0]/60 font-medium text-[#1a1a1a]">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className={row.isValid ? 'hover:bg-[#f5f5f5]/30' : 'bg-red-50/50'}>
                        <td className="py-2 px-3 text-[#9e9e9e] text-[10px] font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-bold">{row.nomComplet || <span className="text-red-500 italic">Vide</span>}</td>
                        <td className="py-2 px-3 font-semibold">{row.classe}</td>
                        <td className="py-2 px-3">
                          <span className="font-mono text-[11px] font-bold bg-[#f5f5f5] px-2 py-0.5 rounded border border-[#e0e0e0]">
                            🔑 {row.code}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {row.isValid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 rounded-md">
                              <Check size={12} /> Prêt
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-700 font-bold text-[10px] bg-red-100 px-2 py-0.5 rounded-md">
                              <AlertTriangle size={12} /> {row.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-4 border-t border-[#e0e0e0] flex items-center justify-between gap-3 flex-shrink-0">
          <span className="text-xs text-[#757575] font-medium">
            {validCount > 0 ? `${validCount} élève(s) seront créés avec leurs frais scolaires initialisés.` : 'Sélectionnez un fichier ou collez du texte.'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2.5 border border-[#e0e0e0] hover:bg-[#f5f5f5] rounded-xl text-xs font-bold text-[#1a1a1a] transition-all cursor-pointer"
            >
              Annuler
            </button>
            <button
              onClick={handleImportStudents}
              disabled={importing || validCount === 0}
              className="px-5 py-2.5 bg-[#1a1a1a] hover:bg-black disabled:bg-[#e0e0e0] disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {importing ? 'Importation en cours...' : `✓ Valider & Importer (${validCount})`}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
