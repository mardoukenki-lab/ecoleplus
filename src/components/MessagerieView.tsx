import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where, setDoc, doc, getDocs } from 'firebase/firestore';
import { sendFcmNotificationToParent } from '../lib/fcm';
import { UserProfile, ChatMessage, Eleve, Note, Absence, Observation } from '../types';
import { 
  Send, User, ShieldCheck, Search, MessageSquare, CheckCheck, ArrowLeft,
  GraduationCap, BookOpen, Clock, AlertTriangle, CheckCircle, ChevronDown, 
  Calendar, FileText, Sparkles, Filter, Info, X
} from 'lucide-react';

export interface MessagerieViewProps {
  currentUser: UserProfile;
  showToast: (msg: string) => void;
  initialRecipientUid?: string;
  initialEleveId?: string;
  initialEleveNom?: string;
  initialEleveClasse?: string;
}

export interface ContactItem {
  uid: string;
  nom: string;
  role: string;
  subtext?: string;
  isChannel?: boolean;
  avatarText: string;
  matiere?: string;
  classe?: string;
  // Student context
  associatedStudents?: Array<{ id: string; nom: string; classe: string }>;
  unreadCount?: number;
}

const TOPICS = [
  { id: 'notes', label: 'Notes & Progrès', icon: '📈' },
  { id: 'devoirs', label: 'Devoirs & Travail', icon: '✍️' },
  { id: 'comportement', label: 'Comportement', icon: '🤝' },
  { id: 'assiduite', label: 'Assiduité & Retards', icon: '⏱️' },
  { id: 'rdv', label: 'Demande de RDV', icon: '📅' },
  { id: 'general', label: 'Échange Général', icon: '💬' },
];

