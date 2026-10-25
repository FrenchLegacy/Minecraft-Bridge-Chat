<div align="center">

<img src="./fl_logo.png" alt="French Legacy Logo" width="200"/>

<h1>Minecraft-Bridge-Chat</h1>

<p>Bidirectional chat bridge between the FrenchLegacy Hypixel guilds and Discord.</p>

[![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)](https://discord.js.org)
[![Mineflayer](https://img.shields.io/badge/mineflayer-v4-62B15B)](https://github.com/PrismarineJS/mineflayer)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](./docker-compose.yml)

</div>

---

## What it does

One Minecraft bot account per guild stays connected to Hypixel; one Discord bot relays everything.

- Guild chat and officer chat ↔ one shared Discord **chat** channel and one shared **staff** channel
  (all guilds together, each message tagged with its guild), through webhooks with player avatars
- Guild events (joins, leaves, promotions, kicks, mutes…) relayed and logged
- Inter-guild relay between the FrenchLegacy guilds (`bridge.interGuild`)
- `/guild …` slash commands to manage the guilds from Discord, and the same commands posted as
  text by the FrenchLegacy Discord bot in the **detection channel** (`fl-meta` protocol)
- `[STAFF]` tag for FrenchLegacy staff on both sides (`bridge.staffTag`)
- Serialized outbound chat per account, with anti-duplicate and rate limits (`bridge.minecraftQueue`)
- Bot status panel, automatic reconnection with exponential backoff

## Dependencies

| Dependency | Why | Where |
| --- | --- | --- |
| [FrenchLegacy-API](https://github.com/FrenchLegacy/FrenchLegacy-API) | receives the shared log (`POST /audit/events`, heartbeat); key `API_KEY_BRIDGE` | `frenchlegacy-api` service |
| [`@frenchlegacy/logging`](https://github.com/FrenchLegacy/FrenchLegacy-Logging) | shared log (log forum + `frenchlegacy_logs` database) | `vendor/frenchlegacy-logging-0.5.0.tgz`, committed here |
| [FrenchLegacy-Discord](https://github.com/FrenchLegacy/FrenchLegacy-Discord) | posts guild commands in the detection channel | — |
| Microsoft accounts | one per guild, already a member of that guild, with the rank needed for the commands | — |

The bridge does **not** use `@frenchlegacy/api-client`: no GitHub token is needed to build it.

When the `fl-meta` detection protocol changes, deploy the bridge **before** FrenchLegacy-Discord
(the bridge must already understand what the Discord bot emits).

## Configuration

```bash
cp config/settings.example.json config/settings.json
```

`config/settings.json` is not committed and is excluded from the image (`.dockerignore`); compose
mounts it **read-only**. `config/patterns.json` (chat/event regexes) and `config/templates.json`
(message formats) are committed and baked into the image.

| Block | Content |
| --- | --- |
| `app` | Discord bot `token`, `clientId`, `serverDiscordId` |
| `guilds[]` | per guild: `name`, `tag`, `id`, `enabled`, `server` (`mc.hypixel.net`, `1.8.9`), `account` (`username`, `email`, `authMethod: "microsoft"`, auth cache paths under `./data/auth-cache`, reconnection), `ranks` (lowest to highest, without the staff rank) |
| `bridge.channels` | `chat` and `staff`: channel `id` and optional `webhookUrl` (must be a `https://discord.com/` URL) — shared by all guilds |
| `bridge.webhook`, `bridge.staffTag`, `bridge.interGuild`, `bridge.rateLimit`, `bridge.minecraftQueue`, `bridge.events` | relay behaviour |
| `discord.permissions` | `moderatorRoles`, `adminRoles` allowed to use `/guild` |
| `discord.logChannels` | legacy log targets (channel or forum post ID), used only without an `audit` block |
| `audit` | shared log: `enabled`, `environment`, `apiKey` = `API_KEY_BRIDGE` from `FrenchLegacy-API/.env`, `posts` (IDs of **existing** log-forum posts: `guildes`, `commandes`, `prives`, optional `technique`) |
| `features.detection` | `channelId` (the Discord bot's `channels.bridgeCommandsDetection`) and `allowedUsers` (the Discord bot's user ID) |
| `features.*`, `advanced.*` | logging, parsers, templates, queues, metrics, message cleaning, routing |

The API URL defaults to `http://frenchlegacy-api:10000` (override: `audit.apiBaseUrl` or
`INTERNAL_API_URL`).

### Discord application

Enable the privileged intents **Server Members** and **Message Content**; invite with the `bot`
and `applications.commands` scopes. Slash commands are registered at startup.

### First Microsoft login

On first start (or when the cached token expires), each account prints a device code in the logs:

```bash
docker compose logs -f frenchlegacy-bridge
# open the verification URL shown, enter the code, sign in with that guild's account
```

Tokens are cached in `data/auth-cache` (volume `fl_bridge_prod`), so this is needed once per account.

## Build and deploy

Prerequisite: FrenchLegacy-API running and attached to the Docker network **`fl-network`**, where
the bridge reaches it by name (`http://frenchlegacy-api:10000`). `docker-compose.yml` attaches the
bridge to that network without declaring it: declare it external in a local
`docker-compose.override.yml` (picked up automatically by Docker Compose):

```yaml
networks:
  fl-network:
    external: true
```

```bash
cp config/settings.example.json config/settings.json   # fill it in
docker compose up -d --build
docker compose logs -f frenchlegacy-bridge
```

The image is a two-stage build (`python3 make g++` for native modules); `entrypoint.sh` creates
`data/auth-cache` and `data/logs`, fixes ownership, then drops to the `node` user.

## Local development

```bash
npm install            # package-lock.json is not committed
cp config/settings.example.json config/settings.json
npm run dev            # node --watch src/main.js
```

Use a test Discord bot and server. Connecting a real guild account from a second place kicks the
production bridge off Hypixel: stop it first, or use a test account. No automated tests.

To update `@frenchlegacy/logging`, run `npm run vendor -- <path to this repo>` from a clone of
FrenchLegacy-Logging; never edit `vendor/` by hand.

## Discord commands

| Command | Description |
|---------|-------------|
| `/ping` | Bot latency |
| `/help` | List available commands |
| `/serverinfo` | Connected server info |
| `/guild list <guild> <type>` | List guild members |
| `/guild invite <guild> <player>` | Invite a player |
| `/guild kick <guild> <player> <reason>` | Kick a player |
| `/guild promote/demote <guild> <player>` | Manage ranks |
| `/guild mute/unmute <guild> <player>` | Moderation |
| `/guild setrank <guild> <player> <rank>` | Set a rank directly |
| `/guild info <guild>` | Guild info |
| `/guild execute <guild> <command>` | Run an arbitrary guild command |

## Project structure

```
src/
├── main.js                          # Entry point
├── config/                          # Config, pattern and template loaders
├── discord/
│   ├── bridge/BridgeCoordinator.js  # Message relay logic
│   ├── client/commands/             # Slash commands (/guild and subcommands)
│   ├── client/handlers/             # Slash commands, detection channel, command responses
│   └── client/senders/              # Webhook & message senders
├── minecraft/
│   ├── client/                      # Bot manager, connection, chat queue
│   ├── client/parsers/              # Chat & event parsing
│   └── servers/HypixelStrategy.js   # Hypixel-specific handling
└── shared/                          # Logger, formatter, inter-guild, staff directory, audit
```

Each `src/*/README.md` describes its module in more detail.

## Troubleshooting

**Bot not connecting to Minecraft** — Check the logs for a pending Microsoft device code, the account credentials, and that the account is in the guild.

**Messages not bridging** — Verify `bridge.channels` IDs and webhook URLs, and check logs for parsing errors.

**Commands not working** — Check `discord.permissions`, the in-game rank of the account, and for text commands `features.detection`.

## License

CC BY-NC 4.0 (see `LICENSE`).

---

<div align="center">
<sub>Made by <a href="https://github.com/FrenchLegacy">French Legacy</a> — maintained by <a href="https://github.com/Fabien83560">@Fabien83560</a></sub>
</div>
