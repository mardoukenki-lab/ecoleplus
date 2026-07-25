import { collection, getDocs, writeBatch, doc, query, where, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Eleve, Paiement, Annonce, Note, Absence, CahierTexte } from '../types';

export const DEMO_ELEVES: Eleve[] = [];
export const DEMO_PAIEMENTS: Paiement[] = [];
export const DEMO_ANNONCES: Annonce[] = [];
export const DEMO_NOTES: Note[] = [];
export const DEMO_ABSENCES: Absence[] = [];
export const DEMO_CAHIER: CahierTexte[] = [];

export async function clearAllDatabaseData() {
  const collectionsToClear = ['eleves', 'paiements', 'annonces', 'notes', 'absences', 'cahier_texte', 'notifications', 'messages'];
  try {
    for (const colName of collectionsToClear) {
      try {
        const snap = await getDocs(collection(db, colName));
        if (!snap.empty) {
          const batch = writeBatch(db);
          snap.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (colErr) {
        handleFirestoreError(colErr, OperationType.DELETE, colName);
      }
    }
    localStorage.setItem('ecoleplus_clean_db', 'true');
    console.log('Database cleared and reset to clean production mode.');
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'collections');
    return false;
  }
}

export async function restoreDemoData() {
  localStorage.setItem('ecoleplus_clean_db', 'true');
}

export async function seedDemoDataIfEmpty(force = false) {
  // Production mode: no dummy data seeding
  return;
}
