import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Eleve, UserProfile } from '../types';
import { Users, Plus, ChevronRight, User, Search, GraduationCap, Trash2 } from 'lucide-react';

interface ClassesViewProps {
  currentUser: UserProfile;
  studentsList: Eleve[];
  showToast: (msg: string) => void;
}

interface FirestoreClassDoc {
  id: string;
  name: string;
  createdAt?: string;
}

export default function ClassesView({ currentUser, studentsList, showToast }: ClassesViewProps) {
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [customClasses, setCustomClasses] = useState<FirestoreClassDoc[]>([]);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [newClassName, setNewClassName] = useState('');
  const [isAddingClass, setIsAddingClass] = useState(false);
  const [searchStudent, setSearchStudent] = useState('');

  // Fetch custom created classes from Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'classes'), (snap) => {
      const list: FirestoreClassDoc[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as { name: string; createdAt?: string }) });
      });
      setCustomClasses(list);
    }, (err) => console.warn('Classes listener error:', err));

    return () => unsub();
  }, []);

  // Fetch teachers from Firestore users collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => {
        const u = d.data() as UserProfile;
        if (u.role === 'prof') list.push(u);
      });
      setTeachers(list);
    });
    return () => unsub();
  }, []);

  // Compute distinct classes list strictly from Firestore custom classes + active enrolled students
  const existingClassesSet = new Set<string>();
  customClasses.forEach((c) => existingClassesSet.add(c.name.trim()));
  studentsList.forEach((s) => {
    if (s.classe) existingClassesSet.add(s.classe.trim());
  });

  const allDistinctClasses = Array.from(existingClassesSet).sort();

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const cleanName = newClassName.trim();
    if (allDistinctClasses.includes(cleanName)) {
      showToast('⚠️ Cette classe existe déjà.');
      return;
    }

    const classDocId = cleanName.toLowerCase().replace(/[\s/]+/g, '_');
    try {
      await setDoc(doc(db, 'classes', classDocId), {
        name: cleanName,
        createdAt: new Date().toISOString(),
      });
      setSelectedClass(cleanName);
      setNewClassName('');
      setIsAddingClass(false);
      showToast(`✅ Classe "${cleanName}" enregistrée dans la base de données.`);
    } catch (err: any) {
      console.error('Error creating class:', err);
      showToast('❌ Erreur lors de la création de la classe.');
    }
  };

  const handleDeleteClass = async (className: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Voulez-vous vraiment supprimer la classe "${className}" ?`)) return;

    const classDocId = className.toLowerCase().replace(/[\s/]+/g, '_');
    try {
      await deleteDoc(doc(db, 'classes', classDocId));
      if (selectedClass === className) {
        setSelectedClass(null);
      }
      showToast(`🗑️ Classe "${className}" supprimée.`);
    } catch (err: any) {
      console.error('Error deleting class:', err);
      showToast('❌ Échec de la suppression de la classe.');
    }
  };

  const classStudents = selectedClass
    ? studentsList.filter((s) => s.classe === selectedClass && s.nom.toLowerCase().includes(searchStudent.toLowerCase()))
    : [];

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="bg-white rounded-[24px] border border-[#e0e0e0] p-5 shadow-sm flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-bold text-xs uppercase tracking-widest text-[#1a1a1a] flex items-center gap-2">
            <GraduationCap size={16} /> Gestion des Classes & Effectifs (2024-2025)
          </h3>
          <p className="text-xs text-[#9e9e9e] font-medium mt-0.5">
            {allDistinctClasses.length} classe(s) active(s) · {studentsList.length} élève(s) inscrit(s)
          </p>
        </div>

        {currentUser.role === 'admin' && (
          <button
            onClick={() => setIsAddingClass(!isAddingClass)}
            className="bg-[#1a1a1a] hover:bg-black text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-2 cursor-pointer uppercase tracking-widest transition-all shadow-2xs"
          >
            <Plus size={15} /> {isAddingClass ? 'Fermer' : 'Nouvelle Classe'}
          </button>
        )}
      </div>

      {/* Form add new class */}
      {isAddingClass && (
        <form onSubmit={handleCreateClass} className="bg-white rounded-[24px] border border-[#e0e0e0] p-5 shadow-sm space-y-3">
          <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest">
            Nom de la nouvelle classe
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              required
              placeholder="Ex: 6e A, 2nde C, Terminale A"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              className="flex-1 px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
            />
            <button
              type="submit"
              className="bg-[#1a1a1a] hover:bg-black text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer"
            >
              Créer la classe
            </button>
          </div>
        </form>
      )}

      {/* Classes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {allDistinctClasses.map((className) => {
          const count = studentsList.filter((s) => s.classe === className).length;
          const assignedTeacher = teachers.find((t) => t.matiere && t.status === 'active')?.nom || 'Non assigné';
          const isSelected = selectedClass === className;

          return (
            <div
              key={className}
              onClick={() => setSelectedClass(className)}
              className={`bg-white rounded-[24px] border p-5 shadow-2xs transition-all cursor-pointer flex flex-col justify-between space-y-4 relative group ${
                isSelected ? 'border-[#1a1a1a] ring-2 ring-[#1a1a1a]/10' : 'border-[#e0e0e0] hover:border-[#1a1a1a]'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e]">Classe Scolaire</span>
                  <h4 className="text-xl font-bold font-sans text-[#1a1a1a]">{className}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-[#1a1a1a] text-white text-[10px] font-bold px-3 py-1 rounded-xl uppercase tracking-wider">
                    {count} élève(s)
                  </span>
                  {currentUser.role === 'admin' && (
                    <button
                      onClick={(e) => handleDeleteClass(className, e)}
                      title="Supprimer la classe"
                      className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 p-1 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="text-xs text-[#9e9e9e] font-medium border-t border-[#e0e0e0]/50 pt-3 flex justify-between items-center">
                <span>👨‍🏫 Titulaire : <strong className="text-[#1a1a1a]">{assignedTeacher}</strong></span>
                <ChevronRight size={16} className="text-[#9e9e9e]" />
              </div>
            </div>
          );
        })}

        {allDistinctClasses.length === 0 && (
          <div className="col-span-full bg-white rounded-[24px] border border-[#e0e0e0] p-8 text-center text-xs text-[#9e9e9e]">
            Aucune classe configurée. Cliquez sur "Nouvelle Classe" pour en ajouter une ou inscrivez des élèves.
          </div>
        )}
      </div>

      {/* Selected Class Details Panel */}
      {selectedClass && (
        <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3 pb-3 border-b border-[#e0e0e0]">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e]">Liste des élèves inscrits</span>
              <h3 className="font-sans font-bold text-lg text-[#1a1a1a]">Classe de {selectedClass}</h3>
            </div>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-[#9e9e9e]" />
              <input
                type="text"
                placeholder="Rechercher un élève..."
                value={searchStudent}
                onChange={(e) => setSearchStudent(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] bg-[#f5f5f5]/30">
                  <th className="py-2.5 px-4">Élève</th>
                  <th className="py-2.5 px-4">Matricule / Code</th>
                  <th className="py-2.5 px-4">Parent Associé</th>
                  <th className="py-2.5 px-4">Statut Compte Parent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
                {classStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-[#f5f5f5]/20">
                    <td className="py-3 px-4 font-bold text-[#1a1a1a]">{s.nom}</td>
                    <td className="py-3 px-4 text-[#9e9e9e] font-mono font-semibold">{s.code}</td>
                    <td className="py-3 px-4 text-[#1a1a1a] font-medium">{s.parentNom || 'Non associé'}</td>
                    <td className="py-3 px-4">
                      {s.parentUid ? (
                        <span className="bg-emerald-50 text-emerald-700 text-[9px] font-bold px-2.5 py-0.5 rounded-lg uppercase">
                          ✓ Compte Lié
                        </span>
                      ) : (
                        <span className="bg-amber-50 text-amber-700 text-[9px] font-bold px-2.5 py-0.5 rounded-lg uppercase">
                          En attente d'inscription
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {classStudents.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-[#9e9e9e]">
                      Aucun élève inscrit dans la classe de {selectedClass} pour l'instant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
