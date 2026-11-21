import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { activeGuild } from "@/lib/guilds";
import { GuildSwitcher } from "@/components/GuildSwitcher";
import { NavLinks } from "@/components/NavLinks";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireOnboardedUser();
  const { guilds, active } = await activeGuild(session.sub);
  return (
    <div>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 sm:gap-4 sm:py-3">
          <Link href="/" className="text-lg font-semibold">
            Meet
          </Link>
          <NavLinks className="hidden md:flex" />
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            <Link href="/meetings/new" className="btn-primary px-2.5 sm:px-3" aria-label="New meeting">
              <span aria-hidden className="text-base leading-none sm:hidden">+</span>
              <span className="hidden sm:inline">New meeting</span>
            </Link>
            {guilds.length > 1 && active && <GuildSwitcher guilds={guilds} activeId={active.id} />}
            {session.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full" />
            )}
            <span className="hidden text-sm lg:inline">{session.name}</span>
            <form action="/api/auth/logout" method="post">
              <button className="text-sm whitespace-nowrap text-muted hover:text-text">Log out</button>
            </form>
          </div>
        </nav>
        <NavLinks className="-mt-1 overflow-x-auto px-3 pb-2 md:hidden" />
      </header>
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        {active ? (
          children
        ) : (
          <div className="card mx-auto max-w-lg space-y-2 text-center">
            <h1 className="font-semibold">No shared server</h1>
            <p className="text-sm text-muted">
              The Meetings bot is not in any Discord server you are in. Ask a server admin to add it, then reload this page.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
