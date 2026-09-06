import { describe, it, expect } from 'vitest';
import { buildDefaultTranches, getTranchesForPaiement } from './tuitionUtils';
import { Paiement } from '../types';

describe('tuitionUtils - School Fees Tranche Calculation', () => {
  it('generates 3 tranches respecting 40% - 30% - 30% proportions', () => {
    const total = 100000;
    const tranches = buildDefaultTranches(total, 0);

    expect(tranches).toHaveLength(3);
    expect(tranches[0].montant).toBe(40000); // 40%
    expect(tranches[1].montant).toBe(30000); // 30%
    expect(tranches[2].montant).toBe(30000); // 30%

    const sumMontants = tranches.reduce((acc, t) => acc + t.montant, 0);
    expect(sumMontants).toBe(total);
  });

  it('allocates partial payments sequentially across tranches', () => {
    const total = 100000;
    // 50,000 FCFA paid: fully covers tranche 1 (40k), partially covers tranche 2 (10k of 30k)
    const tranches = buildDefaultTranches(total, 50000);

    expect(tranches[0].montantPaye).toBe(40000);
    expect(tranches[0].statut).toBe('paye');

    expect(tranches[1].montantPaye).toBe(10000);
    expect(tranches[1].statut).not.toBe('paye');

    expect(tranches[2].montantPaye).toBe(0);
    expect(tranches[2].statut).not.toBe('paye');
  });

  it('marks all tranches as paid when total is fully settled', () => {
    const total = 150000;
    const tranches = buildDefaultTranches(total, 150000);

    expect(tranches[0].statut).toBe('paye');
    expect(tranches[1].statut).toBe('paye');
    expect(tranches[2].statut).toBe('paye');
  });

  it('uses existing tranches on paiement object if present', () => {
    const mockPaiement: Paiement = {
      id: 'p1',
      eleveId: 'elv1',
      eleveNom: 'Kouassi Jean',
      classe: '6e A',
      total: 80000,
      paye: 80000,
      solde: 0,
      echeance: 'Soldé',
      historique: [],
      tranches: [
        {
          id: 'custom-1',
          nom: 'Tranche Unique',
          montant: 80000,
          montantPaye: 80000,
          echeance: '2026-10-15',
          statut: 'paye'
        }
      ]
    };

    const result = getTranchesForPaiement(mockPaiement);
    expect(result).toHaveLength(1);
    expect(result[0].nom).toBe('Tranche Unique');
  });
});
