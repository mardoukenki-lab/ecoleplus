export interface UserProfile {
  uid: string;
  nom: string;
  email: string;
  role: 'admin' | 'prof' | 'parent';
  status: 'pending' | 'active' | 'refused';
  statut?: 'active' | 'archive';
  archivedAt?: string;
  archivedBy?: string;
  tel: string;
  matiere?: string;
  classe?: string;
  etablissement?: string;
  enfants?: { nom: string; classe: string; matricule: string }[];
  createdAt: string;
}

export interface Eleve {
  id: string;
  nom: string;
  classe: string;
  code: string;
  parentUid?: string | null;
  parentNom?: string | null;
  scolaritePayee?: number;
  statut?: 'active' | 'archive';
  archivedAt?: string;
  archivedBy?: string;
  archiveRaison?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: 'eleve_archive' | 'eleve_restore' | 'eleve_delete' | 'prof_deactivate' | 'prof_reactivate' | 'prof_delete' | 'prof_class_change';
  targetId: string;
  targetNom?: string;
  targetName?: string;
  targetType?: 'eleve' | 'prof';
  by?: string;
  byNom?: string;
  adminUid?: string;
  adminNom?: string;
  raison?: string;
  details?: string;
  at?: string;
  timestamp: string;
}

export interface Note {
  id: string;
  eleveId: string;
  eleveNom: string;
  classe: string;
  matiere: string;
  devoir1: number | null;
  devoir2: number | null;
  compo: number | null;
  trimestre: string;
  createdAt: string;
  updatedAt: string;
}

export interface Absence {
  id: string;
  eleveId: string;
  eleveNom: string;
  classe: string;
  matiere: string;
  profNom: string;
  date: string;
  heure: string;
  statut: 'absent' | 'present' | 'retard' | 'justifie';
  createdAt: string;
}

export interface CahierTexte {
  id: string;
  classe: string;
  date: string;
  cours: string;
  devoirs?: string;
  profNom: string;
  createdAt: string;
}

export interface Tranche {
  id: string;
  nom: string;
  montant: number;
  echeance: string; // ISO date string e.g. "2026-10-15"
  echeanceLabel?: string;
  statut: 'paye' | 'en_attente' | 'en_retard';
  montantPaye: number;
  payeLe?: string;
  transactionRef?: string;
  modePaiement?: string;
}

export interface PaiementHistorique {
  date: string;
  montant: number;
  mode: string;
  recuNo?: string;
  trancheNom?: string;
  transactionRef?: string;
}

export interface Paiement {
  id: string;
  eleveId: string;
  eleveNom: string;
  classe: string;
  total: number;
  paye: number;
  solde: number;
  echeance: string;
  modePaiement?: string;
  recuNo?: string;
  historique: PaiementHistorique[];
  tranches?: Tranche[];
}

export interface Annonce {
  id: string;
  destinataire: string;
  objet: string;
  message: string;
  date: string;
  vues: number;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userUid: string; // 'all' or specific user id
  icon: string;
  bg: string;
  title?: string;
  text: string;
  time: string;
  unread: boolean;
  type?: 'absence' | 'note' | 'paiement' | 'annonce' | 'info';
  emailStatus?: 'pending' | 'sent' | 'failed' | 'skipped';
  emailSent?: boolean;
  destinataireEmail?: string | null;
  parentEmail?: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderNom: string;
  senderRole: 'admin' | 'prof' | 'parent';
  recipientUid: string; // user UID or 'all_parents' or 'all_profs' or 'admin'
  recipientNom: string;
  text: string;
  createdAt: string;
}

export interface ScheduleSlot {
  id: string;
  classe: string;
  jour: 'Lundi' | 'Mardi' | 'Mercredi' | 'Jeudi' | 'Vendredi';
  heure: string; // e.g. "07:30" or "07h30 - 08h30"
  matiere: string;
  profNom: string;
  salle?: string;
  createdAt?: string;
}

export interface Observation {
  id: string;
  eleveId: string;
  eleveNom: string;
  classe: string;
  auteurUid: string;
  auteurNom: string;
  auteurRole: 'prof' | 'admin';
  matiere?: string;
  type: 'felicitation' | 'encouragement' | 'avertissement' | 'remarque';
  titre: string;
  description: string;
  date: string;
  createdAt: string;
}
