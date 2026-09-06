import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  query,
  where,
  setDoc,
  updateDoc,
  addDoc,
  CollectionReference,
  DocumentReference,
  Query,
  QueryConstraint,
  SetOptions,
  UpdateData,
  WithFieldValue,
  DocumentData
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export const DEFAULT_ETABLISSEMENT_ID = 'akpany-principal';
export const ETABLISSEMENT_STORAGE_KEY = 'akpany_current_etablissement_id';

export interface MultiTenancyContextValue {
  /** Active school / establishment ID */
  etablissementId: string;
  /** Set the active school / establishment ID (e.g. for multi-school admins) */
  setEtablissementId: (id: string) => void;
  /** Attaches the active etablissementId to any payload object */
  withEtablissement: <T extends Record<string, any>>(data: T) => T & { etablissementId: string };
  /** Validates that a document object has the correct active etablissementId */
  validateEtablissement: (data: Record<string, any>) => boolean;
  /** Creates a scoped Firestore query for a collection name, enforcing etablissementId */
  scopedCollection: <T extends DocumentData = DocumentData>(
    collectionName: string,
    ...extraConstraints: QueryConstraint[]
  ) => Query<T>;
  /** Enforces the active etablissementId filter on any collection or query */
  scopedQuery: <T extends DocumentData = DocumentData>(
    baseTarget: CollectionReference<T> | Query<T> | string,
    ...extraConstraints: QueryConstraint[]
  ) => Query<T>;
  /** Performs setDoc while strictly injecting and enforcing etablissementId */
  scopedSetDoc: <T extends DocumentData>(
    documentRef: DocumentReference<T>,
    data: WithFieldValue<T>,
    options?: SetOptions
  ) => Promise<void>;
  /** Performs addDoc while strictly injecting and enforcing etablissementId */
  scopedAddDoc: <T extends DocumentData>(
    collectionRef: CollectionReference<T>,
    data: WithFieldValue<T>
  ) => Promise<DocumentReference<T>>;
  /** Performs updateDoc while verifying multi-tenant isolation constraints */
  scopedUpdateDoc: <T extends DocumentData>(
    documentRef: DocumentReference<T>,
    data: UpdateData<T>
  ) => Promise<void>;
}

export interface UseMultiTenancyOptions {
  /** Optional override for the establishment ID */
  etablissementId?: string;
}

const MultiTenancyContext = createContext<MultiTenancyContextValue | null>(null);

function getInitialEtablissementId(customId?: string): string {
  if (customId && customId.trim().length > 0) {
    return customId.trim();
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(ETABLISSEMENT_STORAGE_KEY);
      if (stored && stored.trim().length > 0) {
        return stored.trim();
      }
    } catch {
      // Ignore localStorage access errors
    }
  }
  return DEFAULT_ETABLISSEMENT_ID;
}

export interface MultiTenancyProviderProps {
  children: React.ReactNode;
  initialEtablissementId?: string;
}

/**
 * MultiTenancyProvider supplies multi-tenant scoping state and helpers down the React tree.
 */
