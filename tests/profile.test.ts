import { doc, updateDoc } from "firebase/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import { loadProfile, updateOwnProfile } from "../src/firebase/account";
import { db } from "../src/firebase/app";
import { TeamApi } from "../src/firebase/team";
import { seedOrganization, signInAs } from "./helpers";

type Seed = Awaited<ReturnType<typeof seedOrganization>>;

// A real (1x1 pixel) JPEG, the shape squarePhoto() produces.
const PHOTO =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

describe("profile photos", () => {
  let s: Seed;

  beforeAll(async () => {
    s = await seedOrganization();
  });

  it("lets anyone set and remove their own photo and name", async () => {
    const tech = await signInAs(s.tech);
    await updateOwnProfile(tech.id, { full_name: "Terry T. Tech", photo: PHOTO });
    expect(await loadProfile(tech.id)).toMatchObject({ full_name: "Terry T. Tech", photo: PHOTO });

    const client = await signInAs(s.acmeUser);
    await updateOwnProfile(client.id, { full_name: client.full_name, photo: PHOTO });
    await updateOwnProfile(client.id, { full_name: client.full_name, photo: null });
    expect((await loadProfile(client.id))?.photo).toBeNull();
  });

  it("only accepts small image data", async () => {
    const tech = await signInAs(s.tech);
    for (const photo of ["https://example.com/me.jpg", "data:text/html;base64,PHNjcmlwdD4=", "data:image/svg+xml;base64,PHN2Zz4=", `data:image/jpeg;base64,${"A".repeat(160_000)}`]) {
      await expect(updateOwnProfile(tech.id, { full_name: tech.full_name, photo })).rejects.toThrow();
    }
  });

  it("keeps the self-edit to name and photo", async () => {
    const tech = await signInAs(s.tech);
    await expect(updateDoc(doc(db, "users", tech.id), { photo: PHOTO, job_title: "Boss" })).rejects.toThrow();
    // Nobody but an admin changes someone else's photo.
    await expect(updateDoc(doc(db, "users", s.otherTech.profile.id), { photo: PHOTO })).rejects.toThrow();

    const admin = await signInAs(s.admin);
    const other = (await loadProfile(s.otherTech.profile.id))!;
    await TeamApi.saveEmployee(admin, other, { ...other }, null);
    await updateDoc(doc(db, "users", other.id), { photo: null });
    await updateDoc(doc(db, "users", other.id), { photo: PHOTO });
    expect((await loadProfile(other.id))?.photo).toBe(PHOTO);
  });
});
