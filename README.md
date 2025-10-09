# Minecraft Bridge Chat

A sophisticated bridge system that connects Minecraft servers (primarily Hypixel) with Discord, enabling seamless communication between in-game guild chat and Discord channels.

## Features

- **Bidirectional Communication**: Messages flow seamlessly between Minecraft guilds chats and Discord channels
- **Webhook Integration**: Uses Discord webhooks for authentic message display with player avatars
- **Multi-Guild Support**: Manage multiple Minecraft guilds across different Discord channels
- **Command System**: Comprehensive slash commands and in-game command forwarding
- **Event Detection**: Automatically detects and relays important guild events (joins, leaves, promotions, etc.)
- **Flexible Configuration**: JSON-based configuration with pattern matching and templates
- **Server Strategies**: Extensible architecture supporting different Minecraft server types
- **Inter-Guild Messaging**: Cross-guild communication capabilities
- **Advanced Parsing**: Intelligent message parsing with pattern recognition and cleaning

## Architecture Overview

The project is organized into several core modules:

```
src/
├── config/          → Configuration management system
├── discord/         → Discord bot and bridge coordination
├── minecraft/       → Minecraft bot and message parsing
├── shared/          → Shared utilities and formatters
├── bridgeLocator.js → Bridge discovery and management
└── main.js          → Application entry point
```

For detailed information about each module, see:
- [Discord Module Documentation](src/discord/README.md)
- [Minecraft Module Documentation](src/minecraft/README.md)
- [Configuration System Documentation](src/config/README.md)
- [Shared Utilities Documentation](src/shared/README.md)

## Prerequisites

- **Node.js** v22.0.0 or higher
- **Discord Bot Token** with appropriate permissions
- **Minecraft Account** for bot connection
- **Guild Permissions** on target Minecraft server

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Minecraft-Bridge-Chat
```

2. Install dependencies:
```bash
npm install
```

3. Configure the application:
   - Copy configuration templates from `config/` directory
   - Set up your Discord bot token
   - Configure Minecraft bot credentials
   - Define guild-to-channel mappings
   - Customize message patterns and templates

4. Start the bridge:
```bash
npm start
```

## Configuration

The bridge uses a multi-layered configuration system:

- **Main Config**: Bot credentials and connection settings
- **Patterns**: Regular expressions for message and event detection
- **Templates**: Message formatting templates for different event types
- **Guild Mappings**: Links between Minecraft guilds and Discord channels

See the [Configuration Documentation](src/config/README.md) for detailed setup instructions.

## Usage

### Discord Commands

The bot provides several slash commands:

- `/ping` - Check bot responsiveness
- `/help` - Display available commands
- `/serverinfo` - Show information about connected Minecraft servers
- `/guild list <guild> <type>` - List guild members
- `/guild invite <guild> <player>` - Invite a player to the guild
- `/guild kick <guild> <player> <reason>` - Kick a player from the guild
- `/guild promote <guild> <player>` - Promote a guild member
- `/guild demote <guild> <player>` - Demote a guild member
- `/guild mute <guild> <scope> <time> <player>` - Mute a guild member
- `/guild unmute <guild> <scope> <player>` - Unmute a guild member
- `/guild setrank <guild> <player> <rank>` - Set a player's guild rank

### Message Flow

1. **Minecraft → Discord**: 
   - Guild chat messages are detected and parsed
   - Messages are formatted according to templates
   - Sent to Discord via webhooks with player avatars

2. **Discord → Minecraft**:
   - Discord messages are formatted for Minecraft
   - Sent to guild chat via the Minecraft bot
   - Commands are detected and forwarded appropriately

## How It Works

### Bridge Coordination

The system uses a coordinator pattern to manage message flow:

1. **DiscordManager** handles Discord bot lifecycle and message reception
2. **MinecraftManager** manages Minecraft bot connections and message parsing
3. **BridgeCoordinator** coordinates message relay between both platforms
4. **InterGuildManager** handles cross-guild communication

### Message Parsing

Minecraft messages go through a sophisticated parsing pipeline:

1. **Pattern Matching**: Regex patterns detect message types
2. **Message Cleaning**: Removes Minecraft formatting codes and normalizes text
3. **Event Detection**: Identifies guild events (joins, leaves, promotions, etc.)
4. **Coordination**: Routes messages to appropriate handlers

### Command System

The command system operates on two levels:

1. **Discord Slash Commands**: Native Discord commands with validation
2. **Command Forwarding**: Discord messages starting with `/` are forwarded to Minecraft
3. **Response Listening**: Bot monitors for command responses from the server

## Project Structure

- `main.js` - Application entry point and initialization
- `bridgeLocator.js` - Locates and manages bridge instances
- `src/config/` - Configuration loading and management
- `src/discord/` - Discord bot implementation and bridge coordination
- `src/minecraft/` - Minecraft bot and message parsing system
- `src/shared/` - Shared utilities, formatters, and logging

## Development

### Adding New Commands

To add a new Discord command:

1. Create a new command file in `src/discord/client/commands/`
2. Implement the command structure with `data` and `execute` properties
3. The command will be automatically loaded and registered

### Extending Message Patterns

To add new message or event patterns:

1. Update pattern definitions in configuration files
2. Add corresponding templates for message formatting
3. Update parsers if new parsing logic is required

## Logging

The system includes a comprehensive logging system:

- Console output with colored formatting
- File-based logging with rotation
- Separate logs for different components
- Error tracking and debugging information

See [Shared Utilities Documentation](src/shared/README.md) for logger details.

## Troubleshooting

### Bot Not Connecting to Minecraft
- Verify credentials are correct
- Check if the Minecraft account has access to the server
- Ensure no rate limiting is in place

### Messages Not Bridging
- Verify webhook URLs are correct
- Check pattern matching in configuration
- Review logs for parsing errors

### Commands Not Working
- Ensure bot has required Discord permissions
- Verify guild permissions on Minecraft server
- Check command response listening timeout

## Contributing

Contributions are welcome! Please ensure:
- Code follows existing patterns and style
- All messages and comments are in English
- New features include appropriate documentation
- Changes are tested across different scenarios

---

**Note**: This bridge is designed for Hypixel but can be extended to support other Minecraft servers through the strategy pattern.