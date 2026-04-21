"use client";

import { useState, useEffect } from"react";

interface KBDoc {
 id: string;
 title: string;
 content: string;
 category: string;
 updated_at: string;
}

type Category ="services" |"pricing" |"billing" |"policies" |"faq" |"general";

const CATEGORIES: Category[] = ["services","pricing","billing","policies","faq","general"];

const CATEGORY_COLORS: Record<Category, string> = {
 services:"bg-blue-100 text-blue-700",
 pricing:"bg-green-100 text-green-700",
 billing:"bg-amber-100 text-amber-700",
 policies:"bg-orange-100 text-orange-700",
 faq:"bg-amber-100 text-amber-700",
 general:"bg-gray-100 text-gray-600",
};

interface EditForm {
 title: string;
 content: string;
 category: Category;
}

export default function KnowledgeBasePage() {
 const [docs, setDocs] = useState<KBDoc[]>([]);
 const [loading, setLoading] = useState(true);
 const [showAddForm, setShowAddForm] = useState(false);
 const [addForm, setAddForm] = useState<EditForm>({ title:"", content:"", category:"general" });
 const [addSaving, setAddSaving] = useState(false);
 const [editingId, setEditingId] = useState<string | null>(null);
 const [editForm, setEditForm] = useState<EditForm>({ title:"", content:"", category:"general" });
 const [editSaving, setEditSaving] = useState(false);
 const [deletingId, setDeletingId] = useState<string | null>(null);

 useEffect(() => {
 fetchDocs();
 }, []);

 async function fetchDocs() {
 setLoading(true);
 const res = await fetch("/api/knowledge-base/me");
 const data = await res.json();
 setDocs(data.documents || []);
 setLoading(false);
 }

 async function handleAdd(e: React.FormEvent) {
 e.preventDefault();
 setAddSaving(true);
 await fetch("/api/knowledge-base/me", {
 method:"POST",
 headers: {"Content-Type":"application/json" },
 body: JSON.stringify(addForm),
 });
 setAddForm({ title:"", content:"", category:"general" });
 setShowAddForm(false);
 setAddSaving(false);
 fetchDocs();
 }

 function startEdit(doc: KBDoc) {
 setEditingId(doc.id);
 setEditForm({
 title: doc.title,
 content: doc.content,
 category: (CATEGORIES.includes(doc.category as Category) ? doc.category :"general") as Category,
 });
 }

 async function handleEdit(e: React.FormEvent, id: string) {
 e.preventDefault();
 setEditSaving(true);
 await fetch("/api/knowledge-base/me", {
 method:"PUT",
 headers: {"Content-Type":"application/json" },
 body: JSON.stringify({ id, ...editForm }),
 });
 setEditingId(null);
 setEditSaving(false);
 fetchDocs();
 }

 async function handleDelete(id: string, title: string) {
 if (!confirm(`Delete"${title}"? This cannot be undone.`)) return;
 setDeletingId(id);
 await fetch(`/api/knowledge-base/me?id=${id}`, { method:"DELETE" });
 setDeletingId(null);
 fetchDocs();
 }

 const byCategory = CATEGORIES.reduce((acc, cat) => {
 acc[cat] = docs.filter((d) => d.category === cat);
 return acc;
 }, {} as Record<Category, KBDoc[]>);

 const uncategorized = docs.filter((d) => !CATEGORIES.includes(d.category as Category));

 return (
 <div>
 {/* Header */}
 <div className="flex items-center justify-between mb-8">
 <div>
 <h1 className="text-2xl font-semibold text-gray-900">Clinic Handbook</h1>
 <p className="text-gray-500 mt-1">Manage what your AI receptionist knows</p>
 </div>
 <button
 onClick={() => { setShowAddForm(!showAddForm); setEditingId(null); }}
 className="px-4 py-2 bg-white text-amber-900 border border-amber-200 rounded-lg text-sm font-medium hover:bg-[#fdf9ec] border border-amber-300 transition-colors"
 >
 + Add Document
 </button>
 </div>

 {/* Add Document Form */}
 {showAddForm && (
 <div className="bg-white rounded-xl border border-amber-300 p-6 mb-8 shadow-sm">
 <h2 className="font-semibold text-gray-900 mb-4">New Document</h2>
 <form onSubmit={handleAdd} className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
 <input
 type="text"
 value={addForm.title}
 onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
 placeholder="e.g. Botox Pricing"
 required
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
 <select
 value={addForm.category}
 onChange={(e) => setAddForm({ ...addForm, category: e.target.value as Category })}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
 >
 {CATEGORIES.map((c) => (
 <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
 ))}
 </select>
 </div>
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
 <textarea
 value={addForm.content}
 onChange={(e) => setAddForm({ ...addForm, content: e.target.value })}
 rows={5}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
 placeholder="Write the information your AI should know..."
 required
 />
 </div>
 <div className="flex gap-3">
 <button
 type="submit"
 disabled={addSaving}
 className="px-4 py-2 bg-white text-amber-900 border border-amber-200 rounded-lg text-sm font-medium hover:bg-[#fdf9ec] border border-amber-300 disabled:opacity-50 transition-colors"
 >
 {addSaving ?"Saving..." :"Save Document"}
 </button>
 <button
 type="button"
 onClick={() => setShowAddForm(false)}
 className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-[#fdf9ec] transition-colors"
 >
 Cancel
 </button>
 </div>
 </form>
 </div>
 )}

 {/* Content */}
 {loading ? (
 <div className="flex items-center justify-center py-20">
 <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
 </div>
 ) : docs.length === 0 ? (
 <div className="text-center py-20">
 <p className="text-5xl mb-4">📚</p>
 <h3 className="text-lg font-semibold text-gray-700 mb-2">No documents yet</h3>
 <p className="text-gray-400 text-sm mb-6">
 Add your first document to train your AI receptionist.
 </p>
 <button
 onClick={() => setShowAddForm(true)}
 className="px-4 py-2 bg-white text-amber-900 border border-amber-200 rounded-lg text-sm font-medium hover:bg-[#fdf9ec] border border-amber-300 transition-colors"
 >
 + Add your first document
 </button>
 </div>
 ) : (
 <div className="space-y-8">
 {CATEGORIES.map((cat) =>
 byCategory[cat].length === 0 ? null : (
 <section key={cat}>
 <div className="flex items-center gap-2 mb-3">
 <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${CATEGORY_COLORS[cat]}`}>
 {cat.charAt(0).toUpperCase() + cat.slice(1)}
 </span>
 <span className="text-xs text-gray-400">{byCategory[cat].length} doc{byCategory[cat].length !== 1 ?"s" :""}</span>
 </div>
 <div className="space-y-3">
 {byCategory[cat].map((doc) => (
 <DocCard
 key={doc.id}
 doc={doc}
 catColors={CATEGORY_COLORS}
 isEditing={editingId === doc.id}
 editForm={editForm}
 editSaving={editSaving}
 isDeleting={deletingId === doc.id}
 onEdit={() => startEdit(doc)}
 onCancelEdit={() => setEditingId(null)}
 onEditFormChange={setEditForm}
 onEditSubmit={(e) => handleEdit(e, doc.id)}
 onDelete={() => handleDelete(doc.id, doc.title)}
 />
 ))}
 </div>
 </section>
 )
 )}
 {uncategorized.length > 0 && (
 <section>
 <div className="flex items-center gap-2 mb-3">
 <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
 Other
 </span>
 </div>
 <div className="space-y-3">
 {uncategorized.map((doc) => (
 <DocCard
 key={doc.id}
 doc={doc}
 catColors={CATEGORY_COLORS}
 isEditing={editingId === doc.id}
 editForm={editForm}
 editSaving={editSaving}
 isDeleting={deletingId === doc.id}
 onEdit={() => startEdit(doc)}
 onCancelEdit={() => setEditingId(null)}
 onEditFormChange={setEditForm}
 onEditSubmit={(e) => handleEdit(e, doc.id)}
 onDelete={() => handleDelete(doc.id, doc.title)}
 />
 ))}
 </div>
 </section>
 )}
 </div>
 )}
 </div>
 );
}

interface DocCardProps {
 doc: KBDoc;
 catColors: Record<string, string>;
 isEditing: boolean;
 editForm: EditForm;
 editSaving: boolean;
 isDeleting: boolean;
 onEdit: () => void;
 onCancelEdit: () => void;
 onEditFormChange: (form: EditForm) => void;
 onEditSubmit: (e: React.FormEvent) => void;
 onDelete: () => void;
}

function DocCard({
 doc,
 catColors,
 isEditing,
 editForm,
 editSaving,
 isDeleting,
 onEdit,
 onCancelEdit,
 onEditFormChange,
 onEditSubmit,
 onDelete,
}: DocCardProps) {
 const colorClass = catColors[doc.category] || catColors.general;

 if (isEditing) {
 return (
 <div className="bg-white rounded-xl border border-amber-300 p-5 shadow-sm">
 <form onSubmit={onEditSubmit} className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
 <input
 type="text"
 value={editForm.title}
 onChange={(e) => onEditFormChange({ ...editForm, title: e.target.value })}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
 required
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
 <select
 value={editForm.category}
 onChange={(e) => onEditFormChange({ ...editForm, category: e.target.value as Category })}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
 >
 {CATEGORIES.map((c) => (
 <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
 ))}
 </select>
 </div>
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
 <textarea
 value={editForm.content}
 onChange={(e) => onEditFormChange({ ...editForm, content: e.target.value })}
 rows={5}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
 required
 />
 </div>
 <div className="flex gap-3">
 <button
 type="submit"
 disabled={editSaving}
 className="px-4 py-2 bg-white text-amber-900 border border-amber-200 rounded-lg text-sm font-medium hover:bg-[#fdf9ec] border border-amber-300 disabled:opacity-50 transition-colors"
 >
 {editSaving ?"Saving..." :"Save Changes"}
 </button>
 <button
 type="button"
 onClick={onCancelEdit}
 className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-[#fdf9ec] transition-colors"
 >
 Cancel
 </button>
 </div>
 </form>
 </div>
 );
 }

 return (
 <div className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors">
 <div className="flex items-start justify-between gap-4">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <h3 className="font-medium text-gray-900 truncate">{doc.title}</h3>
 <span className={`flex-shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
 {doc.category}
 </span>
 </div>
 <p className="text-sm text-gray-500 line-clamp-2">{doc.content}</p>
 <p className="text-xs text-gray-400 mt-2">
 Updated {new Date(doc.updated_at).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })}
 </p>
 </div>
 <div className="flex items-center gap-2 flex-shrink-0">
 <button
 onClick={onEdit}
 className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-[#fdf9ec] transition-colors"
 >
 Edit
 </button>
 <button
 onClick={onDelete}
 disabled={isDeleting}
 className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
 >
 {isDeleting ?"..." :"Delete"}
 </button>
 </div>
 </div>
 </div>
 );
}
