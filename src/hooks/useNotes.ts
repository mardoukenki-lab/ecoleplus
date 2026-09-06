import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Note } from '../types';
import { useMultiTenancy } from './useMultiTenancy';

interface UseNotesOptions {
  etablissementId?: string;
  classeFilter?: string;
  matiereFilter?: string;
  trimestreFilter?: string;
  eleveIdFilter?: string;
}

export function useNotes(options: UseNotesOptions = {}) {
  const {
    etablissementId: explicitEtablissementId,
    classeFilter,
    matiereFilter,
    trimestreFilter,
    eleveIdFilter
  } = options;

  const { etablissementId: activeTenantId } = useMultiTenancy();
  const etablissementId = explicitEtablissementId || activeTenantId;

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const notesRef = collection(db, 'notes');
    // Enforce multi-tenant query by etablissementId
    const q = query(notesRef, where('etablissementId', '==', etablissementId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Note[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...(doc.data() as Omit<Note, 'id'>) });
        });
        setNotes(list);
        setLoading(false);
      },
      (err) => {
        console.warn('useNotes subscription notice:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [etablissementId]);

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (classeFilter && classeFilter !== 'Toutes' && n.classe !== classeFilter) {
        return false;
      }
      if (matiereFilter && matiereFilter !== 'Toutes' && n.matiere !== matiereFilter) {
        return false;
      }
      if (trimestreFilter && n.trimestre !== trimestreFilter) {
        return false;
      }
      if (eleveIdFilter && n.eleveId !== eleveIdFilter) {
        return false;
      }
      return true;
    });
  }, [notes, classeFilter, matiereFilter, trimestreFilter, eleveIdFilter]);

  return {
    notes: filteredNotes,
    allNotes: notes,
    loading,
    error,
    totalCount: filteredNotes.length
  };
}
