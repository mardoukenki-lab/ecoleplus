import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Absence } from '../types';
import { useMultiTenancy } from './useMultiTenancy';

interface UseAbsencesOptions {
  etablissementId?: string;
  classeFilter?: string;
  eleveIdFilter?: string;
}

export function useAbsences(options: UseAbsencesOptions = {}) {
  const { etablissementId: explicitEtablissementId, classeFilter, eleveIdFilter } = options;

  const { etablissementId: activeTenantId } = useMultiTenancy();
  const etablissementId = explicitEtablissementId || activeTenantId;

  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const absencesRef = collection(db, 'absences');
    // Enforce multi-tenant query by etablissementId
    const q = query(absencesRef, where('etablissementId', '==', etablissementId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Absence[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...(doc.data() as Omit<Absence, 'id'>) });
        });
        setAbsences(list);
        setLoading(false);
      },
      (err) => {
        console.warn('useAbsences subscription notice:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [etablissementId]);

  const filteredAbsences = useMemo(() => {
    return absences.filter((a) => {
      if (classeFilter && classeFilter !== 'Toutes' && a.classe !== classeFilter) {
        return false;
      }
      if (eleveIdFilter && a.eleveId !== eleveIdFilter) {
        return false;
      }
      return true;
    });
  }, [absences, classeFilter, eleveIdFilter]);

  const metrics = useMemo(() => {
    const totalAbsences = filteredAbsences.filter(a => a.statut === 'absent').length;
    const totalRetards = filteredAbsences.filter(a => a.statut === 'retard').length;
    const totalJustified = filteredAbsences.filter(a => a.statut === 'justifie').length;

    // Critical threshold evaluation
    const isCritical = totalAbsences >= 5 || (totalAbsences + totalRetards) >= 8;

    return {
      totalRecords: filteredAbsences.length,
      totalAbsences,
      totalRetards,
      totalJustified,
      isCritical
    };
  }, [filteredAbsences]);

  return {
    absences: filteredAbsences,
    allAbsences: absences,
    metrics,
    loading,
    error
  };
}
