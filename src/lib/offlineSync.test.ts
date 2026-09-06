import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueOfflineAction,
  getOfflineActionQueue,
  saveOfflineActionQueue,
  cacheOfflineStudents,
  getCachedOfflineStudents,
  clearOfflineCache
} from './offlineSync';
import { Eleve } from '../types';

// Mock localStorage for node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock
});

describe('offlineSync - Action Queue & Cache Management', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('caches and retrieves offline students list', () => {
    const mockStudents: Eleve[] = [
      {
        id: 'elv-1',
        nom: 'Koffi Marie',
        classe: '3e B',
        code: 'ELV-1029',
        createdAt: '2026-09-01T10:00:00Z'
      }
    ];

    cacheOfflineStudents(mockStudents);
    const retrieved = getCachedOfflineStudents();

    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].nom).toBe('Koffi Marie');
    expect(retrieved[0].classe).toBe('3e B');
  });

  it('clears offline students cache on demand', () => {
    cacheOfflineStudents([
      {
        id: 'elv-1',
        nom: 'Koffi Marie',
        classe: '3e B',
        code: 'ELV-1029',
        createdAt: '2026-09-01T10:00:00Z'
      }
    ]);

    clearOfflineCache();
    expect(getCachedOfflineStudents()).toEqual([]);
  });

  it('enqueues mutations into the persistent action queue with pending status', () => {
    const action = enqueueOfflineAction({
      type: 'create',
      collectionName: 'notes',
      docId: 'note-123',
      payload: { eleveId: 'elv-1', devoir1: 15 }
    });

    expect(action.status).toBe('pending');
    expect(action.retryCount).toBe(0);

    const queue = getOfflineActionQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].docId).toBe('note-123');
  });

  it('coalesces multiple updates to the same document in the queue', () => {
    enqueueOfflineAction({
      type: 'update',
      collectionName: 'notes',
      docId: 'note-456',
      payload: { devoir1: 12 }
    });

    enqueueOfflineAction({
      type: 'update',
      collectionName: 'notes',
      docId: 'note-456',
      payload: { devoir2: 14 }
    });

    const queue = getOfflineActionQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toEqual({
      devoir1: 12,
      devoir2: 14
    });
  });
});
