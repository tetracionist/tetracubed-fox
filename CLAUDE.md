# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Discord bot (Node.js, ESM) that fronts the **Tetracubed API** to start/stop a Minecraft server running on AWS (ECS + EC2-style infra; the bot doesn't know about AWS itself, only the API). Players use Discord slash commands; the bot calls the API, then pings the resulting server with the Minecraft protocol to report status.

Two source files do everything:
- `src/index.js` — Discord client, slash command definitions, handlers, presence updater.
- `src/api-client.js` — `TetracubedAPIClient`: OAuth2 password-grant auth + `startServer` / `stopServer` / `getResources`.

There is no build step, no test suite, and no linter configured.

## Commands

```bash
npm start          # node src/index.js
npm run dev        # node --watch src/index.js (auto-restart on file change)
```

A populated `.env` (see `.env.example`) is required — `index.js` exits on startup if `DISCORD_TOKEN`, `API_BASE_URL`, `API_USERNAME`, or `API_PASSWORD` are missing.

## Architecture notes that aren't obvious from one file

**Two layers of "is the server up?"** `/status` only asks the API whether infrastructure is provisioned (`outputs.public_ip` present). `/ping-server` goes further: it gets the IP from the API, then opens a Minecraft protocol connection via `minecraft-server-util` to see if the game server itself is responding. Infra-up-but-MC-not-ready is a real state and is reported as "starting up." The presence updater (`updateBotStatus`, every 2 min) uses the same two-step check to set Watching status to Offline / Starting / `N/M players`.

**Server address resolution.** `SERVER_HOSTNAME` (a DDNS name) wins over `result.outputs.public_ip` everywhere the address is shown or pinged. The IP is the fallback when DDNS isn't configured. Keep this precedence consistent if adding new commands.

**Start/stop are long.** `apiClient.startServer()` / `stopServer()` set `timeout: 1800000` (30 min — real provisioning runs have exceeded 15 min) because AWS provisioning runs synchronously inside the API call. Discord interactions are `deferReply()`'d for the same reason, but the interaction token itself dies 15 minutes after invocation, so completion/error messages must go through `safeReply()` (editReply with a channel-message fallback), and a timed-out start falls back to `waitForServerUp()` polling. Don't shorten these timeouts or bypass `safeReply` for anything that runs long.

**Token caching.** `TetracubedAPIClient` refreshes its OAuth token at 25 minutes (API tokens expire at 30). Every method calls `ensureAuthenticated()` first — don't bypass it.

**Permissions ladder** (`hasPermission` in `index.js`): if `ALLOWED_ROLE_ID` is set, only that role passes; else if `ADMIN_USER_IDS` (comma-separated) is set, only those user IDs pass; else falls back to Discord Administrator permission. Only `/start`, `/stop`, and `/set-notification-channel` gate on this — `/status`, `/ping-server`, etc. are open.

**Runtime config persistence.** `/set-notification-channel` writes to `config.json` at the repo root (one level up from `src/`). This file is mutable state at runtime, not source — env `NOTIFICATION_CHANNEL_ID` is just the initial default. The deploy `rsync --delete` does not exclude `config.json`, so a `/set-notification-channel` setting will be wiped on the next deploy unless that's addressed.

**Slash commands are registered globally on every `ready`.** They're defined inline in the `commands` array in `index.js`. Adding a command means: add to the array, add a `case` in the `interactionCreate` switch, write the handler. No separate command-loader machinery.

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which rsyncs the repo over SSH (as `SSH_USER` into `REMOTE_DIR`), writes `.env` from GitHub secrets, runs `npm install --omit=dev`, refreshes the systemd unit if it changed, and restarts the service. The job then tails the last 6 minutes of logs so startup errors show up in the Actions log.

**Two deploy targets, two setups — the workflow is now no-sudo (`systemctl --user`).**

- `setup-user.sh` + `deploy/` (current): unprivileged per-user install. Node via `nvm`, a **systemd user** service at `~/.config/systemd/user/tetracubed-fox.service`, launched by `deploy/run.sh` (sources nvm, `cd`s to repo root so dotenv finds `.env`). No root anywhere. The one catch: the user's systemd instance must persist without an interactive login, so `sudo loginctl enable-linger <user>` has to be run **once** — without it the service dies on logout and CI can't restart it. `setup-user.sh` attempts to enable linger and prints the command if it can't. The workflow sets `XDG_RUNTIME_DIR=/run/user/$(id -u)` so `systemctl --user` targets that instance.
- `setup-oracle.sh` + `tetracubed-fox.service` (legacy, root-based): installs Node via apt and a **system** unit running as `ubuntu`, sourcing `.env` via `EnvironmentFile`. Kept for reference; the workflow no longer uses `sudo systemctl` / the `/etc` unit.

The user unit's `ExecStart`/`WorkingDirectory` use `%h/tetracubed-fox`, so `REMOTE_DIR` must be `/home/<user>/tetracubed-fox` for the paths to line up.

To check the live bot (as the deploy user):
```bash
ssh <user>@<host> "XDG_RUNTIME_DIR=/run/user/\$(id -u) journalctl --user -u tetracubed-fox -f"
ssh <user>@<host> "XDG_RUNTIME_DIR=/run/user/\$(id -u) systemctl --user status tetracubed-fox"
```
