"use client";

import { useState, useEffect } from "react";

interface StaffMember {
  id: string;
  name: string;
  title: string;
  services: string[];
  working_hours: any;
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  
  const [newStaff, setNewStaff] = useState({
    name: "",
    title: "",
    servicesString: ""
  });

  useEffect(() => {
    fetchStaff();
  }, []);

  async function fetchStaff() {
    const res = await fetch("/api/staff");
    if (res.ok) {
      const data = await res.json();
      setStaff(data.staff || []);
    }
    setLoading(false);
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newStaff,
        services: newStaff.servicesString.split(",").map(s => s.trim()).filter(Boolean)
      }),
    });

    if (res.ok) {
      setIsAdding(false);
      setNewStaff({ name: "", title: "", servicesString: "" });
      fetchStaff();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to remove this staff member?")) return;
    const res = await fetch(`/api/staff/${id}`, { method: "DELETE" });
    if (res.ok) fetchStaff();
  }

  return (
    <div className="max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Providers \u0026 Staff</h1>
          <p className="text-sm text-gray-500">Manage your injectors, estheticians, and their schedules.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 flex items-center gap-2"
        >
          <span>+</span> Add Staff Member
        </button>
      </div>

      {isAdding && (
        <div className="mb-8 bg-white p-6 rounded-xl border-2 border-indigo-100 shadow-sm">
          <h2 className="text-lg font-bold mb-4">New Staff Member</h2>
          <form onSubmit={handleAddStaff} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input 
              placeholder="Full Name" 
              className="px-4 py-2 border rounded-lg"
              value={newStaff.name}
              onChange={e => setNewStaff({...newStaff, name: e.target.value})}
              required
            />
            <input 
              placeholder="Title (e.g. Nurse Injector)" 
              className="px-4 py-2 border rounded-lg"
              value={newStaff.title}
              onChange={e => setNewStaff({...newStaff, title: e.target.value})}
              required
            />
            <input 
              placeholder="Services (Botox, Filler...)" 
              className="px-4 py-2 border rounded-lg"
              value={newStaff.servicesString}
              onChange={e => setNewStaff({...newStaff, servicesString: e.target.value})}
              required
            />
            <div className="md:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-gray-500">Cancel</button>
              <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold">Save Provider</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading staff...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {staff.map(member => (
            <div key={member.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-lg">
                  {member.name.charAt(0)}
                </div>
                <button 
                  onClick={() => handleDelete(member.id)}
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
              <h3 className="text-lg font-bold text-gray-900">{member.name}</h3>
              <p className="text-sm text-indigo-600 font-medium mb-4">{member.title}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {member.services.map(s => (
                  <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] uppercase font-bold tracking-wider">{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
