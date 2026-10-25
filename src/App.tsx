import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { PageLoader } from "./components/ui";
import { useAuth } from "./context/AuthContext";
import type { Role } from "./types";

const Clients = lazy(() => import("./pages/Clients"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const HelpDesk = lazy(() => import("./pages/HelpDesk"));
const Login = lazy(() => import("./pages/Login"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Team = lazy(() => import("./pages/Team"));
const Ticket = lazy(() => import("./pages/Ticket"));
const TimeClock = lazy(() => import("./pages/TimeClock"));
const Timesheets = lazy(() => import("./pages/Timesheets"));

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { profile, loading } = useAuth();
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Loading...</div>;
  }
  if (!profile || !profile.active) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

/** Hides a page from roles that can't use it. (The security rules enforce access regardless.) */
function Only({ roles, children }: { roles: Role[]; children: React.ReactElement }) {
  const { profile } = useAuth();
  return profile && roles.includes(profile.role) ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Suspense fallback={<PageLoader />}>
            <Login />
          </Suspense>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="clock" element={<Only roles={["admin", "tech"]}><TimeClock /></Only>} />
        <Route path="timesheets" element={<Timesheets />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="helpdesk" element={<HelpDesk />} />
        <Route path="helpdesk/:id" element={<Ticket />} />
        <Route path="clients" element={<Only roles={["admin", "tech"]}><Clients /></Only>} />
        <Route path="team" element={<Only roles={["admin"]}><Team /></Only>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
