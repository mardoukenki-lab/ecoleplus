import { Paiement, Tranche } from '../types';

/**
 * Generate default 3-tranche plan for a school tuition payment if tranches are not explicitly stored.
 */
export function buildDefaultTranches(total: number, paye: number = 0): Tranche[] {
  const currentYear = new Date().getFullYear();
  // Standard 3 tranches (40%, 30%, 30%)
  const m1 = Math.round(total * 0.4);
  const m2 = Math.round(total * 0.3);
  const m3 = total - m1 - m2;

  // Due dates: Oct 15, Jan 15, Apr 15
  const t1DueDate = `${currentYear}-10-15`;
  const t2DueDate = `${currentYear + 1}-01-15`;
  const t3DueDate = `${currentYear + 1}-04-15`;

  const todayStr = new Date().toISOString().split('T')[0];

  let remainingPaid = paye;

  // Tranche 1
  const t1Paid = Math.min(m1, remainingPaid);
  remainingPaid = Math.max(0, remainingPaid - t1Paid);

  // Tranche 2
  const t2Paid = Math.min(m2, remainingPaid);
  remainingPaid = Math.max(0, remainingPaid - t2Paid);

  // Tranche 3
  const t3Paid = Math.min(m3, remainingPaid);

  const getStatut = (paid: number, target: number, dueDate: string): 'paye' | 'en_attente' | 'en_retard' => {
    if (paid >= target) return 'paye';
    if (todayStr > dueDate) return 'en_retard';
    return 'en_attente';
  };

  return [
    {
      id: 't1',
      nom: '1ère Tranche (Inscription & Rentrée)',
      montant: m1,
      echeance: t1DueDate,
      echeanceLabel: '15 Octobre',
      montantPaye: t1Paid,
      statut: getStatut(t1Paid, m1, t1DueDate)
    },
    {
      id: 't2',
      nom: '2ème Tranche (2ème Trimestre)',
      montant: m2,
      echeance: t2DueDate,
      echeanceLabel: '15 Janvier',
      montantPaye: t2Paid,
      statut: getStatut(t2Paid, m2, t2DueDate)
    },
    {
      id: 't3',
      nom: '3ème Tranche (Solde Final)',
      montant: m3,
      echeance: t3DueDate,
      echeanceLabel: '15 Avril',
      montantPaye: t3Paid,
      statut: getStatut(t3Paid, m3, t3DueDate)
    }
  ];
}

/**
 * Ensures a Paiement object has populated tranches array and calculates current status
 */
export function getTranchesForPaiement(p: Paiement): Tranche[] {
  if (p.tranches && p.tranches.length > 0) {
    const todayStr = new Date().toISOString().split('T')[0];
    let remainingPaid = p.paye;

    return p.tranches.map(t => {
      const paid = Math.min(t.montant, remainingPaid);
      remainingPaid = Math.max(0, remainingPaid - paid);

      let statut: 'paye' | 'en_attente' | 'en_retard' = t.statut;
      if (paid >= t.montant) {
        statut = 'paye';
      } else if (todayStr > t.echeance) {
        statut = 'en_retard';
      } else {
        statut = 'en_attente';
      }

      return {
        ...t,
        montantPaye: paid,
        statut
      };
    });
  }

  return buildDefaultTranches(p.total, p.paye);
}

/**
 * Calculates real-time financial stats for a list of student payments
 */
export interface FinancialSummary {
  totalAttendu: number;
  totalEncaisse: number;
  totalRestant: number;
  elevesEnRetardCount: number;
  elevesAJourCount: number;
  elevesEnCoursCount: number;
  montantEnRetard: number;
  tauxRecouvrement: number;
}

export function computeFinancialSummary(payments: Paiement[]): FinancialSummary {
  let totalAttendu = 0;
  let totalEncaisse = 0;
  let elevesEnRetardCount = 0;
  let elevesAJourCount = 0;
  let elevesEnCoursCount = 0;
  let montantEnRetard = 0;

  payments.forEach(p => {
    totalAttendu += p.total || 0;
    totalEncaisse += p.paye || 0;

    const tranches = getTranchesForPaiement(p);
    const hasOverdueTranche = tranches.some(t => t.statut === 'en_retard');
    const isFullyPaid = p.solde <= 0 || tranches.every(t => t.statut === 'paye');

    if (isFullyPaid) {
      elevesAJourCount++;
    } else if (hasOverdueTranche) {
      elevesEnRetardCount++;
      // Sum unpaid amounts of overdue tranches
      const overdueSum = tranches
        .filter(t => t.statut === 'en_retard')
        .reduce((sum, t) => sum + (t.montant - t.montantPaye), 0);
      montantEnRetard += overdueSum;
    } else {
      elevesEnCoursCount++;
    }
  });

  const totalRestant = Math.max(0, totalAttendu - totalEncaisse);
  const tauxRecouvrement = totalAttendu > 0 ? Math.round((totalEncaisse / totalAttendu) * 100) : 0;

  return {
    totalAttendu,
    totalEncaisse,
    totalRestant,
    elevesEnRetardCount,
    elevesAJourCount,
    elevesEnCoursCount,
    montantEnRetard,
    tauxRecouvrement
  };
}

/**
 * Returns overdue details for a single student's payment
 */
export function getStudentTuitionStatus(p: Paiement) {
  const tranches = getTranchesForPaiement(p);
  const overdueTranches = tranches.filter(t => t.statut === 'en_retard');
  const upcomingTranches = tranches.filter(t => t.statut === 'en_attente');
  const isFullyPaid = p.solde <= 0;

  const nextDue = upcomingTranches[0] || overdueTranches[0] || null;

  return {
    tranches,
    isOverdue: overdueTranches.length > 0 && !isFullyPaid,
    overdueTranches,
    upcomingTranches,
    nextDue,
    isFullyPaid
  };
}
