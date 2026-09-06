import Link from "next/link";
import {
  CalendarDays,
  Users,
  Layers3,
  ArrowUpRight,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const primary = [
  { href: "/dashboard", label: "Today", icon: CalendarDays },
  { href: "/people", label: "People", icon: Users },
  { href: "/circles", label: "Circles", icon: Layers3 },
  { href: "/interviews", label: "Interviews", icon: MessageCircle },
];

export function NetworkShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div className="network-workspace min-h-dvh bg-[#F7F5F0] text-[#222923]">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3"
      >
        Skip to content
      </a>
      <aside className="border-b border-[#deded5] px-5 py-5 md:fixed md:inset-y-0 md:left-0 md:w-[220px] md:border-b-0 md:border-r md:px-6 md:py-9">
        <Link href="/dashboard" className="inline-block text-lg font-medium">
          WhoDoYouKnow
          <span className="mt-1 block text-sm font-normal text-[#62685e]">
            Your relationship notebook
          </span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="mt-5 flex gap-1 md:mt-12 md:flex-col md:gap-2"
        >
          {primary.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active === label ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md px-2 text-sm md:flex-none md:justify-start md:px-3 md:text-base",
                active === label
                  ? "bg-[#e5eadd] font-medium text-[#344e3d]"
                  : "text-[#62685e] hover:bg-white",
              )}
            >
              <Icon className="hidden size-4 sm:block" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <details className="mt-4 md:hidden">
          <summary className="min-h-11 cursor-pointer text-sm text-[#62685e]">
            More from your notebook
          </summary>
          <nav
            aria-label="Tools"
            className="flex flex-wrap gap-x-5 md:flex-col md:gap-1"
          >
            {[
              ["/updates", "Personal updates"],
              ["/filter", "Gmail import"],
              ["/imports/linkedin", "LinkedIn import"],
              ["/archive", "Google archive"],
              ["/review", "Mentor review"],
              ["/exports", "Exports"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-11 items-center justify-between gap-3 text-sm text-[#62685e] hover:text-[#222923]"
              >
                {label}
                <ArrowUpRight className="size-3" aria-hidden />
              </Link>
            ))}
          </nav>
        </details>
        <div className="mt-10 hidden md:block">
          <p className="mb-3 text-sm text-[#62685e]">More from your notebook</p>
          <nav
            aria-label="Tools"
            className="flex flex-wrap gap-x-5 md:flex-col md:gap-1"
          >
            {[
              ["/updates", "Personal updates"],
              ["/filter", "Gmail import"],
              ["/imports/linkedin", "LinkedIn import"],
              ["/archive", "Google archive"],
              ["/review", "Mentor review"],
              ["/exports", "Exports"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-11 items-center justify-between gap-3 text-sm text-[#62685e] hover:text-[#222923]"
              >
                {label}
                <ArrowUpRight className="size-3" aria-hidden />
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-5 hidden text-sm leading-6 text-[#62685e] md:block">
          A little attention,
          <br />
          at the right time.
        </p>
      </aside>
      <main
        id="workspace"
        className="px-5 py-8 md:ml-[220px] md:px-10 md:py-12"
      >
        <div className="mx-auto max-w-[1120px]">{children}</div>
      </main>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-[#deded5] pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-3 text-sm text-[#62685e]">{eyebrow}</p>}
        <h1 className="break-words font-serif text-4xl text-balance">
          {title}
        </h1>
        <p className="mt-3 max-w-xl text-pretty leading-6 text-[#62685e]">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}

export const fieldClass =
  "min-h-11 w-full rounded-md border border-[#c8ccc1] bg-white px-3 py-2 text-base text-[#222923]";
export const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#43664F] px-4 py-2 font-medium text-white hover:bg-[#344e3d] disabled:cursor-wait disabled:opacity-60";
export const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#c8ccc1] bg-white px-4 py-2 text-[#222923] hover:bg-[#eef0e8] disabled:opacity-60";
