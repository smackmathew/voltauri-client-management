import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth, useProfile } from "../context/AuthContext";
import { updateOwnProfile } from "../firebase/account";
import { firstName } from "../lib/format";
import { squarePhoto } from "../lib/image";
import { ROLE_LABELS } from "../lib/labels";
import { siteHref, sitesFor } from "../lib/sites";
import Avatar from "./Avatar";
import { buttonClass, ErrorNote, Field, inputClass, Modal } from "./ui";

/**
 * The signed-in person's photo in the top right. Hovering (or clicking, on touch screens)
 * opens a menu with their profile, every Voltauri site and Sign out.
 */
export default function ProfileMenu() {
  const profile = useProfile();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number>();
  // Touch screens send a "hover" just before each tap, so hover only counts for a real mouse.
  const lastPointer = useRef<string>("mouse");

  // A short delay before closing, so moving the pointer from the button to the menu doesn't close it.
  const show = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const sites = sitesFor(profile.role);

  return (
    <div
      ref={root}
      className="relative"
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
    >
      <button
        type="button"
        onPointerDown={(e) => (lastPointer.current = e.pointerType)}
        // A mouse has already opened it by hovering, so a click keeps it open; taps and the keyboard toggle it.
        onClick={(e) => (e.detail > 0 && lastPointer.current === "mouse" ? show() : setOpen((o) => !o))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${profile.full_name}: profile and sites`}
        className="flex items-center gap-2 rounded-full p-0.5 pr-1 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:pr-2"
      >
        <Avatar name={profile.full_name} photo={profile.photo} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-slate-700">{firstName(profile.full_name)}</span>
          <span className="block text-xs leading-tight text-slate-400">{ROLE_LABELS[profile.role]}</span>
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={`hidden h-4 w-4 text-slate-400 transition sm:block ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        // pt-2 bridges the gap under the button, so the pointer can reach the menu without it closing.
        <div className="absolute right-0 top-full z-50 w-72 pt-2">
          <div role="menu" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center gap-3 border-b border-slate-100 p-4">
              <Avatar name={profile.full_name} photo={profile.photo} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{profile.full_name}</p>
                <p className="truncate text-xs text-slate-500">{profile.email}</p>
                <p className="text-xs text-slate-400">{ROLE_LABELS[profile.role]}</p>
              </div>
            </div>
            <div className="p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setEditing(true);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Your profile & photo
              </button>
            </div>
            <div className="border-t border-slate-100 p-1.5">
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Voltauri sites</p>
              {sites.map((site) => (
                <a
                  key={site.url}
                  role="menuitem"
                  href={siteHref(site)}
                  target={site.current ? undefined : "_blank"}
                  rel={site.current ? undefined : "noopener noreferrer"}
                  aria-current={site.current ? "page" : undefined}
                  onClick={(e) => {
                    if (site.current) {
                      e.preventDefault();
                      setOpen(false);
                    }
                  }}
                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-slate-50 ${site.current ? "bg-brand-50/60" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800">{site.label}</span>
                    <span className="block truncate text-xs text-slate-500">{site.description}</span>
                  </span>
                  {site.current ? (
                    <span className="shrink-0 text-xs font-medium text-brand-700">You're here</span>
                  ) : (
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400">
                      <path d="M11 3a1 1 0 100 2h2.59l-6.3 6.29a1 1 0 101.42 1.42L15 6.41V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                    </svg>
                  )}
                </a>
              ))}
            </div>
            <div className="border-t border-slate-100 p-1.5">
              <button type="button" role="menuitem" onClick={logout} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-50">
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && <ProfileForm onClose={() => setEditing(false)} />}
    </div>
  );
}

function ProfileForm({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const [fullName, setFullName] = useState(profile.full_name);
  const [photo, setPhoto] = useState<string | null>(profile.photo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setPhoto(await squarePhoto(file));
    } catch (err) {
      setError(err);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateOwnProfile(profile.id, { full_name: fullName, photo });
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal title="Your profile" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar name={fullName || profile.full_name} photo={photo} size="xl" />
          <div className="space-y-2">
            <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} aria-label="Photo file" />
            <button type="button" className={buttonClass.secondary} onClick={() => fileInput.current?.click()}>
              {photo ? "Change photo" : "Add a photo"}
            </button>
            {photo && (
              <button type="button" className="block text-sm text-red-600 hover:text-red-700" onClick={() => setPhoto(null)}>
                Remove photo
              </button>
            )}
            <p className="text-xs text-slate-400">Cropped to a square. Your team and clients see it.</p>
          </div>
        </div>
        <Field label="Full name">
          <input className={inputClass} required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <p className="text-xs text-slate-500">Signed in as {profile.email}</p>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={buttonClass.primary} disabled={busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
