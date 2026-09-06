import { Eleve, ScheduleSlot, Examen } from '../types';
import { db } from './firebase';
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';

const OFFLINE_STUDENTS_KEY = 'akpany_offline_students_v1';
const OFFLINE_SCHEDULES_KEY = 'akpany_offline_schedules_v1';
const OFFLINE_EXAMS_KEY = 'akpany_offline_exams_v1';
const OFFLINE_LAST_SYNC_KEY = 'akpany_offline_last_sync_v1';
const OFFLINE_ACTION_QUEUE_KEY = 'akpany_offline_action_queue_v1';

export interface OfflineAction {
  id: string;
  type: 'create' | 'update' | 'delete';
  collectionName: 'eleves' | 'notes' | 'absences' | 'cahier_texte' | 'schedules' | 'observations' | 'examens';
  docId: string;
  payload?: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
}

// -----------------------------------------------------------------------------
// Read-Cache Operations
// -----------------------------------------------------------------------------

export function cacheOfflineStudents(students: Eleve[]) {
  if (!students || students.length === 0) return;
  try {
    const dataStr = JSON.stringify(students);
    localStorage.setItem(OFFLINE_STUDENTS_KEY, dataStr);
    localStorage.setItem(OFFLINE_LAST_SYNC_KEY, new Date().toISOString());

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CACHE_OFFLINE_DATA',
        dataType: 'students',
        count: students.length,
        timestamp: Date.now()
      });
    }
  } catch (err) {
    console.warn('Notice caching offline students:', err);
  }
}

export function getCachedOfflineStudents(): Eleve[] {
  try {
    const raw = localStorage.getItem(OFFLINE_STUDENTS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Notice reading offline students cache:', err);
  }
  return [];
}

export function cacheOfflineSchedules(schedules: ScheduleSlot[]) {
  if (!schedules || schedules.length === 0) return;
  try {
    const dataStr = JSON.stringify(schedules);
    localStorage.setItem(OFFLINE_SCHEDULES_KEY, dataStr);
    localStorage.setItem(OFFLINE_LAST_SYNC_KEY, new Date().toISOString());

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CACHE_OFFLINE_DATA',
        dataType: 'schedules',
        count: schedules.length,
        timestamp: Date.now()
      });
    }
  } catch (err) {
    console.warn('Notice caching offline schedules:', err);
  }
}

export function getCachedOfflineSchedules(): ScheduleSlot[] {
  try {
    const raw = localStorage.getItem(OFFLINE_SCHEDULES_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Notice reading offline schedules cache:', err);
  }
  return [];
}

export function cacheOfflineExams(exams: Examen[]) {
  if (!exams) return;
  try {
    const dataStr = JSON.stringify(exams);
    localStorage.setItem(OFFLINE_EXAMS_KEY, dataStr);
    localStorage.setItem(OFFLINE_LAST_SYNC_KEY, new Date().toISOString());

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CACHE_OFFLINE_DATA',
        dataType: 'exams',
        count: exams.length,
        timestamp: Date.now()
      });
    }
  } catch (err) {
    console.warn('Notice caching offline exams:', err);
  }
}

