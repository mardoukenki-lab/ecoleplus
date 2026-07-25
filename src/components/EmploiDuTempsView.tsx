import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { ScheduleSlot, UserProfile } from '../types';
import { Calendar, Clock, Plus, Trash2, BookOpen, User, Building } from 'lucide-react';

interface EmploiDuTempsViewProps {
  currentUser: UserProfile;
  classesList: string[];
  showToast: (msg: string) => void;
}

const HOURS = ['07h30 - 08h30', '08h30 - 09h30', '09h30 - 10h30', '10h30 - 11h30', '11h30 - 12h30', '14h30 - 15h30', '15h30 - 16h30', '16h30 - 17h30'];
const DAYS: Array<'Lundi' | 'Mardi' | 'Mercredi' | 'Jeudi' | 'Vendredi'> = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

export default function EmploiDuTempsView({ currentUser, classesList, showToast }: EmploiDuTempsViewProps) {
  const [schedules, setSchedules] = useState<ScheduleSlot[]>([]);
  const [selectedClasse, setSelectedClasse] = useState<string>(classesList[0] || '6e A');
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [formJour, setFormJour] = useState<'Lundi' | 'Mardi' | 'Mercredi' | 'Jeudi' | 'Vendredi'>('Lundi');
  const [formHeure, setFormHeure] = useState(HOURS[0]);
  const [formMatiere, setFormMatiere] = useState('Mathématiques');
  const [formProf, setFormProf] = useState(currentUser.role === 'prof' ? currentUser.nom : 'M. Coulibaly');
  const [formSalle, setFormSalle] = useState('Salle 12');

  useEffect(() => {
    if (classesList.length > 0 && !classesList.includes(selectedClasse)) {
      setSelectedClasse(classesList[0]);
    }
  }, [classesList]);

  // Fetch real schedules from Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'schedules'),
      (snap) => {
        const list: ScheduleSlot[] = [];
        snap.forEach((d) => list.push(d.data() as ScheduleSlot));
        setSchedules(list);
      },
      (err) => console.warn('Schedule listener error:', err)
    );
    return () => unsub();
  }, []);

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClasse) {
      showToast('❌ Veuillez sélectionner une classe.');
      return;
    }

    const slotId = `sch_${selectedClasse.replace(/\s+/g, '')}_${formJour}_${formHeure.replace(/\s+/g, '')}`;
    const newSlot: ScheduleSlot = {
      id: slotId,
      classe: selectedClasse,
      jour: formJour,
      heure: formHeure,
      matiere: formMatiere,
      profNom: formProf,
      salle: formSalle,
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'schedules', slotId), newSlot);
      showToast(`✅ Cours de ${formMatiere} ajouté pour la classe ${selectedClasse} (${formJour} à ${formHeure})`);
      setIsAdding(false);
    } catch (err: any) {
      console.error(err);
      showToast('❌ Erreur lors de l\'enregistrement du cours.');
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    try {
      await deleteDoc(doc(db, 'schedules', slotId));
      showToast('🗑️ Créneau supprimé avec succès.');
    } catch (err: any) {
      console.error(err);
      showToast('❌ Échec de la suppression.');
    }
  };

  const classSchedules = schedules.filter((s) => s.classe === selectedClasse);

  return (
    <div className="space-y-6">
      {/* Controls Header */}
      <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-5 shadow-sm flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-[#9e9e9e] uppercase tracking-widest flex items-center gap-1.5">
            <Calendar size={15} className="text-[#1a1a1a]" /> Classe :
          </label>
          <select
            value={selectedClasse}
            onChange={(e) => setSelectedClasse(e.target.value)}
            className="px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
          >
            {classesList.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {(currentUser.role === 'admin' || currentUser.role === 'prof') && (
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="bg-[#1a1a1a] hover:bg-black text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-2 cursor-pointer uppercase tracking-widest transition-all shadow-2xs"
          >
            <Plus size={15} /> {isAdding ? 'Fermer le formulaire' : 'Ajouter un cours'}
          </button>
        )}
      </div>

      {/* Add Slot Form Modal / Banner */}
      {isAdding && (
        <form onSubmit={handleAddSlot} className="bg-white rounded-[24px] border border-[#e0e0e0] p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-xs uppercase tracking-widest text-[#1a1a1a] flex items-center gap-2">
            <Clock size={16} /> Programmer un nouveau cours en direct
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Jour</label>
              <select
                value={formJour}
                onChange={(e) => setFormJour(e.target.value as any)}
                className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Plage Horaire</label>
              <select
                value={formHeure}
                onChange={(e) => setFormHeure(e.target.value)}
                className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Matière</label>
              <input
                type="text"
                required
                value={formMatiere}
                onChange={(e) => setFormMatiere(e.target.value)}
                placeholder="Ex: Mathématiques"
                className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Enseignant</label>
              <input
                type="text"
                required
                value={formProf}
                onChange={(e) => setFormProf(e.target.value)}
                placeholder="Ex: M. Coulibaly"
                className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">Salle / Emplacement</label>
              <input
                type="text"
                value={formSalle}
                onChange={(e) => setFormSalle(e.target.value)}
                placeholder="Ex: Salle 04"
                className="w-full px-3 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 border border-[#e0e0e0] rounded-xl text-xs font-bold text-[#9e9e9e] hover:bg-[#f5f5f5]"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="bg-[#1a1a1a] hover:bg-black text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer"
            >
              Enregistrer le cours
            </button>
          </div>
        </form>
      )}

      {/* Timetable Table */}
      <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm p-6 overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-6 gap-2.5 text-center mb-3">
            <div className="font-bold text-[10px] text-[#9e9e9e] uppercase tracking-widest p-2 flex items-center justify-center gap-1">
              <Clock size={13} /> Horaires
            </div>
            {DAYS.map((j) => (
              <div key={j} className="font-bold text-xs text-[#1a1a1a] bg-[#f5f5f5] py-2.5 rounded-xl uppercase tracking-wider">
                {j}
              </div>
            ))}
          </div>

          {HOURS.map((h) => (
            <div key={h} className="grid grid-cols-6 gap-2.5 text-center mb-2.5 items-stretch">
              <div className="text-[10px] font-bold text-[#9e9e9e] p-2 flex items-center justify-center bg-[#f5f5f5]/30 rounded-xl">
                {h}
              </div>
              {DAYS.map((j) => {
                const slot = classSchedules.find((s) => s.jour === j && s.heure === h);
                return (
                  <div
                    key={j}
                    className={`border rounded-2xl p-2.5 min-h-[72px] flex flex-col justify-between transition-all relative group ${
                      slot
                        ? 'border-[#e0e0e0] bg-white text-[#1a1a1a] shadow-2xs'
                        : 'border-[#e0e0e0]/40 bg-[#f5f5f5]/20 text-[#9e9e9e] items-center justify-center'
                    }`}
                  >
                    {slot ? (
                      <>
                        <div className="flex justify-between items-start text-left">
                          <span className="font-bold text-xs text-[#1a1a1a] leading-tight block">{slot.matiere}</span>
                          {(currentUser.role === 'admin' || currentUser.role === 'prof') && (
                            <button
                              onClick={() => handleDeleteSlot(slot.id)}
                              title="Supprimer ce créneau"
                              className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 p-0.5 transition-opacity"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                        <div className="text-[10px] text-[#9e9e9e] text-left mt-1 font-medium">
                          <div>👨‍🏫 {slot.profNom}</div>
                          {slot.salle && <div className="text-[9px] font-mono">🏫 {slot.salle}</div>}
                        </div>
                      </>
                    ) : (
                      <span className="text-[10px] text-[#e0e0e0] font-semibold italic">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
