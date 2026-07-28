import React, { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { UserProfile } from './types';
import LoginScreen, { ALLOWED_ADMIN_EMAILS, getAdminNom } from './components/LoginScreen';
import ProfRegisterScreen from './components/ProfRegisterScreen';
import ParentRegisterScreen from './components/ParentRegisterScreen';
import AdminView from './components/AdminView';
import ProfView from './components/ProfView';
import ParentView from './components/ParentView';
import { clearAllDatabaseData } from './lib/demoData';

interface Toast {
  id: number;
  message: string;
}

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [screen, setScreen] = useState<'login' | 'prof_reg' | 'parent_reg'>('login');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(true);

  // App initialization
  useEffect(() => {
    // Production mode: dashboard starts clean without auto-seeding or auto-clearing triggers
  }, []);

  useEffect(() => {
    // Listen to Firebase Auth state
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setLoading(true);
      if (authUser) {
        setUser(authUser);
        try {
          // Fetch custom user profile
          let userDoc;
          try {
            userDoc = await getDoc(doc(db, 'users', authUser.uid));
          } catch (firstErr) {
            console.warn('First profile fetch attempt failed, retrying...', firstErr);
            try {
              userDoc = await getDoc(doc(db, 'users', authUser.uid));
            } catch (secondErr) {
              userDoc = null;
            }
          }

          if (userDoc && userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            const lowerEmail = authUser.email?.toLowerCase().trim() || '';
            if (ALLOWED_ADMIN_EMAILS.includes(lowerEmail)) {
              const adminProfile: UserProfile = {
                ...data,
                role: 'admin',
                status: 'active',
                nom: data.nom || getAdminNom(lowerEmail),
              };
              if (data.role !== 'admin' || data.status !== 'active') {
                try {
                  await setDoc(doc(db, 'users', authUser.uid), adminProfile, { merge: true });
                } catch (e) {
                  console.warn('Could not update admin role in firestore:', e);
                }
              }
              setProfile(adminProfile);
            } else {
              setProfile(data);
            }
          } else {
            // Profile document missing or unreadable
            const lowerEmail = authUser.email?.toLowerCase().trim() || '';
            const isAdminEmail = ALLOWED_ADMIN_EMAILS.includes(lowerEmail);
            if (isAdminEmail) {
              const newProfile: UserProfile = {
                uid: authUser.uid,
                nom: getAdminNom(lowerEmail),
                email: lowerEmail,
                role: 'admin',
                status: 'active',
                tel: '07 00 00 00 00',
                createdAt: new Date().toISOString()
              };
              try {
                await setDoc(doc(db, 'users', authUser.uid), newProfile);
              } catch (setErr) {
                console.warn('Could not save auto-generated admin profile:', setErr);
              }
              setProfile(newProfile);
            } else {
              setProfile(null);
            }
          }
        } catch (err) {
          console.warn('Profile fetch handled gracefully:', err);
          const lowerEmail = authUser.email?.toLowerCase().trim() || '';
          if (ALLOWED_ADMIN_EMAILS.includes(lowerEmail)) {
            setProfile({
              uid: authUser.uid,
              nom: getAdminNom(lowerEmail),
              email: lowerEmail,
              role: 'admin',
              status: 'active',
              tel: '07 00 00 00 00',
              createdAt: new Date().toISOString()
            });
          }
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const showToast = (message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
      setScreen('login');
      showToast('🔒 Déconnecté avec succès !');
    } catch (err) {
      showToast('❌ Échec de la déconnexion.');
    }
  };

  const handleLoginSuccess = (userProfile: UserProfile) => {
    setProfile(userProfile);
    showToast(`🎉 Bienvenue, ${userProfile.nom} !`);
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-[#f5f5f5] items-center justify-center flex-col gap-4">
        <div className="w-10 h-10 border-2 border-[#1a1a1a] border-t-transparent rounded-full animate-spin"></div>
        <div className="text-[#1a1a1a] font-sans text-xs font-semibold uppercase tracking-widest">Chargement de ÉcolePlus...</div>
      </div>
    );
  }

  return (
    <div className="font-sans text-[#1a1a1a] bg-[#f5f5f5] min-h-screen selection:bg-[#e0e0e0]">
      {/* AUTH SCREENS */}
      {!user && (
        <>
          {screen === 'login' && (
            <LoginScreen
              onLoginSuccess={handleLoginSuccess}
              onShowProfReg={() => setScreen('prof_reg')}
              onShowParentReg={() => setScreen('parent_reg')}
              showToast={showToast}
            />
          )}
          {screen === 'prof_reg' && (
            <ProfRegisterScreen
              onBack={() => setScreen('login')}
              showToast={showToast}
            />
          )}
          {screen === 'parent_reg' && (
            <ParentRegisterScreen
              onBack={() => setScreen('login')}
              showToast={showToast}
            />
          )}
        </>
      )}

      {/* PENDING APPROVAL VIEW */}
      {user && profile && profile.status === 'pending' && (
        <div className="fixed inset-0 bg-[#f5f5f5] flex items-center justify-center z-50 p-6 text-center">
          <div className="bg-white rounded-[32px] p-10 max-w-md w-full border border-[#e0e0e0] shadow-sm space-y-6">
            <div className="w-12 h-12 bg-[#f5f5f5] rounded-2xl mx-auto flex items-center justify-center text-lg">⏳</div>
            <h2 className="font-sans font-semibold text-xl text-[#1a1a1a] tracking-tight">Compte en attente de validation</h2>
            <p className="text-sm text-[#9e9e9e] leading-relaxed">
              Bonjour <strong>{profile.nom}</strong>. Votre demande d'inscription en tant que{' '}
              <strong>{profile.role === 'prof' ? 'Enseignant' : 'Parent'}</strong> est bien enregistrée.
            </p>
            <p className="text-xs text-[#9e9e9e] bg-[#f5f5f5] p-4 rounded-2xl leading-relaxed">
              Pour des raisons de sécurité, un administrateur du Lycée Moderne de Dabou doit valider votre identité avant que vous ne puissiez accéder à la plateforme.
            </p>
            <button
              onClick={handleLogout}
              className="px-6 py-3 bg-[#1a1a1a] text-white font-semibold rounded-xl text-xs tracking-widest uppercase transition-all hover:bg-black w-full"
            >
              Retour à la connexion
            </button>
          </div>
        </div>
      )}

      {/* REFUSED VIEW */}
      {user && profile && profile.status === 'refused' && (
        <div className="fixed inset-0 bg-[#f5f5f5] flex items-center justify-center z-50 p-6 text-center">
          <div className="bg-white rounded-[32px] p-10 max-w-md w-full border border-[#e0e0e0] shadow-sm space-y-4">
            <div className="w-12 h-12 bg-[#f5f5f5] text-red-500 rounded-2xl mx-auto flex items-center justify-center text-lg">✕</div>
            <h2 className="font-sans font-semibold text-xl text-[#1a1a1a] tracking-tight">Accès refusé</h2>
            <p className="text-sm text-[#9e9e9e]">
              Votre demande d'inscription sur ÉcolePlus a été refusée par l'administration du Lycée Moderne de Dabou.
            </p>
            <button
              onClick={handleLogout}
              className="px-6 py-3 bg-[#1a1a1a] text-white rounded-xl text-xs font-semibold w-full transition-all hover:bg-black"
            >
              Retour à la connexion
            </button>
          </div>
        </div>
      )}

      {/* ARCHIVED / DEACTIVATED VIEW */}
      {user && profile && (profile.statut === 'archive' || profile.status === 'archived' || profile.status === 'archive') && (
        <div className="fixed inset-0 bg-[#f5f5f5] flex items-center justify-center z-50 p-6 text-center">
          <div className="bg-white rounded-[32px] p-10 max-w-md w-full border border-[#e0e0e0] shadow-sm space-y-4">
            <div className="w-12 h-12 bg-amber-50 text-amber-800 rounded-2xl mx-auto flex items-center justify-center text-lg">📦</div>
            <h2 className="font-sans font-semibold text-xl text-[#1a1a1a] tracking-tight">Compte désactivé ou archivé</h2>
            <p className="text-sm text-[#9e9e9e] leading-relaxed">
              Bonjour <strong>{profile.nom}</strong>. Votre compte a été désactivé par l'administration du Lycée Moderne de Dabou.
            </p>
            <p className="text-xs text-[#9e9e9e] bg-[#f5f5f5] p-4 rounded-2xl leading-relaxed">
              Vos informations et données antérieures sont conservées à des fins administratives. Contactez la direction pour toute demande de réactivation.
            </p>
            <button
              onClick={handleLogout}
              className="px-6 py-3 bg-[#1a1a1a] text-white font-semibold rounded-xl text-xs tracking-widest uppercase transition-all hover:bg-black w-full cursor-pointer"
            >
              Retour à la connexion
            </button>
          </div>
        </div>
      )}

      {/* ACTIVE ROLE VIEWS */}
      {user && profile && profile.status === 'active' && profile.statut !== 'archive' && (
        <>
          {profile.role === 'admin' && (
            <AdminView user={profile} onLogout={handleLogout} showToast={showToast} />
          )}
          {profile.role === 'prof' && (
            <ProfView user={profile} onLogout={handleLogout} showToast={showToast} />
          )}
          {profile.role === 'parent' && (
            <ParentView user={profile} onLogout={handleLogout} showToast={showToast} />
          )}
        </>
      )}

      {/* TOAST SYSTEM COVERS */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="bg-[#1a1a1a] text-white font-medium text-xs px-5 py-3.5 rounded-xl border border-[#e0e0e0] pointer-events-auto max-w-xs flex items-center gap-2"
            style={{
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
              animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}
          >
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