export default function MessagerieView({
  currentUser,
  showToast,
  initialRecipientUid,
  initialEleveId,
  initialEleveNom,
  initialEleveClasse,
}: MessagerieViewProps) {
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactItem | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('general');
  const [sending, setSending] = useState(false);
  const [showStudentCard, setShowStudentCard] = useState(false);

  // Active student context in the chat
  const [selectedStudentId, setSelectedStudentId] = useState<string>(initialEleveId || '');
  const [allStudents, setAllStudents] = useState<Eleve[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [allAbsences, setAllAbsences] = useState<Absence[]>([]);
  const [allObservations, setAllObservations] = useState<Observation[]>([]);

  // Filter tabs
  const [classFilter, setClassFilter] = useState<string>('all');
  const [childFilter, setChildFilter] = useState<string>('all');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const etabId = currentUser.etablissementId || 'akpany-principal';

  // 1. Fetch students, notes, absences and observations for tracking context
  useEffect(() => {
    const unsubStudents = onSnapshot(collection(db, 'eleves'), (snap) => {
      const list: Eleve[] = [];
      snap.forEach((d) => {
        const data = d.data() as Eleve;
        if (!data.etablissementId || data.etablissementId === etabId) {
          list.push(data);
        }
      });
      setAllStudents(list);
    });

    const unsubNotes = onSnapshot(collection(db, 'notes'), (snap) => {
      const list: Note[] = [];
      snap.forEach((d) => list.push(d.data() as Note));
      setAllNotes(list);
    });

    const unsubAbsences = onSnapshot(collection(db, 'absences'), (snap) => {
      const list: Absence[] = [];
      snap.forEach((d) => list.push(d.data() as Absence));
      setAllAbsences(list);
    });

    const unsubObs = onSnapshot(collection(db, 'observations'), (snap) => {
      const list: Observation[] = [];
      snap.forEach((d) => list.push(d.data() as Observation));
      setAllObservations(list);
    });

    return () => {
      unsubStudents();
      unsubNotes();
      unsubAbsences();
      unsubObs();
    };
  }, [etabId]);

  // 2. Fetch users and build contextual contact list
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const userList: UserProfile[] = [];
      snap.forEach((d) => {
        const u = d.data() as UserProfile;
        if (u.status === 'active' && u.statut !== 'archive') {
          userList.push(u);
        }
      });

      const contactList: ContactItem[] = [];

      // Channel / Admin contacts
      if (currentUser.role === 'admin') {
        contactList.push({
          uid: 'all_profs',
          nom: '📢 Canal Tous les Enseignants',
          role: 'Canal général',
          subtext: 'Diffusion à tout le corps professoral',
          isChannel: true,
          avatarText: '📢',
        });
        contactList.push({
          uid: 'all_parents',
          nom: '📢 Canal Tous les Parents',
          role: 'Canal général',
          subtext: 'Diffusion à toutes les familles d\'élèves',
          isChannel: true,
          avatarText: '📢',
        });
      } else {
        contactList.push({
          uid: 'admin',
          nom: '🏫 Direction & Vie Scolaire',
          role: 'Administration',
          subtext: 'Direction, proviseur et secrétariat de l\'établissement',
          isChannel: true,
          avatarText: '🏫',
        });
      }

      // Case A: Current User is a PARENT
      // The parent wants to communicate with their children's teachers
      if (currentUser.role === 'parent') {
        // Find children of this parent
        const myKids = allStudents.filter(
          (s) => s.parentUid === currentUser.uid ||
            (currentUser.enfants && currentUser.enfants.some((k) => k.matricule === s.code || k.nom.toLowerCase() === s.nom.toLowerCase()))
        );

        const myKidsClasses = Array.from(new Set(myKids.map((k) => k.classe)));

        // Teachers teaching in those classes
        const profs = userList.filter((u) => u.role === 'prof' && u.uid !== currentUser.uid);

        profs.forEach((p) => {
          // Find which children this teacher teaches
          const taughtKids = myKids.filter((k) => {
            if (p.classe && p.classe === k.classe) return true;
            if (p.enseignements && p.enseignements.some((ens) => ens.classe === k.classe)) return true;
            return false;
          });

          const isDirectTeacher = taughtKids.length > 0;
          const taughtKidsNames = taughtKids.map((k) => `${k.nom} (${k.classe})`).join(', ');

          contactList.push({
            uid: p.uid,
            nom: p.nom,
            role: p.matiere ? `Professeur de ${p.matiere}` : 'Professeur',
            subtext: isDirectTeacher
              ? `Enseigne à : ${taughtKidsNames}`
              : p.classe ? `Classe : ${p.classe}` : p.email,
            avatarText: p.nom.substring(0, 2).toUpperCase(),
            matiere: p.matiere,
            classe: p.classe,
            associatedStudents: isDirectTeacher ? taughtKids.map((k) => ({ id: k.id, nom: k.nom, classe: k.classe })) : myKids.map((k) => ({ id: k.id, nom: k.nom, classe: k.classe })),
          });
        });
      }

      // Case B: Current User is a TEACHER (Prof)
      // The teacher wants to communicate with parents of students in their classes
      else if (currentUser.role === 'prof') {
        // Teacher classes
        const myClasses = new Set<string>();
        if (currentUser.classe) myClasses.add(currentUser.classe);
        if (currentUser.enseignements) {
          currentUser.enseignements.forEach((e) => myClasses.add(e.classe));
        }

        // Students in teacher's classes
        const myStudents = allStudents.filter((s) => myClasses.size === 0 || myClasses.has(s.classe));

        // Group students by parent
        const parentMap = new Map<string, { parentUser?: UserProfile; students: Eleve[] }>();

        myStudents.forEach((s) => {
          if (s.parentUid) {
            if (!parentMap.has(s.parentUid)) {
              const pUser = userList.find((u) => u.uid === s.parentUid);
              parentMap.set(s.parentUid, { parentUser: pUser, students: [] });
            }
            parentMap.get(s.parentUid)!.students.push(s);
          }
        });

        // Add parent contacts
        parentMap.forEach((val, parentUid) => {
          const parentName = val.parentUser?.nom || val.students[0]?.parentNom || 'Parent d\'élève';
          const studentsSummary = val.students.map((s) => `${s.nom} (${s.classe})`).join(', ');

          contactList.push({
            uid: parentUid,
            nom: parentName,
            role: 'Parent d\'élève',
            subtext: `Élève(s) : ${studentsSummary}`,
            avatarText: parentName.substring(0, 2).toUpperCase(),
            classe: val.students[0]?.classe,
            associatedStudents: val.students.map((s) => ({ id: s.id, nom: s.nom, classe: s.classe })),
          });
        });

        // Also add other registered parents who may not have parentUid populated yet
        userList
          .filter((u) => u.role === 'parent' && !parentMap.has(u.uid))
          .forEach((p) => {
            contactList.push({
              uid: p.uid,
              nom: p.nom,
              role: 'Parent d\'élève',
              subtext: p.email,
              avatarText: p.nom.substring(0, 2).toUpperCase(),
              associatedStudents: [],
            });
          });

        // Administration & Fellow teachers
        userList
          .filter((u) => u.role === 'admin' && u.uid !== currentUser.uid)
          .forEach((adm) => {
            contactList.push({
              uid: adm.uid,
              nom: adm.nom,
              role: 'Administration',
              subtext: adm.email,
              avatarText: adm.nom.substring(0, 2).toUpperCase(),
            });
          });
      }

      // Case C: Current User is ADMIN
      else {
        userList.forEach((u) => {
          if (u.uid !== currentUser.uid) {
            contactList.push({
              uid: u.uid,
              nom: u.nom,
              role: u.role === 'prof' ? `Prof. ${u.matiere || ''}` : u.role === 'parent' ? 'Parent d\'élève' : 'Administration',
              subtext: u.email,
              avatarText: u.nom.substring(0, 2).toUpperCase(),
              classe: u.classe,
              matiere: u.matiere,
            });
          }
        });
      }

      setContacts(contactList);

      // Select initial contact if provided
      if (initialRecipientUid) {
        const found = contactList.find((c) => c.uid === initialRecipientUid);
        if (found) {
          setSelectedContact(found);
          setMobileShowChat(true);
        }
      } else if (!selectedContact && contactList.length > 0) {
        setSelectedContact(contactList[0]);
      }
    });

    return () => unsubUsers();
  }, [allStudents, currentUser, initialRecipientUid, selectedContact]);

  // 3. Real-time messages listener scoped to establishment
  useEffect(() => {
    const qMessages = collection(db, 'messages');
    const unsub = onSnapshot(
      qMessages,
      (snap) => {
        const list: ChatMessage[] = [];
        snap.forEach((d) => {
          const msg = d.data() as ChatMessage;
          if (!msg.etablissementId || msg.etablissementId === etabId) {
            list.push(msg);
          }
        });
        list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        setMessages(list);
      },
      (err) => console.warn('Messages listener notice:', err)
    );

    return () => unsub();
  }, [etabId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedContact, mobileShowChat]);

  // Auto-detect and set student context when contact changes
  useEffect(() => {
    if (initialEleveId) {
      setSelectedStudentId(initialEleveId);
      return;
    }
    if (selectedContact?.associatedStudents && selectedContact.associatedStudents.length > 0) {
      setSelectedStudentId(selectedContact.associatedStudents[0].id);
    } else {
      setSelectedStudentId('');
    }
  }, [selectedContact, initialEleveId]);

  // Active student object
  const activeStudent = useMemo(() => {
    if (!selectedStudentId) return null;
    return allStudents.find((s) => s.id === selectedStudentId) || null;
  }, [selectedStudentId, allStudents]);

  // Student tracking stats for quick context card
  const studentTrackingStats = useMemo(() => {
    if (!activeStudent) return null;

    const studentNotes = allNotes.filter((n) => n.eleveId === activeStudent.id);
    const studentAbsences = allAbsences.filter((a) => a.eleveId === activeStudent.id);
    const studentObs = allObservations.filter((o) => o.eleveId === activeStudent.id);

    // Compute average
    const validGrades: number[] = [];
    studentNotes.forEach((n) => {
      if (n.devoir1 !== null) validGrades.push(n.devoir1);
      if (n.devoir2 !== null) validGrades.push(n.devoir2);
      if (n.compo !== null) validGrades.push(n.compo);
    });

    const average = validGrades.length > 0
      ? (validGrades.reduce((a, b) => a + b, 0) / validGrades.length).toFixed(1)
      : null;

    const unexcusedAbsences = studentAbsences.filter((a) => a.statut === 'absent').length;
    const retards = studentAbsences.filter((a) => a.statut === 'retard').length;

    return {
      average,
      notesCount: validGrades.length,
      unexcusedAbsences,
      retards,
      lastObservation: studentObs[studentObs.length - 1] || null,
      recentAbsences: studentAbsences.slice(-3),
    };
  }, [activeStudent, allNotes, allAbsences, allObservations]);

  // Filter messages for active conversation
  const activeConversationMessages = useMemo(() => {
    if (!selectedContact) return [];

    if (selectedContact.isChannel) {
      if (selectedContact.uid === 'admin') {
        return messages.filter(
          (m) =>
            (m.recipientUid === 'admin' && m.senderUid === currentUser.uid) ||
            (m.senderRole === 'admin' && m.recipientUid === currentUser.uid)
        );
      }
      return messages.filter((m) => m.recipientUid === selectedContact.uid);
    }

    return messages.filter(
      (m) =>
        (m.senderUid === currentUser.uid && m.recipientUid === selectedContact.uid) ||
        (m.senderUid === selectedContact.uid && m.recipientUid === currentUser.uid)
    );
  }, [messages, selectedContact, currentUser.uid]);

  // Quick message templates
  const quickTemplates = useMemo(() => {
    const studentName = activeStudent?.nom || 'votre enfant';
    const studentClass = activeStudent?.classe || '';

    if (currentUser.role === 'prof') {
      return [
        {
          label: 'Félicitations progrès',
          text: `Bonjour, je tiens à vous féliciter pour la belle progression et l'assiduité de ${studentName} récemment. Continuez à l'encourager ainsi !`,
        },
        {
          label: 'Rappel devoirs',
          text: `Bonjour, je me permets de vous informer que ${studentName} a accumulé quelques devoirs non rendus cette semaine. Merci de veiller au travail personnel à la maison.`,
        },
        {
          label: 'Baisse d\'attention',
          text: `Bonjour, j'ai remarqué une certaine baisse d'attention et des bavardages chez ${studentName} ces derniers temps. Pourrions-nous faire un point ensemble ?`,
        },
        {
          label: 'Proposition RDV',
          text: `Bonjour, je souhaiterais convenir d'un court entretien avec vous concernant le suivi pédagogique de ${studentName}. Quelles sont vos disponibilités cette semaine ?`,
        },
      ];
    } else {
      return [
        {
          label: 'Question devoirs',
          text: `Bonjour Monsieur/Madame, je vous écris pour solliciter quelques éclaircissements concernant le travail et les leçons demandées à ${studentName}.`,
        },
        {
          label: 'Point sur les notes',
          text: `Bonjour, je souhaiterais avoir vos retours et conseils pour aider ${studentName} à progresser dans votre matière suite à la dernière évaluation.`,
        },
        {
          label: 'Justification absence',
          text: `Bonjour, je vous informe que ${studentName} était absent(e) pour des raisons de santé. Le justificatif médical sera transmis dès son retour en classe.`,
        },
        {
          label: 'Demande de RDV',
          text: `Bonjour, serait-il possible de convenir d'un rendez-vous pour faire le point sur le travail et l'orientation de ${studentName} ? Merci beaucoup.`,
        },
      ];
    }
  }, [activeStudent, currentUser.role]);

  // Send message handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedContact) return;

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newMsg: ChatMessage = {
      id: msgId,
      etablissementId: etabId,
      senderUid: currentUser.uid,
      senderNom: currentUser.nom,
      senderRole: currentUser.role,
      recipientUid: selectedContact.uid,
      recipientNom: selectedContact.nom,
      text: textToSend,
      createdAt: new Date().toISOString(),
      eleveId: activeStudent?.id,
      eleveNom: activeStudent?.nom,
      eleveClasse: activeStudent?.classe,
      sujet: TOPICS.find((t) => t.id === selectedTopic)?.label || 'Général',
    };

    try {
      await setDoc(doc(db, 'messages', msgId), newMsg);

      // Notification to recipient
      const notifId = 'notif_msg_' + Date.now();
      const topicLabel = TOPICS.find((t) => t.id === selectedTopic)?.label || 'Suivi';
      const studentContextText = activeStudent ? ` [Élève: ${activeStudent.nom}]` : '';

      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        etablissementId: etabId,
        userUid: selectedContact.uid,
        icon: '💬',
        bg: 'bg-blue-100 text-blue-800',
        title: `Message de ${currentUser.nom}${studentContextText}`,
        text: `Nouveau message (${topicLabel}) : "${textToSend.substring(0, 50)}${textToSend.length > 50 ? '...' : ''}"`,
        time: 'À l\'instant',
        unread: true,
        type: 'message',
        eleveId: activeStudent?.id || null,
        eleveNom: activeStudent?.nom || null,
        channel: 'fcm_push',
        fcmStatus: 'delivered',
        createdAt: new Date().toISOString(),
      });

      // Dispatch Firebase Cloud Messaging (FCM) Push Notification to parent device
      await sendFcmNotificationToParent({
        parentUid: selectedContact.uid,
        childId: activeStudent?.id,
        childNom: activeStudent?.nom,
        title: `Message de ${currentUser.nom}${studentContextText}`,
        body: `Nouveau message (${topicLabel}) : "${textToSend.substring(0, 70)}${textToSend.length > 70 ? '...' : ''}"`,
        type: 'message',
        icon: '💬',
        etablissementId: etabId
      }).catch(e => console.warn('FCM message dispatch notice:', e));

      showToast('✉️ Message envoyé & notification push FCM transmise aux parents !');
    } catch (err: any) {
      console.error(err);
      showToast('❌ Échec de l\'envoi du message.');
    } finally {
      setSending(false);
    }
  };

  // Contacts filtered by search, class or child
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      // 1. Search Query
      const queryLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        c.nom.toLowerCase().includes(queryLower) ||
        c.role.toLowerCase().includes(queryLower) ||
        (c.subtext && c.subtext.toLowerCase().includes(queryLower)) ||
        (c.associatedStudents && c.associatedStudents.some((s) => s.nom.toLowerCase().includes(queryLower)));

      if (!matchesSearch) return false;

      // 2. Class filter for teachers
      if (currentUser.role === 'prof' && classFilter !== 'all') {
        if (c.isChannel) return true;
        const matchesClass = c.associatedStudents?.some((s) => s.classe === classFilter) || c.classe === classFilter;
        if (!matchesClass) return false;
      }

      // 3. Child filter for parents
      if (currentUser.role === 'parent' && childFilter !== 'all') {
        if (c.isChannel) return true;
        const matchesChild = c.associatedStudents?.some((s) => s.id === childFilter);
        if (!matchesChild) return false;
      }

      return true;
    });
  }, [contacts, searchQuery, classFilter, childFilter, currentUser.role]);

  // Get available classes for teacher filter
  const teacherClasses = useMemo(() => {
    const set = new Set<string>();
    if (currentUser.classe) set.add(currentUser.classe);
    if (currentUser.enseignements) currentUser.enseignements.forEach((e) => set.add(e.classe));
    return Array.from(set);
  }, [currentUser]);

  // Get available children for parent filter
  const parentChildren = useMemo(() => {
    if (currentUser.role !== 'parent') return [];
    return allStudents.filter(
      (s) => s.parentUid === currentUser.uid ||
        (currentUser.enfants && currentUser.enfants.some((k) => k.matricule === s.code || k.nom.toLowerCase() === s.nom.toLowerCase()))
    );
  }, [currentUser, allStudents]);

  return (
    <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm h-[640px] md:h-[680px] flex overflow-hidden">
      {/* LEFT SIDEBAR: CONTACTS LIST */}
      <div
        className={`w-full md:w-80 border-r border-[#e0e0e0] flex flex-col flex-shrink-0 bg-[#fafafa] ${
          mobileShowChat ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-3.5 md:p-4 border-b border-[#e0e0e0] space-y-2.5 bg-white">
          <div className="flex items-center justify-between">
            <div className="font-extrabold text-xs text-[#1a1a1a] flex items-center gap-1.5">
              <MessageSquare size={15} className="text-[#1a1a1a]" />
              <span>Messagerie de Suivi Élèves</span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {filteredContacts.length} contact(s)
            </span>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-[#9e9e9e]" />
            <input
              type="text"
              placeholder={
                currentUser.role === 'prof'
                  ? 'Rechercher un parent ou élève...'
                  : currentUser.role === 'parent'
                  ? 'Rechercher un enseignant...'
                  : 'Rechercher un contact...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-[#e0e0e0] rounded-xl text-xs bg-[#f5f5f5] text-[#1a1a1a] focus:bg-white focus:outline-none focus:border-[#1a1a1a] transition-all"
            />
          </div>

          {/* Context Filter Tabs: for Prof by Class, for Parent by Child */}
          {currentUser.role === 'prof' && teacherClasses.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-[11px]">
              <button
                type="button"
                onClick={() => setClassFilter('all')}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                  classFilter === 'all'
                    ? 'bg-[#1a1a1a] text-white'
                    : 'bg-[#f0f0f0] text-gray-600 hover:bg-gray-200'
                }`}
              >
                Toutes classes
              </button>
              {teacherClasses.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setClassFilter(c)}
                  className={`px-2 py-0.5 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                    classFilter === c
                      ? 'bg-[#1a1a1a] text-white'
                      : 'bg-[#f0f0f0] text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {currentUser.role === 'parent' && parentChildren.length > 1 && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-[11px]">
              <button
                type="button"
                onClick={() => setChildFilter('all')}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                  childFilter === 'all'
                    ? 'bg-[#1a1a1a] text-white'
                    : 'bg-[#f0f0f0] text-gray-600 hover:bg-gray-200'
                }`}
              >
                Tous mes enfants
              </button>
              {parentChildren.map((kid) => (
                <button
                  key={kid.id}
                  type="button"
                  onClick={() => setChildFilter(kid.id)}
                  className={`px-2 py-0.5 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                    childFilter === kid.id
                      ? 'bg-[#1a1a1a] text-white'
                      : 'bg-[#f0f0f0] text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <GraduationCap size={11} />
                  <span>{kid.nom.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Contacts Scrollable List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#e0e0e0]/50">
          {filteredContacts.map((c) => {
            const isSelected = selectedContact?.uid === c.uid;
            return (
              <div
                key={c.uid}
                onClick={() => {
                  setSelectedContact(c);
                  setMobileShowChat(true);
                }}
                className={`p-3.5 cursor-pointer transition-all flex items-start gap-3 ${
                  isSelected
                    ? 'bg-white border-l-4 border-l-[#1a1a1a] shadow-xs'
                    : 'hover:bg-white/80'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                    c.isChannel
                      ? 'bg-[#1a1a1a] text-white'
                      : isSelected
                      ? 'bg-[#1a1a1a] text-white'
                      : 'bg-[#e0e0e0] text-[#1a1a1a]'
                  }`}
                >
                  {c.avatarText}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <span className="font-bold text-xs text-[#1a1a1a] truncate">{c.nom}</span>
                    {c.matiere && (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded ml-1 flex-shrink-0">
                        {c.matiere}
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-[#707070] font-medium block truncate">
                    {c.role}
                  </span>

                  {c.subtext && (
                    <span className="text-[10px] text-gray-500 font-normal block truncate mt-0.5">
                      {c.subtext}
                    </span>
                  )}

                  {/* Associated students pill tags */}
                  {c.associatedStudents && c.associatedStudents.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.associatedStudents.slice(0, 2).map((s) => (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-gray-100 text-gray-700"
                        >
                          <GraduationCap size={9} /> {s.nom} ({s.classe})
                        </span>
                      ))}
                      {c.associatedStudents.length > 2 && (
                        <span className="text-[9px] text-gray-400 font-bold">
                          +{c.associatedStudents.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredContacts.length === 0 && (
            <div className="p-8 text-center text-xs text-[#9e9e9e] space-y-2">
              <MessageSquare size={24} className="mx-auto text-gray-300" />
              <p className="font-medium">Aucun contact trouvé</p>
              <p className="text-[10px] text-gray-400">Modifiez votre recherche ou vos filtres de classe.</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: ACTIVE CHAT */}
      <div
        className={`flex-1 flex flex-col bg-white w-full ${
          !mobileShowChat ? 'hidden md:flex' : 'flex'
        }`}
      >
        {selectedContact ? (
          <>
            {/* CHAT HEADER */}
            <div className="p-3 md:p-3.5 border-b border-[#e0e0e0] flex items-center justify-between bg-white gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileShowChat(false)}
                  className="md:hidden flex items-center gap-1 text-xs font-bold text-[#1a1a1a] p-1.5 rounded-xl bg-[#f5f5f5] border border-[#e0e0e0] hover:bg-[#e0e0e0] transition-all flex-shrink-0"
                >
                  <ArrowLeft size={15} />
                  <span className="hidden sm:inline">Contacts</span>
                </button>

                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    selectedContact.isChannel
                      ? 'bg-[#1a1a1a] text-white'
                      : 'bg-[#f5f5f5] text-[#1a1a1a] border border-[#e0e0e0]'
                  }`}
                >
                  {selectedContact.avatarText}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-xs text-[#1a1a1a] truncate">{selectedContact.nom}</h3>
                    {selectedContact.matiere && (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        {selectedContact.matiere}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#707070] font-medium truncate">
                    {selectedContact.subtext || selectedContact.role}
                  </p>
                </div>
              </div>

              {/* Student Context & Tracking Toggle */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Student Selector if multiple associated students */}
                {selectedContact.associatedStudents && selectedContact.associatedStudents.length > 1 && (
                  <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-[10px]">
                    <span className="font-bold text-gray-500">Élève :</span>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="bg-transparent font-bold text-gray-800 focus:outline-none cursor-pointer"
                    >
                      {selectedContact.associatedStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nom} ({s.classe})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Single student badge */}
                {selectedContact.associatedStudents && selectedContact.associatedStudents.length === 1 && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-lg">
                    <GraduationCap size={12} />
                    <span>{selectedContact.associatedStudents[0].nom} ({selectedContact.associatedStudents[0].classe})</span>
                  </span>
                )}

                {/* Toggle Student Tracking Card */}
                {activeStudent && (
                  <button
                    type="button"
                    onClick={() => setShowStudentCard(!showStudentCard)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                      showStudentCard
                        ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                    }`}
                    title="Afficher/masquer la synthèse des notes et assiduité de l'élève"
                  >
                    <BookOpen size={12} />
                    <span className="hidden sm:inline">Fiche de suivi</span>
                  </button>
                )}

                <span className="hidden lg:inline-block text-[9px] font-bold uppercase tracking-widest text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  ● En direct
                </span>
              </div>
            </div>

            {/* COLLAPSIBLE STUDENT TRACKING CONTEXT CARD */}
            {showStudentCard && activeStudent && studentTrackingStats && (
              <div className="bg-gradient-to-r from-gray-50 to-blue-50/40 border-b border-[#e0e0e0] p-3.5 text-xs animate-fadeIn">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[#1a1a1a] text-white flex items-center justify-center text-xs">
                      🎓
                    </div>
                    <div>
                      <span className="font-extrabold text-[#1a1a1a] text-xs">
                        Suivi scolaire de {activeStudent.nom}
                      </span>
                      <span className="text-[10px] text-gray-500 font-semibold ml-2">
                        Classe de {activeStudent.classe}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowStudentCard(false)}
                    className="text-gray-400 hover:text-gray-700 cursor-pointer p-1"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-2xs">
                    <div className="text-[9px] font-bold uppercase text-gray-400">Moyenne estimée</div>
                    <div className="font-extrabold text-sm text-[#1a1a1a]">
                      {studentTrackingStats.average ? `${studentTrackingStats.average}/20` : '—'}
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-2xs">
                    <div className="text-[9px] font-bold uppercase text-gray-400">Notes enregistrées</div>
                    <div className="font-extrabold text-sm text-emerald-700">
                      {studentTrackingStats.notesCount} note(s)
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-2xs">
                    <div className="text-[9px] font-bold uppercase text-gray-400">Absences non justifiées</div>
                    <div className={`font-extrabold text-sm ${studentTrackingStats.unexcusedAbsences > 0 ? 'text-amber-800' : 'text-gray-700'}`}>
                      {studentTrackingStats.unexcusedAbsences}
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-2xs">
                    <div className="text-[9px] font-bold uppercase text-gray-400">Retards</div>
                    <div className="font-extrabold text-sm text-gray-700">
                      {studentTrackingStats.retards}
                    </div>
                  </div>
                </div>

                {studentTrackingStats.lastObservation && (
                  <div className="mt-2 bg-white p-2 rounded-xl border border-gray-200 text-[11px] flex items-center gap-2">
                    <span className="font-bold text-gray-500 uppercase text-[9px] shrink-0">Dernière remarque :</span>
                    <span className="font-semibold text-gray-800 truncate">
                      "{studentTrackingStats.lastObservation.description || studentTrackingStats.lastObservation.titre}"
                    </span>
                    <span className="text-[10px] text-gray-400 ml-auto shrink-0">
                      par {studentTrackingStats.lastObservation.auteurNom}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* CHAT MESSAGES BODY */}
            <div className="flex-1 p-3 md:p-5 overflow-y-auto space-y-3 bg-[#fafafa]">
              {activeConversationMessages.map((m) => {
                const isMe = m.senderUid === currentUser.uid;
                const formattedTime = m.createdAt
                  ? new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                  : '';
                const formattedDate = m.createdAt
                  ? new Date(m.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
                  : '';

                return (
                  <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="text-[9px] font-bold text-[#9e9e9e] mb-1 px-1 flex items-center gap-1.5">
                      <span>{isMe ? 'Vous' : m.senderNom}</span>
                      <span>·</span>
                      <span>{formattedDate} {formattedTime}</span>
                      {m.sujet && (
                        <span className="px-1.5 py-0.2 rounded bg-gray-200/80 text-gray-700 text-[8px] font-extrabold">
                          {m.sujet}
                        </span>
                      )}
                      {m.eleveNom && (
                        <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-900 text-[8px] font-extrabold flex items-center gap-0.5">
                          <GraduationCap size={9} /> {m.eleveNom}
                        </span>
                      )}
                    </div>
                    <div
                      className={`p-3 md:p-3.5 rounded-2xl max-w-[88%] md:max-w-lg text-xs leading-relaxed shadow-2xs ${
                        isMe
                          ? 'bg-[#1a1a1a] text-white rounded-tr-none'
                          : 'bg-white border border-[#e0e0e0] text-[#1a1a1a] rounded-tl-none'
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })}

              {activeConversationMessages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 text-[#9e9e9e]">
                  <div className="w-12 h-12 rounded-2xl bg-[#f0f0f0] flex items-center justify-center text-xl">
                    💬
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-[#1a1a1a]">
                      Démarrer un échange de suivi avec {selectedContact.nom}
                    </p>
                    <p className="text-[11px] max-w-sm text-gray-500">
                      Discutez du travail, des notes, de l'assiduité ou du comportement de l'élève en toute confidentialité.
                    </p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* CHAT FOOTER: TOPIC SELECTOR & QUICK TEMPLATES */}
            <div className="border-t border-[#e0e0e0] bg-white p-2.5 md:p-3.5 space-y-2">
              {/* Topic Selector Bar */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[10px]">
                <span className="font-bold text-gray-400 uppercase text-[9px] shrink-0">Objet :</span>
                {TOPICS.map((top) => (
                  <button
                    key={top.id}
                    type="button"
                    onClick={() => setSelectedTopic(top.id)}
                    className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                      selectedTopic === top.id
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    <span>{top.icon}</span>
                    <span>{top.label}</span>
                  </button>
                ))}
              </div>

              {/* Quick Template Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[10px]">
                <span className="font-bold text-gray-400 uppercase text-[9px] shrink-0 flex items-center gap-0.5">
                  <Sparkles size={10} /> Modèles :
                </span>
                {quickTemplates.map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setInputText(tpl.text)}
                    className="px-2 py-0.5 rounded-md bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 text-[10px] font-medium transition-colors whitespace-nowrap cursor-pointer"
                    title={tpl.text}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>

              {/* Input Form */}
              <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    activeStudent
                      ? `Écrire au sujet de ${activeStudent.nom}...`
                      : `Écrire à ${selectedContact.nom}...`
                  }
                  className="flex-1 px-3 md:px-4 py-2.5 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !inputText.trim()}
                  className="bg-[#1a1a1a] hover:bg-black disabled:opacity-50 text-white px-4 md:px-5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold flex-shrink-0"
                >
                  <Send size={14} />
                  <span className="hidden sm:inline">Envoyer</span>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-xs text-[#9e9e9e] p-6 space-y-2">
            <MessageSquare size={32} className="text-gray-300" />
            <p className="font-bold text-gray-700">Sélectionnez un contact pour démarrer la discussion</p>
            <p className="text-[11px] text-gray-400">Échangez directement sur le suivi et les progrès des élèves.</p>
          </div>
        )}
      </div>
    </div>
  );
}
