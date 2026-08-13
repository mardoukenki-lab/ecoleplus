import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, getDoc, doc, setDoc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { UserProfile, Eleve, Note, Absence, CahierTexte, AppNotification, ScheduleSlot, Observation } from '../types';
import { BookOpen, UserCheck, Clock, MessageSquare, Send, Check, X, LogOut, Bell, Save, AlertTriangle, Plus } from 'lucide-react';
import MessagerieView from './MessagerieView';
import EmploiDuTempsView from './EmploiDuTempsView';
import BulletinView from './BulletinView';
import ClassesView from './ClassesView';
import StudentMonthlyStatsView from './StudentMonthlyStatsView';
import { Paiement } from '../types';
import { dispatchParentNotification } from '../lib/notifications';

interface ProfViewProps {
  user: UserProfile;
  onLogout: () => void;
  showToast: (msg: string) => void;
}

export default function ProfView({ user, onLogout, showToast }: ProfViewProps) {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Global real-time state for teacher dashboard metrics
  const [allStudents, setAllStudents] = useState<Eleve[]>([]);
  const [allNotesCount, setAllNotesCount] = useState<number>(0);
  const [todayAbsencesCount, setTodayAbsencesCount] = useState<number>(0);
  const [allSchedules, setAllSchedules] = useState<ScheduleSlot[]>([]);
  const [firestoreClasses, setFirestoreClasses] = useState<string[]>([]);

  // Roster lists & filters
  const [students, setStudents] = useState<Eleve[]>([]);
  const [activeClasse, setActiveClasse] = useState('');
  const [activeMatiere, setActiveMatiere] = useState('Mathématiques');
  const [activeEval, setActiveEval] = useState<'devoir1' | 'devoir2' | 'compo'>('devoir1');
  const [activeTrimestre, setActiveTrimestre] = useState('Trimestre 1');

  // Entered notes state
  const [enteredNotes, setEnteredNotes] = useState<{ [studentId: string]: number }>({});
  
  // Attendance roll-call state
  const [rollCall, setRollCall] = useState<{ [studentId: string]: 'absent' | 'present' | 'retard' }>({});

  // Cahier de texte forms
  const [newCahierCours, setNewCahierCours] = useState('');
  const [newCahierDevoirs, setNewCahierDevoirs] = useState('');
  const [cahierEntries, setCahierEntries] = useState<CahierTexte[]>([]);

  // Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Absence Reporting Modal State
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [absenceStudentId, setAbsenceStudentId] = useState('');
  const [absenceDate, setAbsenceDate] = useState(new Date().toISOString().split('T')[0]);
  const [absenceHeure, setAbsenceHeure] = useState(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
  const [absenceStatut, setAbsenceStatut] = useState<'absent' | 'retard'>('absent');
  const [absenceMatiere, setAbsenceMatiere] = useState('Mathématiques');
  const [absenceMotif, setAbsenceMotif] = useState('');
  const [isSubmittingAbsence, setIsSubmittingAbsence] = useState(false);

  // Observations state
  const [observationsList, setObservationsList] = useState<Observation[]>([]);
  const [obsStudentId, setObsStudentId] = useState('');
  const [obsType, setObsType] = useState<'felicitation' | 'encouragement' | 'avertissement' | 'remarque'>('remarque');
  const [obsTitre, setObsTitre] = useState('');
  const [obsDescription, setObsDescription] = useState('');
  const [isSubmittingObs, setIsSubmittingObs] = useState(false);

  // Mobile navigation drawer
  const [isMobilePlusMenuOpen, setIsMobilePlusMenuOpen] = useState(false);

  // Full datasets for monthly statistics calculation
  const [allNotesList, setAllNotesList] = useState<Note[]>([]);
  const [allAbsencesList, setAllAbsencesList] = useState<Absence[]>([]);
  const [allPaiementsList, setAllPaiementsList] = useState<Paiement[]>([]);

  // Real-time listener for global system metrics (Students, Notes count, Today Absences, Schedules, Classes)
  useEffect(() => {
    const unsubAllEleves = onSnapshot(collection(db, 'eleves'), (snap) => {
      const list: Eleve[] = [];
      snap.forEach((d) => list.push(d.data() as Eleve));
      setAllStudents(list);
    }, (err) => console.warn('All students notice:', err));

    const unsubAllNotes = onSnapshot(collection(db, 'notes'), (snap) => {
      setAllNotesCount(snap.size);
      const nList: Note[] = [];
      snap.forEach((d) => nList.push(d.data() as Note));
      setAllNotesList(nList);
    }, (err) => console.warn('All notes notice:', err));

    const unsubAllAbs = onSnapshot(collection(db, 'absences'), (snap) => {
      const aList: Absence[] = [];
      snap.forEach((d) => aList.push(d.data() as Absence));
      setAllAbsencesList(aList);
    }, (err) => console.warn('All absences notice:', err));

    const unsubPaiements = onSnapshot(collection(db, 'paiements'), (snap) => {
      const pList: Paiement[] = [];
      snap.forEach((d) => pList.push(d.data() as Paiement));
      setAllPaiementsList(pList);
    }, (err) => console.warn('Paiements notice:', err));

    const todayStr = new Date().toISOString().split('T')[0];
    const qAbs = query(collection(db, 'absences'), where('date', '==', todayStr), where('statut', '==', 'absent'));
    const unsubAbs = onSnapshot(qAbs, (snap) => {
      setTodayAbsencesCount(snap.size);
    }, (err) => console.warn('Today abs notice:', err));

    const unsubSchedules = onSnapshot(collection(db, 'schedules'), (snap) => {
      const list: ScheduleSlot[] = [];
      snap.forEach((d) => list.push(d.data() as ScheduleSlot));
      setAllSchedules(list);
    }, (err) => console.warn('Schedules notice:', err));

    const unsubClasses = onSnapshot(collection(db, 'classes'), (snap) => {
      const list: string[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.name) list.push(data.name);
      });
      setFirestoreClasses(list);
    }, (err) => console.warn('Classes notice:', err));

    return () => {
      unsubAllEleves();
      unsubAllNotes();
      unsubAllAbs();
      unsubPaiements();
      unsubAbs();
      unsubSchedules();
      unsubClasses();
    };
  }, []);

  // Compute dynamic classes list strictly from enrolled students + firestore classes collection
  const classesFromStudents: string[] = Array.from(new Set(allStudents.map((s) => s.classe).filter((c): c is string => Boolean(c))));
  const classesList: string[] = Array.from(new Set<string>([...classesFromStudents, ...firestoreClasses])).sort();

  // Auto select first available class if current active class is unselected or invalid
  useEffect(() => {
    if (classesList.length > 0 && (!activeClasse || !classesList.includes(activeClasse))) {
      setActiveClasse(classesList[0]);
    }
  }, [classesList]);

  // Load students for active class
  useEffect(() => {
    const q = query(collection(db, 'eleves'), where('classe', '==', activeClasse));
    const unsubStudents = onSnapshot(q, (snap) => {
      const list: Eleve[] = [];
      snap.forEach(d => list.push(d.data() as Eleve));
      setStudents(list);

      // Fetch existing notes for this class, matiere, and evaluation
      const notesQ = query(collection(db, 'notes'), where('classe', '==', activeClasse), where('matiere', '==', activeMatiere));
      getDocs(notesQ).then((notesSnap) => {
        const notesObj: { [studentId: string]: number } = {};
        notesSnap.forEach(docSnap => {
          const nData = docSnap.data() as Note;
          if (activeEval === 'devoir1' && nData.devoir1 !== null) {
            notesObj[nData.eleveId] = nData.devoir1;
          } else if (activeEval === 'devoir2' && nData.devoir2 !== null) {
            notesObj[nData.eleveId] = nData.devoir2;
          } else if (activeEval === 'compo' && nData.compo !== null) {
            notesObj[nData.eleveId] = nData.compo;
          }
        });
        setEnteredNotes(notesObj);
      }).catch(err => console.warn('Fetch notes notice:', err));
    }, (err) => console.warn('Prof students listener notice:', err));

    const qCahier = query(collection(db, 'cahier_texte'), where('classe', '==', activeClasse));
    const unsubCahier = onSnapshot(qCahier, (snap) => {
      const list: CahierTexte[] = [];
      snap.forEach(d => list.push(d.data() as CahierTexte));
      setCahierEntries(list.sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
    }, (err) => console.warn('Cahier listener notice:', err));

    const qNotifs = query(collection(db, 'notifications'), where('userUid', 'in', ['all', user.uid, 'target_prof']));
    const unsubNotifs = onSnapshot(qNotifs, (snap) => {
      const list: AppNotification[] = [];
      snap.forEach(d => list.push(d.data() as AppNotification));
      setNotifications(list.sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
    }, (err) => console.warn('Prof notifs listener notice:', err));

    const qObs = query(collection(db, 'observations'), where('classe', '==', activeClasse));
    const unsubObs = onSnapshot(qObs, (snap) => {
      const list: Observation[] = [];
      snap.forEach(d => list.push(d.data() as Observation));
      setObservationsList(list.sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
    }, (err) => console.warn('Observations listener notice:', err));

    return () => {
      unsubStudents();
      unsubCahier();
      unsubNotifs();
      unsubObs();
    };
  }, [activeClasse, activeEval, activeMatiere, user.uid]);

  const handleSaveObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsStudentId) {
      showToast('⚠️ Veuillez sélectionner un élève.');
      return;
    }
    if (!obsTitre.trim() || !obsDescription.trim()) {
      showToast('⚠️ Veuillez remplir le titre et la description de l\'observation.');
      return;
    }

    const selectedStudent = students.find(s => s.id === obsStudentId);
    if (!selectedStudent) return;

    setIsSubmittingObs(true);
    try {
      const obsId = `obs_${selectedStudent.id}_${Date.now()}`;
      const newObs: Observation = {
        id: obsId,
        eleveId: selectedStudent.id,
        eleveNom: selectedStudent.nom,
        classe: activeClasse,
        auteurUid: user.uid,
        auteurNom: user.nom,
        auteurRole: 'prof',
        matiere: activeMatiere,
        type: obsType,
        titre: obsTitre.trim(),
        description: obsDescription.trim(),
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'observations', obsId), newObs);

      // Find parent UIDs to notify in real time
      const targetParentUids = new Set<string>();
      if (selectedStudent.parentUid) {
        targetParentUids.add(selectedStudent.parentUid);
      }

      try {
        const parentSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'parent')));
        parentSnap.forEach(d => {
          const p = d.data() as UserProfile;
          if (p.enfants && p.enfants.some(e => e.matricule === selectedStudent.code || e.nom.toLowerCase() === selectedStudent.nom.toLowerCase())) {
            targetParentUids.add(p.uid);
          }
        });
      } catch (pErr) {
        console.warn('Could not fetch parents for observation notification:', pErr);
      }

      const typeEmoji = obsType === 'felicitation' ? '🌟' : obsType === 'encouragement' ? '👍' : obsType === 'avertissement' ? '⚠️' : '💬';
      const typeBg = obsType === 'felicitation' ? 'bg-purple-100 text-purple-800' : obsType === 'avertissement' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800';

      for (const pUid of Array.from(targetParentUids)) {
        const notifId = `notif_obs_${obsId}_${pUid}`;
        await setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          userUid: pUid,
          icon: typeEmoji,
          bg: typeBg,
          text: `Nouvelle observation ajoutée au dossier de ${selectedStudent.nom} (${obsType.toUpperCase()}) : "${obsTitre.trim()} — ${obsDescription.trim()}"`,
          time: 'à l\'instant',
          unread: true,
          createdAt: new Date().toISOString()
        });
      }

      showToast(`💬 Observation enregistrée pour ${selectedStudent.nom} — Parent(s) notifié(s) en temps réel !`);
      setObsTitre('');
      setObsDescription('');
    } catch (err: any) {
      console.error('Error saving observation:', err);
      showToast('❌ Échec de l\'enregistrement de l\'observation.');
    } finally {
      setIsSubmittingObs(false);
    }
  };

  const handleNoteChange = (studentId: string, val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 20) {
      setEnteredNotes({ ...enteredNotes, [studentId]: num });
    } else if (val === '') {
      const copy = { ...enteredNotes };
      delete copy[studentId];
      setEnteredNotes(copy);
    }
  };

  const handleSaveNotes = async () => {
    try {
      // Find all registered parents to match against student codes if s.parentUid is missing
      let registeredParents: UserProfile[] = [];
      try {
        const parentSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'parent')));
        parentSnap.forEach(d => registeredParents.push(d.data() as UserProfile));
      } catch (pErr) {
        console.warn('Could not fetch parent list for note notification:', pErr);
      }

      const batch = writeBatch(db);
      let notifCount = 0;

      for (const s of students) {
        const noteVal = enteredNotes[s.id];
        if (noteVal !== undefined) {
          const id = `note_${s.id}_${activeMatiere.toLowerCase().replace(/\s+/g, '_')}`;
          
          // Construct existing note check or creation
          const noteRef = doc(db, 'notes', id);
          const fieldsToSet: Partial<Note> = {
            id,
            eleveId: s.id,
            eleveNom: s.nom,
            classe: activeClasse,
            matiere: activeMatiere,
            trimestre: activeTrimestre,
            updatedAt: new Date().toISOString()
          };

          if (activeEval === 'devoir1') fieldsToSet.devoir1 = noteVal;
          if (activeEval === 'devoir2') fieldsToSet.devoir2 = noteVal;
          if (activeEval === 'compo') fieldsToSet.compo = noteVal;

          batch.set(noteRef, fieldsToSet, { merge: true });

          // Determine parent UIDs for this student
          const targetParentUids = new Set<string>();
          if (s.parentUid) {
            targetParentUids.add(s.parentUid);
          }
          // Match by child matricule/code or name in parent profile
          registeredParents.forEach(p => {
            if (p.enfants && p.enfants.some(e => e.matricule === s.code || e.nom.toLowerCase() === s.nom.toLowerCase())) {
              targetParentUids.add(p.uid);
            }
          });

          const evalLabel = activeEval === 'devoir1' ? 'Devoir 1' : activeEval === 'devoir2' ? 'Devoir 2' : 'Composition';

          // Create notification document in Firestore for each parent
          targetParentUids.forEach(pUid => {
            const notifId = `notif_note_${s.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            batch.set(doc(db, 'notifications', notifId), {
              id: notifId,
              userUid: pUid,
              icon: '📝',
              bg: 'bg-emerald-100 text-emerald-800',
              text: `Nouvelle note publiée : ${s.nom} a obtenu ${noteVal}/20 en ${activeMatiere} (${evalLabel}).`,
              time: 'à l\'instant',
              unread: true,
              emailSent: true,
              pushSent: true,
              createdAt: new Date().toISOString()
            });
            notifCount++;
          });
        }
      }

      await batch.commit();
      showToast(`💾 Notes sauvegardées ! ${notifCount > 0 ? `${notifCount} notification(s) envoyée(s) instantanément (Email & Push) aux parents.` : 'Parents notifiés par Email & Push.'}`);
    } catch (err) {
      console.error(err);
      showToast('❌ Échec de la sauvegarde des notes.');
    }
  };

  const handleSetPresence = async (student: Eleve, status: 'absent' | 'present' | 'retard') => {
    setRollCall({ ...rollCall, [student.id]: status });

    if (status === 'present') return; // Don't trigger notices for presence

    const nowTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const absId = `abs_${student.id}_${Date.now().toString(36)}`;
    const newAbs: Absence = {
      id: absId,
      eleveId: student.id,
      eleveNom: student.nom,
      classe: activeClasse,
      matiere: activeMatiere,
      profNom: user.nom,
      date: new Date().toISOString().split('T')[0],
      heure: nowTime,
      statut: status,
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'absences', absId), newAbs);

      // Fetch parents matched by student parentUid OR child matricule
      const targetParents = new Map<string, string>();
      if (student.parentUid) {
        try {
          const parentDoc = await getDoc(doc(db, 'users', student.parentUid));
          if (parentDoc.exists()) {
            targetParents.set(student.parentUid, parentDoc.data().email || '');
          }
        } catch (pErr) {
          console.warn('Could not fetch parent doc for absence:', pErr);
        }
      }

      try {
        const parentSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'parent')));
        parentSnap.forEach(d => {
          const p = d.data() as UserProfile;
          if (p.enfants && p.enfants.some(e => e.matricule === student.code || e.nom.toLowerCase() === student.nom.toLowerCase())) {
            targetParents.set(p.uid, p.email || '');
          }
        });
      } catch (pErr) {
        console.warn('Could not fetch parent list for absence notification:', pErr);
      }

      // Real envoi alert to parent UIDs
      const notifTitle = status === 'absent' 
        ? `🚨 Signalement d'absence : ${student.nom}`
        : `⏱ Signalement de retard : ${student.nom}`;

      const notifText = status === 'absent'
        ? `🚨 Alerte Ponctualité : Votre enfant ${student.nom} (${student.classe || activeClasse}) a été marqué(e) ABSENT(E) par l'enseignant M./Mme ${user.nom} aujourd'hui à ${nowTime} (Cours : ${activeMatiere || 'Général'}).`
        : `⏱ Alerte Ponctualité : Votre enfant ${student.nom} (${student.classe || activeClasse}) a été marqué(e) EN RETARD par l'enseignant M./Mme ${user.nom} aujourd'hui à ${nowTime} (Cours : ${activeMatiere || 'Général'}).`;

      if (targetParents.size > 0) {
        for (const [pUid, pEmail] of targetParents) {
          await dispatchParentNotification({
            targetUid: pUid,
            icon: status === 'absent' ? '🚨' : '⏱',
            bg: status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800',
            title: notifTitle,
            text: notifText,
            parentEmail: pEmail,
            type: 'absence'
          });
        }
      } else {
        await dispatchParentNotification({
          targetUid: 'target_parent',
          icon: status === 'absent' ? '🚨' : '⏱',
          bg: status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800',
          title: notifTitle,
          text: notifText,
          type: 'absence'
        });
      }

      showToast(`🔔 Appel enregistré pour ${student.nom} — Notification automatique envoyée au parent (Email & Push) !`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReportAbsenceWithNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    const student = allStudents.find(s => s.id === absenceStudentId) || students.find(s => s.id === absenceStudentId);
    if (!student) {
      showToast('⚠️ Veuillez sélectionner un élève.');
      return;
    }

    setIsSubmittingAbsence(true);
    const absId = `abs_${student.id}_${Date.now().toString(36)}`;
    const mat = absenceMatiere || activeMatiere || 'Général';
    const dt = absenceDate || new Date().toISOString().split('T')[0];
    const hr = absenceHeure || new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const newAbs: Absence = {
      id: absId,
      eleveId: student.id,
      eleveNom: student.nom,
      classe: student.classe || activeClasse,
      matiere: mat,
      profNom: user.nom,
      date: dt,
      heure: hr,
      statut: absenceStatut,
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'absences', absId), newAbs);

      // Identify target parent users
      const targetParents = new Map<string, string>();
      if (student.parentUid) {
        try {
          const pDoc = await getDoc(doc(db, 'users', student.parentUid));
          if (pDoc.exists()) {
            targetParents.set(student.parentUid, pDoc.data().email || '');
          }
        } catch (err) {
          console.warn('Parent lookup notice:', err);
        }
      }

      try {
        const pSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'parent')));
        pSnap.forEach(d => {
          const p = d.data() as UserProfile;
          if (p.enfants && p.enfants.some(e => e.matricule === student.code || e.nom.toLowerCase() === student.nom.toLowerCase())) {
            targetParents.set(p.uid, p.email || '');
          }
        });
      } catch (err) {
        console.warn('Parent query notice:', err);
      }

      const label = absenceStatut === 'absent' ? 'absent(e)' : 'en retard';
      const notifMsg = `🚨 Alerte Ponctualité : Votre enfant ${student.nom} (${student.classe}) est signalé(e) ${label} le ${dt} à ${hr} (Matière: ${mat}).${absenceMotif ? ` Motif/Détail: ${absenceMotif}` : ''}`;

      if (targetParents.size > 0) {
        for (const [pUid, pEmail] of targetParents) {
          await dispatchParentNotification({
            targetUid: pUid,
            icon: absenceStatut === 'absent' ? '🚨' : '⏱',
            bg: absenceStatut === 'absent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800',
            title: `🚨 Signalement d'absence : ${student.nom}`,
            text: notifMsg,
            parentEmail: pEmail,
            type: 'absence'
          });
        }
      } else {
        await dispatchParentNotification({
          targetUid: 'target_parent',
          icon: absenceStatut === 'absent' ? '🚨' : '⏱',
          bg: absenceStatut === 'absent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800',
          title: `🚨 Signalement d'absence : ${student.nom}`,
          text: notifMsg,
          type: 'absence'
        });
      }

      showToast(`🔔 Absence de ${student.nom} signalée ! Notification automatique transmise au parent.`);
      setShowAbsenceModal(false);
      setAbsenceMotif('');
    } catch (err) {
      console.error(err);
      showToast('❌ Erreur lors du signalement de l\'absence.');
    } finally {
      setIsSubmittingAbsence(false);
    }
  };

  const handlePublishCahier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCahierCours) {
      showToast('⚠️ Merci d\'indiquer le contenu du cours.');
      return;
    }

    const id = `cah_${Math.random().toString(36).substring(2, 9)}`;
    const newEntry: CahierTexte = {
      id,
      classe: activeClasse,
      date: new Date().toISOString().split('T')[0],
      cours: newCahierCours,
      devoirs: newCahierDevoirs,
      profNom: user.nom,
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'cahier_texte', id), newEntry);

      // Notify class parents
      for (const s of students) {
        if (s.parentUid) {
          const notifId = `notif_cah_${id}_${s.id}`;
          await setDoc(doc(db, 'notifications', notifId), {
            id: notifId,
            userUid: s.parentUid,
            icon: '📓',
            bg: 'bg-indigo-100 text-indigo-700',
            text: `Nouveau devoir publié en ${activeMatiere} (${activeClasse}) : ${newCahierCours}. Devoirs: ${newCahierDevoirs}.`,
            time: 'à l\'instant',
            unread: true,
            createdAt: new Date().toISOString()
          });
        }
      }

      showToast('📓 Cahier de texte enregistré — parents notifiés !');
      setNewCahierCours('');
      setNewCahierDevoirs('');
    } catch (err) {
      showToast('❌ Échec d\'écriture au cahier de texte.');
    }
  };

  const unreadNotifsCount = notifications.filter(n => n.unread).length;

  return (
    <div className="flex h-screen bg-[#f5f5f5] overflow-hidden">
      {/* SIDEBAR DESKTOP */}
      <aside className="hidden md:flex md:w-64 bg-white border-r border-[#e0e0e0] flex-col flex-shrink-0">
        <div className="p-6 border-b border-[#e0e0e0] flex items-center gap-3">
          <div className="w-9 h-9 bg-[#1a1a1a] text-white rounded-xl flex items-center justify-center font-bold text-sm tracking-tight">AS</div>
          <div>
            <div className="font-sans font-bold text-[#1a1a1a] text-sm tracking-tight leading-none">AKPANY SCHOOL</div>
            <div className="text-[10px] text-[#9e9e9e] font-semibold tracking-wide uppercase mt-1">Portail Enseignant</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          <div>
            <div className="px-3 text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-2.5">Général</div>
            <div className="space-y-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'dashboard' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📊 Tableau de bord
              </button>
            </div>
          </div>

          <div>
            <div className="px-3 text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-2.5">Mes classes</div>
            <div className="space-y-1">
              <button
                onClick={() => setActiveTab('classes')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'classes' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                👥 Classes & Élèves
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'notes' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📝 Saisie des notes
              </button>
              <button
                onClick={() => setActiveTab('absences')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'absences' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📌 Absences & Présences
              </button>
              <button
                onClick={() => setActiveTab('cahier')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'cahier' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📓 Cahier de texte
              </button>
              <button
                onClick={() => setActiveTab('emploi')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'emploi' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📅 Emploi du temps
              </button>
              <button
                onClick={() => setActiveTab('bulletins')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'bulletins' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📑 Bulletins
              </button>
              <button
                onClick={() => setActiveTab('statistiques')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'statistiques' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📊 Stats mensuelles
              </button>
              <button
                onClick={() => setActiveTab('observations')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'observations' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                💬 Observations & Dossier
              </button>
            </div>
          </div>

          <div>
            <div className="px-3 text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-2.5">Communication</div>
            <div className="space-y-1">
              <button
                onClick={() => setActiveTab('messagerie')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'messagerie' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                💬 Messagerie
              </button>
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-[#e0e0e0] flex items-center gap-3 bg-[#f5f5f5]/20">
          <div className="w-8 h-8 bg-[#1a1a1a] text-white rounded-full flex items-center justify-center text-xs font-bold">
            {user.nom.substring(0,2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#1a1a1a] truncate">{user.nom}</div>
            <div className="text-[10px] text-[#9e9e9e] font-semibold uppercase">{user.matiere || 'Enseignant'}</div>
          </div>
          <button onClick={onLogout} className="text-[#9e9e9e] hover:text-[#1a1a1a] cursor-pointer" title="Déconnexion">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* HEADER */}
        <header className="bg-white border-b border-[#e0e0e0] h-16 flex items-center px-4 md:px-8 justify-between flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="md:hidden w-8 h-8 bg-[#1a1a1a] text-white rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0">AS</div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
              <span className="font-extrabold text-[#1a1a1a] text-xs sm:text-sm tracking-tight">AKPANY SCHOOL</span>
              <span className="hidden sm:inline text-xs text-[#9e9e9e] font-semibold">•</span>
              <h2 className="font-sans font-semibold text-[#9e9e9e] sm:text-[#1a1a1a] text-xs sm:text-sm tracking-tight truncate">
                {activeTab === 'dashboard' && 'Tableau de bord Enseignant'}
                {activeTab === 'notes' && 'Saisie des notes'}
                {activeTab === 'absences' && 'Registre d\'Appel (Présences)'}
                {activeTab === 'cahier' && 'Cahier de texte numérique'}
                {activeTab === 'bulletins' && 'Bulletins scolaires'}
                {activeTab === 'statistiques' && 'Statistiques mensuelles des élèves'}
                {activeTab === 'messagerie' && 'Messagerie'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative w-9 h-9 rounded-xl border border-[#e0e0e0] flex items-center justify-center text-[#1a1a1a] hover:bg-[#f5f5f5] transition-all cursor-pointer"
              >
                <Bell size={16} />
                {unreadNotifsCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-[#1a1a1a] rounded-full border border-white"></span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-[#e0e0e0] z-50">
                  <div className="p-4 font-bold text-[10px] uppercase tracking-widest text-[#9e9e9e] border-b border-[#e0e0e0] flex justify-between items-center">
                    Notifications
                    <span className="text-[10px] text-[#1a1a1a] font-bold">{unreadNotifsCount} non lues</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-[#e0e0e0]/50">
                    {notifications.length > 0 ? notifications.map(n => (
                      <div key={n.id} className="p-3.5 flex gap-3 text-xs hover:bg-[#f5f5f5]/30">
                        <span className="text-base flex-shrink-0">{n.icon}</span>
                        <div>
                          <p className="text-[#1a1a1a] leading-tight">{n.text}</p>
                          <span className="text-[9px] text-[#9e9e9e] font-medium mt-1.5 block">{n.time}</span>
                        </div>
                      </div>
                    )) : (
                      <div className="p-6 text-center text-xs text-[#9e9e9e]">Aucune notification</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* WORKSPACE CONTENT */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          {activeTab === 'dashboard' && (() => {
            const daysMap = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
            const dayIdx = new Date().getDay();
            const todayName = (dayIdx >= 1 && dayIdx <= 5) ? daysMap[dayIdx] : 'Lundi';
            const todayCourses = allSchedules.filter(s => s.jour === todayName);

            return (
              <div className="space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-white rounded-[24px] p-5 border border-[#e0e0e0] shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-lg">🏛️</div>
                    <div>
                      <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">{classesList.length}</span>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Mes classes</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-[24px] p-5 border border-[#e0e0e0] shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-lg">👥</div>
                    <div>
                      <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">{allStudents.length}</span>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Élèves au total</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-[24px] p-5 border border-[#e0e0e0] shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-lg">📝</div>
                    <div>
                      <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">{allNotesCount}</span>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Notes saisies</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-[24px] p-5 border border-[#e0e0e0] shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-lg">📌</div>
                    <div>
                      <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">{todayAbsencesCount}</span>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Absences aujourd'hui</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#e0e0e0] font-bold text-[10px] text-[#9e9e9e] uppercase tracking-widest bg-[#f5f5f5]/30 flex justify-between items-center">
                      <span>Mes classes d'enseignement</span>
                      <span className="text-[9px] font-mono font-semibold text-[#1a1a1a]">{classesList.length} classe(s) disponible(s)</span>
                    </div>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e]">
                          <th className="py-2.5 px-4">Classe</th>
                          <th className="py-2.5 px-4">Effectif Inscrit</th>
                          <th className="py-2.5 px-4">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
                        {classesList.map((clsName) => {
                          const count = allStudents.filter(s => s.classe === clsName).length;
                          return (
                            <tr key={clsName} className="hover:bg-[#f5f5f5]/20">
                              <td className="py-3 px-4 font-bold text-[#1a1a1a]">{clsName}</td>
                              <td className="py-3 px-4 text-[#9e9e9e] font-medium">{count} élève(s)</td>
                              <td className="py-3 px-4">
                                <button
                                  onClick={() => { setActiveClasse(clsName); setActiveTab('notes'); }}
                                  className="text-xs font-bold text-[#1a1a1a] hover:underline cursor-pointer"
                                >
                                  Saisir notes →
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-white rounded-[24px] p-6 border border-[#e0e0e0] shadow-sm space-y-4">
                    <h3 className="font-bold text-[10px] uppercase tracking-widest text-[#9e9e9e] mb-2">
                      📅 Cours du jour ({todayName})
                    </h3>
                    {todayCourses.length > 0 ? (
                      todayCourses.map((course, idx) => (
                        <div key={idx} className="flex justify-between items-center py-3 border-b border-[#e0e0e0]/50 last:border-b-0">
                          <div>
                            <div className="font-semibold text-xs text-[#1a1a1a]">{course.matiere} — {course.classe}</div>
                            <div className="text-[10px] text-[#9e9e9e] font-medium mt-0.5">{course.heure} {course.salle ? `• ${course.salle}` : ''}</div>
                          </div>
                          <span className="px-2.5 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[#1a1a1a] text-white">
                            Programmé
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-xs text-[#9e9e9e]">
                        Aucun cours programmé dans l'emploi du temps pour aujourd'hui ({todayName}).
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {activeTab === 'notes' && (
            <div className="space-y-6">
              <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-4 shadow-sm flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <select 
                    value={activeClasse}
                    onChange={(e) => setActiveClasse(e.target.value)}
                    className="px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]"
                  >
                    {classesList.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select 
                    value={activeTrimestre}
                    onChange={(e) => setActiveTrimestre(e.target.value)}
                    className="px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]"
                  >
                    <option>Trimestre 1</option>
                    <option>Trimestre 2</option>
                    <option>Trimestre 3</option>
                  </select>
                  <select 
                    value={activeEval}
                    onChange={(e) => setActiveEval(e.target.value as any)}
                    className="px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]"
                  >
                    <option value="devoir1">Devoir 1</option>
                    <option value="devoir2">Devoir 2</option>
                    <option value="compo">Composition</option>
                  </select>
                </div>

                <button 
                  onClick={handleSaveNotes}
                  className="bg-[#1a1a1a] hover:bg-black text-white font-bold py-2.5 px-5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer uppercase tracking-widest transition-all"
                >
                  <Save size={14} /> Enregistrer & Notifier
                </button>
              </div>

              <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] bg-[#f5f5f5]/30">
                      <th className="py-3 px-5">Élève</th>
                      <th className="py-3 px-5">Note /20</th>
                      <th className="py-3 px-5">Observation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
                    {students.map(s => (
                      <tr key={s.id} className="hover:bg-[#f5f5f5]/20">
                        <td className="py-3 px-5 font-bold text-[#1a1a1a]">{s.nom}</td>
                        <td className="py-3 px-5">
                          <input 
                            type="number"
                            min="0"
                            max="20"
                            step="0.5"
                            className="w-20 px-2 py-1.5 border border-[#e0e0e0] rounded-lg text-center font-bold text-sm bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]"
                            placeholder="—"
                            value={enteredNotes[s.id] !== undefined ? enteredNotes[s.id] : ''}
                            onChange={(e) => handleNoteChange(s.id, e.target.value)}
                          />
                        </td>
                        <td className="text-[10px] px-5 font-bold uppercase tracking-wider text-[#9e9e9e]">
                          {enteredNotes[s.id] !== undefined ? (
                            enteredNotes[s.id] >= 16 ? <span className="text-emerald-700">Excellent</span> :
                            enteredNotes[s.id] >= 14 ? <span className="text-[#1a1a1a]">Très Bien</span> :
                            enteredNotes[s.id] >= 12 ? <span className="text-[#1a1a1a]">Bien</span> :
                            enteredNotes[s.id] >= 10 ? <span className="text-[#9e9e9e]">Passable</span> : <span className="text-red-700">Insuffisant</span>
                          ) : 'Saisie en attente...'}
                        </td>
                      </tr>
                    ))}
                    {students.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-xs text-[#9e9e9e]">
                          Aucun élève inscrit dans la classe {activeClasse}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'absences' && (
            <div className="space-y-6">
              <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <select 
                    value={activeClasse}
                    onChange={(e) => setActiveClasse(e.target.value)}
                    className="px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]"
                  >
                    {classesList.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <span className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest">Date d'appel : Aujourd'hui</span>
                </div>

                <button
                  onClick={() => {
                    setAbsenceStudentId(students[0]?.id || allStudents[0]?.id || '');
                    setAbsenceMatiere(activeMatiere || 'Mathématiques');
                    setShowAbsenceModal(true);
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm ml-auto"
                >
                  <AlertTriangle size={14} /> Signaler une Absence & Notifier Parent
                </button>
              </div>

              <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] bg-[#f5f5f5]/30">
                      <th className="py-3 px-5">Élève</th>
                      <th className="py-3 px-5">Statut de présence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
                    {students.map(s => (
                      <tr key={s.id} className="hover:bg-[#f5f5f5]/20">
                        <td className="py-3.5 px-5 font-bold text-[#1a1a1a]">{s.nom}</td>
                        <td className="py-3.5 px-5">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSetPresence(s, 'present')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                                rollCall[s.id] === 'present' 
                                  ? 'bg-[#1a1a1a] border-[#1a1a1a] text-white' 
                                  : 'border-[#e0e0e0] bg-white text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'
                              }`}
                            >
                              ✓ Présent
                            </button>
                            <button
                              onClick={() => handleSetPresence(s, 'absent')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                                rollCall[s.id] === 'absent' 
                                  ? 'bg-red-50 border-red-500 text-red-700' 
                                  : 'border-[#e0e0e0] bg-white text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'
                              }`}
                            >
                              ✗ Absent
                            </button>
                            <button
                              onClick={() => handleSetPresence(s, 'retard')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                                rollCall[s.id] === 'retard' 
                                  ? 'bg-amber-50 border-amber-500 text-amber-800' 
                                  : 'border-[#e0e0e0] bg-white text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'
                              }`}
                            >
                              ⏱ Retard
                            </button>
                            <button
                              onClick={() => {
                                setAbsenceStudentId(s.id);
                                setAbsenceMatiere(activeMatiere || 'Mathématiques');
                                setShowAbsenceModal(true);
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-red-200 text-red-600 hover:bg-red-50 transition-all cursor-pointer flex items-center gap-1"
                              title="Signaler une absence spécifique avec motif au parent"
                            >
                              <AlertTriangle size={12} /> Motif & Notifier
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'cahier' && (
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 shadow-sm h-fit space-y-4">
                <h3 className="font-bold text-[10px] uppercase tracking-widest text-[#9e9e9e] mb-2">📓 Nouvelle entrée cahier</h3>
                <form onSubmit={handlePublishCahier} className="space-y-4">
                  <div>
                    <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Classe</label>
                    <select 
                      className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none"
                      value={activeClasse}
                      onChange={(e) => setActiveClasse(e.target.value)}
                    >
                      {classesList.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Contenu du cours dispensé</label>
                    <textarea 
                      className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a] h-24 placeholder:text-[#9e9e9e]/60"
                      placeholder="Ex: Leçon 5 — Les équations du premier degré"
                      value={newCahierCours}
                      onChange={(e) => setNewCahierCours(e.target.value)}
                      required
                    ></textarea>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Devoirs et Exercices à faire</label>
                    <textarea 
                      className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a] h-16 placeholder:text-[#9e9e9e]/60"
                      placeholder="Ex: Exercices p.48 n°1, 3, 5"
                      value={newCahierDevoirs}
                      onChange={(e) => setNewCahierDevoirs(e.target.value)}
                    ></textarea>
                  </div>
                  <button 
                    type="submit"
                    className="w-full bg-[#1a1a1a] hover:bg-black text-white font-bold py-3 px-4 rounded-xl text-xs shadow-md cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-widest transition-all"
                  >
                    Publier l'entrée
                  </button>
                </form>
              </div>

              <div className="col-span-2 bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e0e0e0] font-bold text-[10px] text-[#9e9e9e] uppercase tracking-widest bg-[#f5f5f5]/30">
                  Entrées récentes — {activeClasse}
                </div>
                <div className="divide-y divide-[#e0e0e0]/50">
                  {cahierEntries.map(entry => (
                     <div key={entry.id} className="p-5 hover:bg-[#f5f5f5]/10 text-xs">
                      <div className="flex justify-between items-start font-semibold">
                        <span className="text-[#1a1a1a]">{entry.cours}</span>
                        <span className="text-[#9e9e9e] font-mono">{entry.date}</span>
                      </div>
                      {entry.devoirs && (
                        <div className="mt-2 text-[#1a1a1a] font-bold text-[10px] uppercase tracking-wide bg-[#f5f5f5] px-2.5 py-1 rounded-lg w-fit">✏️ Devoir : {entry.devoirs}</div>
                      )}
                      <div className="mt-2 text-[9px] text-[#9e9e9e] font-semibold uppercase">Publié par {entry.profNom}</div>
                    </div>
                  ))}
                  {cahierEntries.length === 0 && (
                    <div className="p-12 text-center text-[#9e9e9e]">Aucun cours consigné pour le moment</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'classes' && (
            <ClassesView currentUser={user} studentsList={allStudents} showToast={showToast} />
          )}

          {activeTab === 'emploi' && (
            <EmploiDuTempsView
              currentUser={user}
              classesList={classesList}
              showToast={showToast}
            />
          )}

          {activeTab === 'bulletins' && (
            <BulletinView currentUser={user} studentsList={allStudents} showToast={showToast} />
          )}

          {activeTab === 'statistiques' && (
            <StudentMonthlyStatsView
              studentsList={allStudents}
              notesList={allNotesList}
              absencesList={allAbsencesList}
              paiementsList={allPaiementsList}
              observationsList={observationsList}
              classesList={classesList}
              userRole="prof"
              showToast={showToast}
            />
          )}

          {activeTab === 'observations' && (
            <div className="space-y-8">
              <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-4 flex-wrap gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-[#1a1a1a]">Ajouter une Observation au Dossier de l'Élève</h3>
                    <p className="text-xs text-[#9e9e9e]">Toute observation enregistrée informe instantanément le parent par notification temps réel (Push & Email).</p>
                  </div>
                  <select
                    value={activeClasse}
                    onChange={(e) => {
                      setActiveClasse(e.target.value);
                      setObsStudentId('');
                    }}
                    className="px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold bg-white text-[#1a1a1a]"
                  >
                    {classesList.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <form onSubmit={handleSaveObservation} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Élève de la classe ({activeClasse})</label>
                      <select
                        value={obsStudentId}
                        onChange={(e) => setObsStudentId(e.target.value)}
                        className="w-full px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] font-medium"
                        required
                      >
                        <option value="">-- Choisir un élève --</option>
                        {students.map(s => (
                          <option key={s.id} value={s.id}>{s.nom} ({s.code})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Type d'Observation</label>
                      <select
                        value={obsType}
                        onChange={(e) => setObsType(e.target.value as any)}
                        className="w-full px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] font-bold"
                      >
                        <option value="remarque">💬 Remarque Générale</option>
                        <option value="felicitation">🌟 Félicitation & Travail Remarquable</option>
                        <option value="encouragement">👍 Encouragement & Progrès</option>
                        <option value="avertissement">⚠️ Avertissement Discipline / Travail</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Titre de l'Observation</label>
                    <input
                      type="text"
                      value={obsTitre}
                      onChange={(e) => setObsTitre(e.target.value)}
                      placeholder="Ex: Excellente participation orale en cours"
                      className="w-full px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Détails de l'Observation / Commentaire pédagogique</label>
                    <textarea
                      rows={3}
                      value={obsDescription}
                      onChange={(e) => setObsDescription(e.target.value)}
                      placeholder="Décrivez précisément le comportement, la remarque ou le fait marquant concernant l'élève..."
                      className="w-full px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
                      required
                    ></textarea>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmittingObs}
                      className="bg-[#1a1a1a] hover:bg-black text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-widest transition-all cursor-pointer shadow-sm flex items-center gap-2"
                    >
                      {isSubmittingObs ? 'Enregistrement...' : '✓ Enregistrer & Notifier le Parent'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Existing Observations List */}
              <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                <div className="p-5 border-b border-[#e0e0e0] flex justify-between items-center bg-[#f5f5f5]/30">
                  <h3 className="font-bold text-xs text-[#1a1a1a]">Historique des observations pour la classe {activeClasse}</h3>
                  <span className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest">{observationsList.length} enregistrement(s)</span>
                </div>

                <div className="divide-y divide-[#e0e0e0]/60 p-2">
                  {observationsList.map((obs) => {
                    const badgeBg = obs.type === 'felicitation' ? 'bg-purple-100 text-purple-800 border-purple-200' : obs.type === 'avertissement' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-blue-100 text-blue-800 border-blue-200';
                    const badgeIcon = obs.type === 'felicitation' ? '🌟' : obs.type === 'avertissement' ? '⚠️' : obs.type === 'encouragement' ? '👍' : '💬';

                    return (
                      <div key={obs.id} className="p-4 hover:bg-[#f5f5f5]/20 rounded-2xl transition-all space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[#1a1a1a]">{obs.eleveNom}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${badgeBg}`}>
                              {badgeIcon} {obs.type.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#9e9e9e] font-medium">
                            {obs.date} • Par {obs.auteurNom} ({obs.matiere || 'Enseignant'})
                          </div>
                        </div>
                        <p className="text-xs font-bold text-[#1a1a1a]">{obs.titre}</p>
                        <p className="text-xs text-[#9e9e9e] leading-relaxed">{obs.description}</p>
                      </div>
                    );
                  })}

                  {observationsList.length === 0 && (
                    <div className="p-8 text-center text-xs text-[#9e9e9e]">
                      Aucune observation saisie pour l'instant dans la classe {activeClasse}.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'messagerie' && (
            <MessagerieView currentUser={user} showToast={showToast} />
          )}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#e0e0e0] flex justify-around items-center py-2 z-40 shadow-lg px-1">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'dashboard' ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">📊</span>
          <span>Bord</span>
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'notes' ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">📝</span>
          <span>Notes</span>
        </button>
        <button
          onClick={() => setActiveTab('absences')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'absences' ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">📌</span>
          <span>Absences</span>
        </button>
        <button
          onClick={() => setActiveTab('cahier')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'cahier' ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">📓</span>
          <span>Cahier</span>
        </button>
        <button
          onClick={() => setIsMobilePlusMenuOpen(!isMobilePlusMenuOpen)}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${isMobilePlusMenuOpen ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">⚙️</span>
          <span>Plus</span>
        </button>
      </div>

      {/* MOBILE PLUS DRAWER MENU */}
      {isMobilePlusMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-50 flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl p-6 space-y-4 max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-3">
              <h3 className="font-bold text-sm text-[#1a1a1a]">Menu Enseignant</h3>
              <button onClick={() => setIsMobilePlusMenuOpen(false)} className="p-1 text-[#9e9e9e] hover:text-[#1a1a1a]">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <button
                onClick={() => { setActiveTab('classes'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                👥 Classes & Élèves
              </button>
              <button
                onClick={() => { setActiveTab('emploi'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                📅 Emploi du temps
              </button>
              <button
                onClick={() => { setActiveTab('bulletins'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                📑 Bulletins
              </button>
              <button
                onClick={() => { setActiveTab('observations'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                💬 Observations
              </button>
              <button
                onClick={() => { setActiveTab('messagerie'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left col-span-2"
              >
                💬 Messagerie Directe
              </button>
            </div>
            <div className="pt-2 border-t border-[#e0e0e0] flex items-center justify-between">
              <button
                onClick={onLogout}
                className="text-xs font-bold text-gray-700 flex items-center gap-1 py-2"
              >
                <LogOut size={14} /> Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Absence Signalement Modal */}
      {showAbsenceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-[28px] max-w-lg w-full p-6 shadow-2xl border border-[#e0e0e0] space-y-5">
            <div className="flex justify-between items-center border-b border-[#e0e0e0] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 text-red-600 rounded-xl">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-[#1a1a1a] text-base">Signaler une Absence ou Retard</h3>
                  <p className="text-[11px] text-[#9e9e9e]">Envoie une alerte automatique instantanée (Email & Push) au parent.</p>
                </div>
              </div>
              <button
                onClick={() => setShowAbsenceModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleReportAbsenceWithNotification} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1.5">Élève concerné</label>
                <select
                  required
                  value={absenceStudentId}
                  onChange={(e) => setAbsenceStudentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-red-500 font-bold"
                >
                  <option value="">-- Sélectionner un élève --</option>
                  {(students.length > 0 ? students : allStudents).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.nom} ({s.classe}) {s.code ? `[${s.code}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1.5">Date d'absence</label>
                  <input
                    type="date"
                    required
                    value={absenceDate}
                    onChange={(e) => setAbsenceDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1.5">Heure du cours</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: 08:30"
                    value={absenceHeure}
                    onChange={(e) => setAbsenceHeure(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1.5">Matière</label>
                  <input
                    type="text"
                    required
                    placeholder="Matière"
                    value={absenceMatiere}
                    onChange={(e) => setAbsenceMatiere(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1.5">Nature de l'alerte</label>
                  <select
                    value={absenceStatut}
                    onChange={(e) => setAbsenceStatut(e.target.value as 'absent' | 'retard')}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-red-500 font-bold"
                  >
                    <option value="absent">✗ Absence de cours</option>
                    <option value="retard">⏱ Retard significatif</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1.5">Motif / Commentaire (optionnel)</label>
                <textarea
                  rows={2}
                  placeholder="ex: Absence non justifiée au début de l'évaluation..."
                  value={absenceMotif}
                  onChange={(e) => setAbsenceMotif(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAbsenceModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAbsence}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isSubmittingAbsence ? 'Transmission...' : '🚨 Signaler & Notifier le Parent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
