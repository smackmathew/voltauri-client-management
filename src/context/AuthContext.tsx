import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { auth } from "../firebase/app";
import { AccountApi, completeProfile, profileDoc, toProfile, type SignupPayload } from "../firebase/account";
import type { Profile } from "../types";

interface AuthContextValue {
  /** The signed-in user's profile, kept live: role changes and clock status show up at once. */
  profile: Profile | null;
  loading: boolean;
  /** Signed in, but hasn't joined yet (e.g. a mistyped invite code at sign-up). */
  needsProfile: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  finishSetup: (payload: Pick<SignupPayload, "full_name" | "invite_code" | "org_name">) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  // Bumped after sign-up creates the profile, to re-subscribe to it.
  const [generation, setGeneration] = useState(0);
  // Sign-up creates the account before the profile exists; don't report "no profile" in between.
  const settingUp = useRef(false);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setFirebaseUser(user);
    if (user) {
      setLoading(true);
    } else {
      setProfile(null);
      setNeedsProfile(false);
      setLoading(false);
    }
  }), []);

  useEffect(() => {
    if (!firebaseUser) return;
    return onSnapshot(
      profileDoc(firebaseUser.uid),
      (snap) => {
        if (settingUp.current) return;
        setProfile(snap.exists() ? toProfile(snap) : null);
        setNeedsProfile(!snap.exists());
        setLoading(false);
      },
      () => {
        if (settingUp.current) return;
        setProfile(null);
        setNeedsProfile(true);
        setLoading(false);
      },
    );
  }, [firebaseUser, generation]);

  async function login(email: string, password: string) {
    await AccountApi.login(email, password);
  }

  async function signup(payload: SignupPayload) {
    settingUp.current = true;
    try {
      setProfile(await AccountApi.signup(payload));
      setNeedsProfile(false);
    } catch (error) {
      // The account may exist even though joining failed (e.g. a mistyped invite code).
      setNeedsProfile(auth.currentUser !== null);
      throw error;
    } finally {
      settingUp.current = false;
      setGeneration((g) => g + 1);
    }
  }

  async function finishSetup(payload: Pick<SignupPayload, "full_name" | "invite_code" | "org_name">) {
    setProfile(await completeProfile(payload));
    setNeedsProfile(false);
    setGeneration((g) => g + 1);
  }

  async function logout() {
    await AccountApi.logout();
  }

  return (
    <AuthContext.Provider value={{ profile, loading, needsProfile, login, signup, finishSetup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** The signed-in profile, for pages that are only reachable once signed in. */
export function useProfile(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error("Not signed in");
  return profile;
}
