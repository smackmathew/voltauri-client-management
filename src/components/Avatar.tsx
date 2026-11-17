import { initials } from "./OnTheClock";

const SIZES = { sm: "h-8 w-8 text-xs", md: "h-9 w-9 text-sm", lg: "h-14 w-14 text-lg", xl: "h-20 w-20 text-2xl" };

/** A person's photo, or their initials when they haven't added one. */
export default function Avatar({ name, photo, size = "md" }: { name: string; photo: string | null; size?: keyof typeof SIZES }) {
  return photo ? (
    <img src={photo} alt="" className={`${SIZES[size]} shrink-0 rounded-full object-cover ring-1 ring-slate-200`} />
  ) : (
    <span className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full bg-brand-600 font-semibold text-white`}>
      {initials(name) || "?"}
    </span>
  );
}
