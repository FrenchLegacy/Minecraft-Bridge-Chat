# Discord Module

The Discord module handles all Discord-related functionality, including bot management, command handling, message processing, and bridge coordination.

## Structure

```
discord/
├── DiscordManager.js          → Main Discord coordination
├── bridge/
│   └── BridgeCoordinator.js   → Message relay coordination
├── client/
│   ├── DiscordBot.js          → Discord bot instance
│   ├── commands/              → Command definitions
│   ├── handlers/              → Event and message handlers
│   └── senders/               → Message sending utilities
└── utils/
    └── EmbedBuilder.js        → Discord embed creation
```

## Components

### DiscordManager.js

Main coordinator for Discord functionality. Responsibilities:

- Initializes and manages Discord bot lifecycle
- Coordinates with BridgeCoordinator for message relay
- Manages event listeners and handlers
- Handles bot startup and shutdown

### Bridge Coordination

#### BridgeCoordinator.js

Orchestrates bidirectional message flow between Discord and Minecraft.

**Features:**
- Message queue management
- Duplicate message filtering
- Error handling and retry logic
- Event-driven architecture

**Message Flow:**
```
Discord Message → MessageHandler → BridgeCoordinator → MinecraftManager
Minecraft Message → MinecraftManager → BridgeCoordinator → WebhookSender
```

## Client Implementation

### DiscordBot.js

Core Discord bot implementation using discord.js library.

**Responsibilities:**
- Client connection and authentication
- Event listener registration
- Command registration and management
- Ready state handling

**Events Handled:**
- `ready` - Bot initialization complete
- `messageCreate` - New message received
- `interactionCreate` - Slash command invoked

### Commands

Command system with two types:

#### 1. Utility Commands

Located in `client/commands/`:

- **ping.js** - Latency check
- **help.js** - Command listing and help
- **serverinfo.js** - Minecraft server information

#### 2. Guild Commands

Located in `client/commands/guild/`:

All guild commands use the base `/guild` command:

- **list.js** - Display guild member list
- **invite.js** - Invite player to guild
- **kick.js** - Kick player from guild
- **promote.js** - Promote guild member
- **demote.js** - Demote guild member
- **mute.js** - Mute guild member in chat
- **unmute.js** - Unmute guild member
- **setrank.js** - Set player's guild rank
- **execute.js** - Execute arbitrary guild command

**Command Structure:**
```javascript
module.exports = {
  permission: "moderator",
  execute: async (interaction, bot) => {
    // Command implementation
  }
};
```

### Handlers

#### MessageHandler.js

Processes incoming Discord messages.

**Functions:**
- Filters bot messages
- Detects command prefix
- Routes messages to appropriate handlers
- Handles guild-specific channels

#### SlashCommandHandler.js

Handles Discord slash command interactions.

**Features:**
- Command validation
- Permission checking
- Error handling
- Response formatting

#### CommandDetectionHandler.js

Detects Minecraft commands in Discord messages.

**Pattern Detection:**
```
/command arguments  → Forward to Minecraft
!command arguments  → Process as Discord command
Regular message     → Send to Minecraft chat
```

#### CommandResponseListener.js

Monitors Minecraft bot output for command responses.

**Features:**
- Response pattern matching
- Timeout handling
- Multi-line response aggregation
- Error detection

### Senders

#### MessageSender.js

Sends standard Discord messages.

**Methods:**
- `sendMessage(channel, content, options)` - Send text message
- `sendEmbed(channel, embed)` - Send embed message
- `sendError(channel, error)` - Send error message
- `sendSuccess(channel, message)` - Send success message

#### WebhookSender.js

Sends messages using Discord webhooks for authentic appearance.

**Features:**
- Webhook creation and management
- Username and avatar customization
- Embed support
- Rate limiting handling

**Message Format:**
```javascript
{
  username: 'PlayerName',
  avatarURL: 'https://crafatar.com/avatars/uuid',
  content: 'Message content',
  embeds: [/* optional embeds */]
}
```

## Utilities

### EmbedBuilder.js

Creates formatted Discord embeds for various purposes.

**Embed Types:**
- Info embeds (blue)
- Success embeds (green)
- Error embeds (red)
- Warning embeds (yellow)
- Custom embeds with fields

**Example:**
```javascript
const embed = EmbedBuilder.createSuccess(
  'Success',
  'Operation completed successfully'
);
```

## Message Flow Examples

### Discord to Minecraft

1. User types message in Discord
2. `MessageHandler` receives message
3. `CommandDetectionHandler` checks for commands
4. `BridgeCoordinator` formats message
5. Message sent to Minecraft via MinecraftManager

### Minecraft to Discord

1. Minecraft bot receives chat message
2. Message parsed by MessageParser
3. `BridgeCoordinator` receives formatted message
4. `WebhookSender` sends to Discord with player avatar
5. Message appears in Discord channel

### Command Execution

1. User invokes `/guild invite Player123`
2. `SlashCommandHandler` processes interaction
3. Command forwarded to Minecraft bot
4. `CommandResponseListener` waits for response
5. Response sent back to Discord user

## Error Handling

The module implements comprehensive error handling:

- Connection failures → Auto-reconnect
- Command errors → User-friendly error messages
- Webhook failures → Fallback to standard messages
- Rate limiting → Automatic queue management

## Best Practices

1. **Command Development**
   - Always validate user input
   - Provide clear error messages
   - Use appropriate permissions
   - Handle edge cases

2. **Message Handling**
   - Check message content before processing
   - Validate channel permissions
   - Handle rate limits gracefully
   - Log errors for debugging

3. **Webhook Usage**
   - Cache webhook instances
   - Handle webhook deletion
   - Implement fallback mechanisms
   - Monitor rate limits

## Dependencies

- **discord.js** - Discord API wrapper
- **@discordjs/rest** - REST API utilities
- **@discordjs/builders** - Command builders

## Troubleshooting

**Bot not responding to commands:**
- Check bot permissions in Discord server
- Verify slash commands are registered
- Check bot token validity

**Webhooks not working:**
- Verify webhook URLs are valid
- Check channel permissions
- Ensure webhook hasn't been deleted

**Messages not sending:**
- Check rate limiting
- Verify channel IDs are correct
- Review error logs

---

For overall project documentation, see the [main README](../README.md).