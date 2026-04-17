import { supabaseAdmin } from "./supabase";
import { format, addMinutes, startOfDay, endOfDay, parseISO } from "date-fns";

export async function getAvailableSlots(
  tenantId: string,
  date: string,
  service?: string,
  provider?: string
) {
  // 1. Fetch staff members
  const staffQuery = supabaseAdmin
    .from("staff")
    .select("*")
    .eq("tenant_id", tenantId);

  const { data: staffList } = await staffQuery;

  if (!staffList || staffList.length === 0) return [];

  // Filter staff by service if provided
  let capableStaff = service
    ? staffList.filter(s => s.services?.some((srv: string) => srv.toLowerCase().includes(service.toLowerCase())))
    : staffList;

  // Further filter by provider name if specified (partial, case-insensitive match
  // so "Dr. Sarah" matches a staff row named "Sarah Chen")
  if (provider && provider.trim() && !/no preference|any|anyone/i.test(provider)) {
    const needle = provider.toLowerCase().replace(/dr\.?\s*/g, "").trim();
    const matched = capableStaff.filter(s =>
      (s.name || "").toLowerCase().includes(needle) ||
      needle.split(/\s+/).some(part => part.length > 2 && (s.name || "").toLowerCase().includes(part))
    );
    // If the requested provider doesn't match anyone capable of the service,
    // return empty so the AI knows to clarify rather than silently showing
    // another staffer's slots.
    if (matched.length === 0) return [];
    capableStaff = matched;
  }

  if (capableStaff.length === 0) return [];

  // 2. Fetch existing appointments for the day
  const dayStart = startOfDay(parseISO(date)).toISOString();
  const dayEnd = endOfDay(parseISO(date)).toISOString();

  const { data: existingEvents } = await supabaseAdmin
    .from("calendar_events")
    .select("start_time, end_time, staff_id")
    .eq("tenant_id", tenantId)
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd);

  // 3. Generate combined slots
  const allAvailableSlots = new Set<string>();
  const dayOfWeek = format(parseISO(date), "eeee").toLowerCase();

  for (const staff of capableStaff) {
    const hours = staff.working_hours?.[dayOfWeek];
    if (!hours) continue;

    let currentPos = new Date(`${date}T${hours.open}:00`);
    const endPos = new Date(`${date}T${hours.close}:00`);

    while (currentPos < endPos) {
      // Check if THIS specific staff is busy
      const isBusy = existingEvents?.some(evt => {
        if (evt.staff_id !== staff.id) return false;
        
        const evtStart = new Date(evt.start_time).getTime();
        const evtEnd = new Date(evt.end_time).getTime();
        const sStart = currentPos.getTime();
        const sEnd = sStart + 60 * 60 * 1000;
        
        return (sStart < evtEnd && sEnd > evtStart);
      });

      if (!isBusy) {
        allAvailableSlots.add(format(currentPos, "h:mm a"));
      }
      
      currentPos = addMinutes(currentPos, 60);
    }
  }

  return Array.from(allAvailableSlots).sort((a,b) => {
    return new Date(`${date} ${a}`).getTime() - new Date(`${date} ${b}`).getTime();
  });
}
