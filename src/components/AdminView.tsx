import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { UserProfile, Eleve, Note, Absence, CahierTexte, Paiement, Annonce, AppNotification, AuditLog } from '../types';
import StudentImportModal from './StudentImportModal';
import { clearAllDatabaseData, restoreDemoData } from '../lib/demoData';
import { 
  Users, UserCheck, BookOpen, Clock, CreditCard, Bell, LogOut, ChevronRight, Check, X, Eye, Plus, Send, RefreshCw, Star, FileSpreadsheet, Upload, Trash2, RotateCcw, Sparkles, MessageSquare, Archive, ShieldAlert, FileText, Menu, AlertTriangle
} from 'lucide-react';
import MessagerieView from './MessagerieView';
import ClassesView from './ClassesView';
import EmploiDuTempsView from './EmploiDuTempsView';
import BulletinView from './BulletinView';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid 
} from 'recharts';

interface AdminViewProps {
  user: UserProfile;
  onLogout: () => void;
  showToast: (msg: string) => void;
}

export default function AdminView({ user, onLogout, showToast }: AdminViewProps) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [activeTeachers, setActiveTeachers] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [students, setStudents] = useState<Eleve[]>([]);
  const [payments, setPayments] = useState<Paiement[]>([]);
  const [announcements, setAnnouncements] = useState<Annonce[]>([]);
  const [recentAbsences, setRecentAbsences] = useState<Absence[]>([]);
  const [firestoreClasses, setFirestoreClasses] = useState<string[]>([]);

  // Dynamic classes list from Firestore classes collection + registered students
  const classesList = useMemo(() => {
    const set = new Set<string>();
    firestoreClasses.forEach((c) => { if (c) set.add(c.trim()); });
    students.forEach((s) => { if (s.classe) set.add(s.classe.trim()); });
    return Array.from(set).sort();
  }, [firestoreClasses, students]);

  // Computed live dashboard stats
  const stats = useMemo(() => {
    const pupils = students.length;
    const teachers = activeTeachers.length;
    const uniqueClasses = new Set(students.map(s => s.classe).filter(Boolean));
    const classes = uniqueClasses.size;
    const absents = recentAbsences.filter(a => a.statut === 'absent').length;
    const absenceRate = pupils > 0 ? `${((absents / pupils) * 100).toFixed(1)}%` : '0.0%';
    return { pupils, teachers, classes, absenceRate };
  }, [students, activeTeachers, recentAbsences]);
  
  // Modals state
  const [isEleveModalOpen, setIsEleveModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isProfModalOpen, setIsProfModalOpen] = useState(false);
  const [isPaiementModalOpen, setIsPaiementModalOpen] = useState(false);
  const [isViewUserModalOpen, setIsViewUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Parent Link Modal state
  const [isParentLinkModalOpen, setIsParentLinkModalOpen] = useState(false);
  const [selectedEleveForParentLink, setSelectedEleveForParentLink] = useState<Eleve | null>(null);
  const [parentLinkMode, setParentLinkMode] = useState<'select' | 'create'>('select');
  const [selectedParentUid, setSelectedParentUid] = useState('');
  const [newParentNom, setNewParentNom] = useState('');
  const [newParentEmail, setNewParentEmail] = useState('');
  const [newParentTel, setNewParentTel] = useState('');

  // Parent users list
  const parentUsers = useMemo(() => allUsers.filter(u => u.role === 'parent'), [allUsers]);

  // New Payment Form
  const [payEleveId, setPayEleveId] = useState('');
  const [payMontant, setPayMontant] = useState('25000');
  const [payMode, setPayMode] = useState('Wave');
  const [payRecuNo, setPayRecuNo] = useState(`REC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);

  // New Prof Form
  const [newProfNom, setNewProfNom] = useState('');
  const [newProfEmail, setNewProfEmail] = useState('');
  const [newProfTel, setNewProfTel] = useState('');
  const [newProfMatiere, setNewProfMatiere] = useState('');

  // Audit Log State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Archiving & Permanent Delete Filters / Modals
  const [showArchivedStudents, setShowArchivedStudents] = useState(false);
  const [showArchivedProfs, setShowArchivedProfs] = useState(false);

  // Archive Modal State
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [itemToArchive, setItemToArchive] = useState<Eleve | UserProfile | null>(null);
  const [archiveType, setArchiveType] = useState<'eleve' | 'prof'>('eleve');
  const [archiveRaisonInput, setArchiveRaisonInput] = useState('');

  // Delete Modal State (Permanent Delete)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Eleve | UserProfile | null>(null);
  const [deleteType, setDeleteType] = useState<'eleve' | 'prof'>('eleve');
  const [deleteConfirmNameInput, setDeleteConfirmNameInput] = useState('');
  const [deleteBlockedReason, setDeleteBlockedReason] = useState<string | null>(null);
  const [isCheckingHistory, setIsCheckingHistory] = useState(false);

  // Mobile drawer state
  const [isMobilePlusMenuOpen, setIsMobilePlusMenuOpen] = useState(false);

  const handleConfirmResetDatabase = async () => {
    setIsResetting(true);
    try {
      await clearAllDatabaseData();
      showToast('✨ Dashboard réinitialisé avec succès ! Base de données en Mode Vierge prêt pour la production.');
      setIsResetModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast('❌ Erreur lors de la réinitialisation de la base.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleRestoreDemo = async () => {
    try {
      await restoreDemoData();
      showToast('🌱 Données de démo restaurées dans la base.');
    } catch (err) {
      console.error(err);
      showToast('❌ Erreur lors de la restauration des données.');
    }
  };

  // New Eleve Form
  const [newElevePrenom, setNewElevePrenom] = useState('');
  const [newEleveNom, setNewEleveNom] = useState('');
  const [newEleveClasse, setNewEleveClasse] = useState('6e A');

  // New Annonce Form
  const [newAnnonceDest, setNewAnnonceDest] = useState('Tous (élèves, parents, profs)');
  const [newAnnonceObjet, setNewAnnonceObjet] = useState('');
  const [newAnnonceMsg, setNewAnnonceMsg] = useState('');

  // Notifications state
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Fetch pending approvals and active teachers
  useEffect(() => {
    const qPending = query(collection(db, 'users'), where('status', '==', 'pending'));
    const unsubPending = onSnapshot(qPending, (snap) => {
      const uList: UserProfile[] = [];
      snap.forEach(d => uList.push(d.data() as UserProfile));
      setPendingUsers(uList);
    }, (err) => console.warn('Pending users listener notice:', err));

    const qActiveProfs = query(collection(db, 'users'), where('role', '==', 'prof'), where('status', '==', 'active'));
    const unsubProfs = onSnapshot(qActiveProfs, (snap) => {
      const pList: UserProfile[] = [];
      snap.forEach(d => pList.push(d.data() as UserProfile));
      setActiveTeachers(pList);
    }, (err) => console.warn('Active profs listener notice:', err));

    const unsubStudents = onSnapshot(collection(db, 'eleves'), (snap) => {
      const sList: Eleve[] = [];
      snap.forEach(d => sList.push(d.data() as Eleve));
      setStudents(sList);
    }, (err) => console.warn('Students listener notice:', err));

    const unsubPayments = onSnapshot(collection(db, 'paiements'), (snap) => {
      const payList: Paiement[] = [];
      snap.forEach(d => payList.push(d.data() as Paiement));
      setPayments(payList);
    }, (err) => console.warn('Payments listener notice:', err));

    const unsubAnnonces = onSnapshot(collection(db, 'annonces'), (snap) => {
      const annList: Annonce[] = [];
      snap.forEach(d => annList.push(d.data() as Annonce));
      setAnnouncements(annList);
    }, (err) => console.warn('Annonces listener notice:', err));

    const unsubAbsences = onSnapshot(collection(db, 'absences'), (snap) => {
      const absList: Absence[] = [];
      snap.forEach(d => absList.push(d.data() as Absence));
      setRecentAbsences(absList.slice(0, 10)); // Top 10
    }, (err) => console.warn('Absences listener notice:', err));

    // Load admin notifications
    const qNotifs = query(collection(db, 'notifications'), where('userUid', 'in', ['all', user.uid]));
    const unsubNotifs = onSnapshot(qNotifs, (snap) => {
      const list: AppNotification[] = [];
      snap.forEach(d => list.push(d.data() as AppNotification));
      setNotifications(list.sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
    }, (err) => console.warn('Notifs listener notice:', err));

    // Load all users for registration statistics
    const unsubAllUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const uList: UserProfile[] = [];
      snap.forEach(d => uList.push(d.data() as UserProfile));
      setAllUsers(uList);
    }, (err) => console.warn('All users listener notice:', err));

    const unsubClasses = onSnapshot(collection(db, 'classes'), (snap) => {
      const list: string[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.name) list.push(data.name);
      });
      setFirestoreClasses(list);
    }, (err) => console.warn('Classes listener notice:', err));

    const unsubAudit = onSnapshot(collection(db, 'audit_log'), (snap) => {
      const logList: AuditLog[] = [];
      snap.forEach(d => logList.push(d.data() as AuditLog));
      setAuditLogs(logList.sort((a,b) => b.timestamp.localeCompare(a.timestamp)));
    }, (err) => console.warn('Audit log listener notice:', err));

    return () => {
      unsubPending();
      unsubProfs();
      unsubStudents();
      unsubPayments();
      unsubAnnonces();
      unsubAbsences();
      unsubNotifs();
      unsubAllUsers();
      unsubClasses();
      unsubAudit();
    };
  }, [user.uid]);

  // Compute registrations statistics over the last 30 days for Teachers vs Parents
  const registrationData = useMemo(() => {
    const days: { dateLabel: string; isoDate: string; profs: number; parents: number; total: number }[] = [];
    const now = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const isoDate = d.toISOString().split('T')[0];
      const dateLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      days.push({
        dateLabel,
        isoDate,
        profs: 0,
        parents: 0,
        total: 0
      });
    }

    allUsers.forEach(u => {
      if (!u.createdAt) return;
      const userDate = u.createdAt.split('T')[0];
      const matchedDay = days.find(day => day.isoDate === userDate);
      if (matchedDay) {
        if (u.role === 'prof') {
          matchedDay.profs += 1;
          matchedDay.total += 1;
        } else if (u.role === 'parent') {
          matchedDay.parents += 1;
          matchedDay.total += 1;
        }
      }
    });

    return days;
  }, [allUsers]);

  const last30DaysProfCount = useMemo(() => registrationData.reduce((acc, curr) => acc + curr.profs, 0), [registrationData]);
  const last30DaysParentCount = useMemo(() => registrationData.reduce((acc, curr) => acc + curr.parents, 0), [registrationData]);
  const last30DaysTotalCount = last30DaysProfCount + last30DaysParentCount;

  const generateEleveCode = () => {
    return 'ELV-' + Math.floor(1000 + Math.random() * 9000);
  };

  const handleCreateEleve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newElevePrenom || !newEleveNom) {
      showToast('⚠️ Prénom et Nom de l\'élève requis.');
      return;
    }

    const eleveId = 'elv_' + Math.random().toString(36).substring(2, 9);
    const code = generateEleveCode();
    const newEleve: Eleve = {
      id: eleveId,
      nom: `${newElevePrenom} ${newEleveNom}`,
      classe: newEleveClasse,
      code,
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'eleves', eleveId), newEleve);

      // Create tuition fees model
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

      showToast(`🎒 Élève ${newEleve.nom} créé avec succès ! Code association : ${code}`);
      setNewElevePrenom('');
      setNewEleveNom('');
      setIsEleveModalOpen(false);
    } catch (err) {
      showToast('❌ Échec de la création de l\'élève.');
    }
  };

  const handleCreatePaiement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payEleveId) {
      showToast('⚠️ Veuillez sélectionner un élève.');
      return;
    }
    const student = students.find(s => s.id === payEleveId);
    if (!student) {
      showToast('⚠️ Élève introuvable.');
      return;
    }

    const numMontant = parseFloat(payMontant) || 0;
    const currentPay = payments.find(p => p.eleveId === payEleveId);
    const total = currentPay ? currentPay.total : (student.scolariteTotal || 95000);
    const prevPaye = currentPay ? currentPay.paye : (student.scolaritePayee || 0);
    const newPaye = prevPaye + numMontant;
    const newSolde = Math.max(0, total - newPaye);

    const payId = currentPay ? currentPay.id : `pay_${payEleveId}_${Date.now().toString(36)}`;
    const newVers = {
      date: new Date().toISOString().split('T')[0],
      montant: numMontant,
      mode: payMode,
      recuNo: payRecuNo
    };

    const initialDueDate = (currentPay?.echeance && currentPay.echeance !== 'Solder' && currentPay.echeance !== 'Soldé' && currentPay.echeance !== 'En cours')
      ? currentPay.echeance
      : (student.echeance || '30 Janvier 2026');

    const updatedPaiement: Paiement = {
      id: payId,
      eleveId: payEleveId,
      eleveNom: student.nom,
      classe: student.classe,
      total,
      paye: newPaye,
      solde: newSolde,
      modePaiement: payMode,
      recuNo: payRecuNo,
      echeance: newSolde <= 0 ? 'Soldé' : initialDueDate,
      historique: [...(currentPay?.historique || []), newVers]
    };

    try {
      await setDoc(doc(db, 'paiements', payId), updatedPaiement, { merge: true });
      await updateDoc(doc(db, 'eleves', payEleveId), { scolaritePayee: newPaye });
      showToast(`💳 Règlement de ${numMontant.toLocaleString('fr-FR')} F enregistré pour ${student.nom} !`);
      setIsPaiementModalOpen(false);
      setPayMontant('25000');
      setPayRecuNo(`REC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    } catch (err) {
      console.error(err);
      showToast('❌ Échec de l\'enregistrement du paiement.');
    }
  };

  const handleInviteProf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfNom || !newProfEmail) {
      showToast('⚠️ Veuillez renseigner au moins le nom et l\'email.');
      return;
    }

    const cleanEmail = newProfEmail.toLowerCase().trim();
    const profUid = `invited_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
    const profProfile: UserProfile = {
      uid: profUid,
      nom: newProfNom,
      email: cleanEmail,
      tel: newProfTel || '07 00 00 00 00',
      role: 'prof',
      status: 'active',
      matiere: newProfMatiere || 'Général',
      etablissement: 'Lycée Moderne',
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'users', profUid), profProfile, { merge: true });
      showToast(`👨‍🏫 Enseignant ${newProfNom} ajouté et pré-activé dans l'annuaire !`);
      setIsProfModalOpen(false);
      setNewProfNom('');
      setNewProfEmail('');
      setNewProfTel('');
      setNewProfMatiere('');
    } catch (err) {
      console.error(err);
      showToast('❌ Échec de l\'invitation de l\'enseignant.');
    }
  };

  const handleApproveUser = async (targetUser: UserProfile) => {
    try {
      await updateDoc(doc(db, 'users', targetUser.uid), { status: 'active' });

      // Link children parent info if the user is a parent
      if (targetUser.role === 'parent' && targetUser.enfants) {
        for (const enf of targetUser.enfants) {
          const q = query(collection(db, 'eleves'), where('code', '==', enf.matricule));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const studentDoc = snap.docs[0];
            await updateDoc(doc(db, 'eleves', studentDoc.id), {
              parentUid: targetUser.uid,
              parentNom: targetUser.nom
            });
          }
        }
      }

      // Create a notification for this user
      const notifId = 'notif_' + Math.random().toString(36).substring(2, 9);
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        userUid: targetUser.uid,
        icon: '✅',
        bg: 'bg-emerald-100 text-emerald-800',
        text: 'Félicitations ! Votre compte ÉcolePlus a été validé et activé par l\'administration.',
        time: 'à l\'instant',
        unread: true,
        createdAt: new Date().toISOString()
      });

      showToast(`✅ Compte de ${targetUser.nom} validé et activé !`);
      setIsViewUserModalOpen(false);
    } catch (err) {
      showToast('❌ Échec de la validation du compte.');
    }
  };

  const handleRejectUser = async (targetUser: UserProfile) => {
    try {
      await updateDoc(doc(db, 'users', targetUser.uid), { status: 'refused' });
      showToast(`❌ Demande de ${targetUser.nom} refusée.`);
      setIsViewUserModalOpen(false);
    } catch (err) {
      showToast('❌ Échec de l\'opération.');
    }
  };

  const handleSendAnnonce = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnonceObjet || !newAnnonceMsg) {
      showToast('⚠️ Merci de remplir l\'objet et le message.');
      return;
    }

    const id = 'ann_' + Math.random().toString(36).substring(2, 9);
    const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' 2026';
    const newAnnonce: Annonce = {
      id,
      destinataire: newAnnonceDest,
      objet: newAnnonceObjet,
      message: newAnnonceMsg,
      date: dateStr,
      vues: 0,
      createdAt: new Date().toISOString()
    };

    let targetUid = 'all';
    if (newAnnonceDest === 'Parents uniquement') {
      targetUid = 'target_parent';
    } else if (newAnnonceDest === 'Professeurs uniquement') {
      targetUid = 'target_prof';
    }

    try {
      await setDoc(doc(db, 'annonces', id), newAnnonce);

      // Create targeted notification
      const notifId = 'notif_' + id;
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        userUid: targetUid,
        icon: '📣',
        bg: 'bg-blue-100 text-blue-700',
        text: `Annonce [${newAnnonceDest}] : ${newAnnonceObjet}`,
        time: 'à l\'instant',
        unread: true,
        createdAt: new Date().toISOString()
      });

      showToast(`📣 Annonce ciblée (${newAnnonceDest}) publiée avec succès !`);
      setNewAnnonceObjet('');
      setNewAnnonceMsg('');
    } catch (err) {
      showToast('❌ Échec de publication de l\'annonce.');
    }
  };

  const handleViewUser = (u: UserProfile) => {
    setSelectedUser(u);
    setIsViewUserModalOpen(true);
  };

  const addAuditLog = async (action: AuditLog['action'], targetId: string, targetName: string, targetType: 'eleve' | 'prof', details?: string) => {
    try {
      const nowIso = new Date().toISOString();
      const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2,6)}`;
      const logEntry: AuditLog = {
        id: logId,
        action,
        adminUid: user.uid,
        adminNom: user.nom,
        by: user.uid,
        byNom: user.nom,
        targetId,
        targetName,
        targetNom: targetName,
        targetType,
        details,
        raison: details,
        at: nowIso,
        timestamp: nowIso
      };
      await setDoc(doc(db, 'audit_log', logId), logEntry);
    } catch (e) {
      console.error('Audit log write error:', e);
    }
  };

  const handleOpenArchiveModal = (item: Eleve | UserProfile, type: 'eleve' | 'prof') => {
    setItemToArchive(item);
    setArchiveType(type);
    setArchiveRaisonInput('');
    setIsArchiveModalOpen(true);
  };

  const handleConfirmArchive = async () => {
    if (!itemToArchive) return;
    try {
      const now = new Date().toISOString();
      if (archiveType === 'eleve') {
        const eleve = itemToArchive as Eleve;
        await updateDoc(doc(db, 'eleves', eleve.id), {
          statut: 'archive',
          archivedAt: now,
          archivedBy: user.uid,
          archiveRaison: archiveRaisonInput.trim() || 'Archivage administratif'
        });

        if (eleve.parentUid) {
          try {
            const pRef = doc(db, 'users', eleve.parentUid);
            const parentUser = allUsers.find(u => u.uid === eleve.parentUid);
            if (parentUser && parentUser.enfants) {
              const updatedEnfants = parentUser.enfants.filter(e => e.matricule !== eleve.code);
              await updateDoc(pRef, { enfants: updatedEnfants });
            }
          } catch (pErr) {
            console.warn('Could not update parent enfants array on archive:', pErr);
          }
        }

        await addAuditLog('eleve_archive', eleve.id, eleve.nom, 'eleve', archiveRaisonInput.trim() || 'Archivage élève');
        showToast(`📦 Élève "${eleve.nom}" archivé avec succès.`);
      } else {
        const prof = itemToArchive as UserProfile;
        if (prof.uid === user.uid) {
          showToast('❌ Action impossible : Vous ne pouvez pas vous désactiver vous-même.');
          return;
        }

        if (prof.role === 'admin') {
          const activeAdmins = allUsers.filter(u => u.role === 'admin' && u.status === 'active' && u.statut !== 'archive');
          if (activeAdmins.length <= 1) {
            showToast('❌ Action impossible : Vous ne pouvez pas désactiver le dernier administrateur actif.');
            return;
          }
        }

        await updateDoc(doc(db, 'users', prof.uid), {
          statut: 'archive',
          status: 'archived',
          archivedAt: now,
          archivedBy: user.uid,
          archiveRaison: archiveRaisonInput.trim() || 'Désactivation professeur'
        });

        try {
          const classesSnap = await getDocs(query(collection(db, 'classes'), where('titulaireUid', '==', prof.uid)));
          classesSnap.forEach(async (cDoc) => {
            await updateDoc(doc(db, 'classes', cDoc.id), { titulaireUid: null, titulaireNom: null });
          });
        } catch (cErr) {
          console.warn('Could not unassign class titulaire:', cErr);
        }

        await addAuditLog('prof_deactivate', prof.uid, prof.nom, 'prof', archiveRaisonInput.trim() || 'Désactivation enseignant');
        showToast(`📦 Professeur "${prof.nom}" désactivé et archivé avec succès.`);
      }
      setIsArchiveModalOpen(false);
      setItemToArchive(null);
    } catch (err) {
      console.error(err);
      showToast('❌ Échec de l\'opération d\'archivage.');
    }
  };

  const handleRestoreEleve = async (eleve: Eleve) => {
    try {
      await updateDoc(doc(db, 'eleves', eleve.id), {
        statut: 'active',
        archivedAt: null,
        archivedBy: null,
        archiveRaison: null
      });
      await addAuditLog('eleve_restore', eleve.id, eleve.nom, 'eleve', 'Réactivation élève');
      showToast(`✅ Élève "${eleve.nom}" restauré dans la liste active.`);
    } catch (err) {
      console.error(err);
      showToast('❌ Échec de la restauration de l\'élève.');
    }
  };

  const handleReactivateProf = async (prof: UserProfile) => {
    try {
      await updateDoc(doc(db, 'users', prof.uid), {
        statut: 'active',
        archivedAt: null,
        archivedBy: null,
        archiveRaison: null
      });
      await addAuditLog('prof_reactivate', prof.uid, prof.nom, 'prof', 'Réactivation professeur');
      showToast(`✅ Professeur "${prof.nom}" réactivé avec succès.`);
    } catch (err) {
      console.error(err);
      showToast('❌ Échec de la réactivation du professeur.');
    }
  };

  const handleOpenDeleteModal = async (item: Eleve | UserProfile, type: 'eleve' | 'prof') => {
    setItemToDelete(item);
    setDeleteType(type);
    setDeleteConfirmNameInput('');
    setDeleteBlockedReason(null);
    setIsCheckingHistory(true);
    setIsDeleteModalOpen(true);

    try {
      if (type === 'eleve') {
        const eleve = item as Eleve;
        const notesSnap = await getDocs(query(collection(db, 'notes'), where('studentId', '==', eleve.id)));
        const absSnap = await getDocs(query(collection(db, 'absences'), where('studentId', '==', eleve.id)));
        const pay = payments.find(p => p.eleveId === eleve.id);
        const paidAmount = pay ? pay.paye : (eleve.scolaritePayee || 0);

        if (!notesSnap.empty || !absSnap.empty || paidAmount > 0) {
          const reasons: string[] = [];
          if (!notesSnap.empty) reasons.push(`${notesSnap.size} note(s)`);
          if (!absSnap.empty) reasons.push(`${absSnap.size} absence(s)`);
          if (paidAmount > 0) reasons.push(`Paiements: ${paidAmount.toLocaleString('fr-FR')} F`);
          setDeleteBlockedReason(`Cet élève a un historique actif (${reasons.join(', ')}). Conformément aux règles de traçabilité, la suppression définitive est bloquée. Veuillez utiliser l'Archivage.`);
        }
      } else {
        const prof = item as UserProfile;
        if (prof.uid === user.uid) {
          setDeleteBlockedReason("Vous ne pouvez pas supprimer définitivement votre propre compte.");
        } else {
          const notesSnap = await getDocs(query(collection(db, 'notes'), where('profUid', '==', prof.uid)));
          const cahierSnap = await getDocs(query(collection(db, 'cahier_texte'), where('profNom', '==', prof.nom)));
          if (!notesSnap.empty || !cahierSnap.empty) {
            setDeleteBlockedReason(`Ce professeur a du contenu actif enregistré (${notesSnap.size} note(s), ${cahierSnap.size} cours du cahier de texte). La suppression définitive est bloquée, privilégiez la désactivation.`);
          }
        }
      }
    } catch (err) {
      console.error('Error checking item history:', err);
    } finally {
      setIsCheckingHistory(false);
    }
  };

  const handleConfirmPermanentDelete = async () => {
    if (!itemToDelete) return;
    const expectedName = itemToDelete.nom.trim().toLowerCase();
    if (deleteConfirmNameInput.trim().toLowerCase() !== expectedName) {
      showToast('⚠️ Le nom saisi ne correspond pas exactement au nom requis.');
      return;
    }

    try {
      if (deleteType === 'eleve') {
        const eleve = itemToDelete as Eleve;
        await deleteDoc(doc(db, 'eleves', eleve.id));
        const pay = payments.find(p => p.eleveId === eleve.id);
        if (pay && pay.paye === 0) {
          await deleteDoc(doc(db, 'paiements', pay.id));
        }
        await addAuditLog('eleve_delete', eleve.id, eleve.nom, 'eleve', 'Suppression définitive élève');
        showToast(`🗑️ Élève "${eleve.nom}" définitivement supprimé.`);
      } else {
        const prof = itemToDelete as UserProfile;
        await deleteDoc(doc(db, 'users', prof.uid));
        await addAuditLog('prof_delete', prof.uid, prof.nom, 'prof', 'Suppression définitive professeur');
        showToast(`🗑️ Professeur "${prof.nom}" définitivement supprimé.`);
      }
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (err) {
      console.error(err);
      showToast('❌ Échec de la suppression définitive.');
    }
  };

  const handleOpenLinkParentModal = (eleve: Eleve) => {
    setSelectedEleveForParentLink(eleve);
    if (eleve.parentUid) {
      setSelectedParentUid(eleve.parentUid);
      setParentLinkMode('select');
    } else if (parentUsers.length > 0) {
      setSelectedParentUid(parentUsers[0].uid);
      setParentLinkMode('select');
    } else {
      setSelectedParentUid('');
      setParentLinkMode('create');
    }
    setNewParentNom('');
    setNewParentEmail('');
    setNewParentTel('');
    setIsParentLinkModalOpen(true);
  };

  const handleLinkParentToEleve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEleveForParentLink) return;

    try {
      let parentUidToLink = selectedParentUid;
      let parentNomToLink = '';

      if (parentLinkMode === 'create') {
        if (!newParentNom.trim() || !newParentEmail.trim()) {
          showToast('⚠️ Veuillez renseigner le nom et l\'email du parent.');
          return;
        }
        const newParentRef = doc(collection(db, 'users'));
        parentUidToLink = newParentRef.id;
        parentNomToLink = newParentNom.trim();

        const newParentProfile: UserProfile = {
          uid: newParentRef.id,
          nom: parentNomToLink,
          email: newParentEmail.trim(),
          tel: newParentTel.trim() || 'Non renseigné',
          role: 'parent',
          status: 'active',
          enfants: [{
            nom: selectedEleveForParentLink.nom,
            classe: selectedEleveForParentLink.classe,
            matricule: selectedEleveForParentLink.code,
          }],
          createdAt: new Date().toISOString(),
        };

        await setDoc(newParentRef, newParentProfile);
      } else {
        if (!selectedParentUid) {
          showToast('⚠️ Veuillez choisir un parent dans la liste.');
          return;
        }
        const existingParent = allUsers.find(u => u.uid === selectedParentUid);
        if (!existingParent) {
          showToast('⚠️ Parent introuvable.');
          return;
        }
        parentNomToLink = existingParent.nom;

        // Update parent's enfants array
        const currentEnfants = existingParent.enfants || [];
        const alreadyHas = currentEnfants.some(e => e.matricule === selectedEleveForParentLink.code);
        if (!alreadyHas) {
          const updatedEnfants = [
            ...currentEnfants,
            {
              nom: selectedEleveForParentLink.nom,
              classe: selectedEleveForParentLink.classe,
              matricule: selectedEleveForParentLink.code,
            }
          ];
          await updateDoc(doc(db, 'users', existingParent.uid), {
            enfants: updatedEnfants
          });
        }
      }

      // Update Eleve record in Firestore
      await updateDoc(doc(db, 'eleves', selectedEleveForParentLink.id), {
        parentUid: parentUidToLink,
        parentNom: parentNomToLink,
      });

      showToast(`✅ Parent "${parentNomToLink}" associé à l'élève "${selectedEleveForParentLink.nom}" !`);
      setIsParentLinkModalOpen(false);
      setSelectedEleveForParentLink(null);
    } catch (err: any) {
      console.error('Error linking parent to eleve:', err);
      showToast('❌ Échec de l\'association du parent.');
    }
  };

  const handleUnlinkParentFromEleve = async (eleve: Eleve) => {
    if (!window.confirm(`Voulez-vous vraiment dissocier le parent de l'élève "${eleve.nom}" ?`)) return;

    try {
      if (eleve.parentUid) {
        const parentUser = allUsers.find(u => u.uid === eleve.parentUid);
        if (parentUser) {
          const updatedEnfants = (parentUser.enfants || []).filter(e => e.matricule !== eleve.code);
          await updateDoc(doc(db, 'users', parentUser.uid), {
            enfants: updatedEnfants
          });
        }
      }

      await updateDoc(doc(db, 'eleves', eleve.id), {
        parentUid: null,
        parentNom: null,
      });

      showToast(`ℹ️ Parent dissocié de l'élève "${eleve.nom}".`);
      setIsParentLinkModalOpen(false);
      setSelectedEleveForParentLink(null);
    } catch (err: any) {
      console.error('Error unlinking parent:', err);
      showToast('❌ Échec de la dissociation du parent.');
    }
  };

  const unreadNotifsCount = notifications.filter(n => n.unread).length;

  return (
    <div className="flex h-screen bg-[#f5f5f5] overflow-hidden">
      {/* SIDEBAR DESKTOP */}
      <aside className="hidden md:flex md:w-64 bg-white border-r border-[#e0e0e0] flex-col flex-shrink-0">
        <div className="p-6 border-b border-[#e0e0e0] flex items-center gap-3">
          <div className="w-9 h-9 bg-[#1a1a1a] text-white rounded-xl flex items-center justify-center font-bold text-sm">EP</div>
          <div>
            <div className="font-sans font-semibold text-[#1a1a1a] text-sm tracking-tight leading-none">ÉcolePlus</div>
            <div className="text-[10px] text-[#9e9e9e] font-semibold tracking-wide uppercase mt-1">Administration</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          <div>
            <div className="px-3 text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-2.5">Général</div>
            <div className="space-y-1">
              <button
                onClick={() => navigate(setActiveTab, 'dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'dashboard' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📊 Tableau de bord
              </button>
              <button
                onClick={() => navigate(setActiveTab, 'validation')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'validation' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                <span className="flex items-center gap-3">✅ Validation comptes</span>
                {pendingUsers.length > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${activeTab === 'validation' ? 'bg-white text-[#1a1a1a]' : 'bg-[#1a1a1a] text-white'}`}>
                    {pendingUsers.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div>
            <div className="px-3 text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-2.5">Académique</div>
            <div className="space-y-1">
              <button
                onClick={() => navigate(setActiveTab, 'eleves')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'eleves' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                🎒 Élèves
              </button>
              <button
                onClick={() => navigate(setActiveTab, 'professeurs')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'professeurs' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                👨‍🏫 Professeurs
              </button>
              <button
                onClick={() => navigate(setActiveTab, 'classes')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'classes' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                🏛️ Classes & Matières
              </button>
              <button
                onClick={() => navigate(setActiveTab, 'emploi')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'emploi' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📅 Emploi du temps
              </button>
            </div>
          </div>

          <div>
            <div className="px-3 text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-2.5">Suivi</div>
            <div className="space-y-1">
              <button
                onClick={() => navigate(setActiveTab, 'bulletins')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'bulletins' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📋 Bulletins
              </button>
              <button
                onClick={() => navigate(setActiveTab, 'paiements')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'paiements' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                💳 Frais scolaires
              </button>
              <button
                onClick={() => navigate(setActiveTab, 'annonces')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'annonces' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📣 Annonces
              </button>
              <button
                onClick={() => navigate(setActiveTab, 'messagerie')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'messagerie' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                💬 Messagerie Directe
              </button>
              <button
                onClick={() => navigate(setActiveTab, 'audit')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${activeTab === 'audit' ? 'bg-[#1a1a1a] text-white' : 'text-[#9e9e9e] hover:bg-[#f5f5f5]/60 hover:text-[#1a1a1a]'}`}
              >
                📜 Journal d'audit
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
            <div className="text-[10px] text-[#9e9e9e] font-semibold uppercase">Administration</div>
          </div>
          <button onClick={onLogout} className="text-[#9e9e9e] hover:text-[#1a1a1a] cursor-pointer" title="Déconnexion">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* HEADER DESKTOP & MOBILE TOP BAR */}
        <header className="bg-white border-b border-[#e0e0e0] h-16 flex items-center px-4 md:px-8 justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="md:hidden w-8 h-8 bg-[#1a1a1a] text-white rounded-lg flex items-center justify-center font-bold text-xs">EP</div>
            <h2 className="font-sans font-semibold text-[#1a1a1a] text-sm md:text-base tracking-tight truncate">
              {activeTab === 'dashboard' && 'Tableau de bord'}
              {activeTab === 'validation' && 'Validation des comptes'}
              {activeTab === 'eleves' && 'Gestion des élèves'}
              {activeTab === 'professeurs' && 'Gestion des professeurs'}
              {activeTab === 'classes' && 'Classes & Matières'}
              {activeTab === 'emploi' && 'Emploi du temps'}
              {activeTab === 'bulletins' && 'Bulletins scolaires'}
              {activeTab === 'paiements' && 'Frais scolaires'}
              {activeTab === 'annonces' && 'Annonces générales'}
              {activeTab === 'messagerie' && 'Messagerie en direct'}
              {activeTab === 'audit' && 'Journal d\'audit'}
            </h2>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setIsResetModalOpen(true)}
              className="hidden sm:flex px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              title="Vider les données de test et réinitialiser le tableau de bord"
            >
              <Trash2 size={14} /> Réinitialiser
            </button>

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

              {/* NOTIFICATIONS PANEL */}
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

        {/* CONTENT */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          {activeTab === 'dashboard' && (
            <div className="space-y-6 md:space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                <div className="bg-white rounded-[24px] p-5 border border-[#e0e0e0] shadow-sm flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-lg">🎒</div>
                  <div>
                    <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">{stats.pupils}</span>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Élèves inscrits</p>
                  </div>
                </div>
                <div className="bg-white rounded-[24px] p-5 border border-[#e0e0e0] shadow-sm flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-lg">👨‍🏫</div>
                  <div>
                    <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">{stats.teachers}</span>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Enseignants actifs</p>
                  </div>
                </div>
                <div className="bg-white rounded-[24px] p-5 border border-[#e0e0e0] shadow-sm flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-lg">🏛️</div>
                  <div>
                    <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">{stats.classes}</span>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Classes</p>
                  </div>
                </div>
                <div className="bg-white rounded-[24px] p-5 border border-[#e0e0e0] shadow-sm flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center text-lg">📌</div>
                  <div>
                    <span className="text-xl font-bold font-sans text-[#1a1a1a] leading-none">{stats.absenceRate}</span>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e] mt-1">Taux d'absence</p>
                  </div>
                </div>
              </div>

              {/* 30-Day Registration Trends Chart (Recharts) */}
              <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#e0e0e0]/60">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base">📊</span>
                      <h3 className="font-bold text-sm text-[#1a1a1a]">Inscriptions des 30 derniers jours</h3>
                    </div>
                    <p className="text-xs text-[#9e9e9e] font-medium mt-0.5">
                      Évolution du nombre d'inscriptions par rôle (enseignants vs parents)
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-[#f5f5f5] rounded-xl text-[#1a1a1a]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#1a1a1a]"></span>
                      <span>Enseignants : <strong>{last30DaysProfCount}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-[#f5f5f5] rounded-xl text-[#1a1a1a]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#f07d2a]"></span>
                      <span>Parents : <strong>{last30DaysParentCount}</strong></span>
                    </div>
                    <div className="text-xs font-bold px-3 py-1.5 bg-[#1a1a1a] text-white rounded-xl">
                      Total 30j : {last30DaysTotalCount}
                    </div>
                  </div>
                </div>

                <div className="h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={registrationData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="dateLabel" 
                        tick={{ fontSize: 10, fill: '#9e9e9e' }} 
                        axisLine={{ stroke: '#e0e0e0' }}
                        tickLine={false}
                        interval={3}
                      />
                      <YAxis 
                        allowDecimals={false} 
                        tick={{ fontSize: 10, fill: '#9e9e9e' }} 
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1a1a1a', 
                          borderRadius: '12px', 
                          border: 'none', 
                          color: '#ffffff',
                          fontSize: '12px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                        }}
                        itemStyle={{ color: '#ffffff' }}
                        formatter={(value: any, name: any) => [
                          value, 
                          name === 'profs' ? '👨‍🏫 Enseignants' : '👨‍👩‍👧 Parents'
                        ]}
                        labelFormatter={(label) => `📅 Date : ${label}`}
                      />
                      <Legend 
                        wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }}
                        formatter={(value) => value === 'profs' ? 'Enseignants' : 'Parents'}
                      />
                      <Bar dataKey="profs" name="profs" fill="#1a1a1a" radius={[6, 6, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="parents" name="parents" fill="#f07d2a" radius={[6, 6, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Layout Split */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Absences Table */}
                <div className="lg:col-span-2 bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-[#e0e0e0] font-bold text-[10px] text-[#9e9e9e] uppercase tracking-widest bg-[#f5f5f5]/30">
                    Absences récentes
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] bg-[#f5f5f5]/30">
                          <th className="py-2.5 px-4">Élève</th>
                          <th className="py-2.5 px-4">Classe</th>
                          <th className="py-2.5 px-4">Matière</th>
                          <th className="py-2.5 px-4">Date</th>
                          <th className="py-2.5 px-4">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
                        {recentAbsences.map(abs => (
                          <tr key={abs.id} className="hover:bg-[#f5f5f5]/20">
                            <td className="py-3 px-4 font-bold text-[#1a1a1a]">{abs.eleveNom}</td>
                            <td className="py-3 px-4 text-[#1a1a1a] font-medium">{abs.classe}</td>
                            <td className="py-3 px-4 text-[#1a1a1a] font-medium">{abs.matiere}</td>
                            <td className="py-3 px-4 text-[#9e9e9e] font-medium">{abs.date} à {abs.heure}</td>
                            <td className="py-3 px-4">
                              <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-bold uppercase ${
                                abs.statut === 'absent' ? 'bg-red-50 text-red-700' :
                                abs.statut === 'retard' ? 'bg-amber-50 text-amber-800' :
                                'bg-[#1a1a1a] text-white'
                              }`}>
                                {abs.statut}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {recentAbsences.length === 0 && (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-[#9e9e9e]">Aucune absence enregistrée</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sidebar Widget */}
                <div className="space-y-6">
                  {/* Results Progress Card */}
                  <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm p-5 space-y-4">
                    <h3 className="font-bold text-[10px] uppercase tracking-widest text-[#9e9e9e] mb-2">📈 Résultats T1</h3>
                    {[
                      { classe: '6e A', moy: 12.4 },
                      { classe: '5e B', moy: 11.8 },
                      { classe: '4e C', moy: 13.1 },
                      { classe: '3e A', moy: 10.9 },
                    ].map(item => (
                      <div key={item.classe} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold text-[#1a1a1a]">
                          <span>{item.classe}</span>
                          <span>{item.moy}/20</span>
                        </div>
                        <div className="h-1.5 bg-[#f5f5f5] rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[#1a1a1a] transition-all duration-500" 
                            style={{ width: `${(item.moy / 20) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Payments Card */}
                  <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm p-5">
                    <h3 className="font-bold text-[10px] uppercase tracking-widest text-[#9e9e9e] mb-2">💳 Frais collectés</h3>
                    <div className="text-2xl font-bold font-sans text-[#1a1a1a] leading-none mb-1">
                      {payments.reduce((acc, curr) => acc + curr.paye, 0).toLocaleString('fr-FR')} F
                    </div>
                    <span className="text-[10px] text-[#9e9e9e] font-semibold uppercase tracking-wide block">Sur cible globale de scolarité</span>
                    <div className="h-2 bg-[#f5f5f5] rounded-full overflow-hidden mt-3">
                      <div className="h-full bg-[#1a1a1a]" style={{ width: '87%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'validation' && (
            <div className="space-y-6">
              <p className="text-sm text-[#9e9e9e] font-medium">
                {pendingUsers.length} demande{pendingUsers.length > 1 ? 's' : ''} en attente d'approbation d'accès scolaire.
              </p>

              <div className="space-y-4">
                {pendingUsers.map(u => (
                  <div key={u.uid} className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm p-5 flex items-center justify-between gap-6 hover:border-[#1a1a1a]/30 transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm ${
                        u.role === 'prof' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {u.nom.substring(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-[#1a1a1a] flex items-center gap-2">
                          {u.nom}
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                            u.role === 'prof' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {u.role === 'prof' ? 'Professeur' : 'Parent'}
                          </span>
                        </div>
                        <div className="text-xs text-[#9e9e9e] mt-1 font-semibold">
                          {u.role === 'prof' ? `${u.matiere} · ${u.etablissement}` : `Enfant(s): ${u.enfants?.map(e => e.nom).join(', ')}`}
                        </div>
                        <div className="text-[10px] text-[#9e9e9e] mt-1 font-semibold">Tel: {u.tel} · Email: {u.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleViewUser(u)} 
                        className="p-2 border border-[#e0e0e0] text-[#1a1a1a] rounded-xl hover:border-[#1a1a1a] transition-all cursor-pointer"
                        title="Vérifier le dossier"
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={() => handleApproveUser(u)} 
                        className="p-2 bg-[#f5f5f5] text-[#1a1a1a] rounded-xl hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer"
                        title="Approuver le profil"
                      >
                        <Check size={16} />
                      </button>
                      <button 
                        onClick={() => handleRejectUser(u)} 
                        className="p-2 border border-[#e0e0e0] text-red-700 rounded-xl hover:bg-red-50 transition-all cursor-pointer"
                        title="Rejeter la demande"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                {pendingUsers.length === 0 && (
                  <div className="bg-white rounded-[24px] p-12 text-center text-[#9e9e9e] border border-dashed border-[#e0e0e0]">
                    🎉 Aucune demande d'inscription en attente !
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'eleves' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-sm text-[#757575] font-medium">
                    <strong>{students.filter(s => showArchivedStudents ? s.statut === 'archive' : s.statut !== 'archive').length}</strong> élève(s) {showArchivedStudents ? 'archivé(s)' : 'actif(s)'}.
                  </p>
                  <p className="text-xs text-[#9e9e9e]">
                    Le code d'association unique sert aux parents pour lier l'élève à leur compte.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => setShowArchivedStudents(!showArchivedStudents)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                      showArchivedStudents
                        ? 'bg-amber-100 border-amber-300 text-amber-900'
                        : 'bg-[#f5f5f5] border-[#e0e0e0] text-[#1a1a1a] hover:bg-[#e0e0e0]'
                    }`}
                  >
                    <Archive size={14} />
                    {showArchivedStudents ? 'Masquer les archivés' : `Afficher les archivés (${students.filter(s => s.statut === 'archive').length})`}
                  </button>
                  <button 
                    onClick={() => setIsImportModalOpen(true)}
                    className="bg-[#f5f5f5] hover:bg-[#1a1a1a] text-[#1a1a1a] hover:text-white border border-[#e0e0e0] font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-2 shadow-2xs cursor-pointer uppercase tracking-wider transition-all"
                  >
                    <FileSpreadsheet size={16} /> Importer Fichier (Excel / CSV)
                  </button>
                  <button 
                    onClick={() => setIsEleveModalOpen(true)}
                    className="bg-[#1a1a1a] hover:bg-black text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow-sm cursor-pointer uppercase tracking-widest transition-all"
                  >
                    <Plus size={16} /> Ajouter 1 élève
                  </button>
                </div>
              </div>

              {/* MOBILE CARDS VIEW */}
              <div className="md:hidden space-y-3">
                {students
                  .filter(s => showArchivedStudents ? s.statut === 'archive' : s.statut !== 'archive')
                  .map(s => (
                    <div key={s.id} className="bg-white rounded-2xl border border-[#e0e0e0] p-4 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center font-bold text-xs">
                            {s.nom.substring(0,2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-[#1a1a1a]">{s.nom}</div>
                            <div className="text-[11px] text-[#9e9e9e] font-semibold">Classe : {s.classe}</div>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          s.statut === 'archive' ? 'bg-gray-100 text-gray-700' :
                          s.parentUid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {s.statut === 'archive' ? 'Archivé' : s.parentUid ? 'Associé' : 'Non associé'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-2 border-t border-[#f0f0f0]">
                        <span className="bg-[#f5f5f5] font-mono font-bold px-2 py-0.5 rounded text-[11px] text-[#1a1a1a]">🔑 {s.code}</span>
                        <button
                          onClick={() => handleOpenLinkParentModal(s)}
                          className="px-2 py-1 text-[10px] font-bold bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white border border-[#e0e0e0] rounded-lg transition-colors cursor-pointer"
                        >
                          🔗 {s.parentUid ? 'Gérer Parent' : 'Associer Parent'}
                        </button>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f0f0f0]">
                        {s.statut === 'archive' ? (
                          <>
                            <button
                              onClick={() => handleRestoreEleve(s)}
                              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <RotateCcw size={14} /> Restaurer
                            </button>
                            <button
                              onClick={() => handleOpenDeleteModal(s, 'eleve')}
                              className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <Trash2 size={14} /> Supprimer déf.
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleOpenArchiveModal(s, 'eleve')}
                            className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <Archive size={14} /> Archiver
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                {students.filter(s => showArchivedStudents ? s.statut === 'archive' : s.statut !== 'archive').length === 0 && (
                  <div className="bg-white rounded-2xl p-8 text-center text-xs text-[#9e9e9e] border border-dashed border-[#e0e0e0]">
                    Aucun élève {showArchivedStudents ? 'archivé' : 'actif'} trouvé.
                  </div>
                )}
              </div>

              {/* DESKTOP TABLE VIEW */}
              <div className="hidden md:block bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] bg-[#f5f5f5]/30">
                      <th className="py-3 px-5">Élève</th>
                      <th className="py-3 px-5">Classe</th>
                      <th className="py-3 px-5">Code d'association</th>
                      <th className="py-3 px-5">Parent associé</th>
                      <th className="py-3 px-5">Statut</th>
                      <th className="py-3 px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
                    {students
                      .filter(s => showArchivedStudents ? s.statut === 'archive' : s.statut !== 'archive')
                      .map(s => (
                        <tr key={s.id} className="hover:bg-[#f5f5f5]/20">
                          <td className="py-3.5 px-5 font-bold text-[#1a1a1a] flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#f5f5f5] text-[#1a1a1a] flex items-center justify-center font-bold text-xs">
                              {s.nom.substring(0,2).toUpperCase()}
                            </div>
                            <div>
                              <div>{s.nom}</div>
                              {s.archiveRaison && <div className="text-[10px] text-amber-700 font-normal italic">Raison: {s.archiveRaison}</div>}
                            </div>
                          </td>
                          <td className="py-3.5 px-5 text-[#1a1a1a] font-semibold">{s.classe}</td>
                          <td className="py-3.5 px-5">
                            <span className="bg-[#f5f5f5] text-[#1a1a1a] font-mono font-bold px-2.5 py-1 rounded-lg text-xs border border-[#e0e0e0]">
                              🔑 {s.code}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-[#1a1a1a] font-semibold">
                            <div className="flex items-center gap-2">
                              <span>{s.parentNom || <span className="text-[#9e9e9e] italic font-normal">Non associé</span>}</span>
                              <button
                                onClick={() => handleOpenLinkParentModal(s)}
                                className="px-2.5 py-1 text-[10px] font-bold bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white border border-[#e0e0e0] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                                title="Associer ou modifier le parent"
                              >
                                🔗 {s.parentUid ? 'Gérer' : 'Associer'}
                              </button>
                            </div>
                          </td>
                          <td className="py-3.5 px-5">
                            <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-bold uppercase ${
                              s.statut === 'archive' ? 'bg-gray-100 text-gray-700 border border-gray-200' :
                              s.parentUid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              {s.statut === 'archive' ? '📦 Archivé' : s.parentUid ? '✓ Associé' : '⏳ Non associé'}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            {s.statut === 'archive' ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleRestoreEleve(s)}
                                  title="Restaurer l'élève dans la liste active"
                                  className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer text-[11px] font-bold flex items-center gap-1"
                                >
                                  <RotateCcw size={13} /> Restaurer
                                </button>
                                <button
                                  onClick={() => handleOpenDeleteModal(s, 'eleve')}
                                  title="Supprimer définitivement l'élève"
                                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleOpenArchiveModal(s, 'eleve')}
                                title="Archiver l'élève"
                                className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer text-[11px] font-bold flex items-center gap-1"
                              >
                                <Archive size={13} /> Archiver
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    {students.filter(s => showArchivedStudents ? s.statut === 'archive' : s.statut !== 'archive').length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-[#9e9e9e]">
                          Aucun élève {showArchivedStudents ? 'archivé' : 'actif'} trouvé.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'professeurs' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <p className="text-sm text-[#9e9e9e] font-medium">
                  {allUsers.filter(u => u.role === 'prof' && (showArchivedProfs ? u.statut === 'archive' : u.statut !== 'archive')).length} enseignant(s) {showArchivedProfs ? 'archivé(s)' : 'actif(s)'}.
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => setShowArchivedProfs(!showArchivedProfs)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                      showArchivedProfs
                        ? 'bg-amber-100 border-amber-300 text-amber-900'
                        : 'bg-[#f5f5f5] border-[#e0e0e0] text-[#1a1a1a] hover:bg-[#e0e0e0]'
                    }`}
                  >
                    <Archive size={14} />
                    {showArchivedProfs ? 'Masquer les désactivés' : `Afficher les désactivés (${allUsers.filter(u => u.role === 'prof' && u.statut === 'archive').length})`}
                  </button>
                  <button 
                    onClick={() => setIsProfModalOpen(true)}
                    className="bg-[#1a1a1a] hover:bg-black text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow-sm cursor-pointer uppercase tracking-widest transition-all"
                  >
                    <Plus size={16} /> Inviter un Professeur
                  </button>
                </div>
              </div>

              {/* MOBILE CARDS VIEW */}
              <div className="md:hidden space-y-3">
                {allUsers
                  .filter(u => u.role === 'prof' && (showArchivedProfs ? u.statut === 'archive' : u.statut !== 'archive'))
                  .map(prof => (
                    <div key={prof.uid} className="bg-white rounded-2xl border border-[#e0e0e0] p-4 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs">
                            {prof.nom.substring(0,2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-[#1a1a1a]">{prof.nom}</div>
                            <div className="text-[11px] text-[#9e9e9e] font-semibold">{prof.matiere || 'Multi-matières'}</div>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          prof.statut === 'archive' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {prof.statut === 'archive' ? 'Désactivé' : 'Actif'}
                        </span>
                      </div>

                      <div className="text-xs text-[#9e9e9e] space-y-1 pt-2 border-t border-[#f0f0f0]">
                        <div>Email : {prof.email}</div>
                        <div>Tél : {prof.tel}</div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f0f0f0]">
                        {prof.statut === 'archive' ? (
                          <>
                            <button
                              onClick={() => handleReactivateProf(prof)}
                              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <RotateCcw size={14} /> Réactiver
                            </button>
                            <button
                              onClick={() => handleOpenDeleteModal(prof, 'prof')}
                              className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <Trash2 size={14} /> Supprimer déf.
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleOpenArchiveModal(prof, 'prof')}
                            className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <Archive size={14} /> Désactiver
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                {allUsers.filter(u => u.role === 'prof' && (showArchivedProfs ? u.statut === 'archive' : u.statut !== 'archive')).length === 0 && (
                  <div className="bg-white rounded-2xl p-8 text-center text-xs text-[#9e9e9e] border border-dashed border-[#e0e0e0]">
                    Aucun enseignant {showArchivedProfs ? 'désactivé' : 'actif'} trouvé.
                  </div>
                )}
              </div>

              {/* DESKTOP TABLE VIEW */}
              <div className="hidden md:block bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] bg-[#f5f5f5]/30">
                      <th className="py-3 px-5">Professeur</th>
                      <th className="py-3 px-5">Matière Enseignée</th>
                      <th className="py-3 px-5">Téléphone</th>
                      <th className="py-3 px-5">Email</th>
                      <th className="py-3 px-5">Statut</th>
                      <th className="py-3 px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
                    {allUsers
                      .filter(u => u.role === 'prof' && (showArchivedProfs ? u.statut === 'archive' : u.statut !== 'archive'))
                      .map(prof => (
                        <tr key={prof.uid} className="hover:bg-[#f5f5f5]/20">
                          <td className="py-3.5 px-5 font-bold text-[#1a1a1a] flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs">
                              {prof.nom.substring(0,2).toUpperCase()}
                            </div>
                            {prof.nom}
                          </td>
                          <td className="py-3.5 px-5 text-[#1a1a1a] font-semibold">{prof.matiere || 'Multi-matières'}</td>
                          <td className="py-3.5 px-5 text-[#9e9e9e] font-mono font-semibold">{prof.tel}</td>
                          <td className="py-3.5 px-5 text-[#9e9e9e] font-medium">{prof.email}</td>
                          <td className="py-3.5 px-5">
                            <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-bold uppercase ${
                              prof.statut === 'archive' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {prof.statut === 'archive' ? '📦 Désactivé' : '✓ Actif'}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            {prof.statut === 'archive' ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleReactivateProf(prof)}
                                  title="Réactiver l'enseignant"
                                  className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer text-[11px] font-bold flex items-center gap-1"
                                >
                                  <RotateCcw size={13} /> Réactiver
                                </button>
                                <button
                                  onClick={() => handleOpenDeleteModal(prof, 'prof')}
                                  title="Supprimer définitivement le professeur"
                                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleOpenArchiveModal(prof, 'prof')}
                                title="Désactiver / Archiver le professeur"
                                className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer text-[11px] font-bold flex items-center gap-1"
                              >
                                <Archive size={13} /> Désactiver
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    {allUsers.filter(u => u.role === 'prof' && (showArchivedProfs ? u.statut === 'archive' : u.statut !== 'archive')).length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-[#9e9e9e]">
                          Aucun professeur {showArchivedProfs ? 'désactivé' : 'actif'} trouvé.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'classes' && (
            <ClassesView currentUser={user} studentsList={students} showToast={showToast} />
          )}

          {activeTab === 'emploi' && (
            <EmploiDuTempsView 
              currentUser={user} 
              classesList={Array.from(new Set(['6e A', '6e B', '5e A', '5e B', '4e C', '3e A', ...students.map(s => s.classe)]))} 
              showToast={showToast} 
            />
          )}

          {activeTab === 'bulletins' && (
            <BulletinView currentUser={user} studentsList={students} showToast={showToast} />
          )}

          {activeTab === 'paiements' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-[#9e9e9e] font-medium">Rapprochement financier des frais de scolarité.</p>
                <button
                  onClick={() => {
                    if (students.length > 0 && !payEleveId) setPayEleveId(students[0].id);
                    setIsPaiementModalOpen(true);
                  }}
                  className="bg-[#1a1a1a] hover:bg-black text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow-sm cursor-pointer uppercase tracking-widest transition-all"
                >
                  <Plus size={16} /> Enregistrer un versement
                </button>
              </div>
              <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] bg-[#f5f5f5]/30">
                      <th className="py-3 px-5">Élève</th>
                      <th className="py-3 px-5">Classe</th>
                      <th className="py-3 px-5">Scolarité totale</th>
                      <th className="py-3 px-5">Scolarité payée</th>
                      <th className="py-3 px-5">Solde restant</th>
                      <th className="py-3 px-5">Échéance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
                    {payments.map(p => (
                      <tr key={p.id} className="hover:bg-[#f5f5f5]/20">
                        <td className="py-3.5 px-5 font-bold text-[#1a1a1a]">{p.eleveNom}</td>
                        <td className="py-3.5 px-5 text-[#1a1a1a] font-semibold">{p.classe}</td>
                        <td className="py-3.5 px-5 text-[#9e9e9e] font-medium">{p.total.toLocaleString('fr-FR')} F</td>
                        <td className="py-3.5 px-5 font-bold text-[#1a1a1a]">{p.paye.toLocaleString('fr-FR')} F</td>
                        <td className={`py-3.5 px-5 font-bold ${p.solde > 0 ? 'text-amber-700' : 'text-[#9e9e9e]'}`}>
                          {p.solde.toLocaleString('fr-FR')} F
                        </td>
                        <td className="py-3.5 px-5 text-[#9e9e9e] font-semibold">{p.echeance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'annonces' && (
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 shadow-sm h-fit space-y-4">
                <h3 className="font-bold text-[10px] uppercase tracking-widest text-[#9e9e9e] mb-2 flex items-center gap-2">
                  <Send size={14} className="text-[#1a1a1a]" /> Nouvelle annonce
                </h3>
                <form onSubmit={handleSendAnnonce} className="space-y-4">
                  <div>
                    <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Destinataires</label>
                    <select 
                      className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none"
                      value={newAnnonceDest}
                      onChange={(e) => setNewAnnonceDest(e.target.value)}
                    >
                      <option>Tous (élèves, parents, profs)</option>
                      <option>Parents uniquement</option>
                      <option>Professeurs uniquement</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Objet</label>
                    <input 
                      type="text"
                      className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none text-[#1a1a1a]"
                      placeholder="Ex: Réunion d'information"
                      value={newAnnonceObjet}
                      onChange={(e) => setNewAnnonceObjet(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Message</label>
                    <textarea 
                      className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none h-28 resize-y text-[#1a1a1a]"
                      placeholder="Contenu du message..."
                      value={newAnnonceMsg}
                      onChange={(e) => setNewAnnonceMsg(e.target.value)}
                      required
                    ></textarea>
                  </div>
                  <button 
                    type="submit"
                    className="w-full bg-[#1a1a1a] hover:bg-black text-white font-bold py-3 px-4 rounded-xl text-xs shadow-md cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-widest transition-all"
                  >
                    <Send size={12} /> Diffuser l'annonce
                  </button>
                </form>
              </div>

              <div className="col-span-2 bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#e0e0e0] font-bold text-[10px] text-[#9e9e9e] uppercase tracking-widest bg-[#f5f5f5]/30">
                  Annonces récentes
                </div>
                <div className="divide-y divide-[#e0e0e0]/50">
                  {announcements.map(ann => (
                    <div key={ann.id} className="p-5 hover:bg-[#f5f5f5]/20 transition-all space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="font-bold text-sm text-[#1a1a1a]">{ann.objet}</div>
                        <span className="text-[10px] text-[#9e9e9e] font-semibold">{ann.date}</span>
                      </div>
                      <p className="text-xs text-[#1a1a1a] leading-relaxed font-medium">{ann.message}</p>
                      <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e]">
                        <span>Cible : {ann.destinataire}</span>
                        <span>·</span>
                        <span>👀 {ann.vues} vues</span>
                      </div>
                    </div>
                  ))}
                  {announcements.length === 0 && (
                    <div className="p-12 text-center text-[#9e9e9e] text-xs font-semibold">Aucune annonce générale disponible</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'messagerie' && (
            <MessagerieView currentUser={user} showToast={showToast} />
          )}

          {activeTab === 'audit' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                <div>
                  <h3 className="text-sm font-bold text-[#1a1a1a]">Journal d'audit administratif & traçabilité</h3>
                  <p className="text-xs text-[#9e9e9e] font-medium">Historique infalsifiable des modifications, archivages, désactivations et suppressions de comptes.</p>
                </div>
                <div className="bg-white border border-[#e0e0e0] px-3 py-1.5 rounded-xl text-xs font-bold text-[#1a1a1a] shadow-2xs">
                  {auditLogs.length} entrée(s) enregistrée(s)
                </div>
              </div>

              <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] bg-[#f5f5f5]/30">
                        <th className="py-3 px-5">Horodatage</th>
                        <th className="py-3 px-5">Action</th>
                        <th className="py-3 px-5">Cible</th>
                        <th className="py-3 px-5">Administrateur</th>
                        <th className="py-3 px-5">Détails / Raison</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
                      {auditLogs.map(log => (
                        <tr key={log.id} className="hover:bg-[#f5f5f5]/20">
                          <td className="py-3.5 px-5 font-mono text-[11px] text-[#9e9e9e]">
                            {new Date(log.timestamp).toLocaleString('fr-FR')}
                          </td>
                          <td className="py-3.5 px-5">
                            <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-bold uppercase ${
                              log.action.includes('archive') || log.action.includes('deactivate') ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                              log.action.includes('delete') ? 'bg-red-50 text-red-700 border border-red-200' :
                              'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 font-bold text-[#1a1a1a]">
                            {log.targetName} ({log.targetType})
                          </td>
                          <td className="py-3.5 px-5 font-semibold text-[#1a1a1a]">
                            {log.adminNom}
                          </td>
                          <td className="py-3.5 px-5 text-[#9e9e9e] font-medium">
                            {log.details || 'Aucun détail fourni'}
                          </td>
                        </tr>
                      ))}
                      {auditLogs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-xs text-[#9e9e9e]">
                            Aucun événement répertorié dans le journal d'audit.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
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
          onClick={() => setActiveTab('eleves')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'eleves' ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">🎒</span>
          <span>Élèves</span>
        </button>
        <button
          onClick={() => setActiveTab('professeurs')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'professeurs' ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">👨‍🏫</span>
          <span>Profs</span>
        </button>
        <button
          onClick={() => setActiveTab('paiements')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'paiements' ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">💳</span>
          <span>Finances</span>
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
              <h3 className="font-bold text-sm text-[#1a1a1a]">Menu d'Administration</h3>
              <button onClick={() => setIsMobilePlusMenuOpen(false)} className="p-1 text-[#9e9e9e] hover:text-[#1a1a1a]">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <button
                onClick={() => { setActiveTab('validation'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left flex items-center justify-between"
              >
                <span>✅ Validations</span>
                {pendingUsers.length > 0 && <span className="px-1.5 py-0.5 bg-red-500 text-white rounded-full text-[10px]">{pendingUsers.length}</span>}
              </button>
              <button
                onClick={() => { setActiveTab('classes'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                🏛️ Classes & Matières
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
                📋 Bulletins
              </button>
              <button
                onClick={() => { setActiveTab('annonces'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                📣 Annonces
              </button>
              <button
                onClick={() => { setActiveTab('messagerie'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                💬 Messagerie
              </button>
              <button
                onClick={() => { setActiveTab('audit'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left col-span-2"
              >
                📜 Journal d'audit & Traçabilité
              </button>
            </div>
            <div className="pt-2 border-t border-[#e0e0e0] flex items-center justify-between">
              <button
                onClick={() => { setIsResetModalOpen(true); setIsMobilePlusMenuOpen(false); }}
                className="text-xs font-bold text-red-600 flex items-center gap-1"
              >
                <Trash2 size={14} /> Réinitialiser Données
              </button>
              <button
                onClick={onLogout}
                className="text-xs font-bold text-gray-700 flex items-center gap-1"
              >
                <LogOut size={14} /> Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW ELEVE MODAL */}
      {isEleveModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[32px] border border-[#e0e0e0] max-w-md w-full p-8 shadow-2xl relative space-y-5">
            <h3 className="font-sans font-semibold text-base text-[#1a1a1a] tracking-tight">Ajouter un élève</h3>
            <p className="text-xs text-[#9e9e9e] font-medium leading-relaxed">Un dossier scolaire complet et un code d'association unique seront générés.</p>
            <form onSubmit={handleCreateEleve} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Prénom</label>
                  <input 
                    type="text" 
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]"
                    placeholder="Koffi"
                    value={newElevePrenom}
                    onChange={(e) => setNewElevePrenom(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Nom</label>
                  <input 
                    type="text" 
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]"
                    placeholder="YAO"
                    value={newEleveNom}
                    onChange={(e) => setNewEleveNom(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Classe d'intégration</label>
                <select 
                  className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none text-[#1a1a1a]"
                  value={newEleveClasse}
                  onChange={(e) => setNewEleveClasse(e.target.value)}
                >
                  <option>6e A</option>
                  <option>6e B</option>
                  <option>5e B</option>
                  <option>5e C</option>
                  <option>4e C</option>
                  <option>3e A</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-3">
                <button 
                  type="button" 
                  onClick={() => setIsEleveModalOpen(false)} 
                  className="px-4 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold text-[#1a1a1a] hover:bg-[#f5f5f5] transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-[#1a1a1a] hover:bg-black text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer"
                >
                  Ajouter l'élève
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW PENDING USER FILE MODAL */}
      {isViewUserModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[32px] border border-[#e0e0e0] max-w-lg w-full p-8 shadow-2xl space-y-5">
            <h3 className="font-sans font-semibold text-base text-[#1a1a1a] tracking-tight">
              Vérification de la demande — {selectedUser.nom}
            </h3>
            <p className="text-xs text-[#9e9e9e] font-medium leading-relaxed">Examinez les informations du demandeur d'accès.</p>

            <div className="p-4 bg-[#f5f5f5]/50 rounded-2xl space-y-2 border border-[#e0e0e0]/40 text-xs text-[#1a1a1a]">
              <div className="flex justify-between border-b border-[#e0e0e0]/40 pb-2">
                <span className="text-[#9e9e9e] font-semibold">Email</span>
                <span className="font-bold text-[#1a1a1a]">{selectedUser.email}</span>
              </div>
              <div className="flex justify-between border-b border-[#e0e0e0]/40 pb-2">
                <span className="text-[#9e9e9e] font-semibold">Téléphone</span>
                <span className="font-bold text-[#1a1a1a]">{selectedUser.tel}</span>
              </div>
              <div className="flex justify-between border-b border-[#e0e0e0]/40 pb-2">
                <span className="text-[#9e9e9e] font-semibold">Profil demandé</span>
                <span className="font-bold text-[#1a1a1a] capitalize">{selectedUser.role}</span>
              </div>
              {selectedUser.role === 'prof' && (
                <>
                  <div className="flex justify-between border-b border-[#e0e0e0]/40 pb-2">
                    <span className="text-[#9e9e9e] font-semibold">Matière Enseignée</span>
                    <span className="font-bold text-[#1a1a1a]">{selectedUser.matiere}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9e9e9e] font-semibold">Établissement d'origine</span>
                    <span className="font-bold text-[#1a1a1a]">{selectedUser.etablissement}</span>
                  </div>
                </>
              )}
            </div>

            {selectedUser.role === 'parent' && selectedUser.enfants && (
              <div className="space-y-3">
                <span className="text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest block">Enfant(s) réclamé(s)</span>
                {selectedUser.enfants.map((enf, idx) => {
                  const sMatch = students.find(s => s.code === enf.matricule);
                  return (
                    <div key={idx} className="p-3.5 bg-[#f5f5f5]/40 rounded-xl border border-[#e0e0e0]/30 flex items-center justify-between gap-4 text-xs">
                      <div>
                        <div className="font-bold text-[#1a1a1a]">{enf.nom}</div>
                        <div className="text-[#9e9e9e] text-[10px] font-semibold uppercase mt-0.5">Matricule: {enf.matricule || 'Aucun'} · Classe: {enf.classe || 'CM2'}</div>
                      </div>
                      <div>
                        {sMatch ? (
                          <span className="bg-[#1a1a1a] text-white border border-[#1a1a1a] px-2.5 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wide">
                            ✓ Fiche Élève trouvée
                          </span>
                        ) : (
                          <span className="bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wide">
                            ⚠ Élève Introuvable
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-4 border-t border-[#e0e0e0]/60">
              <button 
                onClick={() => setIsViewUserModalOpen(false)} 
                className="px-4 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold text-[#1a1a1a] hover:bg-[#f5f5f5] transition-all cursor-pointer"
              >
                Fermer
              </button>
              <button 
                onClick={() => handleRejectUser(selectedUser)} 
                className="px-4 py-2 border border-[#e0e0e0] text-red-700 rounded-xl text-xs font-bold hover:bg-red-50 transition-all cursor-pointer"
              >
                Refuser
              </button>
              <button 
                onClick={() => handleApproveUser(selectedUser)} 
                className="px-4 py-2 bg-[#1a1a1a] hover:bg-black text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer"
              >
                ✓ Valider & Activer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW PROFESSOR / TEACHER MODAL */}
      {isProfModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[32px] border border-[#e0e0e0] max-w-md w-full p-8 shadow-2xl space-y-5">
            <h3 className="font-sans font-semibold text-base text-[#1a1a1a] tracking-tight">Créer / Inviter un professeur</h3>
            <p className="text-xs text-[#9e9e9e] font-medium leading-relaxed">Création directe du compte enseignant actif dans la base de données.</p>
            <form onSubmit={handleInviteProf} className="space-y-4">
              <div>
                <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Nom complet</label>
                <input 
                  type="text" 
                  value={newProfNom}
                  onChange={(e) => setNewProfNom(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]" 
                  placeholder="Sékou COULIBALY" 
                  required
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Matière enseignée</label>
                <input 
                  type="text" 
                  value={newProfMatiere}
                  onChange={(e) => setNewProfMatiere(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]" 
                  placeholder="Mathématiques" 
                  required
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">E-mail</label>
                <input 
                  type="email" 
                  value={newProfEmail}
                  onChange={(e) => setNewProfEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]" 
                  placeholder="prof@ecoleplus.ci" 
                  required
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Téléphone</label>
                <input 
                  type="tel" 
                  value={newProfTel}
                  onChange={(e) => setNewProfTel(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]" 
                  placeholder="07 00 00 00 00" 
                />
              </div>
              <div className="flex gap-2 justify-end pt-3">
                <button type="button" onClick={() => setIsProfModalOpen(false)} className="px-4 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold text-[#1a1a1a] hover:bg-[#f5f5f5] transition-all cursor-pointer">
                  Annuler
                </button>
                <button type="submit" className="px-4 py-2 bg-[#1a1a1a] hover:bg-black text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer">
                  Créer l'enseignant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW PAYMENT / VERSEMENT MODAL */}
      {isPaiementModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[32px] border border-[#e0e0e0] max-w-md w-full p-8 shadow-2xl space-y-5">
            <h3 className="font-sans font-semibold text-base text-[#1a1a1a] tracking-tight">Enregistrer un versement de scolarité</h3>
            <p className="text-xs text-[#9e9e9e] font-medium leading-relaxed">Saisissez l'encaissement reçu de la part du parent ou de l'élève.</p>
            <form onSubmit={handleCreatePaiement} className="space-y-4">
              <div>
                <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Élève concerné</label>
                <select
                  value={payEleveId}
                  onChange={(e) => setPayEleveId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]"
                  required
                >
                  <option value="">-- Choisir un élève --</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.nom} ({s.classe}) — Reste: {((payments.find(p => p.eleveId === s.id)?.solde) ?? (s.scolariteTotal || 95000) - (s.scolaritePayee || 0)).toLocaleString('fr-FR')} F
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Montant versé (FCFA)</label>
                <input 
                  type="number"
                  value={payMontant}
                  onChange={(e) => setPayMontant(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]" 
                  placeholder="25000"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Moyen de paiement</label>
                  <select
                    value={payMode}
                    onChange={(e) => setPayMode(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]"
                  >
                    <option>Wave</option>
                    <option>Orange Money</option>
                    <option>Moov Money</option>
                    <option>MTN Money</option>
                    <option>Espèces</option>
                    <option>Chèque</option>
                    <option>Virement</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">N° de Reçu / Référence</label>
                  <input 
                    type="text"
                    value={payRecuNo}
                    onChange={(e) => setPayRecuNo(e.target.value)}
                    className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a]"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-3">
                <button type="button" onClick={() => setIsPaiementModalOpen(false)} className="px-4 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold text-[#1a1a1a] hover:bg-[#f5f5f5] transition-all cursor-pointer">
                  Annuler
                </button>
                <button type="submit" className="px-4 py-2 bg-[#1a1a1a] hover:bg-black text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer">
                  ✓ Enregistrer le versement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MASS STUDENT IMPORT MODAL */}
      <StudentImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        showToast={showToast}
        onSuccess={() => {
          // Additional success callback if needed
        }}
      />

      {/* RESET DATABASE CONFIRMATION MODAL */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-[32px] border border-[#e0e0e0] max-w-md w-full p-6 shadow-2xl space-y-5 text-center">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl border border-red-200 flex items-center justify-center mx-auto text-2xl">
              🧹
            </div>
            <div>
              <h3 className="font-sans font-bold text-lg text-[#1a1a1a] tracking-tight">
                Réinitialiser le Dashboard en Mode Vierge ?
              </h3>
              <p className="text-xs text-[#757575] leading-relaxed mt-2 font-medium">
                Cette action va effacer toutes les données de démonstration (élèves de test, notes, absences, paiements, annonces) de la base de données. 
                Votre tableau de bord sera totalement propre et prêt pour une utilisation réelle en production.
              </p>
            </div>

            <div className="p-3 bg-[#f5f5f5] rounded-xl border border-[#e0e0e0] text-[11px] text-[#1a1a1a] font-semibold text-left space-y-1">
              <div>✓ Élèves & Frais scolaires : vider à 0</div>
              <div>✓ Notes & Bulletins : vider à 0</div>
              <div>✓ Absences & Cahier de texte : vider à 0</div>
              <div>✓ Mode Production propre prêt pour la rentrée</div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setIsResetModalOpen(false)}
                disabled={isResetting}
                className="flex-1 py-2.5 border border-[#e0e0e0] hover:bg-[#f5f5f5] rounded-xl text-xs font-bold text-[#1a1a1a] transition-all cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmResetDatabase}
                disabled={isResetting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
              >
                {isResetting ? 'Réinitialisation...' : '✓ Oui, Vider la base'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PARENT LINK MODAL */}
      {isParentLinkModalOpen && selectedEleveForParentLink && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[32px] border border-[#e0e0e0] max-w-lg w-full p-7 shadow-2xl space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-sans font-bold text-lg text-[#1a1a1a] tracking-tight">
                  Associer un Parent à l'Élève
                </h3>
                <p className="text-xs text-[#9e9e9e] font-medium mt-1">
                  Élève: <span className="font-bold text-[#1a1a1a]">{selectedEleveForParentLink.nom}</span> ({selectedEleveForParentLink.classe}) · Code: <span className="font-mono bg-[#f5f5f5] px-1.5 py-0.5 rounded text-[11px] font-bold">{selectedEleveForParentLink.code}</span>
                </p>
              </div>
              <button
                onClick={() => setIsParentLinkModalOpen(false)}
                className="text-[#9e9e9e] hover:text-[#1a1a1a] p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {selectedEleveForParentLink.parentNom && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-900 font-medium">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block tracking-wider">Actuellement Associé</span>
                  <strong>{selectedEleveForParentLink.parentNom}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnlinkParentFromEleve(selectedEleveForParentLink)}
                  className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-[11px] font-bold rounded-xl transition-all cursor-pointer"
                >
                  Dissocier
                </button>
              </div>
            )}

            {/* Mode selector */}
            <div className="flex bg-[#f5f5f5] p-1 rounded-xl gap-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setParentLinkMode('select')}
                className={`flex-1 py-2 rounded-lg transition-all cursor-pointer text-center ${
                  parentLinkMode === 'select' ? 'bg-white text-[#1a1a1a] shadow-xs' : 'text-[#9e9e9e] hover:text-[#1a1a1a]'
                }`}
              >
                Parent Inscrit Existant
              </button>
              <button
                type="button"
                onClick={() => setParentLinkMode('create')}
                className={`flex-1 py-2 rounded-lg transition-all cursor-pointer text-center ${
                  parentLinkMode === 'create' ? 'bg-white text-[#1a1a1a] shadow-xs' : 'text-[#9e9e9e] hover:text-[#1a1a1a]'
                }`}
              >
                Créer & Lier un Parent
              </button>
            </div>

            <form onSubmit={handleLinkParentToEleve} className="space-y-4">
              {parentLinkMode === 'select' ? (
                <div>
                  <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1.5">
                    Sélectionner le compte Parent
                  </label>
                  {parentUsers.length > 0 ? (
                    <select
                      value={selectedParentUid}
                      onChange={(e) => setSelectedParentUid(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs bg-white focus:outline-none focus:border-[#1a1a1a] text-[#1a1a1a] font-medium"
                      required
                    >
                      <option value="">-- Choisir un parent --</option>
                      {parentUsers.map(p => (
                        <option key={p.uid} value={p.uid}>
                          {p.nom} ({p.email} — Tel: {p.tel})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                      Aucun compte parent inscrit pour l'instant. Choisissez l'onglet "Créer & Lier un Parent".
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Nom complet du Parent</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: M. Mamadou Diop"
                      value={newParentNom}
                      onChange={(e) => setNewParentNom(e.target.value)}
                      className="w-full px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Email</label>
                      <input
                        type="email"
                        required
                        placeholder="parent@exemple.com"
                        value={newParentEmail}
                        onChange={(e) => setNewParentEmail(e.target.value)}
                        className="w-full px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Téléphone</label>
                      <input
                        type="tel"
                        placeholder="+221 77 000 00 00"
                        value={newParentTel}
                        onChange={(e) => setNewParentTel(e.target.value)}
                        className="w-full px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-3 border-t border-[#e0e0e0]">
                <button
                  type="button"
                  onClick={() => setIsParentLinkModalOpen(false)}
                  className="px-4 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold text-[#1a1a1a] hover:bg-[#f5f5f5] transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1a1a1a] hover:bg-black text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer"
                >
                  ✓ Valider l'association
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ARCHIVE MODAL */}
      {isArchiveModalOpen && itemToArchive && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[32px] border border-[#e0e0e0] max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 text-amber-800 rounded-2xl flex items-center justify-center">
                <Archive size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#1a1a1a]">
                  {archiveType === 'eleve' ? `Archiver l'élève "${itemToArchive.nom}"` : `Désactiver le professeur "${itemToArchive.nom}"`}
                </h3>
                <p className="text-[11px] text-[#9e9e9e]">L'enregistrement sera retiré des vues actives tout en préservant son historique.</p>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                Raison de {archiveType === 'eleve' ? "l'archivage" : 'la désactivation'} (Obligatoire)
              </label>
              <textarea
                value={archiveRaisonInput}
                onChange={(e) => setArchiveRaisonInput(e.target.value)}
                placeholder="Ex: Fin de scolarité, départ volontaire, mutation..."
                className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] h-20 resize-none focus:outline-none focus:border-[#1a1a1a]"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#e0e0e0]">
              <button
                type="button"
                onClick={() => setIsArchiveModalOpen(false)}
                className="px-4 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold text-[#1a1a1a] hover:bg-[#f5f5f5] cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmArchive}
                className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Confirmer {archiveType === 'eleve' ? "l'archivage" : 'la désactivation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PERMANENT DELETE MODAL */}
      {isDeleteModalOpen && itemToDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[32px] border border-[#e0e0e0] max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 text-red-700 rounded-2xl flex items-center justify-center">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#1a1a1a]">
                  Suppression définitive de {itemToDelete.nom}
                </h3>
                <p className="text-[11px] text-red-600 font-semibold">Action irréversible et destructrice !</p>
              </div>
            </div>

            {isCheckingHistory ? (
              <div className="py-6 text-center text-xs text-[#9e9e9e]">Vérification de l'historique scolaire en cours...</div>
            ) : deleteBlockedReason ? (
              <div className="space-y-3">
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex items-start gap-2.5">
                  <ShieldAlert size={18} className="flex-shrink-0 mt-0.5" />
                  <div className="leading-relaxed font-medium">{deleteBlockedReason}</div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="px-4 py-2 bg-[#1a1a1a] text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Fermer et Archiver plutôt
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[#757575] leading-relaxed">
                  Cet élément ne possède aucun historique (notes, absences ou paiements). Pour confirmer la suppression définitive, veuillez saisir exactement le nom : <strong className="text-[#1a1a1a] font-mono">{itemToDelete.nom}</strong>
                </p>
                <input
                  type="text"
                  value={deleteConfirmNameInput}
                  onChange={(e) => setDeleteConfirmNameInput(e.target.value)}
                  placeholder={itemToDelete.nom}
                  className="w-full px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-red-600"
                />
                <div className="flex justify-end gap-2 pt-2 border-t border-[#e0e0e0]">
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="px-4 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold text-[#1a1a1a] hover:bg-[#f5f5f5] cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmPermanentDelete}
                    disabled={deleteConfirmNameInput.trim().toLowerCase() !== itemToDelete.nom.trim().toLowerCase()}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer ${
                      deleteConfirmNameInput.trim().toLowerCase() === itemToDelete.nom.trim().toLowerCase()
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    Supprimer définitivement
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
          onClick={() => setActiveTab('eleves')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'eleves' ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">🎒</span>
          <span>Élèves</span>
        </button>
        <button
          onClick={() => setActiveTab('professeurs')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'professeurs' ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">👨‍🏫</span>
          <span>Profs</span>
        </button>
        <button
          onClick={() => setActiveTab('validation')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold relative ${activeTab === 'validation' ? 'text-[#1a1a1a]' : 'text-[#9e9e9e]'}`}
        >
          <span className="text-base">✅</span>
          <span>Valid.</span>
          {pendingUsers.length > 0 && (
            <span className="absolute -top-1 right-1 bg-red-600 text-white text-[8px] font-bold px-1 rounded-full">
              {pendingUsers.length}
            </span>
          )}
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
              <h3 className="font-bold text-sm text-[#1a1a1a]">Menu Administration</h3>
              <button onClick={() => setIsMobilePlusMenuOpen(false)} className="p-1 text-[#9e9e9e] hover:text-[#1a1a1a]">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <button
                onClick={() => { setActiveTab('classes'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                🏛️ Classes & Matières
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
                onClick={() => { setActiveTab('paiements'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                💳 Frais scolaires
              </button>
              <button
                onClick={() => { setActiveTab('annonces'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                📢 Annonces
              </button>
              <button
                onClick={() => { setActiveTab('audit'); setIsMobilePlusMenuOpen(false); }}
                className="p-3 bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white rounded-xl text-left"
              >
                📋 Journal Audit
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
    </div>
  );
}

// Side tab navigation helper
function navigate(setter: (t: string) => void, tab: string) {
  setter(tab);
}
