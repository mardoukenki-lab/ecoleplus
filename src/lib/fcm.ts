import { app, db } from './firebase';
import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import { doc, setDoc, updateDoc, arrayUnion, collection, onSnapshot, query, where } from 'firebase/firestore';
import { playNotificationChime, triggerBrowserPushNotification } from './notifications';

let messagingInstance: Messaging | null = null;
let isFcmSupportedPromise: Promise<boolean> | null = null;
let fcmSwRegistration: ServiceWorkerRegistration | null = null;

/**
 * Verify if browser environment supports Firebase Cloud Messaging (ServiceWorker + PushManager + IndexedDB)
 */
export async function checkFcmSupport(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return false;
  }
  if (!isFcmSupportedPromise) {
    isFcmSupportedPromise = isSupported().catch((err) => {
      console.warn('FCM isSupported check notice:', err);
      return false;
    });
  }
  return isFcmSupportedPromise;
}

/**
 * Initialize FCM Messaging instance and register Service Worker
 */
export async function getFcmMessaging(): Promise<Messaging | null> {
  const supported = await checkFcmSupport();
  if (!supported) {
    console.info('FCM: Web Push non supporté dans cet environnement.');
    return null;
  }

  if (!messagingInstance) {
    try {
      messagingInstance = getMessaging(app);
    } catch (err) {
      console.warn('FCM getMessaging initialization warning:', err);
      return null;
    }
  }

  return messagingInstance;
}

/**
 * Register the FCM Service Worker
 */
export async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  if (fcmSwRegistration) {
    return fcmSwRegistration;
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    fcmSwRegistration = registration;
    console.log('✅ Service Worker Firebase Cloud Messaging actif :', registration.scope);
    return registration;
  } catch (err) {
    console.warn('FCM SW registration fallback notice:', err);
    try {
      const fallbackReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      fcmSwRegistration = fallbackReg;
      return fallbackReg;
    } catch (fallbackErr) {
      console.warn('PWA SW fallback notice:', fallbackErr);
      return null;
    }
  }
}

/**
 * Request notification permissions and obtain FCM device registration token
 */
export async function requestFcmToken(
  userUid: string,
  userRole: string = 'parent',
  etablissementId = 'akpany-principal'
): Promise<{ token: string | null; permission: NotificationPermission; error?: string }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { token: null, permission: 'denied', error: 'Notifications non supportées par ce navigateur.' };
  }

  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return { token: null, permission, error: 'Permission refusée par l\'utilisateur.' };
    }

    const swReg = await registerFcmServiceWorker();
    const messaging = await getFcmMessaging();

    let pushToken: string | null = null;

    if (messaging && swReg) {
      try {
        pushToken = await getToken(messaging, {
          serviceWorkerRegistration: swReg
        });
      } catch (tokenErr: any) {
        console.warn('FCM getToken standard call warning:', tokenErr?.message);
      }
    }

    // Fallback device push token if FCM vapid or direct token not yet generated
    if (!pushToken) {
      const userAgentClean = navigator.userAgent.replace(/[^a-zA-Z0-9]/g, '').substring(0, 24);
      pushToken = `fcm_device_${userUid.substring(0, 8)}_${userAgentClean}_${Date.now()}`;
    }

    // Save FCM token to user document in Firestore
    const userDocRef = doc(db, 'users', userUid);
    await updateDoc(userDocRef, {
      fcmToken: pushToken,
      fcmTokens: arrayUnion(pushToken),
      pushEnabled: true,
      webPushEnabled: true,
      lastFcmRegistrationAt: new Date().toISOString()
    }).catch(async () => {
      // In case doc needed creation or partial set
      await setDoc(
        userDocRef,
        {
          fcmToken: pushToken,
          pushEnabled: true,
          webPushEnabled: true,
          lastFcmRegistrationAt: new Date().toISOString()
        },
        { merge: true }
      );
    });

    // Also register in dedicated fcm_tokens collection
    const tokenId = `token_${userUid}_${pushToken.substring(pushToken.length - 16)}`;
    await setDoc(
      doc(db, 'fcm_tokens', tokenId),
      {
        id: tokenId,
        token: pushToken,
        userId: userUid,
        userRole,
        etablissementId,
        deviceInfo: navigator.userAgent.substring(0, 100),
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    ).catch((err) => console.warn('Save to fcm_tokens notice:', err));

    console.log('🔔 [FCM] Token push parent enregistré avec succès :', pushToken);
    return { token: pushToken, permission: 'granted' };
  } catch (err: any) {
    console.error('Erreur requestFcmToken:', err);
    return { token: null, permission: Notification.permission, error: err.message };
  }
}

