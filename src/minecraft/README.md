# Minecraft Module

The Minecraft module handles all Minecraft server connections, message parsing, event detection, and server-specific strategies.

## Structure

```
minecraft/
├── MinecraftManager.js        → Main Minecraft coordination
├── client/
│   ├── BotManager.js          → Bot instance management
│   ├── connection.js          → Connection handling
│   └── parsers/               → Message and event parsing
│       ├── ChatParser.js
│       ├── EventParser.js
│       ├── MessageCoordinator.js
│       ├── patterns/          → Pattern definitions
│       └── utils/             → Parsing utilities
└── servers/
    ├── StrategyManager.js     → Strategy selection
    └── HypixelStrategy.js     → Hypixel-specific logic
```

## Components

### MinecraftManager.js

Main coordinator for Minecraft functionality.

**Responsibilities:**
- Bot lifecycle management
- Connection monitoring
- Message routing from parsers to bridge
- Server strategy coordination

## Client Implementation

### BotManager.js

Manages Minecraft bot instances using mineflayer library.

**Features:**
- Bot creation and configuration
- Authentication handling
- Connection lifecycle
- Event listener registration

**Bot Events Handled:**
- `login` - Successful authentication
- `spawn` - Bot spawned in world
- `message` - Chat message received
- `kicked` - Bot was kicked
- `error` - Connection error
- `end` - Connection closed

**Example Usage:**
```javascript
const bot = BotManager.createBot({
  host: 'mc.hypixel.net',
  username: 'email@example.com',
  auth: 'microsoft',
  version: '1.8.9'
});
```

### connection.js

Handles low-level connection management.

**Features:**
- Connection state tracking
- Retry logic with exponential backoff
- Error handling
- Connection pooling

**States:**
- `disconnected` - No connection
- `connecting` - Connection in progress
- `connected` - Active connection
- `reconnecting` - Attempting reconnect

## Message Parsing System

### ChatParser.js

Parses general chat messages from Minecraft.

**Pattern Types:**
- Guild chat messages
- Private messages
- System messages
- Officer chat

**Parsing Flow:**
```
Raw Message → Pattern Matching → Cleaning → Structured Data
```

**Output Format:**
```javascript
{
  type: 'GUILD_CHAT',
  username: 'PlayerName',
  message: 'Hello world',
  rank: '[VIP+]',
  guildRank: 'Member',
  raw: 'Original message'
}
```

### EventParser.js

Detects and parses guild events.

**Detected Events:**
- Player joined guild
- Player left guild
- Player promoted
- Player demoted
- Player kicked
- Player muted/unmuted
- Guild level up
- MOTD changes

**Event Structure:**
```javascript
{
  type: 'GUILD_JOIN',
  player: 'PlayerName',
  timestamp: Date.now(),
  details: { /* event-specific data */ }
}
```

### MessageCoordinator.js

Coordinates between ChatParser and EventParser.

**Responsibilities:**
- Routes messages to appropriate parser
- Prioritizes event detection over chat parsing
- Combines parsing results
- Handles parsing failures

**Decision Flow:**
```
Message → Is Event? → EventParser
       → Is Chat?  → ChatParser
       → Unknown   → Log and skip
```

### Patterns

#### MessagePatterns.js

Regular expressions for message detection.

**Pattern Categories:**
- Guild chat patterns
- Private message patterns
- System message patterns
- Command response patterns

**Example Pattern:**
```javascript
GUILD_CHAT: /^Guild > (?:\[(\w+)\] )?(\w+): (.+)$/
```

#### EventPatterns.js

Regular expressions for event detection.

**Pattern Categories:**
- Member events (join, leave, kick)
- Rank events (promote, demote)
- Guild events (level up, quest)
- Moderation events (mute, unmute)

**Example Pattern:**
```javascript
GUILD_JOIN: /^(\w+) joined the guild!$/
```

### Utilities

#### MessageCleaner.js

Cleans and normalizes Minecraft messages.

**Functions:**
- Remove Minecraft color codes (`§a`, `§c`, etc.)
- Strip formatting codes (`§l`, `§o`, etc.)
- Normalize whitespace
- Remove server prefixes
- Decode special characters

**Cleaning Pipeline:**
```
Raw Message → Remove Colors → Strip Format → Normalize → Clean Message
```

