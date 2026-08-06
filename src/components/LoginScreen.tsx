import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export const ALLOWED_ADMIN_EMAILS = [
  'mardoukenki@gmail.com'
];

export const getAdminNom = (email: string) => {
  const lower = email.toLowerCase().trim();
  if (lower === 'mardoukenki@gmail.com') return 'Administration Générale';
  return 'Administrateur';
};

interface LoginScreenProps {
  onLoginSuccess: (userProfile: any) => void;
  onShowProfReg: () => void;
  onShowParentReg: () => void;
  showToast: (msg: string) => void;
}

export default function LoginScreen({ onLoginSuccess, onShowProfReg, onShowParentReg, showToast }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSending, setResetSending] = useState(false);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      showToast('⚠️ Veuillez renseigner votre e-mail ci-dessus puis cliquer sur Mot de passe oublié.');
      return;
    }
    setResetSending(true);
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      showToast(`📧 E-mail de réinitialisation envoyé à ${email.trim().toLowerCase()}. Veuillez vérifier votre boîte de réception.`);
    } catch (err: any) {
      console.error(err);
      let msg = 'Erreur lors de l\'envoi de la réinitialisation.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
        msg = 'Aucun compte associé à cette adresse e-mail.';
      }
      showToast(`❌ ${msg}`);
    } finally {
      setResetSending(false);
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      showToast('⚠️ Veuillez remplir l\'email et le mot de passe');
      return;
    }

    const lowerEmail = email.toLowerCase().trim();
    const isAdminEmail = ALLOWED_ADMIN_EMAILS.includes(lowerEmail);

    setLoading(true);
    try {
      // Authenticate with Firebase Auth using provided credentials
      const userCred = await signInWithEmailAndPassword(auth, lowerEmail, password);
      const uid = userCred.user.uid;

      // Get user document
      let userDoc = null;
      try {
        userDoc = await getDoc(doc(db, 'users', uid));
      } catch (docErr) {
        console.warn('LoginScreen user doc fetch notice:', docErr);
      }

      if (!userDoc || !userDoc.exists()) {
        if (isAdminEmail) {
          const adminNom = getAdminNom(lowerEmail);
          const adminProfile = {
            uid,
            nom: adminNom,
            email: lowerEmail,
            role: 'admin' as const,
            status: 'active' as const,
            tel: '07 00 00 00 00',
            createdAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'users', uid), adminProfile, { merge: true });
          showToast(`🏛️ Bienvenue ${adminNom} (Administrateur)`);
          onLoginSuccess(adminProfile);
          return;
        } else {
          await auth.signOut();
          showToast('❌ Aucun profil trouvé pour ce compte. Veuillez vous inscrire.');
          return;
        }
      }

      let profile = userDoc.data();

      if (isAdminEmail && profile.role !== 'admin') {
        profile = { ...profile, role: 'admin', status: 'active' };
        await setDoc(doc(db, 'users', uid), profile, { merge: true });
      }

      if (profile.status === 'pending') {
        showToast('🟡 Votre compte est en attente de validation par l\'administration.');
        await auth.signOut();
        setLoading(false);
        return;
      } else if (profile.status === 'refused') {
        showToast('❌ Votre demande d\'accès a été refusée par l\'administration.');
        await auth.signOut();
        setLoading(false);
        return;
      }

      onLoginSuccess(profile);
    } catch (err: any) {
      console.error('Login error:', err);
      const code = err?.code || '';
      const msg = err?.message || '';
      let errorMsg = 'Identifiants invalides ou problème de connexion.';

      if (code === 'auth/network-request-failed' || msg.includes('network-request-failed')) {
        errorMsg = 'Problème de réseau ou connexion Internet interrompue. Veuillez réessayer.';
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found' ||
        msg.includes('invalid-credential') ||
        msg.includes('wrong-password') ||
        msg.includes('user-not-found')
      ) {
        errorMsg = 'Adresse e-mail ou mot de passe incorrect.';
      } else if (code === 'auth/too-many-requests' || msg.includes('too-many-requests')) {
        errorMsg = 'Trop de tentatives de connexion. Veuillez patienter un instant.';
      } else if (code === 'auth/weak-password' || msg.includes('weak-password')) {
        errorMsg = 'Le mot de passe doit contenir au moins 6 caractères.';
      } else if (code === 'auth/invalid-email' || msg.includes('invalid-email')) {
        errorMsg = 'Adresse e-mail invalide.';
      } else if (msg) {
        errorMsg = msg.replace(/^Firebase:\s*Error\s*\(.*?\)\.?/i, '').trim() || 'Identifiants invalides.';
      }
      showToast(`❌ ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#f5f5f5] flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-[32px] border border-[#e0e0e0] p-8 sm:p-10 max-w-md w-full my-8 shadow-sm animate-fade-in">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 bg-[#1a1a1a] text-white rounded-2xl flex items-center justify-center text-xl font-bold shadow-sm">AS</div>
          <div>
            <h1 className="font-sans font-bold text-2xl text-[#1a1a1a] tracking-tight leading-none">AKPANY SCHOOL</h1>
            <span className="text-xs text-[#9e9e9e] font-medium tracking-tight mt-1 block">Plateforme éducative unifiée</span>
          </div>
        </div>

        <div className="mb-6">
          <p className="font-sans text-xl font-semibold text-[#1a1a1a] mb-1">Connexion à votre espace</p>
          <p className="text-xs text-[#757575] font-medium">Entrez vos identifiants pour vous connecter</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
              Adresse Email
            </label>
            <input
              type="email"
              className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs focus:outline-none focus:border-[#1a1a1a] bg-[#f5f5f5]/20 placeholder:text-[#9e9e9e]/60 text-[#1a1a1a]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre.email@ecoleplus.ci"
              required
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest">Mot de passe</label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetSending}
                className="text-[10px] font-semibold text-[#1a1a1a] hover:underline cursor-pointer"
              >
                {resetSending ? 'Envoi...' : 'Mot de passe oublié ?'}
              </button>
            </div>
            <input
              type="password"
              className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs focus:outline-none focus:border-[#1a1a1a] bg-[#f5f5f5]/20 placeholder:text-[#9e9e9e]/60 text-[#1a1a1a]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#1a1a1a] text-white hover:bg-black rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            {loading ? 'Vérification...' : 'Se connecter →'}
          </button>
        </form>

        {/* Footer Registration links */}
        <div className="text-center mt-6 pt-6 border-t border-[#f0f0f0] text-xs text-[#9e9e9e]">
          S'inscrire comme :{' '}
          <button onClick={onShowProfReg} className="text-[#1a1a1a] font-semibold hover:underline cursor-pointer">👨‍🏫 Professeur</button>
          {'  ·  '}
          <button onClick={onShowParentReg} className="text-[#1a1a1a] font-semibold hover:underline cursor-pointer">👨‍👩‍👧 Parent</button>
        </div>
      </div>
    </div>
  );
}


