import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";

const NAV = [
  { href: "/hod", label: "Overview" },
  { href: "/hod/faculty", label: "Members" },
  { href: "/hod/requests", label: "Accept Requests" },
  { href: "/hod/report", label: "Report & Files" },
  { href: "/naac-upload", label: "Uploads" },
  { href: "/accept-invite", label: "Accept Invite" },
];

export default function HodLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Head of Department</p>
          <h1 className="text-lg font-semibold text-slate-900">NAAC Report Portal</h1>
        </div>
        <SignOutButton />
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-6">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="whitespace-nowrap px-3 py-3 text-sm font-medium text-slate-600 hover:border-b-2 hover:border-slate-900 hover:text-slate-900"
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
