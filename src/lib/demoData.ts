import { collection, getDocs, writeBatch, doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Eleve, Paiement, Annonce, Note, Absence, CahierTexte } from '../types';

export const DEMO_ELEVES: Eleve[] = [];
export const DEMO_PAIEMENTS: Paiement[] = [];
export const DEMO_ANNONCES: Annonce[] = [];
export const DEMO_NOTES: Note[] = [];
export const DEMO_ABSENCES: Absence[] = [];
export const DEMO_CAHIER: CahierTexte[] = [];


// Export a full backup snapshot of the database before any destructive operation
export async function exportFullDatabaseBackup(): Promise<string> {
  const collectionsToBackup = ['eleves', 'paiements', 'annonces', 'notes', 'absences', 'cahier_texte', 'notifications', 'messages', 'examens', 'schedules', 'classes'];
  const backupData: Record<string, any[]> = {
    _metadata: [{
      backupDate: new Date().toISOString(),
      platform: 'Akpany School Management System',
      version: '1.0.0'
    }]
  };

  for (const colName of collectionsToBackup) {
    try {
      const snap = await getDocs(collection(db, colName));
      backupData[colName] = [];
      snap.forEach(d => {
        backupData[colName].push({ id: d.id, ...d.data() });
      });
    } catch (err) {
      console.warn(`Backup read error for ${colName}:`, err);
    }
  }

  const jsonStr = JSON.stringify(backupData, null, 2);
  
  // Trigger automatic download in browser
  try {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `akpany_school_backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (downloadErr) {
    console.warn('Backup direct download error:', downloadErr);
  }

  return jsonStr;
}

export async function clearAllDatabaseData(adminUser?: { uid?: string; email?: string; nom?: string }) {
  const collectionsToClear = ['eleves', 'paiements', 'annonces', 'notes', 'absences', 'cahier_texte', 'notifications', 'messages', 'examens'];
  try {
    // 1. Automatically create and download backup snapshot before purge
    await exportFullDatabaseBackup();

    // 2. Clear collections
    let totalDocsDeleted = 0;
    for (const colName of collectionsToClear) {
      try {
        const snap = await getDocs(collection(db, colName));
        if (!snap.empty) {
          totalDocsDeleted += snap.size;
          const batch = writeBatch(db);
          snap.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (colErr) {
        handleFirestoreError(colErr, OperationType.DELETE, colName);
      }
    }

    // 3. Write immutable audit log record for this administrative reset
    try {
      const auditRef = doc(collection(db, 'audit_log'));
      await setDoc(auditRef, {
        id: auditRef.id,
        action: 'RESET_DATABASE_PRODUCTION',
        adminEmail: adminUser?.email || 'admin@akpanyschool.store',
        adminNom: adminUser?.nom || 'Administration',
        adminUid: adminUser?.uid || 'admin_uid',
        timestamp: new Date().toISOString(),
        details: `Réinitialisation de la base de données effectuée. ${totalDocsDeleted} documents supprimés. Sauvegarde JSON automatique exportée.`,
        collectionsCleared: collectionsToClear
      });
    } catch (auditErr) {
      console.warn('Could not write reset audit log entry:', auditErr);
    }

    localStorage.setItem('ecoleplus_clean_db', 'true');
    console.log('Database cleared with automatic backup and audit log created.');
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

