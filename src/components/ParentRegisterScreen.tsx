import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ALLOWED_ADMIN_EMAILS, getAdminNom } from './LoginScreen';

interface ParentRegisterScreenProps {
  onBack: () => void;
  showToast: (msg: string) => void;
}

interface EnfantField {
  id: number;
  nom: string;
  classe: string;
  matricule: string;
  matchedStudent: any | null;
}

export default function ParentRegisterScreen({ onBack, showToast }: ParentRegisterScreenProps) {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [tel, setTel] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [enfants, setEnfants] = useState<EnfantField[]>([
    { id: Date.now(), nom: '', classe: '', matricule: '', matchedStudent: null }
  ]);

  const addEnfantField = () => {
    setEnfants([...enfants, { id: Date.now(), nom: '', classe: '', matricule: '', matchedStudent: null }]);
  };

  const removeEnfantField = (id: number) => {
    if (enfants.length > 1) {
      setEnfants(enfants.filter(e => e.id !== id));
    }
  };

  const handleEnfantChange = (id: number, field: keyof EnfantField, value: string) => {
    setEnfants(enfants.map(e => {
      if (e.id === id) {
        return { ...e, [field]: value };
      }
      return e;
    }));
  };

  const verifierMatricule = async (id: number, code: string) => {
    if (!code.trim()) {
      setEnfants(enfants.map(e => e.id === id ? { ...e, matricule: code, matchedStudent: null } : e));
      return;
    }

    try {
      const q = query(collection(db, 'eleves'), where('code', '==', code.trim()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const studentData = snap.docs[0].data();
        setEnfants(enfants.map(e => {
          if (e.id === id) {
            return {
              ...e,
              matricule: code,
              nom: studentData.nom,
              classe: studentData.classe,
              matchedStudent: studentData
            };
          }
          return e;
        }));
      } else {
        setEnfants(enfants.map(e => e.id === id ? { ...e, matricule: code, matchedStudent: false } : e));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom || !email || !tel || !password) {
      showToast('⚠️ Merci de renseigner tous les champs obligatoires');
      return;
    }

    const lowerEmail = email.toLowerCase().trim();

    const validEnfants = enfants.filter(e => e.nom.trim() !== '');
    if (validEnfants.length === 0) {
      showToast('⚠️ Merci d\'associer au moins un enfant.');
      return;
    }

    setLoading(true);
    try {
      let uid = '';
      try {
        const userCred = await createUserWithEmailAndPassword(auth, lowerEmail, password);
        uid = userCred.user.uid;
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          const userCred = await signInWithEmailAndPassword(auth, lowerEmail, password);
          uid = userCred.user.uid;
        } else {
          throw authErr;
        }
      }

      // Save user profile with pending status
      const profile = {
        uid,
        nom,
        email: lowerEmail,
        role: 'parent' as const,
        status: 'pending' as const,
        tel,
        enfants: validEnfants.map(e => ({
          nom: e.nom,
          classe: e.classe,
          matricule: e.matricule
        })),
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', uid), profile);

      // Create a notification for admins
      const notifId = 'notif_' + Math.random().toString(36).substring(2, 9);
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        userUid: 'all',
        icon: '👨‍👩‍👧',
        bg: 'bg-amber-100 text-amber-700',
        text: `Nouvelle demande d'inscription Parent — ${nom} (Enfant: ${validEnfants.map(e => e.nom).join(', ')})`,
        time: 'à l\'instant',
        unread: true,
        createdAt: new Date().toISOString()
      });

      showToast(`🟡 Compte créé pour ${nom} ! En attente de validation.`);
      onBack();
    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message || "Une erreur est survenue lors de l'inscription.";
      if (err.code === 'auth/network-request-failed') {
        errorMsg = 'Problème de réseau ou connexion Internet interrompue. Veuillez réessayer.';
      } else if (err.code === 'auth/email-already-in-use') {
        errorMsg = 'Cette adresse e-mail est déjà associée à un compte existant. Veuillez vous connecter.';
      } else if (err.code === 'auth/invalid-email') {
        errorMsg = 'L\'adresse e-mail saisie est invalide.';
      } else if (err.code === 'auth/weak-password') {
        errorMsg = 'Le mot de passe doit contenir au moins 6 caractères.';
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
          <div className="w-10 h-10 bg-[#1a1a1a] text-white rounded-xl flex items-center justify-center text-lg font-semibold">👨‍👩‍👧</div>
          <div>
            <h1 className="font-sans font-semibold text-xl text-[#1a1a1a] tracking-tight leading-none">Créer un compte Parent</h1>
            <span className="text-xs text-[#9e9e9e] font-medium mt-1 block">Suivez la scolarité de votre/vos enfant(s)</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Nom complet</label>
            <input
              type="text"
              className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs focus:outline-none focus:border-[#1a1a1a] bg-[#f5f5f5]/20 placeholder:text-[#9e9e9e]/60 text-[#1a1a1a]"
              placeholder="Mme KOUAMÉ Awa"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Email</label>
              <input
                type="email"
                className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs focus:outline-none focus:border-[#1a1a1a] bg-[#f5f5f5]/20 placeholder:text-[#9e9e9e]/60 text-[#1a1a1a]"
                placeholder="vous@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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

          <p className="text-[10px] font-bold text-[#1a1a1a] uppercase tracking-widest pt-4 border-t border-[#e0e0e0]">Enfant(s) à associer</p>

          <div className="space-y-3">
            {enfants.map((enf, idx) => (
              <div key={enf.id} className="p-4 bg-[#f5f5f5]/40 rounded-2xl border border-[#e0e0e0] relative space-y-3">
                {enfants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeEnfantField(enf.id)}
                    className="absolute top-2 right-2 text-[#9e9e9e] hover:text-red-500 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-tight">Nom de l'enfant</label>
                    <input
                      type="text"
                      className="w-full px-2.5 py-1.5 border border-[#e0e0e0] rounded-lg text-xs bg-white focus:outline-none text-[#1a1a1a]"
                      placeholder="KOFFI Jean"
                      value={enf.nom}
                      onChange={(e) => handleEnfantChange(enf.id, 'nom', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-tight">Classe (optionnel)</label>
                    <input
                      type="text"
                      className="w-full px-2.5 py-1.5 border border-[#e0e0e0] rounded-lg text-xs bg-white focus:outline-none text-[#1a1a1a]"
                      placeholder="6e A"
                      value={enf.classe}
                      onChange={(e) => handleEnfantChange(enf.id, 'classe', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-[#9e9e9e] uppercase tracking-tight font-sans">Code Association Élève (ELV-XXXX)</label>
                  <input
                    type="text"
                    className="w-full px-2.5 py-1.5 border border-[#e0e0e0] rounded-lg text-xs bg-white focus:outline-none font-mono uppercase text-[#1a1a1a]"
                    placeholder="Ex: ELV-2548"
                    value={enf.matricule}
                    onChange={(e) => {
                      handleEnfantChange(enf.id, 'matricule', e.target.value);
                      verifierMatricule(enf.id, e.target.value);
                    }}
                  />
                </div>

                {enf.matchedStudent === false && (
                  <div className="p-2 bg-amber-50 text-amber-800 text-[10px] rounded-lg border border-amber-100 font-medium">
                    ⚠ Aucun élève ne correspond à ce code — l'administration vérifiera manuellement.
                  </div>
                )}

                {enf.matchedStudent && enf.matchedStudent !== false && (
                  <div className="p-2 bg-emerald-50 text-emerald-800 text-[10px] rounded-lg border border-emerald-100 font-medium">
                    ✅ Élève trouvé : <strong>{enf.matchedStudent.nom}</strong> — {enf.matchedStudent.classe}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addEnfantField}
            className="w-full py-2 border border-dashed border-[#e0e0e0] rounded-xl text-xs font-semibold text-[#1a1a1a] hover:bg-[#f5f5f5]/40 transition-colors cursor-pointer"
          >
            + Ajouter un autre enfant
          </button>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#1a1a1a] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? 'Création...' : 'Créer mon compte →'}
          </button>
        </form>

        <p className="text-[10px] text-[#9e9e9e] font-medium mt-5 text-center leading-relaxed">
          Votre compte sera configuré en statut <strong className="text-[#1a1a1a]">« En attente de validation »</strong>. L'administration validera l'association avec votre enfant.
        </p>
      </div>
    </div>
  );
}
