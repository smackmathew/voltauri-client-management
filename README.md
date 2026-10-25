# Tauri Operations Dashboard

One place for Tauri to run its client work: **clients**, **employees**, **tasks**, **help desk
requests** and a **time clock**. Techs clock in and out against a client, and the hours show up
on Tauri's screens and on that client's screens the moment they punch, with no refresh. That's
the accountability: everyone looks at the same live record.

## Who sees what

| | Admin (Tauri management) | Technician | Client portal user |
| --- | --- | --- | --- |
| Dashboard | Whole company: who's on the clock, team hours, open tickets and tasks | Their clock, their tickets and tasks | Who's working for them right now, hours this week/month, their tickets and tasks |
| Time clock | Clock in/out | Clock in/out | — |
| Timesheets | Everyone's, filterable, CSV export, can correct entries and add missed shifts | Their own | Every hour worked for their company, CSV export |
| Tasks | Create, assign, edit, delete | Create, assign, edit | Read-only, their company's |
| Help desk | All tickets, assign, internal notes | All tickets, assign, internal notes | Open tickets for their company, reply, close/reopen. Never sees internal notes |
| Clients | Add, edit, deactivate | View | — |
| Team | Invite people, change roles, deactivate accounts | — | — |

Each row is enforced by the Firestore security rules (`firestore.rules`), not just hidden in the
UI. A client user can't read another client's tickets or time even by calling the database directly.

## How the time clock stays honest

- **The server stamps the time.** Clock-in and clock-out use the server's clock, so a tech can't
  type in or backdate their own hours.
- **One shift at a time.** A tech can't be clocked in twice. Their profile points at their open
  entry, and the rules check it.
- **Corrections are visible.** Only admins can change an entry (e.g. "forgot to clock out"), and
  they must give a reason. The first correction saves the original punch. The tech and the client
  both see the "Corrected" badge, the reason and the original times. Admin-added missed shifts
  are marked "Added by admin".
- **Nothing is deleted.** Time entries can't be deleted by anyone.
- Each entry can link to a help desk ticket and a task, so the client sees what the time was for.
  Each ticket page totals the time logged against it.

## Stack

Same as the household app in this repo: React + TypeScript (Vite) and Tailwind, on Firebase
(Authentication for sign-in, Cloud Firestore for data, Hosting for the site). Every screen
subscribes to Firestore live (`onSnapshot`), which is what makes updates instant. There are no
Cloud Functions, so the free **Spark** plan is enough.

## Putting it online

1. In the [Firebase console](https://console.firebase.google.com), create a project for Tauri (separate
   from the household app's), then:
   - **Authentication** → Get started → **Email/Password** → enable.
   - **Firestore Database** → Create database (production mode; the rules come from this folder).
   - **Project settings** → General → Your apps → add a **Web app** and copy its config values.
2. Copy `.env.example` to `.env.local` and fill in those values.
3. Deploy from this folder:
   ```bash
   npm ci
   npx firebase login
   npx firebase use --add          # pick the Tauri project
   npx firebase deploy             # builds the site, deploys rules, indexes and hosting
   ```
4. Open the site, choose **First time? Set up Tauri** and create your account. The first account
   becomes the admin; nobody else can do this step afterwards.
5. On **Clients**, add your clients. On **Team** → **Invite someone**, create an invite code for each
   tech (role: Technician) and each client contact (role: Client portal user, plus their company).
   They sign up with **I have an invite code**. A code works once, and can be locked to one email.

## Developing locally

Runs against the Firebase emulators (needs Java 11+), so nothing touches real data:

```bash
npm ci
npm run emulators       # terminal 1: Auth + Firestore emulators (UI at http://localhost:4000)
npm run dev:emulators   # terminal 2: the app at http://localhost:5174
```

## Tests

```bash
npm test
```

This starts the emulators and checks the security rules and data layer: sign-up and invites,
role separation, the time clock guarantees above, help desk privacy (internal notes, one client
can't see another's tickets) and tasks. GitHub Actions runs it on every push.

## Possible next steps

- Billing: hourly rates per client or tech, and invoices built from the timesheets.
- Email or SMS notifications for new tickets and replies (this needs Cloud Functions, so the Blaze plan).
- A desktop build with the [Tauri](https://tauri.app) framework, if you want a native app for techs.
  The web app would run inside it unchanged.
