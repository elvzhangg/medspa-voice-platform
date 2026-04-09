import { supabaseAdmin } from "./supabase";

async function checkLatestCall() {
  const { data, error } = await supabaseAdmin
    .from("call_logs")
    .select("created_at, caller_number, duration_seconds, summary, transcript")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("ERROR:", error);
    return;
  }

  if (data && data.length > 0) {
    console.log("SUCCESS: Found test call!");
    console.log("Time:", data[0].created_at);
    console.log("Caller:", data[0].caller_number);
    console.log("Summary:", data[0].summary);
    // console.log("Transcript:", data[0].transcript);
  } else {
    console.log("No calls found yet.");
  }
}

checkLatestCall();
