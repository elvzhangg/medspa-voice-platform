"use client";

import { useState, useEffect } from "react";
import { format, startOfWeek, addDays, startOfDay, addHours } from "date-fns";
import StaffPage from "../staff/page";

interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  customer_name: string;
  service_type: string;
  staff: { name: string } | null;
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate] = useState(new Date());
  const [view, setView] = useState<"calendar" | "staff" | "setup">("calendar");
  const [provider, setProvider] = useState("internal");
  const [config, setConfig] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchData() {
      // Fetch events
      const res = await fetch("/api/calendar");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
      
      // Fetch current provider setting
      const settingsRes = await fetch("/api/settings");
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setProvider(settings.booking_provider);
        setConfig(settings.booking_config || {});
      }
      
      setLoading(false);
    }
    fetchData();
  }, []);

  async function handleSaveConfig() {
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booking_provider: provider, booking_config: config }),
    });
    setSaving(false);
    setView("calendar");
  }

  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const timeSlots = Array.from({ length: 12 }, (_, i) => addHours(startOfDay(currentDate), i + 8));

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clinic Schedule</h1>
          <p className="text-sm text-gray-500">Manage provider availability and clinic appointments.</p>
        </div>
        
        <div className="flex bg-white rounded-lg border border-gray-200 p-1 shadow-sm">
          <button 
            onClick={() => setView("calendar")}
            className={`px-4 py-1.5 text-sm rounded-md font-bold transition-all ${view === 'calendar' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Calendar
          </button>
          <button 
            onClick={() => setView("staff")}
            className={`px-4 py-1.5 text-sm rounded-md font-bold transition-all ${view === 'staff' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Providers
          </button>
          <button 
            onClick={() => setView("setup")}
            className={`px-4 py-1.5 text-sm rounded-md font-bold transition-all ${view === 'setup' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Settings
          </button>
        </div>
      </div>

      {view === "setup" && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-300">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Booking System Integration</h2>
          <p className="text-sm text-gray-500 mb-8">Choose which calendar your AI receptionist should sync with.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {[
              { id: "internal", name: "Vaux Calendar", desc: "Built-in simple scheduler" },
              { id: "vagaro", name: "Vagaro", desc: "Top choice for SMB Med Spas" },
              { id: "acuity", name: "Acuity", desc: "Squarespace / Professional" },
              { id: "mindbody", name: "Mindbody", desc: "Enterprise wellness clinics" },
              { id: "link", name: "Booking Link", desc: "Texts a URL (Calendly, etc)" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={`p-4 text-left border-2 rounded-xl transition-all ${provider === p.id ? "border-indigo-600 bg-indigo-50" : "border-gray-100 hover:border-gray-200"}`}
              >
                <p className="font-bold text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500">{p.desc}</p>
              </button>
            ))}
          </div>

          {provider !== "internal" && (
            <div className="space-y-4 p-6 bg-gray-50 rounded-xl mb-8">
              <p className="text-sm font-bold text-gray-700 uppercase tracking-wider">Connection Settings</p>
              <div className="grid grid-cols-1 gap-4">
                 {provider === 'link' ? (
                    <input 
                      placeholder="Enter your booking URL (e.g. calendly.com/glow)" 
                      className="px-4 py-2 border rounded-lg"
                      value={config.bookingUrl || ""}
                      onChange={e => setConfig({...config, bookingUrl: e.target.value})}
                    />
                 ) : (
                   <>
                    <input 
                      placeholder={provider === 'vagaro' ? "Merchant ID" : provider === 'mindbody' ? "Site ID" : "User ID"} 
                      className="px-4 py-2 border rounded-lg"
                      value={config.id || ""}
                      onChange={e => setConfig({...config, id: e.target.value})}
                    />
                    <input 
                      placeholder="API Key" 
                      type="password"
                      className="px-4 py-2 border rounded-lg"
                      value={config.apiKey || ""}
                      onChange={e => setConfig({...config, apiKey: e.target.value})}
                    />
                   </>
                 )}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-gray-100">
             <button 
              onClick={handleSaveConfig}
              disabled={saving}
              className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
             >
               {saving ? "Syncing..." : "Connect Calendar"}
             </button>
          </div>
        </div>
      )}

      {view === "calendar" && provider === "internal" && (
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col shadow-sm">
          {/* Header Days */}
          <div className="flex border-b border-gray-100 bg-gray-50/80">
            <div className="w-20 border-r border-gray-100" />
            {days.map((day) => (
              <div key={day.toString()} className="flex-1 py-3 text-center border-r border-gray-100 last:border-0">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{format(day, "eee")}</span>
                <p className={`text-lg font-black ${format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'text-indigo-600' : 'text-gray-900'}`}>{format(day, "d")}</p>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {timeSlots.map((slot) => (
              <div key={slot.toString()} className="flex border-b border-gray-50 min-h-[90px] group">
                <div className="w-20 py-2 px-3 text-right border-r border-gray-100 bg-gray-50/30">
                  <span className="text-[10px] font-black text-gray-400 group-hover:text-indigo-600 transition-colors">
                    {format(slot, "h a")}
                  </span>
                </div>
                {days.map((day) => {
                  const dayEvents = events.filter(e => {
                    const evtStart = new Date(e.start_time);
                    return format(evtStart, "yyyy-MM-dd") === format(day, "yyyy-MM-dd") &&
                           evtStart.getHours() === slot.getHours();
                  });

                  return (
                    <div key={`${day}-${slot}`} className="flex-1 border-r border-gray-50 last:border-0 p-1 relative hover:bg-indigo-50/20 transition-colors">
                      {dayEvents.map(event => (
                        <div 
                          key={event.id}
                          className="bg-indigo-600 text-white rounded-lg p-2.5 shadow-md mb-1 hover:scale-[1.02] transition-all cursor-pointer border border-white/20"
                        >
                          <p className="font-black text-[11px] truncate uppercase">{event.customer_name}</p>
                          <p className="text-[10px] opacity-80 leading-tight">{event.service_type}</p>
                          {event.staff && (
                            <div className="mt-1.5 flex items-center gap-1">
                              <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                              <span className="text-[9px] font-bold text-indigo-100 italic">with {event.staff.name}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "calendar" && provider !== "internal" && (
        <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center p-12 text-center shadow-sm">
          <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-3xl mb-4">🔗</div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Connected to {provider.toUpperCase()}</h3>
          <p className="text-sm text-gray-500 max-w-md mb-8">
            Your bookings are being managed directly in your {provider} account. 
            The AI is already synced with your live availability.
          </p>
          <button 
            onClick={() => setView("setup")}
            className="text-indigo-600 font-bold hover:underline"
          >
            Manage Integration Settings \u2192
          </button>
        </div>
      )}

      {view === "staff" && (
        <div className="animate-in fade-in duration-500">
          <StaffPage />
        </div>
      )}
    </div>
  );
}
