import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Examen, UserProfile, Eleve } from '../types';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Trash2, 
  Edit, 
  Eye, 
  EyeOff, 
  Share2, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Filter, 
  BookOpen, 
  MapPin, 
  Info,
  CalendarCheck,
  Send,
  X,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { cacheOfflineExams, getCachedOfflineExams } from '../lib/offlineSync';

interface ExamCalendarViewProps {
  currentUser: UserProfile;
  userRole: 'admin' | 'prof' | 'parent';
  targetClassFilter?: string; // If provided by parent (child's class) or teacher
  students?: Eleve[];
  classesList?: string[];
  showToast: (msg: string) => void;
}

const EXAM_TYPES: { id: Examen['type']; label: string; color: string; bg: string }[] = [
  { id: 'composition', label: 'Composition Trimestrielle', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  { id: 'examen_blanc', label: 'Examen Blanc', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  { id: 'devoir_surveille', label: 'Devoir Surveillé Général', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  { id: 'bepc', label: 'BEPC Blanc / Officiel', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  { id: 'bac', label: 'BAC Blanc / Officiel', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' },
  { id: 'autre', label: 'Autre Épreuve', color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
];

const DEFAULT_CLASSES = [
  '6e A', '6e B', '5e A', '5e B', '4e A', '4e B', '3e A', '3e B',
  '2nde A', '2nde C', '1ère A', '1ère D', 'Tle A', 'Tle D'
];

export default function ExamCalendarView({
  currentUser,
  userRole,
  targetClassFilter,
  students = [],
  classesList = [],
  showToast,
}: ExamCalendarViewProps) {
  const [exams, setExams] = useState<Examen[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>(targetClassFilter || 'all');
  const [selectedTrimestre, setSelectedTrimestre] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming');

  // Modals & form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Examen | null>(null);
  const [selectedExamDetails, setSelectedExamDetails] = useState<Examen | null>(null);
  const [isSendingAlert, setIsSendingAlert] = useState(false);

  // Form inputs
  const [titre, setTitre] = useState('');
  const [type, setType] = useState<Examen['type']>('composition');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [isAllClasses, setIsAllClasses] = useState(false);
  const [matiere, setMatiere] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [heureDebut, setHeureDebut] = useState('08:00');
  const [heureFin, setHeureFin] = useState('12:00');
  const [salle, setSalle] = useState('');
  const [coefficient, setCoefficient] = useState('2');
  const [consignes, setConsignes] = useState('');
  const [trimestre, setTrimestre] = useState<Examen['trimestre']>('Trimestre 1');
  const [publie, setPublie] = useState(true);

  // Available classes list
  const allClasses = useMemo(() => {
    const set = new Set<string>([...DEFAULT_CLASSES, ...classesList]);
    return Array.from(set).sort();
  }, [classesList]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Update selected class if targetClassFilter prop changes
  useEffect(() => {
    if (targetClassFilter) {
      setSelectedClass(targetClassFilter);
    }
  }, [targetClassFilter]);

  // Load exams real-time or from offline cache
  useEffect(() => {
    const qExams = query(collection(db, 'examens'), orderBy('dateDebut', 'asc'));
    const unsubscribe = onSnapshot(
      qExams,
      (snapshot) => {
        const list: Examen[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as Examen);
        });
        setExams(list);
        cacheOfflineExams(list);
        setLoading(false);
      },
      (error) => {
        console.warn('Examens listener warning (fallback to offline cache):', error);
        const cached = getCachedOfflineExams();
        if (cached && cached.length > 0) {
          setExams(cached);
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Open modal for new or editing
  const handleOpenModal = (exam?: Examen) => {
    if (exam) {
      setEditingExam(exam);
      setTitre(exam.titre);
      setType(exam.type);
      if (exam.classes.includes('Toutes') || exam.classes.length >= allClasses.length) {
        setIsAllClasses(true);
        setSelectedClasses(allClasses);
      } else {
        setIsAllClasses(false);
        setSelectedClasses(exam.classes);
      }
      setMatiere(exam.matiere || '');
      setDateDebut(exam.dateDebut);
      setDateFin(exam.dateFin || '');
      setHeureDebut(exam.heureDebut || '08:00');
      setHeureFin(exam.heureFin || '12:00');
      setSalle(exam.salle || '');
      setCoefficient(exam.coefficient?.toString() || '2');
      setConsignes(exam.consignes || '');
      setTrimestre(exam.trimestre || 'Trimestre 1');
      setPublie(exam.publie ?? true);
    } else {
      setEditingExam(null);
      setTitre('');
      setType('composition');
      setIsAllClasses(false);
      setSelectedClasses(targetClassFilter ? [targetClassFilter] : ['6e A']);
      setMatiere('Toutes les matières');
      // Default to next week
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      setDateDebut(nextWeek.toISOString().split('T')[0]);
      setDateFin('');
      setHeureDebut('08:00');
      setHeureFin('12:00');
      setSalle('Salles de classe habituelles');
      setCoefficient('2');
      setConsignes('Calculatrice autorisée uniquement si spécifié. Téléphone strictement interdit.');
      setTrimestre('Trimestre 1');
      setPublie(true);
    }
    setIsModalOpen(true);
  };

  // Submit Exam Form
  const handleSubmitExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre.trim() || !dateDebut) {
      showToast('⚠️ Veuillez renseigner au moins le titre et la date de début.');
      return;
    }

    const classesToSave = isAllClasses ? ['Toutes'] : (selectedClasses.length > 0 ? selectedClasses : ['Toutes']);
    const examId = editingExam ? editingExam.id : `exam_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const examData: Examen = {
      id: examId,
      titre: titre.trim(),
      type,
      classes: classesToSave,
      matiere: matiere.trim() || undefined,
      dateDebut,
      dateFin: dateFin || undefined,
      heureDebut: heureDebut || undefined,
      heureFin: heureFin || undefined,
      salle: salle.trim() || undefined,
      coefficient: coefficient ? parseFloat(coefficient) : undefined,
      consignes: consignes.trim() || undefined,
      trimestre,
      publie,
      auteurNom: currentUser.nom,
      createdAt: editingExam ? editingExam.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'examens', examId), examData);
      showToast(editingExam ? '✅ Épreuve mise à jour avec succès !' : '🎉 Examen programmé et enregistré au calendrier !');
      setIsModalOpen(false);
      setEditingExam(null);
    } catch (err) {
      console.error('Error saving exam:', err);
      showToast('❌ Erreur lors de l\'enregistrement de l\'examen.');
    }
  };

  // Delete Exam
  const handleDeleteExam = async (examId: string, examTitre: string) => {
    if (!window.confirm(`Confirmez-vous la suppression de l'examen "${examTitre}" du calendrier ?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'examens', examId));
      showToast('🗑️ Examen retiré du calendrier.');
    } catch (err) {
      console.error('Error deleting exam:', err);
      showToast('❌ Erreur lors de la suppression.');
    }
  };

  // Toggle publish status
  const handleTogglePublish = async (exam: Examen) => {
    try {
      const newStatus = !exam.publie;
      await updateDoc(doc(db, 'examens', exam.id), { publie: newStatus, updatedAt: new Date().toISOString() });
      showToast(newStatus ? '👁️ Épreuve publiée (visible par les parents et professeurs).' : '🔒 Épreuve passée en brouillon privé.');
    } catch (err) {
      console.error('Error toggling publish:', err);
      showToast('❌ Erreur lors de la mise à jour.');
    }
  };

  // Send Alert Notification to Parents & Teachers
  const handleBroadcastExamNotification = async (exam: Examen) => {
    if (!window.confirm(`Diffuser une alerte notification pour "${exam.titre}" à tous les parents et enseignants concernés ?`)) {
      return;
    }
    setIsSendingAlert(true);
    try {
      const classesLabel = exam.classes.includes('Toutes') ? 'toutes les classes' : exam.classes.join(', ');
      const notifId = `notif_exam_${exam.id}_${Date.now()}`;
      
      const notifData = {
        id: notifId,
        userUid: 'all',
        icon: '🗓️',
        bg: 'bg-purple-100 text-purple-800',
        title: `🗓️ Calendrier des Examens : ${exam.titre}`,
        text: `Rappel d'épreuve [${classesLabel}] : "${exam.titre}" fixé le ${new Date(exam.dateDebut).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}${exam.heureDebut ? ` à ${exam.heureDebut}` : ''}. Salle : ${exam.salle || 'Classes'}.`,
        time: 'à l\'instant',
        unread: true,
        type: 'info',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'notifications', notifId), notifData);
      showToast(`📢 Alerte transmise avec succès pour "${exam.titre}" !`);
    } catch (err) {
      console.error('Error broadcasting notification:', err);
      showToast('❌ Échec de la diffusion de l\'alerte.');
    } finally {
      setIsSendingAlert(false);
    }
  };

  // Toggle class selection in form
  const toggleClassSelection = (cls: string) => {
    if (selectedClasses.includes(cls)) {
      setSelectedClasses(selectedClasses.filter((c) => c !== cls));
    } else {
      setSelectedClasses([...selectedClasses, cls]);
    }
  };

  // Filtered exams list
  const filteredExams = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    return exams.filter((exam) => {
      // In parent/teacher mode, hide drafts unless admin
      if (userRole !== 'admin' && !exam.publie) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchTitle = exam.titre.toLowerCase().includes(term);
        const matchMatiere = exam.matiere?.toLowerCase().includes(term);
        const matchSalle = exam.salle?.toLowerCase().includes(term);
        if (!matchTitle && !matchMatiere && !matchSalle) return false;
      }

      // Type filter
      if (selectedType !== 'all' && exam.type !== selectedType) {
        return false;
      }

      // Class filter
      if (selectedClass !== 'all') {
        const matchesClass = exam.classes.includes('Toutes') || exam.classes.includes(selectedClass);
        if (!matchesClass) return false;
      }

      // Trimestre filter
      if (selectedTrimestre !== 'all' && exam.trimestre !== selectedTrimestre) {
        return false;
      }

      // Time filter
      const examDate = exam.dateFin || exam.dateDebut;
      if (timeFilter === 'upcoming' && examDate < todayStr) {
        return false;
      }
      if (timeFilter === 'past' && examDate >= todayStr) {
        return false;
      }

      return true;
    });
  }, [exams, userRole, searchTerm, selectedType, selectedClass, selectedTrimestre, timeFilter]);

  // Statistics
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const total = exams.length;
    const upcoming = exams.filter((e) => (e.dateFin || e.dateDebut) >= todayStr && (userRole === 'admin' || e.publie)).length;
    const published = exams.filter((e) => e.publie).length;
    const drafts = exams.filter((e) => !e.publie).length;
    return { total, upcoming, published, drafts };
  }, [exams, userRole]);

  // Print schedule
  const handlePrintSchedule = () => {
    window.print();
  };

  // Helper to calculate days remaining
  const getCountdownLabel = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: 'Terminé', badge: 'bg-gray-100 text-gray-600' };
    } else if (diffDays === 0) {
      return { text: 'Aujourd\'hui !', badge: 'bg-rose-100 text-rose-800 font-extrabold animate-pulse' };
    } else if (diffDays === 1) {
      return { text: 'Demain !', badge: 'bg-amber-100 text-amber-800 font-bold' };
    } else if (diffDays <= 7) {
      return { text: `Dans ${diffDays} jours`, badge: 'bg-indigo-100 text-indigo-800 font-bold' };
    } else {
      return { text: `Dans ${diffDays} jours`, badge: 'bg-slate-100 text-slate-700' };
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER BANNER */}
      <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#1a1a1a] text-white flex items-center justify-center text-2xl shadow-sm">
            🗓️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-sans font-bold text-lg text-[#1a1a1a] tracking-tight">
                Calendrier des Examens & Épreuves
              </h2>
              {isOffline && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full border border-amber-200">
                  Mode Hors-Ligne (Cache)
                </span>
              )}
            </div>
            <p className="text-xs text-[#9e9e9e] font-medium mt-0.5">
              Consultez les dates des compositions, examens blancs, devoirs surveillés et sessions officielles.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePrintSchedule}
            className="px-3.5 py-2 border border-[#e0e0e0] hover:bg-[#f5f5f5] text-[#1a1a1a] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            title="Imprimer le calendrier"
          >
            <Printer size={14} /> Imprimer
          </button>

          {userRole === 'admin' && (
            <button
              onClick={() => handleOpenModal()}
              className="px-4 py-2 bg-[#1a1a1a] hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <Plus size={14} /> Programmer une épreuve
            </button>
          )}
        </div>
      </div>

      {/* METRICS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white rounded-[20px] p-4 border border-[#e0e0e0] shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center text-lg">
            ⏳
          </div>
          <div>
            <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">{stats.upcoming}</span>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Épreuves à venir</p>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-4 border border-[#e0e0e0] shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-lg">
            📋
          </div>
          <div>
            <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">{stats.total}</span>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Total programmées</p>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-4 border border-[#e0e0e0] shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-lg">
            👁️
          </div>
          <div>
            <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">{stats.published}</span>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Visibles (Publiées)</p>
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-4 border border-[#e0e0e0] shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-lg">
            🏛️
          </div>
          <div>
            <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">
              {targetClassFilter || (selectedClass !== 'all' ? selectedClass : 'Toutes')}
            </span>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Filtre Classe</p>
          </div>
        </div>
      </div>

      {/* SEARCH AND FILTERS BAR */}
      <div className="bg-white rounded-[20px] border border-[#e0e0e0] p-4 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9e9e9e]" />
          <input
            type="text"
            placeholder="Rechercher une épreuve, matière, salle..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Timeline filter */}
          <div className="flex bg-[#f5f5f5] p-0.5 rounded-xl border border-[#e0e0e0]">
            <button
              onClick={() => setTimeFilter('upcoming')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeFilter === 'upcoming' ? 'bg-[#1a1a1a] text-white shadow-xs' : 'text-[#9e9e9e] hover:text-[#1a1a1a]'
              }`}
            >
              À venir
            </button>
            <button
              onClick={() => setTimeFilter('past')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeFilter === 'past' ? 'bg-[#1a1a1a] text-white shadow-xs' : 'text-[#9e9e9e] hover:text-[#1a1a1a]'
              }`}
            >
              Passées
            </button>
            <button
              onClick={() => setTimeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeFilter === 'all' ? 'bg-[#1a1a1a] text-white shadow-xs' : 'text-[#9e9e9e] hover:text-[#1a1a1a]'
              }`}
            >
              Toutes
            </button>
          </div>

          {/* Class Filter */}
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] font-semibold focus:outline-none focus:border-[#1a1a1a]"
          >
            <option value="all">Toutes les classes</option>
            {allClasses.map((cls) => (
              <option key={cls} value={cls}>
                Classe {cls}
              </option>
            ))}
          </select>

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] font-semibold focus:outline-none focus:border-[#1a1a1a]"
          >
            <option value="all">Tous les types</option>
            {EXAM_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          {/* Period Filter */}
          <select
            value={selectedTrimestre}
            onChange={(e) => setSelectedTrimestre(e.target.value)}
            className="px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] font-semibold focus:outline-none focus:border-[#1a1a1a]"
          >
            <option value="all">Toutes les périodes</option>
            <option value="Trimestre 1">Trimestre 1</option>
            <option value="Trimestre 2">Trimestre 2</option>
            <option value="Trimestre 3">Trimestre 3</option>
            <option value="Semestre 1">Semestre 1</option>
            <option value="Semestre 2">Semestre 2</option>
            <option value="Annuel">Annuel</option>
          </select>
        </div>
      </div>

      {/* EXAMS LIST CARDS */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-12 text-center text-[#9e9e9e]">
            Chargement du calendrier des examens...
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-12 text-center space-y-3 shadow-sm">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#f5f5f5] flex items-center justify-center text-3xl">
              📅
            </div>
            <h3 className="font-bold text-sm text-[#1a1a1a]">Aucune épreuve trouvée</h3>
            <p className="text-xs text-[#9e9e9e] max-w-md mx-auto">
              Aucun examen ne correspond aux filtres sélectionnés. {userRole === 'admin' && 'Cliquez sur "Programmer une épreuve" pour en ajouter une.'}
            </p>
            {userRole === 'admin' && (
              <button
                onClick={() => handleOpenModal()}
                className="mt-2 px-4 py-2 bg-[#1a1a1a] text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm hover:bg-black"
              >
                <Plus size={14} /> Programmer le premier examen
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredExams.map((exam) => {
              const typeConfig = EXAM_TYPES.find((t) => t.id === exam.type) || EXAM_TYPES[0];
              const countdown = getCountdownLabel(exam.dateDebut);
              const isMultiDay = exam.dateFin && exam.dateFin !== exam.dateDebut;

              return (
                <div
                  key={exam.id}
                  className={`bg-white rounded-[24px] border border-[#e0e0e0] p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between relative ${
                    !exam.publie ? 'border-dashed border-gray-400 bg-gray-50/40' : ''
                  }`}
                >
                  <div>
                    {/* Top Row: Type & Countdown */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${typeConfig.bg} ${typeConfig.color}`}>
                        {typeConfig.label}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] ${countdown.badge}`}>
                        {countdown.text}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-sans font-bold text-sm text-[#1a1a1a] leading-tight mb-2">
                      {exam.titre}
                    </h3>

                    {/* Key Details Grid */}
                    <div className="space-y-2 text-xs py-2 border-y border-[#e0e0e0]/60 my-2">
                      {/* Date & Time */}
                      <div className="flex items-center gap-2 text-[#1a1a1a]">
                        <Calendar size={14} className="text-[#9e9e9e] flex-shrink-0" />
                        <span className="font-semibold">
                          {new Date(exam.dateDebut).toLocaleDateString('fr-FR', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {isMultiDay && ` ➔ ${new Date(exam.dateFin!).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}
                        </span>
                      </div>

                      {/* Hours */}
                      {(exam.heureDebut || exam.heureFin) && (
                        <div className="flex items-center gap-2 text-[#1a1a1a]">
                          <Clock size={14} className="text-[#9e9e9e] flex-shrink-0" />
                          <span className="font-medium text-gray-700">
                            {exam.heureDebut || '08:00'} {exam.heureFin ? `– ${exam.heureFin}` : ''}
                          </span>
                        </div>
                      )}

                      {/* Target Classes */}
                      <div className="flex items-start gap-2 text-[#1a1a1a]">
                        <BookOpen size={14} className="text-[#9e9e9e] flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <span className="text-[10px] font-bold uppercase text-[#9e9e9e]">Classes : </span>
                          <span className="font-semibold text-sky-800">
                            {exam.classes.includes('Toutes') ? 'Toutes les classes' : exam.classes.join(', ')}
                          </span>
                        </div>
                      </div>

                      {/* Room */}
                      {exam.salle && (
                        <div className="flex items-center gap-2 text-[#1a1a1a]">
                          <MapPin size={14} className="text-[#9e9e9e] flex-shrink-0" />
                          <span className="text-gray-700 font-medium truncate">{exam.salle}</span>
                        </div>
                      )}
                    </div>

                    {/* Consignes snippet if exists */}
                    {exam.consignes && (
                      <p className="text-[11px] text-[#9e9e9e] font-medium line-clamp-2 bg-[#f5f5f5]/60 p-2.5 rounded-xl border border-[#e0e0e0]/40 my-2">
                        💡 <strong>Consignes :</strong> {exam.consignes}
                      </p>
                    )}
                  </div>

                  {/* Footer Action Bar */}
                  <div className="pt-3 border-t border-[#e0e0e0]/60 flex items-center justify-between gap-2 mt-2">
                    <button
                      onClick={() => setSelectedExamDetails(exam)}
                      className="text-xs font-bold text-[#1a1a1a] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      Détails complets <ChevronRight size={13} />
                    </button>

                    {userRole === 'admin' ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleTogglePublish(exam)}
                          className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                            exam.publie
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                          title={exam.publie ? 'Publié (Cliquer pour passer en brouillon)' : 'Brouillon (Cliquer pour publier)'}
                        >
                          {exam.publie ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>

                        <button
                          onClick={() => handleBroadcastExamNotification(exam)}
                          disabled={isSendingAlert}
                          className="p-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs cursor-pointer transition-all"
                          title="Diffuser alerte rappel aux parents et profs"
                        >
                          <Send size={13} />
                        </button>

                        <button
                          onClick={() => handleOpenModal(exam)}
                          className="p-1.5 rounded-lg border border-[#e0e0e0] hover:bg-[#f5f5f5] text-[#1a1a1a] text-xs cursor-pointer transition-all"
                          title="Modifier l'examen"
                        >
                          <Edit size={13} />
                        </button>

                        <button
                          onClick={() => handleDeleteExam(exam.id, exam.titre)}
                          className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-xs cursor-pointer transition-all"
                          title="Supprimer l'examen"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="text-[10px] font-bold text-[#9e9e9e] uppercase">
                        {exam.trimestre}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE / EDIT EXAM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-[32px] border border-[#e0e0e0] max-w-xl w-full p-6 md:p-8 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-3">
              <div>
                <h3 className="font-sans font-bold text-base text-[#1a1a1a] tracking-tight">
                  {editingExam ? 'Modifier l\'épreuve / examen' : 'Programmer une nouvelle épreuve'}
                </h3>
                <p className="text-xs text-[#9e9e9e] font-medium">
                  Cette épreuve apparaîtra dans les calendriers des professeurs et des parents d'élèves.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-[#9e9e9e] hover:text-[#1a1a1a] rounded-xl hover:bg-[#f5f5f5] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitExam} className="space-y-4">
              {/* Titre */}
              <div>
                <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                  Intitulé de l'épreuve *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Composition du 1er Trimestre, BAC Blanc Régional..."
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] font-semibold focus:outline-none focus:border-[#1a1a1a]"
                />
              </div>

              {/* Type & Période */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                    Type d'évaluation
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as Examen['type'])}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] font-medium focus:outline-none focus:border-[#1a1a1a]"
                  >
                    {EXAM_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                    Période / Trimestre
                  </label>
                  <select
                    value={trimestre}
                    onChange={(e) => setTrimestre(e.target.value as Examen['trimestre'])}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] font-medium focus:outline-none focus:border-[#1a1a1a]"
                  >
                    <option value="Trimestre 1">Trimestre 1</option>
                    <option value="Trimestre 2">Trimestre 2</option>
                    <option value="Trimestre 3">Trimestre 3</option>
                    <option value="Semestre 1">Semestre 1</option>
                    <option value="Semestre 2">Semestre 2</option>
                    <option value="Annuel">Annuel</option>
                  </select>
                </div>
              </div>

              {/* Classes selection */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest">
                    Classes concernées
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAllClasses(!isAllClasses);
                      if (!isAllClasses) setSelectedClasses(allClasses);
                    }}
                    className="text-[10px] font-bold text-sky-800 hover:underline cursor-pointer"
                  >
                    {isAllClasses ? 'Sélectionner des classes spécifiques' : '✓ Concerne toutes les classes'}
                  </button>
                </div>

                {!isAllClasses && (
                  <div className="flex flex-wrap gap-1.5 p-3 border border-[#e0e0e0] rounded-xl max-h-32 overflow-y-auto bg-gray-50/50">
                    {allClasses.map((cls) => {
                      const isSelected = selectedClasses.includes(cls);
                      return (
                        <button
                          key={cls}
                          type="button"
                          onClick={() => toggleClassSelection(cls)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#1a1a1a] text-white shadow-2xs'
                              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {cls}
                        </button>
                      );
                    })}
                  </div>
                )}

                {isAllClasses && (
                  <div className="p-2.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <ShieldCheck size={15} /> Toutes les classes de l'établissement sont convoquées à cette épreuve.
                  </div>
                )}
              </div>

              {/* Dates & Horaires */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                    Date de début *
                  </label>
                  <input
                    type="date"
                    required
                    value={dateDebut}
                    onChange={(e) => setDateDebut(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                    Date de fin (Optionnel si 1 seul jour)
                  </label>
                  <input
                    type="date"
                    value={dateFin}
                    onChange={(e) => setDateFin(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                    Heure de début
                  </label>
                  <input
                    type="time"
                    value={heureDebut}
                    onChange={(e) => setHeureDebut(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                    Heure de fin
                  </label>
                  <input
                    type="time"
                    value={heureFin}
                    onChange={(e) => setHeureFin(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
                  />
                </div>
              </div>

              {/* Salle, Matière, Coefficient */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                    Salle / Bâtiment d'examen
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Salles habituelles, Bâtiment B..."
                    value={salle}
                    onChange={(e) => setSalle(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                    Coefficient
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="10"
                    value={coefficient}
                    onChange={(e) => setCoefficient(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
                  />
                </div>
              </div>

              {/* Consignes */}
              <div>
                <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                  Consignes & Matériel autorisé aux élèves
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Calculatrice non programmable autorisée. Carte d'identité scolaire obligatoire. Téléphones interdits."
                  value={consignes}
                  onChange={(e) => setConsignes(e.target.value)}
                  className="w-full px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
                />
              </div>

              {/* Publication Status */}
              <div className="flex items-center gap-3 p-3 bg-[#f5f5f5] rounded-xl border border-[#e0e0e0]">
                <input
                  type="checkbox"
                  id="publieCheck"
                  checked={publie}
                  onChange={(e) => setPublie(e.target.checked)}
                  className="w-4 h-4 rounded text-[#1a1a1a] focus:ring-[#1a1a1a] cursor-pointer"
                />
                <label htmlFor="publieCheck" className="text-xs font-semibold text-[#1a1a1a] cursor-pointer">
                  Publier immédiatement au calendrier pour consultation par les Professeurs et Parents
                </label>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 justify-end pt-3 border-t border-[#e0e0e0]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 border border-[#e0e0e0] rounded-xl text-xs font-bold text-[#1a1a1a] hover:bg-[#f5f5f5] transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#1a1a1a] hover:bg-black text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer shadow-sm"
                >
                  ✓ Enregistrer l'épreuve
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedExamDetails && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[32px] border border-[#e0e0e0] max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🗓️</span>
                <div>
                  <h3 className="font-sans font-bold text-base text-[#1a1a1a]">
                    {selectedExamDetails.titre}
                  </h3>
                  <span className="text-[10px] font-bold uppercase text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                    {EXAM_TYPES.find((t) => t.id === selectedExamDetails.type)?.label || selectedExamDetails.type}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedExamDetails(null)}
                className="p-1.5 text-[#9e9e9e] hover:text-[#1a1a1a] rounded-xl hover:bg-[#f5f5f5] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] block">Date Début</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {new Date(selectedExamDetails.dateDebut).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                </div>

                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] block">Horaires</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {selectedExamDetails.heureDebut || '08:00'} à {selectedExamDetails.heureFin || '12:00'}
                  </span>
                </div>

                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] block">Classes convoquées</span>
                  <span className="font-bold text-sky-800">
                    {selectedExamDetails.classes.includes('Toutes') ? 'Toutes les classes' : selectedExamDetails.classes.join(', ')}
                  </span>
                </div>

                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] block">Lieu / Salle</span>
                  <span className="font-bold text-[#1a1a1a]">{selectedExamDetails.salle || 'Salles de classe habituelles'}</span>
                </div>
              </div>

              {selectedExamDetails.consignes && (
                <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-950 space-y-1">
                  <div className="font-bold text-xs flex items-center gap-1.5 text-amber-900">
                    <Info size={14} /> Consignes d'examen & Matériel autorisé :
                  </div>
                  <p className="text-xs leading-relaxed">{selectedExamDetails.consignes}</p>
                </div>
              )}

              {selectedExamDetails.coefficient && (
                <div className="text-xs text-gray-600">
                  Coefficient de l'évaluation : <strong>x{selectedExamDetails.coefficient}</strong> ({selectedExamDetails.trimestre})
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-[#e0e0e0]">
              <button
                onClick={() => setSelectedExamDetails(null)}
                className="px-5 py-2.5 bg-[#1a1a1a] hover:bg-black text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
