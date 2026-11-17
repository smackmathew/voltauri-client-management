import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { buttonClass, ErrorNote, PageLoader } from "../components/ui";
import { useAuth, useProfile } from "../context/AuthContext";
import { auth } from "../firebase/app";
import { ssoRedirectUrl, ssoTarget } from "../lib/sso";

/**
 * /sso?to=admin|sites&next=/path — signs the person into another Voltauri site with their Portal
 * login. Reached from the profile menu, or from a site's "Sign in with Voltauri" button.
 */
export default function Sso() {
  const profile = useProfile();
  const { emailVerified, sendVerification, refreshVerified } = useAuth();
  const [params] = useSearchParams();
  const target = ssoTarget(params.get("to"));
  const allowed = !!target && target.roles.includes(profile.role);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!target || !allowed || !emailVerified) return;
    let cancelled = false;
    // A freshly minted token: the site refuses ones more than a few minutes old.
    auth.currentUser
      ?.getIdToken(true)
      .then((token) => {
        if (!cancelled) window.location.replace(ssoRedirectUrl(target, token, params.get("next")));
      })
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [target, allowed, emailVerified, params]);

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <img src="/voltauri-logo.png" alt="Voltauri" className="mx-auto mb-5 h-9 w-auto" />
        {children}
      </div>
    </div>
  );

  if (!target) {
    return shell(
      <>
        <p className="text-sm text-slate-600">That sign-in link isn't one the Portal recognises.</p>
        <Link to="/" className={`${buttonClass.primary} mt-4 inline-block`}>Go to the Portal</Link>
      </>,
    );
  }

  if (!allowed) {
    return shell(
      <>
        <h1 className="text-lg font-semibold text-slate-900">No access to {target.label}</h1>
        <p className="mt-2 text-sm text-slate-600">Your Voltauri account doesn't include {target.label}. If you think it should, ask a Voltauri admin.</p>
        <Link to="/" className={`${buttonClass.primary} mt-4 inline-block`}>Go to the Portal</Link>
      </>,
    );
  }

  if (!emailVerified) {
    return shell(
      <>
        <h1 className="text-lg font-semibold text-slate-900">Verify your email first</h1>
        <p className="mt-2 text-sm text-slate-600">
          To open {target.label} with your Voltauri login, confirm that <span className="font-medium">{profile.email}</span> is yours. It only takes one click, once.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            className={buttonClass.primary}
            disabled={sent}
            onClick={() => sendVerification().then(() => setSent(true), setError)}
          >
            {sent ? "Link sent: check your inbox" : "Email me a verification link"}
          </button>
          <button
            className={buttonClass.secondary}
            disabled={checking}
            onClick={() => {
              setChecking(true);
              setError(null);
              refreshVerified()
                .then((ok) => !ok && setError(new Error("Not verified yet. Click the link in the email, then try again.")))
                .catch(setError)
                .finally(() => setChecking(false));
            }}
          >
            I've clicked the link
          </button>
        </div>
        <div className="mt-3"><ErrorNote error={error} /></div>
      </>,
    );
  }

  return shell(
    error ? (
      <>
        <ErrorNote error={error} />
        <Link to="/" className={`${buttonClass.secondary} mt-4 inline-block`}>Back to the Portal</Link>
      </>
    ) : (
      <>
        <PageLoader />
        <p className="-mt-16 text-sm text-slate-500">Signing you in to {target.label}…</p>
      </>
    ),
  );
}
