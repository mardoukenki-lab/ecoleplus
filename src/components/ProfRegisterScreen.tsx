import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ALLOWED_ADMIN_EMAILS, getAdminNom } from './LoginScreen';

interface ProfRegisterScreenProps {
  onBack: () => void;
  showToast: (msg: string) => void;
}

export default function ProfRegisterScreen({ onBack, showToast }: ProfRegisterScreenProps) {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [tel, setTel] = useState('');
  const [matiere, setMatiere] = useState('');
  const [etablissement, setEtablissement] = useState('Lycée Moderne de Dabou');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom || !email || !tel || !matiere || !etablissement || !password) {
      showToast('⚠️ Merci de renseigner tous les champs obligatoires');
      return;
    }

    setLoading(true);
    try {
      const lowerEmail = email.toLowerCase().trim();

      let uid = '';
      try {
        const userCred = await createUserWithEmailAndPassword(auth, lowerEmail, password);
        uid = userCred.user.uid;
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          // If already created, attempt sign in
          const userCred = await signInWithEmailAndPassword(auth, lowerEmail, password);
          uid = userCred.user.uid;
        } else {
          throw authErr;
        }
      }

      // Check if teacher was pre-invited by admin
      const invitedDocId = `invited_${lowerEmail.replace(/[^a-z0-9]/g, '_')}`;
      let initialStatus: 'active' | 'pending' = 'pending';
      try {
        const invSnap = await getDoc(doc(db, 'users', invitedDocId));
        if (invSnap.exists() && invSnap.data()?.status === 'active') {
          initialStatus = 'active';
        }
      } catch (e) {
        console.warn('Check invited doc notice:', e);
      }

      // Save standard teacher profile
      const profile = {
        uid,
        nom,
        email: lowerEmail,
        role: 'prof' as const,
        status: initialStatus,
        tel,
        matiere,
        etablissement,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', uid), profile, { merge: true });

      if (initialStatus === 'active') {
        showToast(`🎉 Bienvenue Enseignant ${nom} ! Compte pré-approuvé et actif.`);
      } else {
        // Create a notification for admins
        const notifId = 'notif_' + Math.random().toString(36).substring(2, 9);
        await setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          userUid: 'all', // all admins
          icon: '👨‍🏫',
          bg: 'bg-blue-100 text-blue-700',
          text: `Nouvelle demande d'inscription Professeur — ${nom} (${matiere})`,
          time: 'à l\'instant',
          unread: true,
          createdAt: new Date().toISOString()
        });
        showToast('Demande envoyée ! Votre compte sera validé par l\'administration.');
      }

      onBack();
    } catch (err: any) {
      console.error('Prof registration error:', err);
      const code = err?.code || '';
      const msg = err?.message || '';
      let errorMsg = "Une erreur est survenue lors de l'inscription.";

      if (code === 'auth/network-request-failed' || msg.includes('network-request-failed')) {
        errorMsg = 'Problème de réseau ou connexion Internet interrompue. Veuillez réessayer.';
      } else if (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) {
        errorMsg = 'Cette adresse e-mail est déjà associée à un compte existant. Veuillez vous connecter.';
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        msg.includes('invalid-credential') ||
        msg.includes('wrong-password')
      ) {
        errorMsg = 'Ce compte existe déjà ou les identifiants sont invalides. Veuillez vous connecter.';
      } else if (code === 'auth/invalid-email' || msg.includes('invalid-email')) {
        errorMsg = 'L\'adresse e-mail saisie est invalide.';
      } else if (code === 'auth/weak-password' || msg.includes('weak-password')) {
        errorMsg = 'Le mot de passe doit contenir au moins 6 caractères.';
      } else if (msg) {
        errorMsg = msg.replace(/^Firebase:\s*Error\s*\(.*?\)\.?/i, '').trim() || "Une erreur est survenue lors de l'inscription.";
      }
      showToast(`❌ Échec de l'inscription: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#f5f5f5] flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-[32px] border border-[#e0e0e0] p-10 max-w-lg w-full my-8 shadow-sm">
        <button onClick={onBack} className="text-xs text-[#9e9e9e] font-semibold hover:text-[#1a1a1a] mb-5 inline-block cursor-pointer">
          ← Retour à la connexion
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#1a1a1a] text-white rounded-xl flex items-center justify-center text-lg font-semibold">👨‍🏫</div>
          <div>
            <h1 className="font-sans font-semibold text-xl text-[#1a1a1a] tracking-tight leading-none">Créer un compte Professeur</h1>
            <span className="text-xs text-[#9e9e9e] font-medium mt-1 block">Votre compte sera activé après validation administrative</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Nom complet</label>
            <input
              type="text"
              className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs focus:outline-none focus:border-[#1a1a1a] bg-[#f5f5f5]/20 placeholder:text-[#9e9e9e]/60 text-[#1a1a1a]"
              placeholder="M. Sébastien Traoré"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Email professionnel</label>
              <input
                type="email"
                className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs focus:outline-none focus:border-[#1a1a1a] bg-[#f5f5f5]/20 placeholder:text-[#9e9e9e]/60 text-[#1a1a1a]"
                placeholder="vous@akpanyschool.store"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Téléphone</label>
              <input
                type="tel"
                className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs focus:outline-none focus:border-[#1a1a1a] bg-[#f5f5f5]/20 placeholder:text-[#9e9e9e]/60 text-[#1a1a1a]"
                placeholder="07 00 00 00 00"
                value={tel}
                onChange={(e) => setTel(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Matière enseignée</label>
              <input
                type="text"
                className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs focus:outline-none focus:border-[#1a1a1a] bg-[#f5f5f5]/20 placeholder:text-[#9e9e9e]/60 text-[#1a1a1a]"
                placeholder="Ex: Sciences Physiques"
                value={matiere}
                onChange={(e) => setMatiere(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Établissement</label>
              <input
                type="text"
                className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs focus:outline-none focus:border-[#1a1a1a] bg-[#f5f5f5]/20 text-[#1a1a1a]"
                value={etablissement}
                onChange={(e) => setEtablissement(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Mot de passe</label>
            <input
              type="password"
              className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs focus:outline-none focus:border-[#1a1a1a] bg-[#f5f5f5]/20 placeholder:text-[#9e9e9e]/60 text-[#1a1a1a]"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#1a1a1a] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? 'Création...' : 'Créer mon compte →'}
          </button>
        </form>

        <p className="text-[10px] text-[#9e9e9e] font-medium mt-5 text-center leading-relaxed">
          Votre compte sera configuré en statut <strong className="text-[#1a1a1a]">« En attente de validation »</strong> jusqu'à l'approbation d'un administrateur.
        </p>
      </div>
    </div>
  );
}
