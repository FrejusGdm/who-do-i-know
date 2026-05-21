import Link from "next/link";
import { Download, Home, Radar, TableProperties, Users } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/people", label: "People", icon: Users },
  { href: "/outreach", label: "Mentors", icon: Radar },
  { href: "/review", label: "Review", icon: TableProperties },
  { href: "/exports", label: "Exports", icon: Download },
];

export function AppNav() {
  return (
    <nav className="fixed left-0 right-0 top-4 z-50 flex justify-center px-4">
      <div className="flex items-center gap-1 border border-neutral-200 bg-white/90 p-1 shadow-sm backdrop-blur-md">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex h-9 items-center gap-2 px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"
          >
            <link.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{link.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
