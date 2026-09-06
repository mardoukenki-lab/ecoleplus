import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Paiement } from '../types';
import { useMultiTenancy } from './useMultiTenancy';

interface UsePaiementsOptions {
  etablissementId?: string;
  classeFilter?: string;
  searchQuery?: string;
  parentEmail?: string;
  parentUid?: string;
}

export function usePaiements(options: UsePaiementsOptions = {}) {
  const {
    etablissementId: explicitEtablissementId,
    classeFilter,
    searchQuery = '',
    parentEmail,
    parentUid
  } = options;

  const { etablissementId: activeTenantId } = useMultiTenancy();
  const etablissementId = explicitEtablissementId || activeTenantId;

  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const paiementsRef = collection(db, 'paiements');
    // Enforce multi-tenant query by etablissementId
    const q = query(paiementsRef, where('etablissementId', '==', etablissementId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Paiement[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...(doc.data() as Omit<Paiement, 'id'>) });
        });
        setPaiements(list);
        setLoading(false);
      },
      (err) => {
        console.warn('usePaiements subscription notice:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [etablissementId]);

  const filteredPaiements = useMemo(() => {
    return paiements.filter((p) => {
      // Parent restriction if not admin
      if (parentEmail && (p as any).parentEmail && (p as any).parentEmail !== parentEmail) {
        return false;
      }
      if (parentUid && (p as any).parentUid && (p as any).parentUid !== parentUid) {
        return false;
      }

      // Class filter
      if (classeFilter && classeFilter !== 'Toutes' && p.classe !== classeFilter) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase().trim();
        const matchesName = (p.eleveNom || '').toLowerCase().includes(queryLower);
        const matchesClass = (p.classe || '').toLowerCase().includes(queryLower);
        const matchesRecu = (p.recuNo || '').toLowerCase().includes(queryLower);
        return matchesName || matchesClass || matchesRecu;
      }

      return true;
    });
  }, [paiements, classeFilter, searchQuery, parentEmail, parentUid]);

  const metrics = useMemo(() => {
    const totalDue = filteredPaiements.reduce((acc, curr) => acc + (curr.total || 0), 0);
    const totalCollected = filteredPaiements.reduce((acc, curr) => acc + (curr.paye || 0), 0);
    const totalOutstanding = Math.max(0, totalDue - totalCollected);
    const collectionRate = totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 100;

    return {
      totalDue,
      totalCollected,
      totalOutstanding,
      collectionRate,
      paidInFullCount: filteredPaiements.filter(p => (p.solde || 0) <= 0).length,
      unpaidCount: filteredPaiements.filter(p => (p.solde || 0) > 0).length
    };
  }, [filteredPaiements]);

  return {
    paiements: filteredPaiements,
    allPaiements: paiements,
    metrics,
    loading,
    error
  };
}