export const MultiTenancyProvider: React.FC<MultiTenancyProviderProps> = ({
  children,
  initialEtablissementId
}) => {
  const [etablissementId, setEtablissementIdState] = useState<string>(() =>
    getInitialEtablissementId(initialEtablissementId)
  );

  useEffect(() => {
    if (initialEtablissementId && initialEtablissementId.trim().length > 0) {
      setEtablissementIdState(initialEtablissementId.trim());
      try {
        localStorage.setItem(ETABLISSEMENT_STORAGE_KEY, initialEtablissementId.trim());
      } catch {
        // Ignore
      }
    }
  }, [initialEtablissementId]);

  const setEtablissementId = useCallback((newId: string) => {
    const cleanId = newId && newId.trim().length > 0 ? newId.trim() : DEFAULT_ETABLISSEMENT_ID;
    setEtablissementIdState(cleanId);
    try {
      localStorage.setItem(ETABLISSEMENT_STORAGE_KEY, cleanId);
    } catch {
      // Ignore
    }
  }, []);

  const withEtablissement = useCallback(
    <T extends Record<string, any>>(data: T): T & { etablissementId: string } => {
      return {
        ...data,
        etablissementId
      };
    },
    [etablissementId]
  );

  const validateEtablissement = useCallback(
    (data: Record<string, any>): boolean => {
      if (!data || typeof data !== 'object') return false;
      return (
        typeof data.etablissementId === 'string' &&
        data.etablissementId.trim().length > 0 &&
        data.etablissementId === etablissementId
      );
    },
    [etablissementId]
  );

  const scopedQuery = useCallback(
    <T extends DocumentData = DocumentData>(
      baseTarget: CollectionReference<T> | Query<T> | string,
      ...extraConstraints: QueryConstraint[]
    ): Query<T> => {
      const targetQuery =
        typeof baseTarget === 'string'
          ? (collection(db, baseTarget) as CollectionReference<T>)
          : baseTarget;

      return query(targetQuery, where('etablissementId', '==', etablissementId), ...extraConstraints);
    },
    [etablissementId]
  );

  const scopedCollection = useCallback(
    <T extends DocumentData = DocumentData>(
      collectionName: string,
      ...extraConstraints: QueryConstraint[]
    ): Query<T> => {
      return scopedQuery(collection(db, collectionName) as CollectionReference<T>, ...extraConstraints);
    },
    [scopedQuery]
  );

  const scopedSetDoc = useCallback(
    async <T extends DocumentData>(
      documentRef: DocumentReference<T>,
      data: WithFieldValue<T>,
      options?: SetOptions
    ): Promise<void> => {
      if (!etablissementId) {
        throw new Error('MultiTenancy: Active etablissementId is undefined.');
      }
      const enrichedPayload = {
        ...data,
        etablissementId
      } as WithFieldValue<T>;

      if (options) {
        return await setDoc(documentRef, enrichedPayload, options);
      }
      return await setDoc(documentRef, enrichedPayload);
    },
    [etablissementId]
  );

  const scopedAddDoc = useCallback(
    async <T extends DocumentData>(
      collectionRef: CollectionReference<T>,
      data: WithFieldValue<T>
    ): Promise<DocumentReference<T>> => {
      if (!etablissementId) {
        throw new Error('MultiTenancy: Active etablissementId is undefined.');
      }
      const enrichedPayload = {
        ...data,
        etablissementId
      } as WithFieldValue<T>;

      return await addDoc(collectionRef, enrichedPayload);
    },
    [etablissementId]
  );

  const scopedUpdateDoc = useCallback(
    async <T extends DocumentData>(
      documentRef: DocumentReference<T>,
      data: UpdateData<T>
    ): Promise<void> => {
      if (!etablissementId) {
        throw new Error('MultiTenancy: Active etablissementId is undefined.');
      }

      if ('etablissementId' in data && data.etablissementId !== etablissementId) {
        throw new Error(
          `MultiTenancy Violation: Cannot cross-assign document to school '${data.etablissementId}'. Active school is '${etablissementId}'.`
        );
      }

      const safePayload = {
        ...data,
        etablissementId
      } as UpdateData<T>;

      return await updateDoc(documentRef, safePayload);
    },
    [etablissementId]
  );

  const contextValue = useMemo<MultiTenancyContextValue>(
    () => ({
      etablissementId,
      setEtablissementId,
      withEtablissement,
      validateEtablissement,
      scopedCollection,
      scopedQuery,
      scopedSetDoc,
      scopedAddDoc,
      scopedUpdateDoc
    }),
    [
      etablissementId,
      setEtablissementId,
      withEtablissement,
      validateEtablissement,
      scopedCollection,
      scopedQuery,
      scopedSetDoc,
      scopedAddDoc,
      scopedUpdateDoc
    ]
  );

  return (
    <MultiTenancyContext.Provider value={contextValue}>
      {children}
    </MultiTenancyContext.Provider>
  );
};

/**
 * Custom hook providing access to the multi-tenancy context and scoped Firestore helpers.
 * Can be used inside MultiTenancyProvider, or standalone with an optional etablissementId option.
 */
