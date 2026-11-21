import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { activeGuild } from "@/lib/guilds";
import { GuildSwitcher } from "@/components/GuildSwitcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireOnboardedUser();
  const { guilds, active } = await activeGuild(session.sub);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/" className="text-lg font-semibold">
            Meet
          </Link>
          <Link href="/" className="text-sm text-muted hover:text-text">
            Calendar
          </Link>
          <Link href="/settings" className="text-sm text-muted hover:text-text">
            Availability &amp; settings
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/meetings/new" className="btn-primary">
              New meeting
            </Link>
            {guilds.length > 1 && active && <GuildSwitcher guilds={guilds} activeId={active.id} />}
            {session.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
            )}
            <span className="hidden text-sm sm:inline">{session.name}</span>
            <form action="/api/auth/logout" method="post">
              <button className="text-sm text-muted hover:text-text">Log out</button>
            </form>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
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
