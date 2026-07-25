# ÉcolePlus Cloud Functions 🚀

Ce dossier contient la fonction Firebase Cloud Function permettant d'envoyer automatiquement un e-mail professionnel aux utilisateurs (Enseignants ou Parents) lorsque leur statut de compte est modifié par l'administrateur (accepté/activé ou refusé).

## Fonctionnalités

- **Déclenchement Automatique** : Écoute les modifications de la collection Firestore `users/{userId}`.
- **Détection Intelligente de Statut** : Envoie un e-mail de validation si le statut passe à `active`, ou un e-mail d'explication si le statut passe à `refused`.
- **E-mails HTML Professionnels** : Intègre des gabarits d'e-mails HTML responsives, élégants, reprenant la charte graphique sobre et moderne d'ÉcolePlus.

---

## 🛠️ Configuration et Prérequis

Pour envoyer des e-mails, cette fonction utilise **Nodemailer** avec un serveur SMTP sécurisé (par exemple, Gmail, SendGrid, Mailgun ou le serveur SMTP de votre établissement).

### 1. Variables d'environnement SMTP

Vous devez configurer les secrets d'environnement de votre projet Firebase pour que la fonction puisse s'authentifier auprès de votre service SMTP :

*   **`SMTP_HOST`** : L'hôte de votre serveur SMTP (par défaut `smtp.gmail.com`).
*   **`SMTP_PORT`** : Le port du serveur (par défaut `465` pour SSL, ou `587` pour TLS).
*   **`SMTP_USER`** : L'adresse e-mail d'envoi (ex: `noreply.ecoleplus@gmail.com`).
*   **`SMTP_PASSWORD`** : **(Requis)** Le mot de passe ou mot de passe d'application de l'adresse e-mail d'envoi.

### 2. Définir le mot de passe d'envoi sécurisé (Firebase Secrets)

Pour de meilleures pratiques de sécurité, utilisez le gestionnaire de secrets de Firebase pour définir votre mot de passe SMTP afin qu'il soit chiffré dans Google Cloud Secret Manager :

```bash
firebase functions:secrets:set SMTP_PASSWORD="votre_mot_de_passe_d_application"
```

Pour définir les autres variables d'environnement (si vous n'utilisez pas Gmail) :

```bash
firebase functions:config:set smtp.host="smtp.votre-serveur.ci" smtp.port="465" smtp.user="notifications@ecoleplus.ci"
```

---

## 🚀 Comment Déployer sur Firebase

### Étape 1 : Se connecter à votre projet Firebase
Si ce n'est pas déjà fait, installez les outils de ligne de commande Firebase et connectez-vous :

```bash
npm install -g firebase-tools
firebase login
```

### Étape 2 : Associer à votre projet Firebase actuel
Associez ce code à votre identifiant de projet Firebase (ex: `ai-studio-coleplus-71e42fc3-26e2-4a9b-bb9d-a1f00c991d16`) :

```bash
firebase use --add
```

### Étape 3 : Installer les dépendances localement
Naviguez dans le dossier `functions` et installez les modules requis :

```bash
cd functions
npm install
```

### Étape 4 : Déployer la fonction et les règles Firestore
Depuis la racine du projet ÉcolePlus, exécutez la commande suivante :

```bash
firebase deploy --only functions
```

Une fois le déploiement terminé, la fonction `onUserStatusChange` sera active et écoutera les modifications de statut dans votre base de données Firestore !

---

## 🧪 Tests Locaux avec l'Émulateur Firebase

Vous pouvez tester l'envoi d'e-mails et le déclenchement de la fonction localement sur votre machine grâce à l'émulateur Firebase :

1. Définissez la variable temporaire dans votre terminal local :
   ```bash
   export SMTP_PASSWORD="votre_mot_de_passe"
   ```
2. Démarrez l'émulateur :
   ```bash
   firebase emulators:start --only functions,firestore
   ```
3. Modifiez le statut d'un utilisateur dans votre Firestore local pour voir l'e-mail se déclencher dans la console !