export function getCachedOfflineExams(): Examen[] {
  try {
    const raw = localStorage.getItem(OFFLINE_EXAMS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Notice reading offline exams cache:', err);
  }
  return [];
}

export function getLastSyncTime(): string | null {
  try {
    const raw = localStorage.getItem(OFFLINE_LAST_SYNC_KEY);
    if (raw) {
      const date = new Date(raw);
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ' le ' + date.toLocaleDateString('fr-FR');
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearOfflineCache() {
  try {
    localStorage.removeItem(OFFLINE_STUDENTS_KEY);
    localStorage.removeItem(OFFLINE_SCHEDULES_KEY);
    localStorage.removeItem(OFFLINE_EXAMS_KEY);
    localStorage.removeItem(OFFLINE_LAST_SYNC_KEY);
  } catch (err) {
    console.warn('Notice clearing offline cache:', err);
  }
}

// -----------------------------------------------------------------------------
// Offline Action Queue with Conflict Resolution (Last-Write-Wins)
// -----------------------------------------------------------------------------

export function getOfflineActionQueue(): OfflineAction[] {
  try {
    const raw = localStorage.getItem(OFFLINE_ACTION_QUEUE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Could not read offline action queue:', e);
  }
  return [];
}

export function saveOfflineActionQueue(queue: OfflineAction[]) {
  try {
    localStorage.setItem(OFFLINE_ACTION_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('Could not save offline action queue:', e);
  }
}

/**
 * Enqueues a mutation operation when offline or network fails
 */
export function enqueueOfflineAction(action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount' | 'status'>): OfflineAction {
  const queue = getOfflineActionQueue();
  const newAction: OfflineAction = {
    ...action,
    id: `action_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    timestamp: Date.now(),
    retryCount: 0,
    status: 'pending'
  };

  // Coalesce / deduplicate updates on the same document to prevent redundant writes
  const existingIdx = queue.findIndex(a => a.collectionName === action.collectionName && a.docId === action.docId && a.status === 'pending');
  if (existingIdx >= 0 && action.type === 'update' && queue[existingIdx].type === 'update') {
    queue[existingIdx] = {
      ...queue[existingIdx],
      payload: { ...queue[existingIdx].payload, ...action.payload },
      timestamp: Date.now()
    };
  } else {
    queue.push(newAction);
  }

  saveOfflineActionQueue(queue);
  return newAction;
}

/**
 * Replays all pending actions from the queue to Firestore.
 * Enforces Last-Write-Wins: if the server document has an `updatedAt` newer than the queued action timestamp,
 * server data is respected.
 */
export async function replayOfflineActions(): Promise<{ successCount: number; failureCount: number }> {
  if (!navigator.onLine) {
    return { successCount: 0, failureCount: 0 };
  }

  const queue = getOfflineActionQueue();
  if (queue.length === 0) return { successCount: 0, failureCount: 0 };

  let successCount = 0;
  let failureCount = 0;
  const remainingQueue: OfflineAction[] = [];

  for (const item of queue) {
    try {
      const docRef = doc(db, item.collectionName, item.docId);

      if (item.type === 'create') {
        await setDoc(docRef, {
          ...item.payload,
          createdAt: item.payload?.createdAt || new Date(item.timestamp).toISOString(),
          updatedAt: new Date(item.timestamp).toISOString()
        }, { merge: true });
        successCount++;
      } else if (item.type === 'update') {
        // Last-Write-Wins Conflict Resolution: check remote timestamp
        try {
          const remoteSnap = await getDoc(docRef);
          if (remoteSnap.exists()) {
            const remoteData = remoteSnap.data();
            const remoteUpdatedAt = remoteData.updatedAt ? new Date(remoteData.updatedAt).getTime() : 0;
            if (remoteUpdatedAt > item.timestamp) {
              console.warn(`[LWW Conflict] Server has newer update for ${item.collectionName}/${item.docId}, skipping older offline action.`);
              successCount++;
              continue;
            }
          }
        } catch {
          // If check fails, proceed with safe merge
        }

        await updateDoc(docRef, {
          ...item.payload,
          updatedAt: new Date(item.timestamp).toISOString()
        });
        successCount++;
      } else if (item.type === 'delete') {
        await deleteDoc(docRef);
        successCount++;
      }
    } catch (err: unknown) {
      console.error(`Failed to replay offline action ${item.id}:`, err);
      failureCount++;
      const updatedItem: OfflineAction = {
        ...item,
        retryCount: item.retryCount + 1,
        status: item.retryCount >= 5 ? 'failed' : 'pending',
        error: err instanceof Error ? err.message : String(err)
      };
      if (updatedItem.status !== 'failed') {
        remainingQueue.push(updatedItem);
      }
    }
  }

  saveOfflineActionQueue(remainingQueue);
  return { successCount, failureCount };
}

// Auto-trigger replay whenever network comes back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.info('Network connection restored. Replaying pending offline actions...');
    replayOfflineActions().then(res => {
      if (res.successCount > 0) {
        console.info(`Successfully synchronized ${res.successCount} queued offline actions.`);
      }
    }).catch(e => console.warn('Offline sync replay error:', e));
  });
}
