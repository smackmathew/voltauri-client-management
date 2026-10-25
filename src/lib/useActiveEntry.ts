import { useProfile } from "../context/AuthContext";
import { TimeApi, toEntry } from "../firebase/time";
import { useLiveDoc } from "./useLive";

/** The signed-in tech's open time entry, live; null when they're off the clock. */
export function useActiveEntry() {
  const profile = useProfile();
  const id = profile.active_entry_id;
  return useLiveDoc(id ? TimeApi.entryDoc(id) : null, toEntry, id ?? "none");
}