**Example:**
```javascript
Input:  "§a§l[VIP+] §bPlayer§r: §7Hello!"
Output: "[VIP+] Player: Hello!"
```

## Server Strategies

### StrategyManager.js

Manages server-specific strategy selection.

**Features:**
- Strategy registration
- Auto-detection based on server address
- Fallback to generic strategy
- Strategy switching on reconnect

**Methods:**
- `registerStrategy(name, strategy)` - Register new strategy
- `getStrategy(serverAddress)` - Get appropriate strategy
- `detectServer(host)` - Detect server type

### HypixelStrategy.js

Hypixel-specific implementation.

**Features:**
- Limbo detection and handling
- Guild chat commands
- Hypixel-specific patterns
- Anti-AFK measures

**Commands:**
```javascript
sendGuildMessage(message)   → /gc message
listGuildMembers()          → /g list
invitePlayer(name)          → /g invite name
kickPlayer(name)            → /g kick name
promotePlayer(name)         → /g promote name
```

**Hypixel-Specific Handling:**
- Limbo state detection
- Re-joining after kick
- Command cooldown management
- Chat mode switching

## Connection Management

### Connection Flow

```
1. Initialize Bot
   ↓
2. Connect to Server
   ↓
3. Login/Auth
   ↓
4. Spawn in World
   ↓
5. Join Guild Chat (if applicable)
   ↓
6. Ready for Messages
```

### Reconnection Logic

**Trigger Conditions:**
- Connection timeout
- Server kick
- Network error
- Authentication failure

**Reconnection Strategy:**
```javascript
attempt = 1
while (attempts <= maxAttempts) {
  wait = baseDelay * (2 ^ attempt)
  await sleep(wait)
  try connect()
  attempt++
}
```

**Backoff Times:**
- Attempt 1: 5 seconds
- Attempt 2: 10 seconds
- Attempt 3: 20 seconds
- Attempt 4: 40 seconds
- Attempt 5: 80 seconds

## Message Flow

### Incoming Messages (Minecraft → Discord)

```
Minecraft Server
      ↓
Bot receives message
      ↓
MessageCoordinator
      ↓
EventParser (priority) or ChatParser
      ↓
MessageCleaner
      ↓
Structured data output
      ↓
MinecraftManager
      ↓
BridgeCoordinator
      ↓
Discord
```

### Outgoing Messages (Discord → Minecraft)

```
Discord
      ↓
BridgeCoordinator
      ↓
MinecraftManager
      ↓
Strategy (format command)
      ↓
BotManager
      ↓
Minecraft Server
```

## Error Handling

**Connection Errors:**
- Network timeout → Retry with backoff
- Authentication failure → Log error, skip account
- Server offline → Extended retry delay

**Parsing Errors:**
- Unknown pattern → Log and skip
- Malformed message → Attempt recovery
- Invalid data → Fallback to raw message

**Command Errors:**
- No permission → Inform user
- Invalid syntax → Return error message
- Cooldown active → Queue command

## Best Practices

1. **Pattern Development**
   - Test patterns with real server messages
   - Handle optional components with `(?:...)?`
   - Use capture groups for data extraction
   - Document pattern purpose and examples

2. **Strategy Implementation**
   - Implement all required strategy methods
   - Handle server-specific quirks
   - Test connection stability
   - Document server requirements

3. **Message Processing**
   - Always clean messages before parsing
   - Handle null/undefined gracefully
   - Log unrecognized patterns for improvement
   - Maintain backward compatibility

## Dependencies

- **mineflayer** - Minecraft bot framework
- **prismarine-auth** - Microsoft authentication
- **minecraft-protocol** - Protocol implementation

## Troubleshooting

**Bot not connecting:**
- Verify account credentials
- Check server address and port
- Ensure Minecraft version matches
- Review authentication type

**Messages not parsing:**
- Check pattern definitions
- Verify message format from server
- Enable debug logging
- Test patterns in isolation

**Commands not executing:**
- Verify bot has guild permissions
- Check command syntax for server
- Review command cooldowns
- Test with simpler commands

**Frequent disconnections:**
- Check network stability
- Review rate limiting
- Verify no conflicting bots
- Check server-specific rules

---

For overall project documentation, see the [main README](../README.md).