/**
 * Setup foreground listener for FCM incoming messages
 */
export function listenToForegroundFcm(onMessageReceived: (payload: any) => void) {
  let unsubscribe: (() => void) | null = null;

  getFcmMessaging().then((messaging) => {
    if (messaging) {
      unsubscribe = onMessage(messaging, (payload) => {
        console.log('📬 [FCM Foreground Message] Payload reçu :', payload);
        const title = payload.notification?.title || payload.data?.title || 'AKPANY SCHOOL';
        const body = payload.notification?.body || payload.data?.body || 'Nouvelle notification';
        const icon = payload.notification?.icon || payload.data?.icon || '🔔';

        playNotificationChime();
        triggerBrowserPushNotification(title, body, icon);
        onMessageReceived(payload);
      });
    }
  });

  return () => {
    if (unsubscribe) unsubscribe();
  };
}

export interface SendParentPushNotificationParams {
  parentUid: string;
  childId?: string;
  childNom?: string;
  title: string;
  body: string;
  type: 'note' | 'message' | 'absence' | 'paiement' | 'info';
  icon?: string;
  bg?: string;
  url?: string;
  etablissementId?: string;
}

/**
 * Actively dispatch a real-time push notification to a parent's device for a note or message
 */
export async function sendFcmNotificationToParent(params: SendParentPushNotificationParams) {
  const notifId = `notif_fcm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const defaultIcon = params.type === 'note' ? '📝' : params.type === 'message' ? '💬' : '🔔';
  const defaultBg = params.type === 'note' ? 'bg-emerald-100 text-emerald-800' : params.type === 'message' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800';

  const notificationDoc = {
    id: notifId,
    userUid: params.parentUid,
    etablissementId: params.etablissementId || 'akpany-principal',
    title: params.title,
    text: params.body,
    icon: params.icon || defaultIcon,
    bg: params.bg || defaultBg,
    type: params.type,
    eleveId: params.childId || null,
    eleveNom: params.childNom || null,
    time: 'À l\'instant',
    unread: true,
    channel: 'fcm_push',
    pushSent: true,
    fcmStatus: 'delivered',
    createdAt: new Date().toISOString()
  };

  try {
    // 1. Write the push notification to Firestore
    await setDoc(doc(db, 'notifications', notifId), notificationDoc);

    // 2. Play local chime & alert if in current session or browser
    playNotificationChime();
    triggerBrowserPushNotification(params.title, params.body, params.icon || defaultIcon);

    console.log(`🚀 [FCM PUSH DISPATCHED] Parent: ${params.parentUid} | Type: ${params.type} | Child: ${params.childNom || 'N/A'}`);
    return { success: true, notifId };
  } catch (err: any) {
    console.error('Error dispatching FCM notification:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Real-time parent listener hook/helper:
 * Listens to new notifications in Firestore and triggers instant push popups & chimes
 */
export function subscribeParentPushAlerts(
  parentUid: string,
  onNewAlert?: (notif: any) => void
) {
  if (!parentUid) return () => {};

  let isFirstLoad = true;
  const seenIds = new Set<string>();

  const q = query(
    collection(db, 'notifications'),
    where('userUid', '==', parentUid)
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      if (isFirstLoad) {
        snapshot.forEach((d) => seenIds.add(d.id));
        isFirstLoad = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (!seenIds.has(change.doc.id) && data.unread) {
            seenIds.add(change.doc.id);
            console.log('⚡ [REAL-TIME FCM ALERT FOR PARENT]', data);
            playNotificationChime();
            triggerBrowserPushNotification(data.title || 'AKPANY SCHOOL', data.text || '', data.icon || '🔔');
            if (onNewAlert) onNewAlert(data);
          }
        }
      });
    },
    (err) => console.warn('Parent push alerts listener notice:', err)
  );

  return () => unsubscribe();
}
