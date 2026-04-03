<div style="text-align: center;">

<img src="./fl_logo.png" alt="French Legacy Logo" width="128"/>

<h1>Minecraft-Bridge-Chat</h1>

<p>Bidirectional chat bridge between Minecraft guild chat and Discord.</p>

<p><a href="./README.md">Version française</a></p>

</div>

<p style="text-align: center;">
[![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)](https://discord.js.org)
[![Mineflayer](https://img.shields.io/badge/mineflayer-v4-62B15B)](https://github.com/PrismarineJS/mineflayer)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](./docker-compose.yml)
</p>

---

## Important information

- **Node.js 22+** required
- **Discord bot** with the *message content intent* and slash commands enabled
- **Microsoft Minecraft account** with access to the target guild
- **Officer/admin permissions** on the Minecraft side for management commands
- The logo at the top of the README must exist at `./fl_logo.png`

## What the project does

- Real-time relay between **Minecraft ↔ Discord**
- Automatic detection of guild events: joins, leaves, promotions, kicks, mutes, and more
- Discord slash commands to manage the guild
- Webhook integration with player avatars
- Multi-guild support
- Inter-guild communication
- Automatic reconnection with exponential backoff

## Documentation

- [Configuration](src/config/README.md)
- [Discord](src/discord/README.md)
- [Minecraft](src/minecraft/README.md)
- [Shared / utilities](src/shared/README.md)

## Quick installation

```bash
# 1. Clone the repository
git clone https://github.com/Fabien83560/Minecraft-Bridge-Chat.git
cd Minecraft-Bridge-Chat

# 2. Install dependencies
npm install

# 3. Configure
cp config/settings.example.json config/settings.json
# Then fill in the credentials in config/settings.json

# 4. Start the bot
npm start
```

### Development mode

```bash
npm run dev
```

### With Docker

```bash
docker-compose up -d
```

## Quick configuration

Copy `config/settings.example.json` to `config/settings.json`, then fill in at least:

- `app.token` — Discord bot token
- `app.clientId` — Discord client ID
- `app.serverDiscordId` — Discord server ID
- `guilds[]` — list of guilds to connect
- `account.email` — Microsoft Minecraft account
- `server.host`, `server.port`, `server.version` — server settings
- `channels` and `webhooks` — Discord channel IDs and webhooks

For the full structure, see [the configuration docs](src/config/README.md) and `config/settings.example.json`.

## Main Discord commands

| Command | Description |
|---------|-------------|
| `/ping` | Bot latency |
| `/help` | Help and available commands |
| `/serverinfo` | Connected server information |
| `/guild list` | List guild members |
| `/guild invite` | Invite a player |
| `/guild kick` | Kick a player |
| `/guild promote` / `/guild demote` | Manage ranks |
| `/guild mute` / `/guild unmute` | Moderation |
| `/guild setrank` | Set a rank directly |
| `/guild info` | Guild information |
| `/guild execute` | Run an arbitrary guild command |

## Quick troubleshooting

- **The bot does not connect to Minecraft**: check the Microsoft account, guild access, and server configuration.
- **Messages are not relaying**: check webhooks, Discord channels, and detection patterns.
- **Commands do not respond**: check Discord bot permissions and the officer role in Minecraft.

## Project structure

```text
src/
├── main.js
├── config/
├── discord/
├── minecraft/
└── shared/
```

---

Project maintained by [Fabien83560](https://github.com/Fabien83560)






