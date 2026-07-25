import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { UserProfile, Eleve, Note, Absence, Paiement, AppNotification } from '../types';
import { Award, Clock, FileText, CreditCard, Bell, LogOut, ChevronRight, Check, Mail, Smartphone, Volume2, ShieldCheck, Zap, MessageSquare } from 'lucide-react';
import { playNotificationChime, requestPushPermission, triggerBrowserPushNotification, initServiceWorker } from '../lib/notifications';
import MessagerieView from './MessagerieView';
import BulletinView from './BulletinView';
import EmploiDuTempsView from './EmploiDuTempsView';

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
    const qNotifs = query(collection(db, 'notifications'), where('userUid', 'in', [user.uid, 'all']));
    const unsubNotifs = onSnapshot(qNotifs, (snap) => {
      if (!isInitialNotifs.current) {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const newNotif = change.doc.data() as AppNotification;
            if (newNotif.unread) {
              triggerBrowserPushNotification('ALERTE TEMPS RÉEL ÉCOLEPLUS', newNotif.text, newNotif.icon || '🔔');
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

    return () => {
      unsubNotes();
      unsubAbs();
      unsubPaiement();
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
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-[#e0e0e0] flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-[#e0e0e0] flex items-center gap-3">
          <div className="w-9 h-9 bg-[#1a1a1a] text-white rounded-xl flex items-center justify-center font-bold text-sm">EP</div>
          <div>
            <div className="font-sans font-semibold text-[#1a1a1a] text-sm tracking-tight leading-none">ÉcolePlus</div>
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
        <header className="bg-white border-b border-[#e0e0e0] h-16 flex items-center px-8 justify-between flex-shrink-0">
          <div className="flex items-center gap-5">
            <h2 className="font-sans font-semibold text-[#1a1a1a] text-base tracking-tight">
              {activeTab === 'dashboard' && 'Suivi de l\'élève'}
              {activeTab === 'resultats' && 'Relevé de notes détaillé'}
              {activeTab === 'presence' && 'Registre de ponctualité'}
              {activeTab === 'emploi' && 'Grille horaire hebdomadaire'}
              {activeTab === 'paiements' && 'Frais scolaires & Comptabilité'}
              {activeTab === 'notifications' && 'Historique de notifications'}
            </h2>

            {/* Kids Switcher tabs inside header */}
            {user.enfants && user.enfants.length > 1 && (
              <div className="flex bg-[#f5f5f5] p-1 rounded-xl gap-1 border border-[#e0e0e0]">
                {user.enfants.map((enf, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleKidSwitch(idx)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold tracking-tight transition-all cursor-pointer ${
                      selectedKidIdx === idx ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#9e9e9e] hover:text-[#1a1a1a]'
                    }`}
                  >
                    {enf.nom}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('notifications')}
              className="relative w-9 h-9 rounded-xl border border-[#e0e0e0] flex items-center justify-center text-[#1a1a1a] hover:bg-[#f5f5f5] transition-all cursor-pointer"
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
        <main className="flex-1 overflow-y-auto p-8">
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

                  {/* Stats Cards */}
                  <div className="grid grid-cols-4 gap-6">
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

                  {/* Layout split */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Latest Marks Widget */}
                    <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 shadow-sm space-y-4">
                      <h3 className="font-bold text-[10px] uppercase tracking-widest text-[#9e9e9e] mb-2">📝 Dernières notes obtenues</h3>
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
                <div className="grid grid-cols-3 gap-6">
                  {paiement ? (
                    <>
                      <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 space-y-4 shadow-sm h-fit">
                        <h4 className="font-bold text-[10px] uppercase tracking-widest text-[#9e9e9e]">État financier</h4>
                        <div className="text-xs text-[#9e9e9e] font-medium">Scolarité annuelle totale : <strong className="text-[#1a1a1a] font-semibold">{paiement.total.toLocaleString('fr-FR')} F</strong></div>
                        <div className="flex justify-between items-center text-xs border-b border-[#e0e0e0]/60 pb-2">
                          <span className="text-[#9e9e9e] font-semibold">Payé :</span>
                          <span className="font-bold text-[#1a1a1a]">{paiement.paye.toLocaleString('fr-FR')} F</span>
                        </div>
                        <div className="flex justify-between items-center text-xs border-b border-[#e0e0e0]/60 pb-2">
                          <span className="text-[#9e9e9e] font-semibold">Solde restant :</span>
                          <span className="font-bold text-[#1a1a1a]">{paiement.solde.toLocaleString('fr-FR')} F</span>
                        </div>
                        <div className="h-2 bg-[#f5f5f5] rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[#1a1a1a]" 
                            style={{ width: `${(paiement.paye / paiement.total) * 100}%` }}
                          ></div>
                        </div>
                        <div className="bg-[#f5f5f5] border border-[#e0e0e0] p-3 rounded-xl text-[10px] text-[#1a1a1a] font-bold text-center tracking-tight">
                          ⚠️ Prochaine échéance : {paiement.echeance}
                        </div>
                      </div>

                      <div className="col-span-2 bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-[#e0e0e0] font-bold text-[10px] text-[#9e9e9e] uppercase tracking-widest bg-[#f5f5f5]/30">
                          Historique des reçus
                        </div>
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e]">
                              <th className="py-3 px-4">Date</th>
                              <th className="py-3 px-4">Montant Versé</th>
                              <th className="py-3 px-4">Mode de transaction</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
                            {paiement.historique.map((h, i) => (
                              <tr key={i} className="hover:bg-[#f5f5f5]/10">
                                <td className="py-3 px-4 text-[#9e9e9e]">{h.date}</td>
                                <td className="py-3 px-4 font-bold text-[#1a1a1a]">{h.montant.toLocaleString('fr-FR')} FCFA</td>
                                <td className="py-3 px-4 text-[#9e9e9e] font-semibold">{h.mode}</td>
                              </tr>
                            ))}
                            {paiement.historique.length === 0 && (
                              <tr>
                                <td colSpan={3} className="py-8 text-center text-[#9e9e9e]">Aucun paiement effectué pour le moment</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-3 bg-white p-8 rounded-[24px] text-center text-[#9e9e9e] border border-dashed border-[#e0e0e0]">
                      Aucune donnée financière disponible pour {selectedKid.nom}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="space-y-6">
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
                              'Alerte Critique ÉcolePlus (Test)',
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
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                <Mail size={10} /> Email transmis à {user.email}
                              </span>
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
    </div>
  );
}
