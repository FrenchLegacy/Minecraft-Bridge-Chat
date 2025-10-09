# Shared Utilities Module

The shared module contains utilities and components used across both Discord and Minecraft systems.

## Structure

```
shared/
├── InterGuildManager.js    → Cross-guild communication
├── MessageFormatter.js     → Message formatting utilities
└── logger/                 → Logging system
    ├── index.js            → Logger exports
    ├── logger.js           → Main logger
    └── FileLogger.js       → File-based logging
```

## Components

### InterGuildManager.js

Manages communication between different Minecraft guilds through the bridge.

**Features:**
- Cross-guild message routing
- Guild registration and tracking
- Message filtering and validation
- Rate limiting per guild

**Use Cases:**
- Alliance communication
- Multi-guild networks
- Cross-server coordination
- Guild collaboration events

**Message Flow:**
```
Source Guild → InterGuildManager → Validation → Target Guild(s)
```

**Security Features:**
- Guild whitelist
- Message content filtering
- Rate limiting
- Origin verification

### MessageFormatter.js

Provides utilities for formatting messages between platforms.

**Formatting Functions:**

#### 1. Discord to Minecraft
```javascript
MessageFormatter.formatForMinecraft(discordMessage)
// Input:  "Hello @Player **bold text** [link]"
// Output: "Hello Player bold text link"
```

**Conversions:**
- Mentions → Plain text
- Markdown → Plain text
- Embeds → Text summary
- Emojis → Unicode or text
- Links → URL text

#### 2. Minecraft to Discord
```javascript
MessageFormatter.formatForDiscord(minecraftMessage)
// Input:  "§aGreen text §l§oFormatted"
// Output: "Green text Formatted"
```

**Conversions:**
- Color codes → Removed or converted
- Format codes → Markdown equivalent
- Special chars → Escaped for Discord

#### 3. Username Formatting
```javascript
MessageFormatter.formatUsername(username, platform)
// Minecraft: Player123
// Discord:  @Player123
```

#### 4. Timestamp Formatting
```javascript
MessageFormatter.formatTimestamp(date, format)
// Formats: 'short', 'long', 'relative', 'time'
```

**Special Handling:**

**Mentions:**
```javascript
// Discord → Minecraft
"<@123456789>" → "@Username"

// Minecraft → Discord
"@Player" → "**Player**"
```

**Links:**
```javascript
// Discord → Minecraft
"[Click here](https://example.com)" → "Click here (https://example.com)"

// Markdown preservation in Discord
"**bold**" → "**bold**"
```

**Emojis:**
```javascript
// Unicode emojis preserved
"👍" → "👍"

// Discord custom emojis
"<:emoji:123>" → ":emoji:"
```

## Logging System

### logger.js

Main logging implementation with multiple output targets.

**Log Levels:**
- `error` - Error messages
- `warn` - Warning messages
- `info` - Informational messages
- `debug` - Debug information
- `verbose` - Detailed logging

**Features:**
- Colored console output
- File rotation
- Log level filtering
- Timestamp formatting
- Module-specific logging

**Usage:**
```javascript
const logger = require('./shared/logger');

logger.info('Bridge initialized');
logger.error('Connection failed', error);
logger.debug('Message received', { data });
logger.warn('Rate limit approaching');
```

**Log Format:**
```
[2025-10-09 14:30:45] [INFO] [Discord] Connected to gateway
[2025-10-09 14:30:46] [DEBUG] [Minecraft] Received chat message
[2025-10-09 14:30:47] [ERROR] [Bridge] Failed to send message: Network error
```

### FileLogger.js

Handles file-based logging with rotation.

**Features:**
- Daily log rotation
- Size-based rotation
- Automatic compression
- Old log cleanup
- Error log separation

**Log Structure:**
```
data/logs/
├── combined.log          → All logs
├── error.log            → Error logs only
├── combined-2025-10-08.log  → Previous day
└── error-2025-10-08.log     → Previous errors
```

