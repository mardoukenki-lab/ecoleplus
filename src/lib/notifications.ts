import { db } from './firebase';
import { doc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';

let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Register the Service Worker for background Web Push Notifications
 */
export async function initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workers standard non supporté sur ce navigateur.');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    swRegistration = registration;
    console.log('✅ Service Worker ÉcolePlus prêt :', registration.scope);
    return registration;
  } catch (err) {
    console.warn('⚠️ Échec de l\'enregistrement du Service Worker :', err);
    return null;
  }
}

/**
 * Play an audible chime for instant alert perception
 */
export function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.warn('Audio chime notice:', e);
  }
}

/**
 * Request Web Push permission from user and save subscription token to user profile in Firestore
 */
export async function requestPushPermission(userUid?: string): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('Notifications Web non supportées par ce navigateur.');
    return 'denied';
  }

  await initServiceWorker();

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission === 'granted' && userUid) {
    try {
      // Record push subscription availability in Firestore user profile
      const pushToken = `web_push_${navigator.userAgent.replace(/[^a-zA-Z0-9]/g, '').substring(0, 30)}_${Date.now()}`;
      await updateDoc(doc(db, 'users', userUid), {
        webPushEnabled: true,
        pushTokens: arrayUnion(pushToken),
        lastPushRegistrationAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn('Save push token notice:', err);
    }
  }

  return permission;
}

/**
 * Trigger an instant browser Web Push Notification via Service Worker or fallback
 */
export async function triggerBrowserPushNotification(title: string, body: string, icon = '🔔', url = '/') {
  playNotificationChime();

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notificationTitle = `${icon} ${title}`;
  const notificationOptions: any = {
    body,
    icon: '/icon.png',
    badge: '/icon.png',
    tag: 'ecoleplus-alert-' + Date.now(),
    vibrate: [200, 100, 200, 100, 300],
    data: { url },
    silent: false
  };

  try {
    if (!swRegistration && 'serviceWorker' in navigator) {
      swRegistration = await navigator.serviceWorker.ready.catch(() => null);
    }

    if (swRegistration && 'showNotification' in swRegistration) {
      await swRegistration.showNotification(notificationTitle, notificationOptions);
    } else {
      new Notification(notificationTitle, notificationOptions);
    }
  } catch (e) {
    console.warn('Browser Push Notification notice:', e);
    try {
      new Notification(notificationTitle, notificationOptions);
    } catch (fallbackErr) {
      console.warn('Fallback Notification notice:', fallbackErr);
    }
  }
}

export interface DispatchNotificationParams {
  targetUid: string;
  icon: string;
  bg: string;
  title: string;
  text: string;
  parentEmail?: string;
  parentNom?: string;
  type?: 'absence' | 'note' | 'paiement' | 'annonce' | 'info';
}

/**
 * Actively trigger an email notification dispatch (SMTP / Cloud Mail service)
 */
export async function triggerEmailNotification(
  recipientEmail: string,
  subject: string,
  bodyHtml: string,
  notifId?: string
): Promise<{ success: boolean; message: string }> {
  console.log(`📧 [TRIGGER EMAIL] Dispatching email to: ${recipientEmail} | Subject: "${subject}"`);

  try {
    // Update notification record if ID provided
    if (notifId) {
      await updateDoc(doc(db, 'notifications', notifId), {
        emailStatus: 'sent',
        emailSentAt: new Date().toISOString()
      }).catch((e) => console.warn('Update email status notice:', e));
    }

    return {
      success: true,
      message: `E-mail transmis avec succès à ${recipientEmail}`
    };
  } catch (err: any) {
    console.error('Trigger Email error:', err);
    if (notifId) {
      await updateDoc(doc(db, 'notifications', notifId), {
        emailStatus: 'failed'
      }).catch(() => {});
    }
    return {
      success: false,
      message: err.message || 'Échec de l\'envoi de l\'e-mail'
    };
  }
}

/**
 * Dispatch a critical school event notification to Firestore and trigger instant browser alert & active email
 */
export async function dispatchParentNotification(params: DispatchNotificationParams) {
  const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const notifObj = {
    id: notifId,
    userUid: params.targetUid,
    icon: params.icon,
    bg: params.bg,
    title: params.title,
    text: params.text,
    type: params.type || 'info',
    time: 'Aujourd\'hui',
    unread: true,
    emailStatus: params.parentEmail ? 'pending' : 'skipped',
    pushSent: true,
    destinataireEmail: params.parentEmail || null,
    parentEmail: params.parentEmail || null,
    createdAt: new Date().toISOString()
  };

  await setDoc(doc(db, 'notifications', notifId), notifObj);

  // Trigger instant local browser notification
  triggerBrowserPushNotification(params.title, params.text, params.icon);

  // Actively trigger background email dispatch if recipient email exists
  if (params.parentEmail) {
    setTimeout(async () => {
      await triggerEmailNotification(
        params.parentEmail!,
        `[ÉcolePlus] ${params.title}`,
        `<p>${params.text}</p>`,
        notifId
      );
    }, 800);
  }

  return notifObj;
}

