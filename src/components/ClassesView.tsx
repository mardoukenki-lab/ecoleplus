import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { Eleve, UserProfile, SubjectAssignment } from '../types';
import { Users, Plus, ChevronRight, User, Search, GraduationCap, Trash2, Edit3, X, Save, BookOpen, CheckCircle2, UserPlus, FileText } from 'lucide-react';
import BulletinPrintModal from './BulletinPrintModal';

interface ClassesViewProps {
  currentUser: UserProfile;
  studentsList: Eleve[];
  showToast: (msg: string) => void;
}

interface FirestoreClassDoc {
  id: string;
  name: string;
  scolarite?: number;
  titulaireUid?: string;
  titulaireNom?: string;
  assignments?: SubjectAssignment[];
  createdAt?: string;
}

const DEFAULT_MATIERES = [
  'Mathématiques',
  'Français',
  'Espagnol',
  'Philosophie',
  'Anglais',
  'Histoire-Géographie',
  'SVT',
  'Physique-Chimie',
  'EPS',
  'Allemand',
  'Informatique'
];

export default function ClassesView({ currentUser, studentsList, showToast }: ClassesViewProps) {
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [customClasses, setCustomClasses] = useState<FirestoreClassDoc[]>([]);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedDetailTab, setSelectedDetailTab] = useState<'profs' | 'eleves'>('profs');
  const [newClassName, setNewClassName] = useState('');
  const [newClassScolarite, setNewClassScolarite] = useState('');
  const [isAddingClass, setIsAddingClass] = useState(false);
  const [searchStudent, setSearchStudent] = useState('');
  const [deletedClasses, setDeletedClasses] = useState<Set<string>>(new Set());
  const [newCustomMatiereInput, setNewCustomMatiereInput] = useState('');

  // Class Edit Modal state
  const [selectedStudentForBulletin, setSelectedStudentForBulletin] = useState<Eleve | null>(null);
  const [editingClass, setEditingClass] = useState<string | null>(null);
  const [editClassName, setEditClassName] = useState('');
  const [editClassScolarite, setEditClassScolarite] = useState('');
  const [editClassTitulaireUid, setEditClassTitulaireUid] = useState('');

  // Fetch custom created classes from Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'classes'), (snap) => {
      const list: FirestoreClassDoc[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          name: data.name,
          scolarite: data.scolarite,
          titulaireUid: data.titulaireUid,
          titulaireNom: data.titulaireNom,
          assignments: data.assignments || [],
          createdAt: data.createdAt
        });
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
  customClasses.forEach((c) => {
    if (c.name && !deletedClasses.has(c.name.trim().toLowerCase())) {
      existingClassesSet.add(c.name.trim());
    }
  });
  studentsList.forEach((s) => {
    if (s.classe && !deletedClasses.has(s.classe.trim().toLowerCase())) {
      existingClassesSet.add(s.classe.trim());
    }
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

    const scolariteVal = Number(newClassScolarite) || 0;
    const classDocId = cleanName.toLowerCase().replace(/[\s/]+/g, '_');
    try {
      await setDoc(doc(db, 'classes', classDocId), {
        name: cleanName,
        scolarite: scolariteVal,
        createdAt: new Date().toISOString(),
      });
      setSelectedClass(cleanName);
      setNewClassName('');
      setNewClassScolarite('');
      setIsAddingClass(false);
      showToast(`✅ Classe "${cleanName}" enregistrée${scolariteVal > 0 ? ` avec scolarité de ${scolariteVal.toLocaleString('fr-FR')} FCFA` : ''}.`);
    } catch (err: any) {
      console.error('Error creating class:', err);
      showToast('❌ Erreur lors de la création de la classe.');
    }
  };

  const handleOpenEditModal = (className: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const classDoc = customClasses.find(c => c.name.trim().toLowerCase() === className.trim().toLowerCase());
    const assignedProfObj = teachers.find(t => t.classe === className || (classDoc?.titulaireUid && t.uid === classDoc.titulaireUid));

    setEditingClass(className);
    setEditClassName(className);
    setEditClassScolarite(classDoc?.scolarite ? classDoc.scolarite.toString() : '');
    setEditClassTitulaireUid(classDoc?.titulaireUid || assignedProfObj?.uid || '');
  };

  const handleSaveEditedClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;

    const oldName = editingClass.trim();
    const newName = editClassName.trim();
    if (!newName) {
      showToast('⚠️ Le nom de la classe est obligatoire.');
      return;
    }

    const scolariteVal = Number(editClassScolarite) || 0;
    const selectedProf = teachers.find(t => t.uid === editClassTitulaireUid);

    try {
      const oldDocId = oldName.toLowerCase().replace(/[\s/]+/g, '_');
      const newDocId = newName.toLowerCase().replace(/[\s/]+/g, '_');

      if (oldName !== newName) {
        try {
          await deleteDoc(doc(db, 'classes', oldDocId));
        } catch (err) {
          // ignore if non-existent
        }
      }

      await setDoc(doc(db, 'classes', newDocId), {
        name: newName,
        scolarite: scolariteVal,
        titulaireUid: selectedProf?.uid || null,
        titulaireNom: selectedProf?.nom || null,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      if (oldName !== newName) {
        // Update all students
        try {
          const studentSnap = await getDocs(query(collection(db, 'eleves'), where('classe', '==', oldName)));
          if (!studentSnap.empty) {
            const batch = writeBatch(db);
            studentSnap.forEach(d => {
              batch.update(doc(db, 'eleves', d.id), { classe: newName });
            });
            await batch.commit();
          }
        } catch (err) {
          console.warn('Error updating students class name:', err);
        }

        // Update teachers
        try {
          const teacherSnap = await getDocs(query(collection(db, 'users'), where('classe', '==', oldName)));
          teacherSnap.forEach(async (d) => {
            await updateDoc(doc(db, 'users', d.id), { classe: newName });
          });
        } catch (err) {
          console.warn('Error updating teachers class name:', err);
        }

        if (selectedClass === oldName) {
          setSelectedClass(newName);
        }
      }

      if (selectedProf) {
        await updateDoc(doc(db, 'users', selectedProf.uid), { classe: newName });
      }

      showToast(`✅ Classe "${newName}" mise à jour avec succès !`);
      setEditingClass(null);
    } catch (err: any) {
      console.error('Error updating class:', err);
      showToast('❌ Échec de la mise à jour de la classe.');
    }
  };

  const handleDeleteClass = async (className: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const count = studentsList.filter((s) => s.classe === className).length;
    const confirmMsg = count > 0
      ? `La classe "${className}" contient ${count} élève(s).\n\nVoulez-vous vraiment supprimer cette classe et désinscrire ces élèves de cette classe ?`
      : `Voulez-vous vraiment supprimer définitivement la classe "${className}" ?`;

    if (!window.confirm(confirmMsg)) return;

    // Immediately update local state so UI updates without delay
    const targetKey = className.trim().toLowerCase();
    setDeletedClasses((prev) => new Set(prev).add(targetKey));
    setCustomClasses((prev) => prev.filter((c) => c.name.trim().toLowerCase() !== targetKey));
    if (editingClass === className) setEditingClass(null);

    try {
      // 1. Delete all Firestore documents in 'classes' matching this name or id
      const matchingDocs = customClasses.filter(c => c.name.trim().toLowerCase() === className.trim().toLowerCase());
      for (const mDoc of matchingDocs) {
        await deleteDoc(doc(db, 'classes', mDoc.id));
      }

      const classDocId = className.toLowerCase().replace(/[\s/]+/g, '_');
      try {
        await deleteDoc(doc(db, 'classes', classDocId));
      } catch (e) {
        // Ignored if document didn't exist
      }

      // Query any remaining docs in 'classes' where name == className
      try {
        const snap = await getDocs(query(collection(db, 'classes'), where('name', '==', className)));
        snap.forEach(async (d) => {
          await deleteDoc(doc(db, 'classes', d.id));
        });
      } catch (e) {
        console.warn('Class cleanup query notice:', e);
      }

      // 2. Unassign students from this deleted class in Firestore
      try {
        const studentSnap = await getDocs(query(collection(db, 'eleves'), where('classe', '==', className)));
        if (!studentSnap.empty) {
          const batch = writeBatch(db);
          studentSnap.forEach((d) => {
            batch.update(doc(db, 'eleves', d.id), { classe: '' });
          });
          await batch.commit();
        }
      } catch (e) {
        console.warn('Student unassign notice:', e);
      }

      // 3. Unassign teachers assigned as titular of this class
      try {
        const teacherSnap = await getDocs(query(collection(db, 'users'), where('classe', '==', className)));
        teacherSnap.forEach(async (d) => {
          await updateDoc(doc(db, 'users', d.id), { classe: null });
        });
      } catch (e) {
        console.warn('Teacher class unassign notice:', e);
      }

      if (selectedClass === className) {
        setSelectedClass(null);
      }
      showToast(`🗑️ Classe "${className}" supprimée avec succès.`);
    } catch (err: any) {
      console.error('Error deleting class:', err);
      showToast('❌ Échec de la suppression de la classe.');
    }
  };

  const handleDeleteStudent = async (student: Eleve) => {
    if (!window.confirm(`Voulez-vous vraiment supprimer l'élève "${student.nom}" ?`)) return;
    try {
      await deleteDoc(doc(db, 'eleves', student.id));
      showToast(`🗑️ Élève "${student.nom}" supprimé.`);
    } catch (err: any) {
      console.error('Error deleting student:', err);
      showToast('❌ Échec de la suppression de l\'élève.');
    }
  };

  const handleChangeStudentClass = async (student: Eleve) => {
    const targetClass = window.prompt(`Transférer "${student.nom}" dans une autre classe. Saisissez la nouvelle classe :`, student.classe);
    if (!targetClass || !targetClass.trim() || targetClass.trim() === student.classe) return;
    
    const cleanClass = targetClass.trim();
    try {
      await updateDoc(doc(db, 'eleves', student.id), { classe: cleanClass });
      showToast(`🔄 "${student.nom}" a été transféré de ${student.classe} vers ${cleanClass}.`);
    } catch (err: any) {
      console.error('Error changing student class:', err);
      showToast('❌ Échec du changement de classe.');
    }
  };

  const handleAssignTeacherToSubject = async (className: string, matiere: string, profUid: string) => {
    const classDocId = className.toLowerCase().replace(/[\s/]+/g, '_');
    const existingClassDoc = customClasses.find((c) => c.name.trim().toLowerCase() === className.trim().toLowerCase());
    let currentAssignments = existingClassDoc?.assignments ? [...existingClassDoc.assignments] : [];

    const prevAssignment = currentAssignments.find((a) => a.matiere === matiere);
    currentAssignments = currentAssignments.filter((a) => a.matiere !== matiere);

    let assignedProfName: string | null = null;

    if (profUid) {
      const selectedProf = teachers.find((t) => t.uid === profUid);
      if (selectedProf) {
        assignedProfName = selectedProf.nom;
        currentAssignments.push({
          matiere,
          profUid: selectedProf.uid,
          profNom: selectedProf.nom
        });

        const profEnseignements = selectedProf.enseignements ? [...selectedProf.enseignements] : [];
        if (!profEnseignements.some((e) => e.classe === className && e.matiere === matiere)) {
          profEnseignements.push({ classe: className, matiere });
          try {
            await updateDoc(doc(db, 'users', selectedProf.uid), {
              enseignements: profEnseignements,
              updatedAt: new Date().toISOString()
            });
          } catch (e) {
            console.warn('Sync prof profile notice:', e);
          }
        }
      }
    }

    if (prevAssignment && prevAssignment.profUid && prevAssignment.profUid !== profUid) {
      const oldProf = teachers.find((t) => t.uid === prevAssignment.profUid);
      if (oldProf && oldProf.enseignements) {
        const updatedEnseignements = oldProf.enseignements.filter(
          (e) => !(e.classe === className && e.matiere === matiere)
        );
        try {
          await updateDoc(doc(db, 'users', oldProf.uid), {
            enseignements: updatedEnseignements,
            updatedAt: new Date().toISOString()
          });
        } catch (e) {
          console.warn('Unsync old prof profile notice:', e);
        }
      }
    }

    try {
      await setDoc(doc(db, 'classes', classDocId), {
        name: className,
        assignments: currentAssignments,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      if (assignedProfName) {
        showToast(`✅ Prof. ${assignedProfName} assigné pour ${matiere} en ${className}`);
      } else {
        showToast(`ℹ️ Affectation retirée pour ${matiere} en ${className}`);
      }
    } catch (err) {
      console.error('Error assigning teacher:', err);
      showToast('❌ Échec de la mise à jour de l\'affectation.');
    }
  };

  const handleAddCustomSubjectToClass = async (className: string) => {
    if (!newCustomMatiereInput.trim()) return;
    const matiereClean = newCustomMatiereInput.trim();

    const classDocId = className.toLowerCase().replace(/[\s/]+/g, '_');
    const existingClassDoc = customClasses.find((c) => c.name.trim().toLowerCase() === className.trim().toLowerCase());
    const currentAssignments = existingClassDoc?.assignments ? [...existingClassDoc.assignments] : [];

    if (currentAssignments.some((a) => a.matiere.toLowerCase() === matiereClean.toLowerCase())) {
      showToast('⚠️ Cette matière existe déjà dans le programme.');
      return;
    }

    currentAssignments.push({
      matiere: matiereClean,
      profUid: null,
      profNom: null
    });

    try {
      await setDoc(doc(db, 'classes', classDocId), {
        name: className,
        assignments: currentAssignments,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setNewCustomMatiereInput('');
      showToast(`📚 Matière "${matiereClean}" ajoutée au programme de la classe ${className}`);
    } catch (err) {
      console.error('Error adding custom subject:', err);
      showToast('❌ Échec de l\'ajout de la matière.');
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
        <form onSubmit={handleCreateClass} className="bg-white rounded-[24px] border border-[#e0e0e0] p-5 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                Nom de la nouvelle classe
              </label>
              <input
                type="text"
                required
                placeholder="Ex: 6e A, 2nde C, Terminale A"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                className="w-full px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                Frais de scolarité annuels (FCFA) - Optionnel
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                placeholder="Ex: 100000 (Laissez vide si non définie)"
                value={newClassScolarite}
                onChange={(e) => setNewClassScolarite(e.target.value)}
                className="w-full px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddingClass(false)}
              className="bg-[#f5f5f5] hover:bg-[#e0e0e0] text-[#1a1a1a] px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="bg-[#1a1a1a] hover:bg-black text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer uppercase tracking-widest"
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
          const classDoc = customClasses.find((c) => c.name.trim() === className.trim());
          const scolariteVal = classDoc?.scolarite ?? 0;
          const assignedProfObj = teachers.find((t) => t.classe === className || (classDoc?.titulaireUid && t.uid === classDoc.titulaireUid));
          const assignedTeacher = classDoc?.titulaireNom || assignedProfObj?.nom || 'Non assigné';
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
                <div className="flex items-center gap-1.5">
                  <span className="bg-[#1a1a1a] text-white text-[10px] font-bold px-3 py-1 rounded-xl uppercase tracking-wider">
                    {count} élève(s)
                  </span>
                  {currentUser.role === 'admin' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleOpenEditModal(className, e)}
                        title="Modifier les infos de la classe"
                        className="text-[#1a1a1a] hover:bg-[#f5f5f5] p-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteClass(className, e)}
                        title="Supprimer la classe"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="text-xs text-[#1a1a1a] font-semibold flex items-center justify-between">
                  <span className="text-[#9e9e9e] font-normal text-[11px]">Scolarité annuelle :</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${
                      scolariteVal > 0 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}>
                      💳 {scolariteVal > 0 ? `${scolariteVal.toLocaleString('fr-FR')} FCFA` : 'Non définie'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-xs text-[#9e9e9e] font-medium border-t border-[#e0e0e0]/50 pt-3 flex justify-between items-center">
                <span>👨‍🏫 Titulaire : <strong className="text-[#1a1a1a]">{assignedTeacher}</strong></span>
                {currentUser.role === 'admin' ? (
                  <button
                    onClick={(e) => handleOpenEditModal(className, e)}
                    className="text-[10px] font-bold bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white border border-[#e0e0e0] px-2 py-1 rounded-lg transition-all cursor-pointer text-[#1a1a1a]"
                  >
                    ✏️ Modifier
                  </button>
                ) : (
                  <ChevronRight size={16} className="text-[#9e9e9e]" />
                )}
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
      {selectedClass && (() => {
        const selectedClassDoc = customClasses.find(c => c.name.trim().toLowerCase() === selectedClass.trim().toLowerCase());
        const classAssignments = selectedClassDoc?.assignments || [];
        const allMatieresInClass = Array.from(new Set([...DEFAULT_MATIERES, ...classAssignments.map(a => a.matiere)]));
        const assignedProfsCount = classAssignments.filter(a => Boolean(a.profUid)).length;

        return (
          <div className="bg-white rounded-[24px] border border-[#e0e0e0] shadow-sm p-6 space-y-5 animate-in fade-in duration-200">
            {/* Header and Tab Selector */}
            <div className="flex justify-between items-center flex-wrap gap-4 pb-4 border-b border-[#e0e0e0]">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#9e9e9e]">Programme & Effectif</span>
                <h3 className="font-sans font-bold text-xl text-[#1a1a1a]">Classe de {selectedClass}</h3>
              </div>

              <div className="flex items-center gap-2 bg-[#f5f5f5] p-1 rounded-xl border border-[#e0e0e0]">
                <button
                  onClick={() => setSelectedDetailTab('profs')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedDetailTab === 'profs'
                      ? 'bg-[#1a1a1a] text-white shadow-2xs'
                      : 'text-[#9e9e9e] hover:text-[#1a1a1a]'
                  }`}
                >
                  <BookOpen size={14} />
                  <span>👨‍🏫 Enseignants & Matières</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    selectedDetailTab === 'profs' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                  }`}>
                    {assignedProfsCount}
                  </span>
                </button>

                <button
                  onClick={() => setSelectedDetailTab('eleves')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedDetailTab === 'eleves'
                      ? 'bg-[#1a1a1a] text-white shadow-2xs'
                      : 'text-[#9e9e9e] hover:text-[#1a1a1a]'
                  }`}
                >
                  <Users size={14} />
                  <span>👥 Élèves Inscrits</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    selectedDetailTab === 'eleves' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                  }`}>
                    {classStudents.length}
                  </span>
                </button>
              </div>
            </div>

            {/* TAB 1: TEACHERS & SUBJECTS ASSIGNMENT */}
            {selectedDetailTab === 'profs' && (
              <div className="space-y-4">
                <div className="bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200 text-xs text-amber-900 flex justify-between items-center flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <GraduationCap size={18} className="text-amber-700" />
                    <div>
                      <strong className="font-bold">Affectation des Enseignants par Matière</strong>
                      <p className="text-[11px] text-amber-800">
                        Exemple : <strong>6eA Espagnol → Okechi Okafor</strong>, <strong>Philo → Kra Daya</strong>. L'enseignant accèdera directement aux élèves de cette classe.
                      </p>
                    </div>
                  </div>
                  <span className="bg-white px-2.5 py-1 rounded-lg text-[10px] font-bold text-amber-900 border border-amber-300">
                    {assignedProfsCount} / {allMatieresInClass.length} matière(s) attribuée(s)
                  </span>
                </div>

                <div className="overflow-x-auto border border-[#e0e0e0] rounded-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] bg-[#f5f5f5]/60">
                        <th className="py-3 px-4">Matière au Programme</th>
                        <th className="py-3 px-4">Enseignant Assigné</th>
                        <th className="py-3 px-4 text-right">Attribuer / Modifier le Professeur</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e0e0e0]/60 text-xs">
                      {allMatieresInClass.map((mat) => {
                        const currentAssign = classAssignments.find(a => a.matiere === mat);
                        const isAssigned = Boolean(currentAssign?.profUid);

                        return (
                          <tr key={mat} className="hover:bg-[#f5f5f5]/30">
                            <td className="py-3 px-4 font-bold text-[#1a1a1a] flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[#1a1a1a]"></span>
                              {mat}
                            </td>
                            <td className="py-3 px-4">
                              {isAssigned ? (
                                <span className="bg-emerald-50 text-emerald-800 text-[11px] font-bold px-2.5 py-1 rounded-xl border border-emerald-200 flex items-center gap-1.5 w-fit">
                                  <CheckCircle2 size={13} className="text-emerald-600" />
                                  Prof. {currentAssign?.profNom}
                                </span>
                              ) : (
                                <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2.5 py-0.5 rounded-lg uppercase">
                                  Non attribué
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {currentUser.role === 'admin' ? (
                                <select
                                  value={currentAssign?.profUid || ''}
                                  onChange={(e) => handleAssignTeacherToSubject(selectedClass, mat, e.target.value)}
                                  className="px-3 py-1.5 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] font-semibold focus:outline-none focus:border-[#1a1a1a] cursor-pointer"
                                >
                                  <option value="">-- Choisir un enseignant --</option>
                                  {teachers.map((t) => (
                                    <option key={t.uid} value={t.uid}>
                                      👨‍🏫 {t.nom} ({t.matiere || 'Matières générales'})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-[#9e9e9e]">{currentAssign?.profNom || '—'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Add Custom Subject Form */}
                {currentUser.role === 'admin' && (
                  <div className="pt-2 flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="Ajouter une matière spécifique (ex: Arts Plastiques, Économie...)"
                      value={newCustomMatiereInput}
                      onChange={(e) => setNewCustomMatiereInput(e.target.value)}
                      className="px-3.5 py-2 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] max-w-sm w-full"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddCustomSubjectToClass(selectedClass)}
                      className="bg-[#1a1a1a] hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 uppercase tracking-wider"
                    >
                      <Plus size={14} /> Ajouter au programme
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: ENROLLED STUDENTS */}
            {selectedDetailTab === 'eleves' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center flex-wrap gap-3">
                  <p className="text-xs text-[#9e9e9e] font-medium">
                    Liste des élèves régulièrement inscrits en classe de <strong>{selectedClass}</strong>.
                  </p>
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

                <div className="overflow-x-auto border border-[#e0e0e0] rounded-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#e0e0e0] text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e] bg-[#f5f5f5]/60">
                        <th className="py-2.5 px-4">Élève</th>
                        <th className="py-2.5 px-4">Matricule / Code</th>
                        <th className="py-2.5 px-4">Parent Associé</th>
                        <th className="py-2.5 px-4">Statut Compte Parent</th>
                        <th className="py-2.5 px-4 text-right">Actions & Bulletin</th>
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
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setSelectedStudentForBulletin(s)}
                                title="Générer la version imprimable du bulletin scolaire"
                                className="px-2 py-1 text-[10px] font-bold bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white border border-[#e0e0e0] text-[#1a1a1a] rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                              >
                                <FileText size={11} /> Bulletin PDF
                              </button>
                              {currentUser.role === 'admin' && (
                                <>
                                  <button
                                    onClick={() => handleChangeStudentClass(s)}
                                    title="Changer de classe"
                                    className="px-2 py-1 text-[10px] font-bold bg-[#f5f5f5] hover:bg-[#1a1a1a] hover:text-white border border-[#e0e0e0] text-[#1a1a1a] rounded-lg transition-all cursor-pointer"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => handleDeleteStudent(s)}
                                    title="Supprimer l'élève"
                                    className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}

                      {classStudents.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-xs text-[#9e9e9e]">
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
      })()}

      {/* Edit Class Modal */}
      {editingClass && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[28px] max-w-lg w-full p-6 space-y-5 shadow-2xl relative animate-in fade-in zoom-in-95 border border-[#e0e0e0]">
            <div className="flex justify-between items-center pb-3 border-b border-[#e0e0e0]">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#9e9e9e]">Administration</span>
                <h3 className="text-lg font-bold text-[#1a1a1a]">Modifier la classe : {editingClass}</h3>
              </div>
              <button
                onClick={() => setEditingClass(null)}
                className="text-[#9e9e9e] hover:text-[#1a1a1a] p-1.5 hover:bg-[#f5f5f5] rounded-xl transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditedClass} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                  Nom de la classe
                </label>
                <input
                  type="text"
                  required
                  value={editClassName}
                  onChange={(e) => setEditClassName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] font-semibold focus:outline-none focus:border-[#1a1a1a]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                  Frais de scolarité annuels (FCFA)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="Saisir le montant en FCFA (ex: 120000)"
                  value={editClassScolarite}
                  onChange={(e) => setEditClassScolarite(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#9e9e9e] uppercase tracking-widest mb-1">
                  Professeur Titulaire
                </label>
                <select
                  value={editClassTitulaireUid}
                  onChange={(e) => setEditClassTitulaireUid(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#e0e0e0] rounded-xl text-xs bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a] font-medium"
                >
                  <option value="">-- Aucun professeur titulaire --</option>
                  {teachers.map((t) => (
                    <option key={t.uid} value={t.uid}>
                      👨‍🏫 {t.nom} ({t.matiere || 'Matières générales'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-[#e0e0e0] flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handleDeleteClass(editingClass)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 size={14} /> Supprimer la classe
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingClass(null)}
                    className="bg-[#f5f5f5] hover:bg-[#e0e0e0] text-[#1a1a1a] px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="bg-[#1a1a1a] hover:bg-black text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer uppercase tracking-widest shadow-2xs transition-all"
                  >
                    <Save size={14} /> Enregistrer
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Bulletin Modal */}
      {selectedStudentForBulletin && (
        <BulletinPrintModal
          student={selectedStudentForBulletin}
          allStudents={studentsList}
          onClose={() => setSelectedStudentForBulletin(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
}

