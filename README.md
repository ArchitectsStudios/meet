# meet

Schedule meetings with people on your Discord servers.

- Log in with Discord. Anyone who shares a server with the bot can sign in. If you share several, a menu in the top right switches between them; new meetings, guest search, roles and voice channels follow the active server.
- Set your timezone and a weekly availability pattern: times you are **unavailable** and times that are **ideal**.
- See your meetings on a week calendar, shaded with your availability.
- Create meetings with an agenda (Markdown), an optional voice channel, and **required** or **optional** guests. Invite people by name or invite a whole **@role**.
- **Best times** scores every slot against everyone's availability and existing meetings. Click a slot to set the start, or drag down a day to set the start and end.
- A Discord bot DMs each guest with RSVP buttons (Going, Maybe, Not going), a link to the voice channel, a reminder before the meeting, and a notice when the meeting changes or is cancelled.
- A private **ICS feed** per user lets your meetings show up in Google Calendar, Apple Calendar or Outlook.

## Layout

```
apps/web/          Next.js 16 app: UI, API routes, Discord OAuth
apps/bot/          discord.js bot: DMs, RSVP buttons, reminders, internal API for the web app
packages/shared/   types, zod schemas, timezone and suggestion logic, ICS builder, Mongo helpers
deploy/k8s/        Kubernetes manifests (kustomize) for k3s
deploy/k3s/        VPS and cluster setup guide
```

The web app never talks to Discord's bot API directly. It calls the bot's internal HTTP API, which is reachable only inside the cluster and protected by `INTERNAL_API_SECRET`. Both apps share one MongoDB database.

## Discord setup

1. Create an application at <https://discord.com/developers/applications>.
2. **OAuth2**: add these redirect URLs:
   - `https://meet.architectsstudio.dev/api/auth/callback/discord`
   - `http://localhost:3000/api/auth/callback/discord` (for development)
3. Copy the client ID and the client secret.
4. **Bot**: reset and copy the token. Turn on **Server Members Intent**.
5. Invite the bot. Open this URL, replacing `CLIENT_ID`:

   ```
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=3072
   ```

   `3072` is View Channels plus Send Messages. Repeat for each server that should use the app. The bot loads a new server's members as soon as it joins.

Guests who have DMs from server members turned off cannot get DMs. The meeting page shows **DM failed** next to them.

## Local development

You need Node 22+, Docker for MongoDB, and pnpm (`corepack enable` installs it).

```sh
cp .env.example .env        # fill in the Discord values and secrets
docker compose -f docker-compose.dev.yml up -d
pnpm install
pnpm dev                    # web on :3000, bot internal API on :3001
```

Both apps read the repo-root `.env` in development.

```sh
pnpm test        # unit tests: timezone and DST expansion, suggestions, guest merging, ICS
pnpm typecheck
pnpm build
```

## How things work

- **Availability** is stored as weekly blocks in the user's local time, with their IANA timezone. The blocks are turned into real UTC times for each date, so a block stays at the same wall-clock time when DST changes. Unmarked time counts as available but not ideal.
- **Role invites** take the role's members at the moment you add the role. People who join the role later are not added. The meeting page shows each role as a group with its own RSVP count.
- **Suggestions** drop any slot where a required guest is unavailable or already in another meeting. The remaining slots get a score: 3 × (required guests ideal) + 1 × (optional guests ideal) − 2 × (optional guests unavailable). The organizer always counts as required.
- **Reminders**: the bot checks every minute and claims each due meeting atomically, so each reminder is sent once.
- **ICS feed**: open *Availability & settings*, copy your calendar link, and in Google Calendar add it under *Other calendars → From URL*. Google refreshes subscribed calendars every few hours. Reset the link if it leaks.

## Deployment

See [deploy/k3s/README.md](deploy/k3s/README.md). In short: install k3s and cert-manager, create the `meet-secrets` Secret, then run `kubectl apply -k deploy/k8s/overlays/prod`. GitHub Actions builds and pushes `ghcr.io/craftycodie/meet-web` and `meet-bot` on every push to `main`.
