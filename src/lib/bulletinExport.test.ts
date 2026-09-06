import { describe, it, expect } from 'vitest';
import { getSubjectCoefficient, DEFAULT_SUBJECT_COEFFICIENTS } from './bulletinExport';

describe('bulletinExport - Subject Coefficients and Calculation Rules', () => {
  it('correctly maps standard secondary school coefficients', () => {
    expect(getSubjectCoefficient('Français')).toBe(3);
    expect(getSubjectCoefficient('Mathématiques')).toBe(3);
    expect(getSubjectCoefficient('Anglais')).toBe(2);
    expect(getSubjectCoefficient('Physique-Chimie')).toBe(2);
    expect(getSubjectCoefficient('SVT')).toBe(2);
    expect(getSubjectCoefficient('Philosophie')).toBe(3);
    expect(getSubjectCoefficient('EPS')).toBe(1);
    expect(getSubjectCoefficient('Arts Plastiques')).toBe(1);
  });

  it('performs case-insensitive and partial match lookup', () => {
    expect(getSubjectCoefficient('français')).toBe(3);
    expect(getSubjectCoefficient('mathématiques')).toBe(3);
    expect(getSubjectCoefficient('Sciences de la Vie et de la Terre (SVT)')).toBe(2);
  });

  it('falls back to coefficient 1 for unknown or unspecified subjects', () => {
    expect(getSubjectCoefficient('Discipline Inconnue Non Référencée')).toBe(1);
    expect(getSubjectCoefficient('')).toBe(1);
  });

  it('calculates weighted subject points accurately', () => {
    const matiere = 'Français';
    const coef = getSubjectCoefficient(matiere);
    const moy = 14.5;
    const points = moy * coef;

    expect(coef).toBe(3);
    expect(points).toBe(43.5);
  });

  it('calculates general average correctly over multiple coefficiented subjects', () => {
    const subjects = [
      { matiere: 'Français', coef: 3, moy: 14 },
      { matiere: 'Mathématiques', coef: 3, moy: 16 },
      { matiere: 'Anglais', coef: 2, moy: 12 },
      { matiere: 'EPS', coef: 1, moy: 15 }
    ];

    const totalCoef = subjects.reduce((sum, s) => sum + s.coef, 0); // 3 + 3 + 2 + 1 = 9
    const totalPoints = subjects.reduce((sum, s) => sum + (s.moy * s.coef), 0); // 42 + 48 + 24 + 15 = 129
    const overallAverage = Number((totalPoints / totalCoef).toFixed(2));

    expect(totalCoef).toBe(9);
    expect(totalPoints).toBe(129);
    expect(overallAverage).toBe(14.33);
  });
});
