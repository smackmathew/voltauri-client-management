import { useState } from "react";
import { useAuth, useProfile } from "../context/AuthContext";

/** Staff who haven't verified their email can't use the one login on the other Voltauri sites yet. */
export default function VerifyEmailBanner() {
  const profile = useProfile();
  const { emailVerified, sendVerification, refreshVerified } = useAuth();
  const [state, setState] = useState<"idle" | "sent" | "not-yet" | "error">("idle");
  if (emailVerified || profile.role === "client") return null;
  return (
    <div className="no-print border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm text-amber-900">
        <span>
          Verify <span className="font-medium">{profile.email}</span> to open Admin and the Site hub with your Portal login.
        </span>
        <button className="font-medium underline" onClick={() => sendVerification().then(() => setState("sent"), () => setState("error"))}>
          {state === "sent" ? "Link sent: check your inbox" : "Send verification link"}
        </button>
        <button className="font-medium underline" onClick={() => refreshVerified().then((ok) => !ok && setState("not-yet"), () => setState("error"))}>
          I've verified
        </button>
        {state === "not-yet" && <span className="text-amber-700">Not verified yet: click the link in the email first.</span>}
        {state === "error" && <span className="text-red-700">Couldn't do that just now. Try again in a minute.</span>}
      </div>
    </div>
  );
}