**Rotation Strategy:**
- Rotate daily at midnight
- Rotate when file exceeds max size
- Keep last N days of logs
- Compress old logs (optional)

### index.js

Logger module exports and initialization.

**Exports:**
- Main logger instance
- Log level constants
- Utility functions
- Configuration helpers

## Utility Functions

### Message Processing

```javascript
// Remove sensitive information
MessageFormatter.redactSensitive(message)

// Validate message content
MessageFormatter.validate(message, rules)

// Calculate message hash for deduplication
MessageFormatter.hash(message)
```

### Data Transformation

```javascript
// Convert Discord user to Minecraft format
MessageFormatter.userToMinecraft(discordUser)

// Convert Minecraft player to Discord format
MessageFormatter.playerToDiscord(minecraftPlayer)

// Transform embed to plain text
MessageFormatter.embedToText(embed)
```

## Cross-Module Communication

### Event System

The shared module provides an event bus for cross-module communication:

```javascript
const EventEmitter = require('events');
const bridgeEvents = new EventEmitter();

// Emit event
bridgeEvents.emit('message', {
  source: 'minecraft',
  guild: 'MyGuild',
  message: 'Hello world'
});

// Listen for events
bridgeEvents.on('message', (data) => {
  logger.info('Message received', data);
});
```

**Standard Events:**
- `message` - New message
- `command` - Command execution
- `event` - Guild event
- `error` - Error occurred
- `connect` - Connection established
- `disconnect` - Connection lost

## Best Practices

### Logging

1. **Use Appropriate Log Levels:**
   - `error` - Only for errors requiring attention
   - `warn` - For potential issues
   - `info` - For important events
   - `debug` - For development/troubleshooting

2. **Include Context:**
```javascript
// Good
logger.error('Failed to send message', {
  guild: 'MyGuild',
  error: error.message,
  attempt: retryCount
});

// Bad
logger.error('Error occurred');
```

3. **Avoid Logging Sensitive Data:**
   - Never log passwords or tokens
   - Redact user data when necessary
   - Use appropriate log levels for sensitive operations

### Message Formatting

1. **Validate Before Formatting:**
```javascript
if (!MessageFormatter.validate(message)) {
  logger.warn('Invalid message format');
  return null;
}
```

2. **Handle Edge Cases:**
   - Empty messages
   - Very long messages
   - Special characters
   - Null/undefined values

3. **Test Formatting:**
```javascript
// Test with various inputs
const testCases = [
  'Normal message',
  'Message with **markdown**',
  'Message with @mention',
  'Very long message that needs truncation...'
];

testCases.forEach(test => {
  const formatted = MessageFormatter.format(test);
  assert(formatted.length <= MAX_LENGTH);
});
```

### Inter-Guild Communication

1. **Verify Permissions:**
```javascript
if (!InterGuildManager.isAuthorized(sourceGuild, targetGuild)) {
  logger.warn('Unauthorized inter-guild message attempt');
  return false;
}
```

2. **Rate Limiting:**
```javascript
if (InterGuildManager.isRateLimited(guild)) {
  logger.warn('Rate limit exceeded', { guild });
  return false;
}
```

3. **Message Validation:**
```javascript
const validated = InterGuildManager.validate(message);
if (!validated.valid) {
  logger.error('Invalid message', validated.errors);
  return false;
}
```

## Performance Considerations

1. **Message Formatting:**
   - Cache compiled regex patterns
   - Minimize string operations
   - Batch process when possible

2. **Logging:**
   - Use async file writing
   - Buffer log writes
   - Rotate logs during low traffic

3. **Inter-Guild:**
   - Queue messages
   - Batch deliveries
   - Cache guild lookups

## Troubleshooting

**Logs not appearing:**
- Check log level configuration
- Verify file permissions
- Review output targets
- Check disk space

**Messages formatting incorrectly:**
- Test formatters in isolation
- Check regex patterns
- Verify input data
- Review platform differences

**Inter-guild not working:**
- Verify guild registration
- Check permissions
- Review rate limits
- Test with simple messages

---

For overall project documentation, see the [main README](../README.md).