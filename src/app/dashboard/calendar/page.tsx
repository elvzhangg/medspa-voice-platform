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
  const [view, setView] = useState<"calendar" | "staff">("calendar");

  useEffect(() => {
    async function fetchEvents() {
      const res = await fetch("/api/calendar");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
      setLoading(false);
    }
    fetchEvents();
  }, []);

  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const timeSlots = Array.from({ length: 12 }, (_, i) => addHours(startOfDay(currentDate), i + 8)); // 8 AM to 8 PM

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clinic Schedule</h1>
          <p className="text-sm text-gray-500">Manage provider availability and clinic appointments.</p>
        </div>
        
        {/* Toggle Switch */}
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
            Medical Providers
          </button>
        </div>
      </div>

      {view === "calendar" ? (
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

          {/* Time Grid */}
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
                              <span className="text-[9px] font-bold text-indigo-100 italic">
                                with {event.staff.name}
                              </span>
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
      ) : (
        <div className="animate-in fade-in duration-500">
          <StaffPage />
        </div>
      )}
    </div>
  );
}
