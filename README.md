# Akpany School — Plateforme Intégrée de Gestion Scolaire & Suivi Parental

Akpany School est une application web progressive (PWA) conçue pour la gestion des établissements scolaires, la scolarité, la saisie des notes, les emplois du temps, le calendrier des examens, les bulletins trimestriels et le suivi en temps réel pour les parents d'élèves.

---

## 🏛️ Architecture Technique

- **Frontend** : React 19, TypeScript, Tailwind CSS, Vite 6, Motion, Recharts, Lucide Icons.
- **Backend & Données** : Firebase v12 (Firestore, Firebase Authentication).
- **Offline / PWA** : Service Worker (`public/sw.js`) & synchronisation locale sécurisée (`src/lib/offlineSync.ts`).
- **Cloud Functions** : Node.js (notifications SMS via passerelle Infobip, e-mails transactionnels SMTP via Nodemailer).

---

## 👥 Rôles & Niveaux d'Accès

1. **Direction & Administration (`admin`)** :
   - Gestion complète des élèves, classes, coefficients et matières.
   - Validation et activation des demandes d'accès (professeurs et parents).
   - Suivi financier des frais de scolarité (tranches, échéanciers, reçus et historique).
   - Programmation des examens, gestion des emplois du temps et diffusion des annonces.
   - Journal d'audit et traçabilité de toutes les actions sensibles.

2. **Corps Enseignant (`prof`)** :
   - Saisie des notes, devoirs, évaluations et appréciations pédagogiques.
   - Pointage quotidien des présences et absences.
   - Remplissage du cahier de texte numérique.
   - Consultation des emplois du temps et du calendrier des examens.
   - Messagerie directe avec l'administration et les parents.

3. **Parents d'Élèves (`parent`)** :
   - Suivi en temps réel des notes, moyennes et bulletins trimestriels.
   - Alertes instantanées de ponctualité et présences.
   - Relevé de scolarité et paiements dématérialisés avec reçus officiels.
   - Dossier d'observations et suivi des devoirs.

---

## 🚀 Démarrage & Développement Local

```bash
# Installation des dépendances
npm install

# Lancement du serveur de développement local
npm run dev

# Vérification TypeScript & Linting
npm run lint

# Compilation de production
npm run build
```

---

## 🛡️ Sécurité & Règles Firestore

Les règles de sécurité (`firestore.rules`) protègent les données sensibles :
- Les relevés de paiement et informations financières sont cloisonnés par élève et réservés à l'administration et aux parents rattachés.
- Les notes, absences et appréciations sont modifiables exclusivement par les enseignants et l'administration.
- Le journal d'audit est en lecture restreinte `admin` et non modifiable après écriture.

Déploiement des règles Firestore :
```bash
firebase deploy --only firestore:rules
```

---

## ⚙️ Variables d'Environnement (Cloud Functions)

Pour activer les notifications par SMS et par e-mail dans `functions/` :

```env
# Passerelle SMS Infobip (optionnel)
INFOBIP_API_KEY=votre_cle_api
INFOBIP_BASE_URL=https://api.infobip.com

# Passerelle E-mail SMTP (optionnel)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=contact@akpanyschool.store
SMTP_PASSWORD=votre_mot_de_passe_application
```

Déploiement des Cloud Functions :
```bash
firebase deploy --only functions
```
