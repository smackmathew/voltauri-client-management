import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { buttonClass, ErrorNote, Field, inputClass } from "../components/ui";
import { useAuth } from "../context/AuthContext";

type Mode = "signin" | "join" | "setup";

export default function Login() {
  const { profile, needsProfile, login, signup, finishSetup, logout } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [orgName, setOrgName] = useState("Tauri");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (profile) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (needsProfile) {
        await finishSetup({ full_name: fullName, invite_code: mode === "setup" ? undefined : inviteCode, org_name: orgName });
      } else if (mode === "signin") {
        await login(email, password);
      } else {
        await signup({
          full_name: fullName,
          email,
          password,
          invite_code: mode === "join" ? inviteCode : undefined,
          org_name: orgName,
        });
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const heading = needsProfile
    ? "Finish joining"
    : { signin: "Sign in", join: "Join with an invite", setup: "Set up Tauri" }[mode];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white shadow">T</span>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">Tauri Operations</h1>
          <p className="text-sm text-slate-500">Clients, tasks, help desk and time — live for your team and your clients.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">{heading}</h2>
          {needsProfile && (
            <p className="text-sm text-slate-500">You're signed in, but not part of the organization yet. Enter the invite code an admin gave you.</p>
          )}

          {(mode !== "signin" || needsProfile) && (
            <Field label="Your full name">
              <input className={inputClass} required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            </Field>
          )}
          {!needsProfile && (
            <>
              <Field label="Email">
                <input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label="Password" hint={mode !== "signin" ? "At least 8 characters" : undefined}>
                <input
                  className={inputClass}
                  type="password"
                  required
                  minLength={mode === "signin" ? undefined : 8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </Field>
            </>
          )}
          {(mode === "join" || (needsProfile && mode !== "setup")) && (
            <Field label="Invite code" hint="Admins create these on the Team page.">
              <input className={`${inputClass} font-mono uppercase tracking-widest`} required value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
            </Field>
          )}
          {mode === "setup" && (
            <Field label="Organization name" hint="Only the very first account can do this; it becomes the admin.">
              <input className={inputClass} required value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </Field>
          )}

          <ErrorNote error={error} />
          <button type="submit" disabled={busy} className={`${buttonClass.primary} w-full`}>
            {busy ? "Please wait…" : needsProfile ? "Continue" : mode === "signin" ? "Sign in" : mode === "join" ? "Create account" : "Create admin account"}
          </button>

          <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4 text-sm">
            {needsProfile ? (
              <>
                <button type="button" className={buttonClass.link} onClick={() => setMode(mode === "setup" ? "join" : "setup")}>
                  {mode === "setup" ? "I have an invite code" : "First account? Set up Tauri"}
                </button>
                <button type="button" className="text-slate-500 hover:text-slate-700" onClick={logout}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                {mode !== "signin" && (
                  <button type="button" className={buttonClass.link} onClick={() => setMode("signin")}>
                    I have an account
                  </button>
                )}
                {mode !== "join" && (
                  <button type="button" className={buttonClass.link} onClick={() => setMode("join")}>
                    I have an invite code
                  </button>
                )}
                {mode !== "setup" && (
                  <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => setMode("setup")}>
                    First time? Set up Tauri
                  </button>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
