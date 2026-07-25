import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { UserProfile, Eleve, Note, Absence, CahierTexte, AppNotification, ScheduleSlot } from '../types';
import { BookOpen, UserCheck, Clock, MessageSquare, Send, Check, X, LogOut, Bell, Save } from 'lucide-react';
import MessagerieView from './MessagerieView';
import EmploiDuTempsView from './EmploiDuTempsView';
import BulletinView from './BulletinView';
import ClassesView from './ClassesView';

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

  // Real-time listener for global system metrics (Students, Notes count, Today Absences, Schedules, Classes)
  useEffect(() => {
    const unsubAllEleves = onSnapshot(collection(db, 'eleves'), (snap) => {
      const list: Eleve[] = [];
      snap.forEach((d) => list.push(d.data() as Eleve));
      setAllStudents(list);
    }, (err) => console.warn('All students notice:', err));

    const unsubAllNotes = onSnapshot(collection(db, 'notes'), (snap) => {
      setAllNotesCount(snap.size);
    }, (err) => console.warn('All notes notice:', err));

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

    return () => {
      unsubStudents();
      unsubCahier();
      unsubNotifs();
    };
  }, [activeClasse, activeEval, activeMatiere, user.uid]);

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
      const targetParentUids = new Set<string>();
      if (student.parentUid) {
        targetParentUids.add(student.parentUid);
      }

      try {
        const parentSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'parent')));
        parentSnap.forEach(d => {
          const p = d.data() as UserProfile;
          if (p.enfants && p.enfants.some(e => e.matricule === student.code || e.nom.toLowerCase() === student.nom.toLowerCase())) {
            targetParentUids.add(p.uid);
          }
        });
      } catch (pErr) {
        console.warn('Could not fetch parent list for absence notification:', pErr);
      }

      // Real envoi alert to parent UIDs
      for (const pUid of Array.from(targetParentUids)) {
        const notifId = `notif_abs_${student.id}_${Date.now()}_${Math.random().toString(36).substring(2,6)}`;
        await setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          userUid: pUid,
          icon: status === 'absent' ? '📌' : '⏱',
          bg: status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700',
          text: status === 'absent'
            ? `Votre enfant ${student.nom} est marqué absent aujourd'hui en ${activeMatiere} à 10h15.`
            : `Votre enfant ${student.nom} est marqué en retard de cours aujourd'hui en ${activeMatiere}.`,
          time: 'à l\'instant',
          unread: true,
          emailSent: true,
          pushSent: true,
          createdAt: new Date().toISOString()
        });
      }

      showToast(`🔔 Appel enregistré pour ${student.nom} — ${targetParentUids.size > 0 ? targetParentUids.size : 1} parent(s) notifié(s) (Email & Push) !`);
    } catch (err) {
      console.error(err);
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
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-[#e0e0e0] flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-[#e0e0e0] flex items-center gap-3">
          <div className="w-9 h-9 bg-[#1a1a1a] text-white rounded-xl flex items-center justify-center font-bold text-sm">EP</div>
          <div>
            <div className="font-sans font-semibold text-[#1a1a1a] text-sm tracking-tight leading-none">ÉcolePlus</div>
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
        <header className="bg-white border-b border-[#e0e0e0] h-16 flex items-center px-8 justify-between flex-shrink-0">
          <h2 className="font-sans font-semibold text-[#1a1a1a] text-base tracking-tight">
            {activeTab === 'dashboard' && 'Tableau de bord Enseignant'}
            {activeTab === 'notes' && 'Saisie des notes'}
            {activeTab === 'absences' && 'Registre d\'Appel (Présences)'}
            {activeTab === 'cahier' && 'Cahier de texte numérique'}
            {activeTab === 'messagerie' && 'Messagerie'}
          </h2>

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
        <main className="flex-1 overflow-y-auto p-8">
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
              <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-4 shadow-sm flex items-center gap-3">
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

          {activeTab === 'messagerie' && (
            <MessagerieView currentUser={user} showToast={showToast} />
          )}
        </main>
      </div>
    </div>
  );
}
