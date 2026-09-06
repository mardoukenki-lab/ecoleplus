import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Eleve } from '../types';
import { cacheOfflineStudents, getCachedOfflineStudents } from '../lib/offlineSync';
import { useMultiTenancy } from './useMultiTenancy';

interface UseElevesOptions {
  etablissementId?: string;
  classeFilter?: string;
  searchQuery?: string;
  includeArchived?: boolean;
}

export function useEleves(options: UseElevesOptions = {}) {
  const {
    etablissementId: explicitEtablissementId,
    classeFilter,
    searchQuery = '',
    includeArchived = false
  } = options;

  const { etablissementId: activeTenantId } = useMultiTenancy();
  const etablissementId = explicitEtablissementId || activeTenantId;

  const [eleves, setEleves] = useState<Eleve[]>(() => getCachedOfflineStudents());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const elevesRef = collection(db, 'eleves');
    // Enforce multi-tenant query by etablissementId
    const q = query(elevesRef, where('etablissementId', '==', etablissementId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Eleve[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...(doc.data() as Omit<Eleve, 'id'>) });
        });
        setEleves(list);
        cacheOfflineStudents(list);
        setLoading(false);
      },
      (err) => {
        console.warn('useEleves subscription notice, falling back to cache:', err);
        const cached = getCachedOfflineStudents();
        if (cached.length > 0) {
          setEleves(cached);
        }
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [etablissementId]);

  const filteredEleves = useMemo(() => {
    return eleves.filter((e) => {
      // Archive filter
      if (!includeArchived && e.statut === 'archive') return false;
      if (includeArchived && e.statut !== 'archive') return false;

      // Class filter
      if (classeFilter && classeFilter !== 'Toutes' && e.classe !== classeFilter) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase().trim();
        const matchesName = e.nom.toLowerCase().includes(queryLower);
        const matchesClass = e.classe.toLowerCase().includes(queryLower);
        const matchesCode = (e.code || '').toLowerCase().includes(queryLower);
        return matchesName || matchesClass || matchesCode;
      }

      return true;
    });
  }, [eleves, classeFilter, searchQuery, includeArchived]);

  return {
    eleves: filteredEleves,
    allEleves: eleves,
    loading,
    error,
    totalCount: filteredEleves.length
  };
}
