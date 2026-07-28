import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

// Initialisation de l'application Firebase Admin
initializeApp();
const db = getFirestore();

// Configuration Infobip SMS
const infobipApiKey = process.env.INFOBIP_API_KEY;
const infobipBaseUrl = process.env.INFOBIP_BASE_URL || "https://api.infobip.com";

/**
 * Helper function pour envoyer un SMS via l'API Infobip REST
 */
async function sendInfobipSmsMessage(to, text, sender = "EcolePlus") {
  if (!infobipApiKey) {
    logger.error("La clé d'API Infobip (INFOBIP_API_KEY) n'est pas configurée.");
    throw new Error("Clé API Infobip manquante dans les variables d'environnement.");
  }

  const formattedBaseUrl = infobipBaseUrl.startsWith("http") ? infobipBaseUrl : `https://${infobipBaseUrl}`;
  const endpoint = `${formattedBaseUrl.replace(/\/$/, "")}/sms/2/text/advanced`;

  const payload = {
    messages: [
      {
        destinations: [{ to }],
        from: sender,
        text
      }
    ]
  };

  logger.info(`Envoi SMS Infobip vers ${to} via ${endpoint}...`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `App ${infobipApiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const responseData = await response.json();
  if (!response.ok) {
    logger.error("Échec envoi Infobip SMS:", responseData);
    throw new Error(`Erreur Infobip (${response.status}): ${JSON.stringify(responseData)}`);
  }

  logger.info("SMS Infobip envoyé avec succès:", responseData);
  return responseData;
}

/**
 * Fonction HTTP Firebase (v2) permettant d'envoyer un SMS Infobip directement via requête API POST
 */
export const sendInfobipSMS = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée. Utilisez POST." });
  }

  const { to, text, sender } = req.body || {};

  if (!to || !text) {
    return res.status(400).json({ error: "Les champs 'to' (numéro) et 'text' (message) sont obligatoires." });
  }

  try {
    const result = await sendInfobipSmsMessage(to, text, sender || "EcolePlus");
    return res.status(200).json({ success: true, message: "SMS envoyé avec succès", result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Fonction Cloud déclenchée automatiquement lors de la création d'un document dans 'sms_queue'
 */
export const onSMSQueueCreate = onDocumentCreated("sms_queue/{docId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const data = snap.data();
  const { to, text, sender, status } = data;

  if (status === "sent" || !to || !text) return;

  try {
    const result = await sendInfobipSmsMessage(to, text, sender || "EcolePlus");
    await snap.ref.update({
      status: "sent",
      sentAt: new Date().toISOString(),
      infobipResult: result
    });
  } catch (err) {
    await snap.ref.update({
      status: "failed",
      error: err.message,
      failedAt: new Date().toISOString()
    });
  }
});

// Configuration SMTP d'envoi d'emails.
// Vous pouvez définir ces variables d'environnement dans la console Firebase / GCP
// ou utiliser les secrets Firebase :
// firebase functions:secrets:set SMTP_PASSWORD="votre_mot_de_passe"
const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = parseInt(process.env.SMTP_PORT || "465", 10);
const smtpUser = process.env.SMTP_USER || "noreply.ecoleplus@gmail.com";
const smtpPass = process.env.SMTP_PASSWORD;

// Création d'un transporteur Nodemailer réutilisable
const getTransporter = () => {
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // True pour SSL sur le port 465, False pour TLS sur 587
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
};

/**
 * Helper pour construire le contenu HTML et l'objet de l'e-mail pour une notification
 */
function buildNotificationEmail(notif) {
  let subject = `ÉcolePlus — ${notif.title || "Notification"}`;
  let typeLabel = "Notification ÉcolePlus";
  let badgeColor = "#1a1a1a";
  let badgeBg = "#f5f5f5";

  if (notif.type === "absence") {
    typeLabel = "Avis d'Absence / Retard";
    badgeColor = "#c5221f";
    badgeBg = "#fce8e6";
    subject = `⚠️ ÉcolePlus : ${notif.title || "Avis d'absence"}`;
  } else if (notif.type === "paiement") {
    typeLabel = "Reçu de Paiement / Scolarité";
    badgeColor = "#137333";
    badgeBg = "#e6f4ea";
    subject = `💳 ÉcolePlus : ${notif.title || "Confirmation de paiement"}`;
  } else if (notif.type === "annonce") {
    typeLabel = "Annonce Officielle";
    badgeColor = "#1a73e8";
    badgeBg = "#e8f0fe";
    subject = `📢 ÉcolePlus : ${notif.title || "Nouvelle annonce"}`;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; color: #1a1a1a; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
        .container { max-width: 580px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
        .header { background-color: #1a1a1a; color: #ffffff; padding: 32px 24px; text-align: center; }
        .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
        .subtitle { font-size: 10px; font-weight: 700; color: #9e9e9e; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 6px; }
        .content { padding: 36px 32px; line-height: 1.6; }
        .badge { background-color: ${badgeBg}; color: ${badgeColor}; padding: 4px 10px; border-radius: 8px; font-weight: 700; font-size: 11px; display: inline-block; text-transform: uppercase; margin-bottom: 16px; }
        .title { font-size: 16px; font-weight: 700; color: #1a1a1a; margin-bottom: 12px; }
        .text { font-size: 14px; color: #424242; margin-bottom: 24px; white-space: pre-wrap; }
        .btn-container { text-align: center; margin-top: 32px; }
        .btn { background-color: #1a1a1a; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 12px; font-weight: 700; font-size: 13px; display: inline-block; }
        .footer { background-color: #fafafa; padding: 20px; text-align: center; font-size: 11px; color: #9e9e9e; border-top: 1px solid #e0e0e0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 class="logo">ÉcolePlus</h1>
          <div class="subtitle">${typeLabel}</div>
        </div>
        <div class="content">
          <span class="badge">${typeLabel}</span>
          <div class="title">${notif.title || "Notification d'Information"}</div>
          <div class="text">${notif.text || ""}</div>
          <div class="btn-container">
            <a href="https://ecoleplus.ci" class="btn">Consulter sur ÉcolePlus</a>
          </div>
        </div>
        <div class="footer">
          Cet e-mail automatique est transmis par le système de gestion scolaire ÉcolePlus.
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

// Types de notification pour lesquelles un e-mail doit réellement partir
const EMAIL_ENABLED_TYPES = ['absence', 'annonce', 'paiement'];

/**
 * Cloud Function déclenchée automatiquement lors de la création d'une notification.
 * Envoie un e-mail réel pour les types autorisés (absence, annonce, paiement).
 */
export const onNotificationCreate = onDocumentCreated("notifications/{docId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const notif = snap.data();
  if (!notif) return;

  // Filtrer par type d'événement
  if (!EMAIL_ENABLED_TYPES.includes(notif.type)) {
    await snap.ref.update({ emailStatus: 'skipped' });
    return;
  }

  // Résolution de l'adresse destinataire (destinataireEmail ou parentEmail ou recherche utilisateur)
  let recipientEmail = notif.destinataireEmail || notif.parentEmail;
  if (!recipientEmail && notif.userUid && !['all', 'target_parent', 'target_prof'].includes(notif.userUid)) {
    try {
      const userDoc = await db.collection('users').doc(notif.userUid).get();
      if (userDoc.exists) {
        recipientEmail = userDoc.data().email;
      }
    } catch (e) {
      logger.warn(`Impossible d'obtenir l'email pour le userUid ${notif.userUid}:`, e);
    }
  }

  if (!recipientEmail) {
    await snap.ref.update({ emailStatus: 'failed', emailError: 'Adresse e-mail manquante' });
    return;
  }

  if (!smtpPass) {
    logger.error("La variable d'environnement SMTP_PASSWORD n'est pas configurée. Envoi d'email impossible.");
    await snap.ref.update({ emailStatus: 'failed', emailError: 'SMTP non configuré' });
    return;
  }

  const { subject, html } = buildNotificationEmail(notif);

  try {
    const transporter = getTransporter();
    logger.info(`Envoi en cours d'e-mail de notification (${notif.type}) à ${recipientEmail}...`);
    await transporter.sendMail({
      from: `"ÉcolePlus" <${smtpUser}>`,
      to: recipientEmail,
      subject,
      html
    });
    logger.info(`E-mail de notification (${notif.type}) envoyé avec succès à ${recipientEmail}.`);
    await snap.ref.update({
      emailStatus: 'sent',
      emailSentAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Échec d'envoi d'e-mail pour la notification ${snap.id} à ${recipientEmail} :`, error);
    await snap.ref.update({
      emailStatus: 'failed',
      emailError: error.message || 'Erreur d\'envoi d\'e-mail'
    });
  }
});

/**
 * Fonction Cloud de second niveau (v2) déclenchée à la mise à jour d'un document utilisateur.
 * Détecte les changements de statut pour envoyer l'email adéquat.
 */
export const onUserStatusChange = onDocumentUpdated("users/{userId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  // Sortie précoce si aucune donnée n'est présente
  if (!beforeData || !afterData) {
    logger.info("Données utilisateur manquantes ou document supprimé.");
    return;
  }

  const nom = afterData.nom || "Utilisateur ÉcolePlus";
  const email = afterData.email;
  const role = afterData.role; // 'prof' ou 'parent'
  const newStatus = afterData.status; // 'active', 'refused', 'pending'
  const oldStatus = beforeData.status;

  // On vérifie que le statut a bien changé
  if (newStatus === oldStatus) {
    logger.info(`Pas de changement de statut pour ${nom} (Statut actuel: ${newStatus}).`);
    return;
  }

  // Si l'utilisateur n'a pas d'adresse email valide, on ne peut pas envoyer d'email
  if (!email) {
    logger.warn(`L'utilisateur ${nom} n'a pas d'adresse e-mail enregistrée.`);
    return;
  }

  // Vérification de sécurité pour alerter si le mot de passe SMTP n'est pas configuré
  if (!smtpPass) {
    logger.error("La variable d'environnement SMTP_PASSWORD n'est pas définie. Envoi d'email impossible.");
    return;
  }

  const roleText = role === "prof" ? "Enseignant" : "Parent d'élève";
  let subject = "";
  let htmlContent = "";

  // Création du message selon le nouveau statut
  if (newStatus === "active") {
    subject = "Félicitations ! Votre compte ÉcolePlus a été validé ✅";
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; color: #1a1a1a; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
          .container { max-width: 580px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
          .header { background-color: #1a1a1a; color: #ffffff; padding: 32px 24px; text-align: center; }
          .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
          .subtitle { font-size: 10px; font-weight: 700; color: #9e9e9e; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 6px; }
          .content { padding: 40px 32px; line-height: 1.6; }
          .greeting { font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 16px; color: #1a1a1a; }
          .text { font-size: 14px; color: #424242; margin-bottom: 24px; }
          .box { background-color: #fcfcfc; border: 1px solid #e0e0e0; border-radius: 16px; padding: 20px; margin: 24px 0; }
          .box-title { font-size: 10px; font-weight: 700; color: #9e9e9e; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px 0; }
          .info-row { font-size: 13px; margin: 6px 0; color: #1a1a1a; }
          .badge { background-color: #e6f4ea; color: #137333; padding: 4px 10px; border-radius: 8px; font-weight: 700; font-size: 11px; display: inline-block; text-transform: uppercase; }
          .btn-container { text-align: center; margin-top: 32px; }
          .btn { background-color: #1a1a1a; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 12px; font-weight: 700; font-size: 13px; display: inline-block; transition: all 0.2s ease; }
          .footer { background-color: #fafafa; padding: 20px; text-align: center; font-size: 11px; color: #9e9e9e; border-top: 1px solid #e0e0e0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="logo">ÉcolePlus</h1>
            <div class="subtitle">Validation de compte</div>
          </div>
          <div class="content">
            <p class="greeting">Bonjour ${nom},</p>
            <p class="text">Nous avons le grand plaisir de vous informer que votre demande d'inscription sur la plateforme <strong>ÉcolePlus</strong> en tant que <strong>${roleText}</strong> a été validée avec succès par la direction de l'établissement.</p>
            
            <div class="box">
              <h4 class="box-title">Détails d'accès</h4>
              <div class="info-row"><strong>E-mail :</strong> ${email}</div>
              <div class="info-row"><strong>Rôle :</strong> ${roleText}</div>
              <div class="info-row" style="margin-top: 10px;"><strong>Statut :</strong> <span class="badge">Actif</span></div>
            </div>

            <p class="text">Vous pouvez dès à présent vous connecter pour accéder à l'ensemble de vos services de suivi scolaire en temps réel (emplois du temps, notes, bulletins, absences et messagerie).</p>

            <div class="btn-container">
              <a href="https://ecoleplus.ci" class="btn">Accéder à ÉcolePlus</a>
            </div>
          </div>
          <div class="footer">
            Cet e-mail est généré automatiquement par ÉcolePlus. Merci de ne pas y répondre directement.
          </div>
        </div>
      </body>
      </html>
    `;
  } else if (newStatus === "refused") {
    subject = "Information concernant votre inscription ÉcolePlus ⚠️";
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; color: #1a1a1a; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
          .container { max-width: 580px; margin: 40px auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
          .header { background-color: #1a1a1a; color: #ffffff; padding: 32px 24px; text-align: center; }
          .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
          .subtitle { font-size: 10px; font-weight: 700; color: #9e9e9e; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 6px; }
          .content { padding: 40px 32px; line-height: 1.6; }
          .greeting { font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 16px; color: #1a1a1a; }
          .text { font-size: 14px; color: #424242; margin-bottom: 24px; }
          .box { background-color: #fef8f8; border: 1px solid #fce8e6; border-radius: 16px; padding: 20px; margin: 24px 0; }
          .box-title { font-size: 10px; font-weight: 700; color: #c5221f; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px 0; }
          .info-row { font-size: 13px; margin: 6px 0; color: #1a1a1a; }
          .badge { background-color: #fce8e6; color: #c5221f; padding: 4px 10px; border-radius: 8px; font-weight: 700; font-size: 11px; display: inline-block; text-transform: uppercase; }
          .footer { background-color: #fafafa; padding: 20px; text-align: center; font-size: 11px; color: #9e9e9e; border-top: 1px solid #e0e0e0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="logo">ÉcolePlus</h1>
            <div class="subtitle">Notification d'inscription</div>
          </div>
          <div class="content">
            <p class="greeting">Bonjour ${nom},</p>
            <p class="text">Nous vous remercions pour votre demande d'inscription sur la plateforme <strong>ÉcolePlus</strong>.</p>
            
            <p class="text">Après examen des informations fournies pour votre compte de <strong>${roleText}</strong>, nous sommes au regret de vous informer que votre demande a été rejetée par l'administration de l'établissement ou requiert des corrections.</p>
            
            <div class="box">
              <h4 class="box-title">Statut de la demande</h4>
              <div class="info-row"><strong>E-mail :</strong> ${email}</div>
              <div class="info-row"><strong>Rôle :</strong> ${roleText}</div>
              <div class="info-row" style="margin-top: 10px;"><strong>Statut :</strong> <span class="badge">Non validé / Refusé</span></div>
            </div>

            <p class="text">Si vous pensez qu'il s'agit d'une erreur de saisie ou si vous souhaitez soumettre un nouveau dossier muni des pièces justificatives de l'établissement, nous vous invitons à vous rapprocher directement de l'administration du Lycée.</p>
          </div>
          <div class="footer">
            Cet e-mail est généré automatiquement par ÉcolePlus. Merci de ne pas y répondre directement.
          </div>
        </div>
      </body>
      </html>
    `;
  } else {
    // Si l'utilisateur est passé au statut 'pending' ou autre, pas d'email d'activation/rejet à envoyer
    return;
  }

  // Configuration de l'email
  const mailOptions = {
    from: `"ÉcolePlus" <${smtpUser}>`,
    to: email,
    subject: subject,
    html: htmlContent,
  };

  try {
    const transporter = getTransporter();
    logger.info(`Envoi en cours de l'e-mail de notification à ${email} (Statut: ${newStatus})...`);
    const info = await transporter.sendMail(mailOptions);
    logger.info(`E-mail de statut envoyé avec succès à ${email}. MessageID: ${info.messageId}`);
  } catch (error) {
    logger.error(`Erreur d'envoi d'e-mail à ${email} :`, error);
  }
});
