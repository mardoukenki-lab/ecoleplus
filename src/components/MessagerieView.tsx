import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where, addDoc, setDoc, doc } from 'firebase/firestore';
import { UserProfile, ChatMessage } from '../types';
import { Send, User, ShieldCheck, Search, MessageSquare, CheckCheck } from 'lucide-react';

interface MessagerieViewProps {
  currentUser: UserProfile;
  showToast: (msg: string) => void;
}

interface ContactItem {
  uid: string; // user UID or channel id 'admin' | 'all_profs' | 'all_parents'
  nom: string;
  role: string;
  subtext?: string;
  isChannel?: boolean;
}

export default function MessagerieView({ currentUser, showToast }: MessagerieViewProps) {
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch available contacts from Firestore users collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const userList: UserProfile[] = [];
      snap.forEach((d) => userList.push(d.data() as UserProfile));

      const contactList: ContactItem[] = [];

      // Add channel contacts depending on user role
      if (currentUser.role === 'admin') {
        contactList.push({
          uid: 'all_profs',
          nom: '📢 Canal Enseignants',
          role: 'Canal général',
          subtext: 'Envoyer à tous les professeurs',
          isChannel: true,
        });
        contactList.push({
          uid: 'all_parents',
          nom: '📢 Canal Parents',
          role: 'Canal général',
          subtext: 'Envoyer à tous les parents d\'élèves',
          isChannel: true,
        });
      } else {
        contactList.push({
          uid: 'admin',
          nom: '🏫 Administration (Direction)',
          role: 'Direction',
          subtext: 'Contacter le secrétariat & proviseur',
          isChannel: true,
        });
      }

      // Add actual users (excluding current user)
      userList.forEach((u) => {
        if (u.uid !== currentUser.uid && u.status === 'active') {
          contactList.push({
            uid: u.uid,
            nom: u.nom,
            role: u.role === 'admin' ? 'Administrateur' : u.role === 'prof' ? `Prof. ${u.matiere || ''}` : 'Parent d\'élève',
            subtext: u.email,
          });
        }
      });

      setContacts(contactList);

      // Auto-select first contact if none selected
      if (!selectedContact && contactList.length > 0) {
        setSelectedContact(contactList[0]);
      }
    });

    return () => unsub();
  }, [currentUser.uid, currentUser.role]);

  // 2. Real-time messages listener
  useEffect(() => {
    const qMessages = collection(db, 'messages');
    const unsub = onSnapshot(
      qMessages,
      (snap) => {
        const list: ChatMessage[] = [];
        snap.forEach((d) => {
          const msg = d.data() as ChatMessage;
          list.push(msg);
        });
        // Sort chronologically
        list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        setMessages(list);
      },
      (err) => console.warn('Messages listener notice:', err)
    );

    return () => unsub();
  }, [currentUser.uid]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedContact]);

  // Filter messages for current active conversation
  const activeConversationMessages = messages.filter((m) => {
    if (!selectedContact) return false;

    if (selectedContact.isChannel) {
      if (selectedContact.uid === 'admin') {
        return (
          (m.recipientUid === 'admin' && m.senderUid === currentUser.uid) ||
          (m.senderRole === 'admin' && m.recipientUid === currentUser.uid)
        );
      }
      return m.recipientUid === selectedContact.uid;
    }

    return (
      (m.senderUid === currentUser.uid && m.recipientUid === selectedContact.uid) ||
      (m.senderUid === selectedContact.uid && m.recipientUid === currentUser.uid)
    );
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedContact) return;

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newMsg: ChatMessage = {
      id: msgId,
      senderUid: currentUser.uid,
      senderNom: currentUser.nom,
      senderRole: currentUser.role,
      recipientUid: selectedContact.uid,
      recipientNom: selectedContact.nom,
      text: textToSend,
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'messages', msgId), newMsg);

      // Create notification for target user or channel
      const notifId = 'notif_msg_' + Date.now();
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        userUid: selectedContact.uid,
        icon: '💬',
        bg: 'bg-blue-100 text-blue-700',
        text: `Nouveau message de ${currentUser.nom} : "${textToSend.substring(0, 40)}${textToSend.length > 40 ? '...' : ''}"`,
        time: 'À l\'instant',
        unread: true,
        createdAt: new Date().toISOString(),
      });

      showToast('✉️ Message transmis en direct !');
    } catch (err: any) {
      console.error(err);
      showToast('❌ Échec de l\'envoi du message.');
    } finally {
      setSending(false);
    }
  };

  const filteredContacts = contacts.filter(
    (c) =>
      c.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.subtext && c.subtext.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm h-[560px] flex overflow-hidden">
      {/* Left sidebar: Contacts list */}
      <div className="w-72 border-r border-[#e0e0e0] flex flex-col flex-shrink-0 bg-[#f5f5f5]/30">
        <div className="p-4 border-b border-[#e0e0e0] space-y-3">
          <div className="font-bold text-[10px] text-[#9e9e9e] uppercase tracking-widest flex items-center gap-1.5">
            <MessageSquare size={13} /> Messagerie en Direct
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-[#9e9e9e]" />
            <input
              type="text"
              placeholder="Rechercher un contact..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#e0e0e0]/40">
          {filteredContacts.map((c) => {
            const isSelected = selectedContact?.uid === c.uid;
            return (
              <div
                key={c.uid}
                onClick={() => setSelectedContact(c)}
                className={`p-3.5 cursor-pointer transition-all flex items-center gap-3 ${
                  isSelected ? 'bg-white border-l-4 border-l-[#1a1a1a] shadow-2xs' : 'hover:bg-[#f5f5f5]/60'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    c.isChannel ? 'bg-[#1a1a1a] text-white' : 'bg-[#e0e0e0] text-[#1a1a1a]'
                  }`}
                >
                  {c.isChannel ? '📢' : c.nom.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-[#1a1a1a] truncate">{c.nom}</span>
                  </div>
                  <span className="text-[10px] text-[#9e9e9e] font-semibold block truncate">{c.role}</span>
                </div>
              </div>
            );
          })}
          {filteredContacts.length === 0 && (
            <div className="p-6 text-center text-xs text-[#9e9e9e]">Aucun contact trouvé</div>
          )}
        </div>
      </div>

      {/* Right panel: Active Chat */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedContact ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-[#e0e0e0] flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${
                    selectedContact.isChannel ? 'bg-[#1a1a1a] text-white' : 'bg-[#f5f5f5] text-[#1a1a1a] border border-[#e0e0e0]'
                  }`}
                >
                  {selectedContact.isChannel ? '📢' : selectedContact.nom.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-xs text-[#1a1a1a]">{selectedContact.nom}</h3>
                  <p className="text-[10px] text-[#9e9e9e] font-medium">{selectedContact.subtext || selectedContact.role}</p>
                </div>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                ● En direct via Firestore
              </span>
            </div>

            {/* Chat Body */}
            <div className="flex-1 p-5 overflow-y-auto space-y-3.5 bg-[#f5f5f5]/15">
              {activeConversationMessages.map((m) => {
                const isMe = m.senderUid === currentUser.uid;
                const formattedTime = m.createdAt
                  ? new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                  : '';

                return (
                  <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="text-[9px] font-bold text-[#9e9e9e] mb-1 px-1">
                      {isMe ? 'Vous' : m.senderNom} · {formattedTime}
                    </div>
                    <div
                      className={`p-3.5 rounded-2xl max-w-md text-xs leading-relaxed shadow-2xs ${
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
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 text-[#9e9e9e]">
                  <MessageSquare size={32} className="text-[#e0e0e0]" />
                  <p className="text-xs font-semibold text-[#1a1a1a]">Aucun message échangé pour le moment</p>
                  <p className="text-[11px] max-w-xs">
                    Posez vos questions ou envoyez une consigne en direct. Les messages sont enregistrés en temps réel.
                  </p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Footer / Input */}
            <form onSubmit={handleSendMessage} className="p-3.5 border-t border-[#e0e0e0] flex gap-2.5 bg-white">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Écrire à ${selectedContact.nom}...`}
                className="flex-1 px-4 py-2.5 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                className="bg-[#1a1a1a] hover:bg-black disabled:opacity-50 text-white px-5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold"
              >
                <Send size={15} />
              </button>
            </form>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-[#9e9e9e]">
            Sélectionnez un contact pour démarrer la discussion
          </div>
        )}
      </div>
    </div>
  );
}
