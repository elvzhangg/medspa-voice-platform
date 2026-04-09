"use client";

import { useState, useEffect } from "react";
import { format, startOfWeek, addDays, startOfDay, addHours } from "date-fns";

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
          <h1 className="text-2xl font-bold text-gray-900">Clinic Calendar</h1>
          <p className="text-sm text-gray-500">Manage appointments from phone and online bookings</p>
        </div>
        <div className="flex bg-white rounded-lg border border-gray-200 p-1">
          <button className="px-3 py-1 text-sm bg-indigo-50 text-indigo-700 rounded-md font-medium">Week</button>
          <button className="px-3 py-1 text-sm text-gray-500 hover:bg-gray-50 rounded-md">Month</button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        {/* Header Days */}
        <div className="flex border-b border-gray-100 bg-gray-50">
          <div className="w-20 border-r border-gray-100" />
          {days.map((day) => (
            <div key={day.toString()} className="flex-1 py-3 text-center border-r border-gray-100 last:border-0">
              <span className="text-xs font-semibold text-gray-500 uppercase">{format(day, "eee")}</span>
              <p className="text-lg font-bold text-gray-900">{format(day, "d")}</p>
            </div>
          ))}
        </div>

        {/* Time Grid */}
        <div className="flex-1 overflow-y-auto">
          {timeSlots.map((slot) => (
            <div key={slot.toString()} className="flex border-b border-gray-50 min-h-[80px] group">
              <div className="w-20 py-2 px-3 text-right border-r border-gray-100">
                <span className="text-xs font-medium text-gray-400 group-hover:text-gray-600 transition-colors">
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
                  <div key={`${day}-${slot}`} className="flex-1 border-r border-gray-50 last:border-0 p-1 relative hover:bg-gray-50/50 transition-colors">
                    {dayEvents.map(event => (
                      <div 
                        key={event.id}
                        className="bg-indigo-600 text-white rounded-lg p-2 text-xs shadow-sm mb-1 hover:bg-indigo-700 transition-colors cursor-pointer"
                      >
                        <p className="font-bold truncate">{event.customer_name}</p>
                        <p className="opacity-90">{event.service_type}</p>
                        {event.staff && (
                          <p className="mt-1 text-[9px] font-medium bg-white/20 px-1 rounded inline-block">
                            with {event.staff.name}
                          </p>
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
    </div>
  );
}