export function useMultiTenancy(options?: UseMultiTenancyOptions): MultiTenancyContextValue {
  const context = useContext(MultiTenancyContext);
  const explicitId = options?.etablissementId;

  // Local fallback if used outside of MultiTenancyProvider or when an explicit ID is supplied
  const [localEtablissementId, setLocalEtablissementId] = useState<string>(() =>
    getInitialEtablissementId(explicitId)
  );

  useEffect(() => {
    if (explicitId && explicitId.trim().length > 0) {
      setLocalEtablissementId(explicitId.trim());
    }
  }, [explicitId]);

  const activeId = explicitId || (context ? context.etablissementId : localEtablissementId);

  const setEtablissementId = useCallback(
    (id: string) => {
      if (context && !explicitId) {
        context.setEtablissementId(id);
      } else {
        const cleanId = id && id.trim().length > 0 ? id.trim() : DEFAULT_ETABLISSEMENT_ID;
        setLocalEtablissementId(cleanId);
        try {
          localStorage.setItem(ETABLISSEMENT_STORAGE_KEY, cleanId);
        } catch {
          // Ignore
        }
      }
    },
    [context, explicitId]
  );

  const withEtablissement = useCallback(
    <T extends Record<string, any>>(data: T): T & { etablissementId: string } => {
      return {
        ...data,
        etablissementId: activeId
      };
    },
    [activeId]
  );

  const validateEtablissement = useCallback(
    (data: Record<string, any>): boolean => {
      if (!data || typeof data !== 'object') return false;
      return (
        typeof data.etablissementId === 'string' &&
        data.etablissementId.trim().length > 0 &&
        data.etablissementId === activeId
      );
    },
    [activeId]
  );

  const scopedQuery = useCallback(
    <T extends DocumentData = DocumentData>(
      baseTarget: CollectionReference<T> | Query<T> | string,
      ...extraConstraints: QueryConstraint[]
    ): Query<T> => {
      const targetQuery =
        typeof baseTarget === 'string'
          ? (collection(db, baseTarget) as CollectionReference<T>)
          : baseTarget;

      return query(targetQuery, where('etablissementId', '==', activeId), ...extraConstraints);
    },
    [activeId]
  );

  const scopedCollection = useCallback(
    <T extends DocumentData = DocumentData>(
      collectionName: string,
      ...extraConstraints: QueryConstraint[]
    ): Query<T> => {
      return scopedQuery(collection(db, collectionName) as CollectionReference<T>, ...extraConstraints);
    },
    [scopedQuery]
  );

  const scopedSetDoc = useCallback(
    async <T extends DocumentData>(
      documentRef: DocumentReference<T>,
      data: WithFieldValue<T>,
      setOptions?: SetOptions
    ): Promise<void> => {
      if (!activeId) {
        throw new Error('MultiTenancy: Active etablissementId is undefined.');
      }
      const safePayload = {
        ...data,
        etablissementId: activeId
      } as WithFieldValue<T>;

      if (setOptions) {
        return await setDoc(documentRef, safePayload, setOptions);
      }
      return await setDoc(documentRef, safePayload);
    },
    [activeId]
  );

  const scopedAddDoc = useCallback(
    async <T extends DocumentData>(
      collectionRef: CollectionReference<T>,
      data: WithFieldValue<T>
    ): Promise<DocumentReference<T>> => {
      if (!activeId) {
        throw new Error('MultiTenancy: Active etablissementId is undefined.');
      }
      const safePayload = {
        ...data,
        etablissementId: activeId
      } as WithFieldValue<T>;

      return await addDoc(collectionRef, safePayload);
    },
    [activeId]
  );

  const scopedUpdateDoc = useCallback(
    async <T extends DocumentData>(
      documentRef: DocumentReference<T>,
      data: UpdateData<T>
    ): Promise<void> => {
      if (!activeId) {
        throw new Error('MultiTenancy: Active etablissementId is undefined.');
      }
      if ('etablissementId' in data && data.etablissementId !== activeId) {
        throw new Error(
          `MultiTenancy Violation: Cannot cross-assign document to school '${data.etablissementId}'. Active school is '${activeId}'.`
        );
      }
      const safePayload = {
        ...data,
        etablissementId: activeId
      } as UpdateData<T>;

      return await updateDoc(documentRef, safePayload);
    },
    [activeId]
  );

  // If using context directly without explicit override, return the shared context value
  if (context && !explicitId) {
    return context;
  }

  return {
    etablissementId: activeId,
    setEtablissementId,
    withEtablissement,
    validateEtablissement,
    scopedCollection,
    scopedQuery,
    scopedSetDoc,
    scopedAddDoc,
    scopedUpdateDoc
  };
}
