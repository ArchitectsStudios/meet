const ERRORS: Record<string, string> = {
  state: "The sign-in link expired. Try again.",
  oauth: "Discord did not accept the sign-in. Try again.",
  not_member: "You need to share a Discord server with the Meetings bot to use this app.",
  bot: "The Discord bot is offline, so membership could not be checked. Try again soon.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm text-center">
        <h1 className="mb-1 text-2xl font-semibold">Meet</h1>
        <p className="mb-6 text-sm text-muted">Find a time that works and invite people from your Discord server.</p>
        {error && (
          <p className="mb-4 rounded-md border border-unavail/50 bg-unavail/10 p-2 text-sm text-red-200">
            {ERRORS[error] ?? "Sign-in failed."}
          </p>
        )}
        <a href="/api/auth/login" className="btn-primary w-full py-2.5">
          Log in with Discord
        </a>
      </div>
    </main>
  );
}
