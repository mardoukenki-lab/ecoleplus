import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { UserProfile, Eleve, Note, Absence, Paiement, AppNotification, Observation, Tranche } from '../types';
import { Award, Clock, FileText, CreditCard, Bell, LogOut, ChevronRight, Check, Mail, Smartphone, Volume2, ShieldCheck, Zap, MessageSquare, X, AlertTriangle, ArrowRight } from 'lucide-react';
import { playNotificationChime, requestPushPermission, triggerBrowserPushNotification, initServiceWorker, dispatchParentNotification, triggerEmailNotification } from '../lib/notifications';
import MessagerieView from './MessagerieView';
import BulletinView from './BulletinView';
import EmploiDuTempsView from './EmploiDuTempsView';
import StudentMonthlyStatsView from './StudentMonthlyStatsView';
import { calculateStudentMonthlyStat, printIndividualMonthlyReport, getCurrentYearMonth } from '../lib/studentMonthlyStats';
import { getTranchesForPaiement, getStudentTuitionStatus } from '../lib/tuitionUtils';
import MobileMoneyPaymentModal from './MobileMoneyPaymentModal';

interface ParentViewProps {
  user: UserProfile;
  onLogout: () => void;
  showToast: (msg: string) => void;
}

export default function ParentView({ user, onLogout, showToast }: ParentViewProps) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedKidIdx, setSelectedKidIdx] = useState(0);

  const [kidsList, setKidsList] = useState<Eleve[]>([]);
  const [selectedKid, setSelectedKid] = useState<Eleve | null>(null);
  const [pushStatus, setPushStatus] = useState<NotificationPermission>('default');

  // Firestore retrieved values
  const [notes, setNotes] = useState<Note[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [paiement, setPaiement] = useState<Paiement | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);

  // Mobile Money Payment Modal State
  const [isMobileMoneyModalOpen, setIsMobileMoneyModalOpen] = useState(false);
  const [selectedTrancheForPay, setSelectedTrancheForPay] = useState<Tranche | null>(null);

  // Mobile drawer state
  const [isMobilePlusMenuOpen, setIsMobilePlusMenuOpen] = useState(false);

  // Email notifications state
  const [emailNotifsEnabled, setEmailNotifsEnabled] = useState(true);
  const [selectedEmailSample, setSelectedEmailSample] = useState<{ title: string; subject: string; date: string; contentHtml: string } | null>(null);

  // Initialize Service Worker & check initial push notification permission status
  useEffect(() => {
    initServiceWorker();
    if ('Notification' in window) {
      setPushStatus(Notification.permission);
    }
  }, []);

  const handleEnablePush = async () => {
    const perm = await requestPushPermission(user.uid);
    setPushStatus(perm);
    if (perm === 'granted') {
      showToast('🎉 Web Push activé via Service Worker ! Alertes instantanées configurées pour cet appareil.');
      triggerBrowserPushNotification('Web Push Activé (Service Worker)', 'Vous recevrez désormais les alertes instantanées de notes, absences et frais en direct.', '🔔');
    } else {
      showToast('⚠️ Les notifications Web Push sont refusées sur votre navigateur.');
    }
  };

  // Refs to detect real-time snapshot updates after initial load
  const isInitialNotifs = React.useRef(true);
  const isInitialNotes = React.useRef(true);
  const isInitialObservations = React.useRef(true);

  // Load children based on codes
  useEffect(() => {
    if (!user.enfants || user.enfants.length === 0) return;

    const matricules = user.enfants.map(e => e.matricule);
    const qKids = query(collection(db, 'eleves'), where('code', 'in', matricules));
    
    const unsubKids = onSnapshot(qKids, (snap) => {
      const list: Eleve[] = [];
      snap.forEach(d => list.push(d.data() as Eleve));
      setKidsList(list);
      if (list.length > 0) {
        setSelectedKid(list[selectedKidIdx] || list[0]);
      }
    }, (err) => console.warn('Parent kids listener notice:', err));

    // Load parent alerts in real time
    const qNotifs = query(collection(db, 'notifications'), where('userUid', 'in', [user.uid, 'all', 'target_parent']));
    const unsubNotifs = onSnapshot(qNotifs, (snap) => {
      if (!isInitialNotifs.current) {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const newNotif = change.doc.data() as AppNotification;
            if (newNotif.unread) {
              triggerBrowserPushNotification('ALERTE TEMPS RÉEL AKPANY SCHOOL', newNotif.text, newNotif.icon || '🔔');
              showToast(`🔔 ALERTE TEMPS RÉEL (Email & Push envoyé) : ${newNotif.text}`);
            }
          }
        });
      } else {
        isInitialNotifs.current = false;
      }

      const list: AppNotification[] = [];
      snap.forEach(d => list.push(d.data() as AppNotification));
      setNotifications(list.sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
    }, (err) => console.warn('Parent notifs listener notice:', err));

    return () => {
      unsubKids();
      unsubNotifs();
    };
  }, [user.enfants, selectedKidIdx, user.uid]);

  // Load student records based on selected kid in real time
  useEffect(() => {
    if (!selectedKid) return;

    const unsubNotes = onSnapshot(query(collection(db, 'notes'), where('eleveId', '==', selectedKid.id)), (snap) => {
      if (!isInitialNotes.current) {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const noteData = change.doc.data() as Note;
            showToast(`📝 Note actualisée en temps réel pour ${selectedKid.nom} en ${noteData.matiere} !`);
          }
        });
      } else {
        isInitialNotes.current = false;
      }

      const list: Note[] = [];
      snap.forEach(d => list.push(d.data() as Note));
      setNotes(list);
    }, (err) => console.warn('Parent notes listener notice:', err));

    const unsubAbs = onSnapshot(query(collection(db, 'absences'), where('eleveId', '==', selectedKid.id)), (snap) => {
      const list: Absence[] = [];
      snap.forEach(d => list.push(d.data() as Absence));
      setAbsences(list.sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
    }, (err) => console.warn('Parent absences listener notice:', err));

    const unsubPaiement = onSnapshot(query(collection(db, 'paiements'), where('eleveId', '==', selectedKid.id)), (snap) => {
      if (!snap.empty) {
        setPaiement(snap.docs[0].data() as Paiement);
      } else {
        setPaiement(null);
      }
    }, (err) => console.warn('Parent paiement listener notice:', err));

    const unsubObs = onSnapshot(query(collection(db, 'observations'), where('eleveId', '==', selectedKid.id)), (snap) => {
      if (!isInitialObservations.current) {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const obsData = change.doc.data() as Observation;
            triggerBrowserPushNotification(
              `NOUVELLE OBSERVATION — ${selectedKid.nom}`,
              `[${obsData.type.toUpperCase()}] ${obsData.titre} : ${obsData.description}`,
              '💬'
            );
            showToast(`💬 NOUVELLE OBSERVATION (${obsData.type.toUpperCase()}) pour ${selectedKid.nom} : "${obsData.titre}"`);
          }
        });
      } else {
        isInitialObservations.current = false;
      }

      const list: Observation[] = [];
      snap.forEach(d => list.push(d.data() as Observation));
      setObservations(list.sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
    }, (err) => console.warn('Parent observations listener notice:', err));

    return () => {
      unsubNotes();
      unsubAbs();
      unsubPaiement();
      unsubObs();
    };
  }, [selectedKid]);

  const handleKidSwitch = (idx: number) => {
    setSelectedKidIdx(idx);
    if (kidsList[idx]) {
      setSelectedKid(kidsList[idx]);
    }
  };

  const handleMarkAsRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { unread: false });
    } catch (err) {
      console.error(err);
    }
  };

  // Computation helpers
  const calculateGeneralAvg = () => {
    if (notes.length === 0) return '—';
    let sumObj = 0;
    let count = 0;
    notes.forEach(n => {
      let divSum = 0;
      let divCount = 0;
      if (n.devoir1 !== null) { divSum += n.devoir1; divCount++; }
      if (n.devoir2 !== null) { divSum += n.devoir2; divCount++; }
      if (n.compo !== null) { divSum += n.compo; divCount++; }
      if (divCount > 0) {
        sumObj += (divSum / divCount);
        count++;
      }
    });
    return count > 0 ? (sumObj / count).toFixed(1) : '—';
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
            <div className="text-[10px] text-[#9e9e9e] font-semibold tracking-wide uppercase mt-1">Espace Parent</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          <div>
            <div className="px-3 text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-2.5">Suivi Scolaire</div>
            <div className="space-y-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'dashboard' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📊 Tableau de bord
              </button>
              <button
                onClick={() => setActiveTab('resultats')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'resultats' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                🎯 Notes & Résultats
              </button>
              <button
                onClick={() => setActiveTab('statistiques')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'statistiques' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📊 Stats mensuelles
              </button>
              <button
                onClick={() => setActiveTab('presence')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'presence' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📌 Présences & Absences
              </button>
              <button
                onClick={() => setActiveTab('emploi')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'emploi' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📅 Emploi du temps
              </button>
              <button
                onClick={() => setActiveTab('observations')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'observations' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                <span className="flex items-center gap-3">💬 Observations & Dossier</span>
                {observations.length > 0 && (
                  <span className="bg-[#f5f5f5] text-[#1a1a1a] border border-[#e0e0e0] text-[10px] px-2 py-0.5 rounded-full font-bold">{observations.length}</span>
                )}
              </button>
            </div>
          </div>

          <div>
            <div className="px-3 text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-2.5">Administratif</div>
            <div className="space-y-1">
              <button
                onClick={() => setActiveTab('paiements')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'paiements' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                💳 Paiements
              </button>
              <button
                onClick={() => setActiveTab('messagerie')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'messagerie' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                💬 Messagerie Directe
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'notifications' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                <span className="flex items-center gap-3">🔔 Toutes les alertes</span>
                {unreadNotifsCount > 0 && (
                  <span className="bg-[#1a1a1a] text-white border border-[#e0e0e0] text-[10px] px-2 py-0.5 rounded-full font-bold">{unreadNotifsCount}</span>
                )}
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
            <div className="text-[10px] text-[#9e9e9e] font-semibold uppercase">Tuteur</div>
          </div>
          <button onClick={onLogout} className="text-[#9e9e9e] hover:text-[#1a1a1a] cursor-pointer" title="Déconnexion">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* HEADER */}
        <header className="bg-white border-b border-[#e0e0e0] min-h-16 py-2 px-4 md:px-8 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="md:hidden w-8 h-8 bg-[#1a1a1a] text-white rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0">AS</div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
              <span className="font-extrabold text-[#1a1a1a] text-xs sm:text-sm tracking-tight flex-shrink-0">AKPANY SCHOOL</span>
              <span className="hidden sm:inline text-xs text-[#9e9e9e] font-semibold">•</span>
              <h2 className="font-sans font-semibold text-[#9e9e9e] sm:text-[#1a1a1a] text-xs sm:text-sm tracking-tight truncate">
                {activeTab === 'dashboard' && 'Suivi de l\'élève'}
                {activeTab === 'resultats' && 'Relevé de notes détaillé'}
                {activeTab === 'statistiques' && 'Statistiques mensuelles de l\'élève'}
                {activeTab === 'presence' && 'Registre de ponctualité'}
                {activeTab === 'emploi' && 'Grille horaire hebdomadaire'}
                {activeTab === 'observations' && 'Dossier & Observations'}
                {activeTab === 'paiements' && 'Frais scolaires & Comptabilité'}
                {activeTab === 'notifications' && 'Historique de notifications'}
              </h2>

              {/* Kids Switcher tabs inside header */}
              {user.enfants && user.enfants.length > 1 && (
                <div className="flex bg-[#f5f5f5] p-0.5 rounded-xl gap-1 border border-[#e0e0e0] flex-shrink-0">
                  {user.enfants.map((enf, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleKidSwitch(idx)}
                      className={`px-2 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-bold tracking-tight transition-all cursor-pointer ${
                        selectedKidIdx === idx ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#9e9e9e] hover:text-[#1a1a1a]'
                      }`}
                    >
                      {enf.nom}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('notifications')}
              className="relative w-8 h-8 md:w-9 md:h-9 rounded-xl border border-[#e0e0e0] flex items-center justify-center text-[#1a1a1a] hover:bg-[#f5f5f5] transition-all cursor-pointer"
            >
              <Bell size={16} />
              {unreadNotifsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#1a1a1a] text-white text-[9px] font-bold w-4 h-4 rounded-full border border-white flex items-center justify-center">
                  {unreadNotifsCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* WORKSPACE */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          {activeTab === 'messagerie' && (
            <MessagerieView currentUser={user} showToast={showToast} />
          )}

          {selectedKid ? (
            <>
              {/* Instant Notification Engine Status Banner */}
              <div className="bg-[#1a1a1a] text-white p-4 rounded-[24px] shadow-sm mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-lg flex-shrink-0">
                    ⚡
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Canal d'alertes instantanées Parent</span>
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Actif (Email + Push)
                      </span>
                    </div>
                    <p className="text-xs text-[#9e9e9e] mt-0.5">
                      Notifications instantanées envoyées à <strong>{user.email}</strong> & sur votre écran lors de chaque saisie de note, absence ou reçu.
                    </p>
                  </div>
                </div>

                {pushStatus !== 'granted' ? (
                  <button
                    onClick={handleEnablePush}
                    className="px-4 py-2 bg-white text-[#1a1a1a] hover:bg-[#f5f5f5] text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shadow-sm"
                  >
                    <Smartphone size={14} /> Activer Notif Push Navigateur
                  </button>
                ) : (
                  <div className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap">
                    <Check size={14} /> Push Navigateur Actif
                  </div>
                )}
              </div>

              {activeTab === 'dashboard' && (
                <div className="space-y-8">
                  {/* Real-Time Absence Notification Banner */}
                  {notifications.some(n => n.unread && (n.type === 'absence' || n.text.includes('absent') || n.text.includes('retard') || n.text.includes('absence') || n.icon === '📌' || n.icon === '⏱' || n.icon === '🚨')) && (
                    <div className="bg-red-950 text-white p-4 rounded-[20px] shadow-sm border border-red-800 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl p-2 bg-red-500/20 text-red-400 rounded-xl flex-shrink-0">🚨</span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold flex items-center gap-2 text-red-400">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block"></span>
                            Alerte Ponctualité / Absence Signalée
                          </div>
                          <p className="text-xs text-red-100 truncate mt-0.5">
                            {notifications.find(n => n.unread && (n.type === 'absence' || n.text.includes('absent') || n.text.includes('retard') || n.text.includes('absence') || n.icon === '📌' || n.icon === '⏱' || n.icon === '🚨'))?.text}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setActiveTab('presence');
                          notifications.filter(n => n.unread && (n.type === 'absence' || n.text.includes('absent') || n.text.includes('retard') || n.text.includes('absence') || n.icon === '📌' || n.icon === '⏱' || n.icon === '🚨')).forEach(n => handleMarkAsRead(n.id));
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer flex-shrink-0 shadow-sm"
                      >
                        Voir le registre →
                      </button>
                    </div>
                  )}

                  {/* Real-Time Grade Notification Banner */}
                  {notifications.some(n => n.unread && (n.icon === '📝' || n.text.includes('Nouvelle note'))) && (
                    <div className="bg-[#1a1a1a] text-white p-4 rounded-[20px] shadow-sm border border-[#333] flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl p-2 bg-emerald-500/20 text-emerald-400 rounded-xl flex-shrink-0">📝</span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold flex items-center gap-2 text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block"></span>
                            Notification Firestore en temps réel
                          </div>
                          <p className="text-xs text-neutral-300 truncate mt-0.5">
                            {notifications.find(n => n.unread && (n.icon === '📝' || n.text.includes('Nouvelle note')))?.text}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setActiveTab('resultats');
                          notifications.filter(n => n.unread && (n.icon === '📝' || n.text.includes('Nouvelle note'))).forEach(n => handleMarkAsRead(n.id));
                        }}
                        className="bg-white text-[#1a1a1a] font-bold px-3.5 py-2 rounded-xl text-xs hover:bg-neutral-200 transition-all cursor-pointer flex-shrink-0"
                      >
                        Voir les résultats →
                      </button>
                    </div>
                  )}

                  {/* Real-Time Observation Notification Banner */}
                  {notifications.some(n => n.unread && (n.text.includes('observation') || n.text.includes('Observation'))) && (
                    <div className="bg-[#1a1a1a] text-white p-4 rounded-[20px] shadow-sm border border-[#333] flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl p-2 bg-blue-500/20 text-blue-400 rounded-xl flex-shrink-0">💬</span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold flex items-center gap-2 text-blue-400">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping inline-block"></span>
                            Nouvelle Observation au dossier
                          </div>
                          <p className="text-xs text-neutral-300 truncate mt-0.5">
                            {notifications.find(n => n.unread && (n.text.includes('observation') || n.text.includes('Observation')))?.text}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setActiveTab('observations');
                          notifications.filter(n => n.unread && (n.text.includes('observation') || n.text.includes('Observation'))).forEach(n => handleMarkAsRead(n.id));
                        }}
                        className="bg-white text-[#1a1a1a] font-bold px-3.5 py-2 rounded-xl text-xs hover:bg-neutral-200 transition-all cursor-pointer flex-shrink-0"
                      >
                        Consulter le dossier →
                      </button>
                    </div>
                  )}

                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                    <div className="bg-white rounded-[24px] p-5 border border-[#e0e0e0] shadow-sm flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-lg">📈</div>
                      <div>
                        <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">{calculateGeneralAvg()}</span>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Moyenne générale</p>
                      </div>
                    </div>
                    <div className="bg-white rounded-[24px] p-5 border border-[#e0e0e0] shadow-sm flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-lg">📌</div>
                      <div>
                        <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">
                          {absences.filter(a => a.statut === 'absent').length}
                        </span>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Absences Trimestre</p>
                      </div>
                    </div>
                    <div className="bg-white rounded-[24px] p-5 border border-[#e0e0e0] shadow-sm flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-lg">📋</div>
                      <div>
                        <span className="text-lg font-bold font-sans text-[#1a1a1a] leading-none">Trim. 1</span>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Bulletin Actif</p>
                      </div>
                    </div>
                    <div className="bg-white rounded-[24px] p-5 border border-[#e0e0e0] shadow-sm flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-lg">💰</div>
                      <div>
                        <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">
                          {paiement ? paiement.solde.toLocaleString('fr-FR') : '0'} F
                        </span>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Frais restants</p>
                      </div>
                    </div>
                  </div>

                  {/* Monthly Statistical Summary Widget for selected kid */}
                  {selectedKid && (
                    <div className="bg-gradient-to-br from-amber-500/10 via-white to-amber-500/5 rounded-[24px] border border-amber-200 p-5 shadow-2xs space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-base">📊</span>
                          <div>
                            <h4 className="text-xs font-extrabold text-[#1a1a1a]">Résumé Statistique Mensuel</h4>
                            <p className="text-[10px] text-[#9e9e9e] font-semibold">
                              Bilan de {selectedKid.nom} — {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const currMonth = getCurrentYearMonth();
                              const stat = calculateStudentMonthlyStat(selectedKid, currMonth, notes, absences, paiement ? [paiement] : [], observations);
                              printIndividualMonthlyReport(stat);
                            }}
                            className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 shadow-sm"
                          >
                            <FileText size={13} /> Exporter PDF
                          </button>
                          <button
                            onClick={() => setActiveTab('statistiques')}
                            className="bg-[#1a1a1a] hover:bg-black text-white px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1"
                          >
                            Détails ➔
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 pt-1">
                        <div className="bg-white/80 p-3 rounded-xl border border-amber-200/60">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e]">Moyenne Mensuelle</span>
                          <div className="text-base font-black text-[#1a1a1a] mt-0.5">
                            {calculateGeneralAvg() !== 'N/A' ? `${calculateGeneralAvg()} / 20` : 'N/A'}
                          </div>
                        </div>

                        <div className="bg-white/80 p-3 rounded-xl border border-amber-200/60">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e]">Taux Présence</span>
                          <div className="text-base font-black text-emerald-700 mt-0.5">
                            {Math.max(0, 100 - absences.filter(a => a.statut === 'absent').length * 5)}%
                          </div>
                        </div>

                        <div className="bg-white/80 p-3 rounded-xl border border-amber-200/60">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e]">Frais Mensuels</span>
                          <div className="text-base font-black text-amber-800 mt-0.5">
                            {paiement && paiement.solde <= 0 ? 'À jour ✓' : `${paiement ? paiement.solde.toLocaleString('fr-FR') : 0} F`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Layout split */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Latest Marks Widget */}
                    <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 shadow-sm space-y-4">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-[10px] uppercase tracking-widest text-[#9e9e9e]">📝 Dernières notes obtenues</h3>
                        <button
                          onClick={() => setActiveTab('resultats')}
                          className="text-[10px] font-extrabold text-[#1a1a1a] hover:underline flex items-center gap-1 cursor-pointer uppercase tracking-wider"
                        >
                          <FileText size={12} /> Exporter Bulletin PDF ➔
                        </button>
                      </div>
                      <div className="divide-y divide-[#e0e0e0]/60">
                        {notes.slice(0, 5).map((n, i) => (
                          <div key={i} className="flex justify-between items-center py-3">
                            <div>
                              <div className="font-semibold text-xs text-[#1a1a1a]">{n.matiere}</div>
                              <div className="text-[10px] text-[#9e9e9e] font-medium">Trimestre 1</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {n.devoir1 !== null && (
                                <span className="bg-[#f5f5f5] text-[#1a1a1a] border border-[#e0e0e0] font-bold px-2 py-0.5 rounded-lg text-[10px]">
                                  D1: {n.devoir1}/20
                                </span>
                              )}
                              {n.devoir2 !== null && (
                                <span className="bg-[#f5f5f5] text-[#1a1a1a] border border-[#e0e0e0] font-bold px-2 py-0.5 rounded-lg text-[10px]">
                                  D2: {n.devoir2}/20
                                </span>
                              )}
                              {n.compo !== null && (
                                <span className="bg-[#1a1a1a] text-white font-bold px-2.5 py-0.5 rounded-lg text-[10px]">
                                  Compo: {n.compo}/20
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        {notes.length === 0 && (
                          <div className="py-8 text-center text-[#9e9e9e] text-xs">Aucune note enregistrée</div>
                        )}
                      </div>
                    </div>

                    {/* Recent Notifications Widget */}
                    <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 shadow-sm space-y-4">
                      <h3 className="font-bold text-[10px] uppercase tracking-widest text-[#9e9e9e] mb-2">🔔 Alertes & Flux de vie</h3>
                      <div className="divide-y divide-[#e0e0e0]/60">
                        {notifications.slice(0, 4).map((n, i) => (
                          <div key={i} className={`flex gap-3 py-3 items-start cursor-pointer hover:bg-[#f5f5f5]/20 px-2 rounded-xl transition-all ${n.unread ? 'font-semibold' : ''}`} onClick={() => handleMarkAsRead(n.id)}>
                            <span className="text-base flex-shrink-0">{n.icon}</span>
                            <div className="flex-1">
                              <p className="text-xs text-[#1a1a1a] leading-tight">{n.text}</p>
                              <span className="text-[9px] text-[#9e9e9e] font-medium tracking-tight mt-1 block">{n.time}</span>
                            </div>
                          </div>
                        ))}
                        {notifications.length === 0 && (
                          <div className="py-8 text-center text-[#9e9e9e] text-xs">Aucune alerte reçue</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'resultats' && (
                <BulletinView currentUser={user} studentsList={kidsList} showToast={showToast} />
              )}

              {activeTab === 'statistiques' && (
                <StudentMonthlyStatsView
                  studentsList={kidsList}
                  notesList={notes}
                  absencesList={absences}
                  paiementsList={paiement ? [paiement] : []}
                  observationsList={observations}
                  classesList={Array.from(new Set(kidsList.map(k => k.classe).filter(Boolean)))}
                  userRole="parent"
                  showToast={showToast}
                />
              )}

              {activeTab === 'presence' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-5 border border-[#e0e0e0] rounded-[20px] shadow-sm flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center text-lg font-bold">✕</div>
                      <div>
                        <span className="text-lg font-bold text-[#1a1a1a]">{absences.filter(a => a.statut === 'absent').length}</span>
                        <p className="text-[10px] text-[#9e9e9e] font-bold uppercase tracking-widest mt-0.5">Absences cumulées</p>
                      </div>
                    </div>
                    <div className="bg-white p-5 border border-[#e0e0e0] rounded-[20px] shadow-sm flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-lg font-bold">⏱</div>
                      <div>
                        <span className="text-lg font-bold text-[#1a1a1a]">{absences.filter(a => a.statut === 'retard').length}</span>
                        <p className="text-[10px] text-[#9e9e9e] font-bold uppercase tracking-widest mt-0.5">Retards consignés</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] bg-[#f5f5f5]/30">
                          <th className="py-3 px-5">Date</th>
                          <th className="py-3 px-5">Cours / Matière</th>
                          <th className="py-3 px-5">Professeur</th>
                          <th className="py-3 px-5">État ponctualité</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
                        {absences.map((abs, idx) => (
                          <tr key={idx} className="hover:bg-[#f5f5f5]/20">
                            <td className="py-3.5 px-5 font-medium text-[#9e9e9e]">{abs.date} à {abs.heure}</td>
                            <td className="py-3.5 px-5 font-semibold text-[#1a1a1a]">{abs.matiere}</td>
                            <td className="py-3.5 px-5 text-[#9e9e9e] font-medium">{abs.profNom}</td>
                            <td className="py-3.5 px-5">
                              <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider ${
                                abs.statut === 'absent' ? 'bg-red-50 text-red-700 border border-red-100' :
                                abs.statut === 'retard' ? 'bg-amber-50 text-amber-800 border border-amber-100' :
                                'bg-[#f5f5f5] text-[#1a1a1a] border border-[#e0e0e0]'
                              }`}>
                                {abs.statut}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {absences.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-10 text-center text-[#9e9e9e] font-medium">Aucun signalement d'absence ou de retard. Félicitations !</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'emploi' && (
                <EmploiDuTempsView
                  currentUser={user}
                  classesList={Array.from(new Set([selectedKid.classe, '6e A', '6e B', '5e A', '5e B', '4e C', '3e A']))}
                  showToast={showToast}
                />
              )}

              {activeTab === 'paiements' && (
                <div className="space-y-6">
                  {paiement ? (
                    <>
                      {/* Financial Status Header & Quick Mobile Money Action */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 space-y-4 shadow-sm h-fit">
                          <div className="flex justify-between items-center">
                            <h4 className="font-bold text-[10px] uppercase tracking-widest text-[#9e9e9e]">Aperçu financier</h4>
                            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-sky-100 text-sky-800">
                              {paiement.solde <= 0 ? '✓ Soldé' : 'En cours'}
                            </span>
                          </div>

                          <div className="text-xs text-[#9e9e9e] font-medium">Scolarité annuelle totale : <strong className="text-[#1a1a1a] font-semibold">{paiement.total.toLocaleString('fr-FR')} FCFA</strong></div>
                          
                          <div className="flex justify-between items-center text-xs border-b border-[#e0e0e0]/60 pb-2">
                            <span className="text-[#9e9e9e] font-semibold">Payé :</span>
                            <span className="font-bold text-emerald-600">{paiement.paye.toLocaleString('fr-FR')} FCFA</span>
                          </div>

                          <div className="flex justify-between items-center text-xs border-b border-[#e0e0e0]/60 pb-2">
                            <span className="text-[#9e9e9e] font-semibold">Solde restant :</span>
                            <span className={`font-extrabold ${paiement.solde > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                              {paiement.solde.toLocaleString('fr-FR')} FCFA
                            </span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold text-[#9e9e9e]">
                              <span>Progression du règlement</span>
                              <span>{Math.round((paiement.paye / (paiement.total || 1)) * 100)}%</span>
                            </div>
                            <div className="h-2.5 bg-[#f5f5f5] rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-emerald-600 transition-all duration-500" 
                                style={{ width: `${Math.min(100, (paiement.paye / (paiement.total || 1)) * 100)}%` }}
                              ></div>
                            </div>
                          </div>

                          {paiement.solde > 0 && (
                            <button
                              onClick={() => {
                                setSelectedTrancheForPay(null);
                                setIsMobileMoneyModalOpen(true);
                              }}
                              className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                            >
                              <Smartphone size={16} /> Payer par Mobile Money (Wave, Orange, MTN)
                            </button>
                          )}
                        </div>

                        {/* Detailed Tranches Breakdown Card */}
                        <div className="col-span-1 md:col-span-2 bg-white rounded-[24px] border border-[#e0e0e0] p-6 shadow-sm space-y-4">
                          <div className="flex justify-between items-center border-b border-[#e0e0e0] pb-3">
                            <div>
                              <h3 className="font-bold text-sm text-[#1a1a1a]">Échéancier de Scolarité par Tranches</h3>
                              <p className="text-[11px] text-[#9e9e9e]">Détail des échéances, dates limites et paiements mobile money.</p>
                            </div>
                            <span className="text-xs font-mono font-bold text-[#1a1a1a] bg-gray-100 px-3 py-1 rounded-lg">
                              3 Tranches
                            </span>
                          </div>

                          <div className="space-y-3">
                            {getTranchesForPaiement(paiement).map((t, idx) => {
                              const isUnpaid = t.statut !== 'paye';
                              const isOverdue = t.statut === 'en_retard';

                              return (
                                <div
                                  key={t.id || idx}
                                  className={`p-4 rounded-2xl border transition-all ${
                                    isOverdue
                                      ? 'bg-red-50/50 border-red-200'
                                      : t.statut === 'paye'
                                      ? 'bg-emerald-50/30 border-emerald-200'
                                      : 'bg-gray-50/70 border-gray-200'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="space-y-1 min-w-[180px]">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-xs text-[#1a1a1a]">{t.nom}</span>
                                        {t.statut === 'paye' && (
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                            ✓ Payé
                                          </span>
                                        )}
                                        {isOverdue && (
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 flex items-center gap-1">
                                            🚨 En retard
                                          </span>
                                        )}
                                        {t.statut === 'en_attente' && (
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 flex items-center gap-1">
                                            ⏱ En attente
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-[#9e9e9e] font-medium flex items-center gap-3">
                                        <span>Échéance : <strong>{t.echeanceLabel || t.echeance}</strong></span>
                                        {t.payeLe && <span>· Réglé le : {t.payeLe}</span>}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-4 ml-auto">
                                      <div className="text-right">
                                        <div className="text-xs font-extrabold text-[#1a1a1a]">
                                          {t.montant.toLocaleString('fr-FR')} FCFA
                                        </div>
                                        <div className="text-[10px] font-semibold text-gray-500">
                                          {t.montantPaye >= t.montant
                                            ? 'Intégralement réglé'
                                            : `Acompte : ${t.montantPaye.toLocaleString('fr-FR')} F (Reste: ${(t.montant - t.montantPaye).toLocaleString('fr-FR')} F)`}
                                        </div>
                                      </div>

                                      {isUnpaid && (
                                        <button
                                          onClick={() => {
                                            setSelectedTrancheForPay(t);
                                            setIsMobileMoneyModalOpen(true);
                                          }}
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl text-[11px] transition-all flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                                        >
                                          <Smartphone size={14} /> Payer
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Receipt History */}
                      <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-[#e0e0e0] font-bold text-[10px] text-[#9e9e9e] uppercase tracking-widest bg-[#f5f5f5]/30 flex justify-between items-center">
                          <span>Historique des reçus & transactions</span>
                          <span className="text-[10px] text-[#1a1a1a] font-mono">{paiement.historique?.length || 0} versement(s)</span>
                        </div>
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e]">
                              <th className="py-3 px-4">Date</th>
                              <th className="py-3 px-4">Objet / Tranche</th>
                              <th className="py-3 px-4">Montant Versé</th>
                              <th className="py-3 px-4">Mode / Opérateur</th>
                              <th className="py-3 px-4">N° Reçu / Réf.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
                            {paiement.historique?.map((h, i) => (
                              <tr key={i} className="hover:bg-[#f5f5f5]/10">
                                <td className="py-3 px-4 text-[#9e9e9e] font-medium">{h.date}</td>
                                <td className="py-3 px-4 text-[#1a1a1a] font-bold">{h.trancheNom || 'Scolarité'}</td>
                                <td className="py-3 px-4 font-extrabold text-emerald-700">{h.montant.toLocaleString('fr-FR')} FCFA</td>
                                <td className="py-3 px-4 text-[#9e9e9e] font-semibold">{h.mode}</td>
                                <td className="py-3 px-4 font-mono text-[11px] text-sky-800 font-bold">
                                  {h.recuNo || h.transactionRef || `REC-${i + 1}`}
                                </td>
                              </tr>
                            ))}
                            {(!paiement.historique || paiement.historique.length === 0) && (
                              <tr>
                                <td colSpan={5} className="py-8 text-center text-[#9e9e9e]">Aucun paiement effectué pour le moment</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="bg-white p-8 rounded-[24px] text-center text-[#9e9e9e] border border-dashed border-[#e0e0e0]">
                      Aucune donnée financière disponible pour {selectedKid.nom}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'observations' && (
                <div className="space-y-6">
                  <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 shadow-sm space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-lg">💬</div>
                      <div>
                        <h3 className="font-bold text-sm text-[#1a1a1a]">Observations & Remarques Pédagogiques</h3>
                        <p className="text-xs text-[#9e9e9e]">Toutes les appréciations, félicitations, encouragements et avertissements ajoutés au dossier de <strong>{selectedKid.nom}</strong> ({selectedKid.classe}).</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-[#e0e0e0] flex justify-between items-center bg-[#f5f5f5]/30">
                      <span className="font-bold text-xs text-[#1a1a1a]">Dossier disciplinaire et suivi pédagogique</span>
                      <span className="text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest">{observations.length} observation(s)</span>
                    </div>

                    <div className="divide-y divide-[#e0e0e0]/60 p-4 space-y-4">
                      {observations.map((obs) => {
                        const badgeBg = obs.type === 'felicitation' ? 'bg-purple-100 text-purple-800 border-purple-200' : obs.type === 'avertissement' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-blue-100 text-blue-800 border-blue-200';
                        const badgeIcon = obs.type === 'felicitation' ? '🌟' : obs.type === 'avertissement' ? '⚠️' : obs.type === 'encouragement' ? '👍' : '💬';

                        return (
                          <div key={obs.id} className="p-5 bg-[#f5f5f5]/30 border border-[#e0e0e0] rounded-2xl space-y-2.5">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-xl border ${badgeBg}`}>
                                {badgeIcon} {obs.type.toUpperCase()}
                              </span>
                              <span className="text-[10px] text-[#9e9e9e] font-medium">
                                Publié le {obs.date} • Par {obs.auteurNom} ({obs.matiere || 'Enseignant/Direction'})
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-[#1a1a1a]">{obs.titre}</h4>
                            <p className="text-xs text-[#9e9e9e] leading-relaxed bg-white p-3.5 rounded-xl border border-[#e0e0e0]">
                              {obs.description}
                            </p>
                          </div>
                        );
                      })}

                      {observations.length === 0 && (
                        <div className="py-12 text-center text-xs text-[#9e9e9e]">
                          Aucune observation particulière enregistrée dans le dossier de {selectedKid.nom} pour le moment.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="space-y-6">
                  {/* EMAIL NOTIFICATIONS CARD */}
                  <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 shadow-sm space-y-4">
                    <div className="flex flex-wrap justify-between items-center gap-4 border-b border-[#e0e0e0]/60 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-xs text-[#1a1a1a] uppercase tracking-wider flex items-center gap-1.5">
                            <Mail size={14} className="text-[#1a1a1a]" /> Notifications Automatiques par Email (SMTP / Cloud Mail)
                          </h3>
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                            emailNotifsEnabled
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}>
                            {emailNotifsEnabled ? '● Emails Activés' : '✕ Emails Désactivés'}
                          </span>
                        </div>
                        <p className="text-xs text-[#9e9e9e] mt-1 font-medium">
                          Transmises à l'adresse officielle : <strong className="text-[#1a1a1a]">{user.email || 'parent@akpanyschool.store'}</strong> (Absences, Bulletins, Observations, Frais)
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEmailNotifsEnabled(!emailNotifsEnabled);
                            showToast(
                              !emailNotifsEnabled
                                ? '📧 Notifications Email activées pour votre adresse !'
                                : '⚠️ Notifications Email suspendues.'
                            );
                          }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            emailNotifsEnabled
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-[#f5f5f5] text-[#1a1a1a] border border-[#e0e0e0]'
                          }`}
                        >
                          {emailNotifsEnabled ? '✓ Notification Email Actives' : 'Activer les e-mails'}
                        </button>
                        <button
                          onClick={async () => {
                            const recipient = user.email || 'parent@akpanyschool.store';
                            showToast(`📧 Déclenchement de l'envoi de l'e-mail test à ${recipient}...`);
                            
                            await dispatchParentNotification({
                              targetUid: user.uid,
                              icon: '📧',
                              bg: 'bg-emerald-500',
                              title: 'Test de Notification E-mail Trigger',
                              text: `Alerte e-mail déclenchée avec succès pour ${user.nom} (${recipient}).`,
                              parentEmail: recipient,
                              type: 'info'
                            });

                            showToast(`✅ E-mail de notification déclenché et envoyé à ${recipient} !`);
                          }}
                          className="bg-black hover:bg-neutral-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Zap size={14} className="text-yellow-400" /> Déclencher E-mail Test
                        </button>
                        <button
                          onClick={() => {
                            setSelectedEmailSample({
                              title: `Notification Scolaire — ${selectedKid?.nom || 'Élève'}`,
                              subject: `[AKPANY SCHOOL] Alerte officielle concernant ${selectedKid?.nom || 'votre enfant'}`,
                              date: new Date().toLocaleString('fr-FR'),
                              contentHtml: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 16px; overflow: hidden; background: #ffffff;">
                                  <div style="background: #1a1a1a; color: #ffffff; padding: 24px; text-align: center;">
                                    <h2 style="margin: 0; font-size: 20px; font-weight: 700;">🏫 AKPANY SCHOOL — Côte d'Ivoire</h2>
                                    <p style="margin: 4px 0 0 0; font-size: 12px; color: #9e9e9e;">Notification Officielle à l'Attention du Parent</p>
                                  </div>
                                  <div style="padding: 24px; color: #1a1a1a; line-height: 1.6; font-size: 14px;">
                                    <p style="margin-top: 0;">Bonjour M./Mme <strong>${user.nom}</strong>,</p>
                                    <p>Nous vous informons qu'une nouvelle mise à jour a été enregistrée dans le dossier scolaire de votre enfant <strong>${selectedKid?.nom || 'votre enfant'}</strong> (${selectedKid?.classe || 'Classe'}).</p>
                                    <div style="background: #f8f9fa; border-left: 4px solid #1a1a1a; padding: 16px; border-radius: 8px; margin: 20px 0;">
                                      <strong style="display: block; margin-bottom: 6px; text-transform: uppercase; font-size: 11px; color: #6c757d;">RÉSUMÉ DE L'ALERTE :</strong>
                                      <p style="margin: 0; font-weight: 600;">Saisie d'une observation par l'équipe pédagogique & mise à jour du carnet de suivi.</p>
                                    </div>
                                    <p style="font-size: 12px; color: #6c757d;">Vous pouvez consulter le relevé complet et échanger directement avec l'établissement depuis votre espace parent AKPANY SCHOOL sur <a href="https://demo.akpanyschool.store/" style="color: #1a1a1a; font-weight: bold;">demo.akpanyschool.store</a>.</p>
                                    <div style="text-align: center; margin-top: 28px;">
                                      <a href="https://demo.akpanyschool.store/" target="_blank" rel="noopener noreferrer" style="background: #1a1a1a; color: #ffffff; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 13px; display: inline-block;">Accéder à mon Espace Parent</a>
                                    </div>
                                  </div>
                                  <div style="background: #f5f5f5; padding: 16px; text-align: center; font-size: 11px; color: #9e9e9e; border-top: 1px solid #e0e0e0;">
                                    Ce courriel automatique a été envoyé à <strong>${user.email || 'parent@akpanyschool.store'}</strong>.<br/>© 2026 AKPANY SCHOOL — <a href="https://demo.akpanyschool.store/" style="color: #666; text-decoration: underline;">https://demo.akpanyschool.store/</a>
                                  </div>
                                </div>
                              `
                            });
                            showToast('📧 Génération d\'un aperçu de l\'e-mail de notification !');
                          }}
                          className="border border-[#e0e0e0] hover:bg-[#f5f5f5] text-[#1a1a1a] px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Mail size={14} /> Aperçu E-mail Reçu
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px] text-[#9e9e9e] font-medium">
                      <div className="flex items-center gap-2 bg-[#f5f5f5]/50 p-2.5 rounded-xl border border-[#e0e0e0]/50">
                        <span className="text-base">📧</span>
                        <span><strong>Récapitulatif de Notes :</strong> Copie e-mail envoyée lors de chaque saisie de devoir ou compo.</span>
                      </div>
                      <div className="flex items-center gap-2 bg-[#f5f5f5]/50 p-2.5 rounded-xl border border-[#e0e0e0]/50">
                        <span className="text-base">📌</span>
                        <span><strong>Signalement d'Absence :</strong> Notification e-mail immédiate avec motif lors de l'appel.</span>
                      </div>
                      <div className="flex items-center gap-2 bg-[#f5f5f5]/50 p-2.5 rounded-xl border border-[#e0e0e0]/50">
                        <span className="text-base">💳</span>
                        <span><strong>Reçus de Paiement :</strong> Reçu électronique au format PDF joint par courriel dès encaissement.</span>
                      </div>
                    </div>
                  </div>

                  {/* Web Push API & Service Worker Status Card */}
                  <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 shadow-sm space-y-4">
                    <div className="flex flex-wrap justify-between items-center gap-4 border-b border-[#e0e0e0]/60 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-xs text-[#1a1a1a] uppercase tracking-wider flex items-center gap-1.5">
                            <Zap size={14} className="text-[#1a1a1a]" /> Système de Notifications Web Push API (Service Worker v2.0)
                          </h3>
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                            pushStatus === 'granted'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : pushStatus === 'denied'
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}>
                            {pushStatus === 'granted' ? '● Web Push Activé' : pushStatus === 'denied' ? '✕ Push Bloqué' : '⚠️ En attente d\'autorisation'}
                          </span>
                        </div>
                        <p className="text-xs text-[#9e9e9e] mt-1 font-medium">
                          Alertes instantanées transmises par le navigateur avec signal sonore, vibration et bannières même en arrière-plan.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {pushStatus !== 'granted' && (
                          <button
                            onClick={handleEnablePush}
                            className="bg-[#1a1a1a] hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                          >
                            <ShieldCheck size={14} /> Activer Web Push
                          </button>
                        )}
                        <button
                          onClick={() => {
                            triggerBrowserPushNotification(
                              'Alerte Critique AKPANY SCHOOL (Test)',
                              `Test d'envoi d'alerte en direct via Service Worker pour ${user.nom}. Tout fonctionne !`,
                              '⚡'
                            );
                            showToast('⚡ Alerte Web Push de test envoyée au navigateur !');
                          }}
                          className="border border-[#e0e0e0] hover:bg-[#f5f5f5] text-[#1a1a1a] px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Volume2 size={14} /> Tester une alerte instantanée
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px] text-[#9e9e9e] font-medium">
                      <div className="flex items-center gap-2 bg-[#f5f5f5]/50 p-2.5 rounded-xl border border-[#e0e0e0]/50">
                        <span className="text-base">📌</span>
                        <span><strong>Absences & Retards :</strong> Alertes push immédiates dès l'appel fait par l'enseignant.</span>
                      </div>
                      <div className="flex items-center gap-2 bg-[#f5f5f5]/50 p-2.5 rounded-xl border border-[#e0e0e0]/50">
                        <span className="text-base">📝</span>
                        <span><strong>Nouvelles Notes :</strong> Notifications directes lors de la publication des compositions.</span>
                      </div>
                      <div className="flex items-center gap-2 bg-[#f5f5f5]/50 p-2.5 rounded-xl border border-[#e0e0e0]/50">
                        <span className="text-base">📢</span>
                        <span><strong>Annonces Générales :</strong> Flash d'information urgent de la direction d'établissement.</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 shadow-sm space-y-4">
                    <h3 className="font-bold text-[10px] uppercase tracking-widest text-[#9e9e9e] mb-2">Historique d'alertes reçu par mobile/push</h3>
                    <div className="divide-y divide-[#e0e0e0]/60">
                      {notifications.map((n, i) => (
                        <div key={i} className={`py-4 flex gap-4 items-start cursor-pointer hover:bg-[#f5f5f5]/20 px-3 rounded-xl transition-all ${n.unread ? 'bg-[#f5f5f5]/40 font-semibold' : ''}`} onClick={() => handleMarkAsRead(n.id)}>
                          <div className="w-8 h-8 rounded-xl bg-[#f5f5f5] border border-[#e0e0e0] flex items-center justify-center text-sm flex-shrink-0">
                            {n.icon}
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-[#1a1a1a] leading-relaxed">
                              {n.unread && <span className="text-[#1a1a1a] font-bold mr-1">● [Nouveau]</span>}
                              {n.text}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <span className="text-[9px] text-[#9e9e9e] font-medium tracking-tight">{n.time}</span>
                              {n.emailStatus === 'sent' && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                  <Mail size={10} /> ✓ Email envoyé à {user.email}
                                </span>
                              )}
                              {n.emailStatus === 'pending' && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                                  <Mail size={10} /> Envoi e-mail en cours…
                                </span>
                              )}
                              {(n.emailStatus === 'failed' || n.emailStatus === 'skipped') && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200 flex items-center gap-1">
                                  <Mail size={10} /> Non transmis par e-mail
                                </span>
                              )}
                              {(!n.emailStatus && n.emailSent) && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                  <Mail size={10} /> Email transmis à {user.email}
                                </span>
                              )}
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1">
                                <Smartphone size={10} /> Notif Push Écran
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {notifications.length === 0 && (
                        <div className="py-8 text-center text-[#9e9e9e] text-xs">Aucune notification reçue</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white p-12 rounded-[24px] text-center text-[#9e9e9e] border border-dashed border-[#e0e0e0]">
              Aucun enfant associé à votre profil pour le moment.
            </div>
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
          onClick={() => setActiveTab('resultats')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'resultats' ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">🎯</span>
          <span>Notes</span>
        </button>
        <button
          onClick={() => setActiveTab('bulletin')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'bulletin' ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">📋</span>
          <span>Bulletin</span>
        </button>
        <button
          onClick={() => setActiveTab('paiements')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'paiements' ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">💳</span>
          <span>Frais</span>
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
              <h3 className="font-bold text-sm text-[#1a1a1a]">Espace Parent</h3>
              <button onClick={() => setIsMobilePlusMenuOpen(false)} className="p-1 text-[#9e9e9e] hover:text-[#1a1a1a]">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <button
                onClick={() => { setActiveTab('presence'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                📌 Absences & Présences
              </button>
              <button
                onClick={() => { setActiveTab('cahier'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                📓 Cahier de texte
              </button>
              <button
                onClick={() => { setActiveTab('emploi'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                📅 Emploi du temps
              </button>
              <button
                onClick={() => { setActiveTab('observations'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                💬 Observations ({observations.length})
              </button>
              <button
                onClick={() => { setActiveTab('messagerie'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left col-span-2"
              >
                💬 Messagerie avec l'école
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
      {/* EMAIL PREVIEW MODAL */}
      {selectedEmailSample && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-3">
              <div className="flex items-center gap-2">
                <Mail size={18} className="text-[#1a1a1a]" />
                <div>
                  <h3 className="font-bold text-sm text-[#1a1a1a]">{selectedEmailSample.title}</h3>
                  <p className="text-[11px] text-[#9e9e9e]">Destinataire : {user.email || 'parent@ecoleplus.ci'} · {selectedEmailSample.date}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmailSample(null)}
                className="p-1.5 rounded-full hover:bg-[#f5f5f5] text-[#9e9e9e] hover:text-[#1a1a1a] transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-[#f5f5f5] p-3 rounded-xl border border-[#e0e0e0] text-xs font-mono text-[#1a1a1a]">
              <strong>Objet :</strong> {selectedEmailSample.subject}
            </div>

            <div className="border border-[#e0e0e0] rounded-2xl overflow-hidden bg-white max-h-[60vh] overflow-y-auto">
              <div dangerouslySetInnerHTML={{ __html: selectedEmailSample.contentHtml }} />
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedEmailSample(null)}
                className="bg-[#1a1a1a] hover:bg-black text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Fermer l'Aperçu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Money Payment Modal */}
      {isMobileMoneyModalOpen && selectedKid && paiement && (
        <MobileMoneyPaymentModal
          paiement={paiement}
          tranche={selectedTrancheForPay}
          studentName={selectedKid.nom}
          parentEmail={user.email}
          userUid={user.uid}
          onClose={() => {
            setIsMobileMoneyModalOpen(false);
            setSelectedTrancheForPay(null);
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
