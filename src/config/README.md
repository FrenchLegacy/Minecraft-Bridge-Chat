# Configuration Module

The configuration module handles loading, validation, and management of all configuration files for the bridge system.

## Structure

```
config/
├── ConfigLoader.js      → Main configuration loading
├── PatternLoader.js     → Pattern definitions loading
└── TemplateLoader.js    → Message template loading
```

## Components

### ConfigLoader.js

Main configuration loader for the bridge system.

**Responsibilities:**
- Loads main configuration file
- Validates configuration structure
- Provides configuration access methods
- Handles configuration updates
- Manages environment variables

**Validation Rules:**
- Discord token must be present
- At least one Minecraft account required
- Guild-channel mappings must be valid
- Webhook URLs must be properly formatted
- Server host must be specified

### PatternLoader.js

Loads and manages regex patterns for message and event detection.

**Pattern Types:**

1. **Message Patterns** - For chat message detection
2. **Event Patterns** - For guild event detection
3. **Command Patterns** - For command response detection

**Pattern File Structure:**
```json
{
  "messages": {
    "guildChat": "^Guild > (?:\\[(\\w+)\\] )?(\\w+): (.+)$",
    "privateMessage": "^From (\\w+): (.+)$",
    "officerChat": "^Officer > (\\w+): (.+)$"
  },
  "events": {
    "guildJoin": "^(\\w+) joined the guild!$",
    "guildLeave": "^(\\w+) left the guild!$",
    "guildPromote": "^(\\w+) was promoted from (\\w+) to (\\w+)$",
    "guildKick": "^(\\w+) was kicked from the guild by (\\w+)!$"
  },
  "commands": {
    "listResponse": "^-- Guild Members --$",
    "inviteSuccess": "^You invited (\\w+) to your guild!$",
    "inviteError": "^(\\w+) is already in a guild!$"
  }
}
```

**Pattern Features:**
- Regex compilation and caching
- Named capture groups support
- Pattern validation
- Case-insensitive matching options
- Multi-line pattern support

### TemplateLoader.js

Loads and manages message formatting templates.

**Template Types:**

1. **Discord Templates** - Format messages for Discord
2. **Minecraft Templates** - Format messages for Minecraft
3. **Embed Templates** - Format Discord embeds
4. **Event Templates** - Format event notifications

**Template Variables:**
- `{username}` - Player username
- `{message}` - Message content
- `{guildRank}` - Guild rank
- `{player}` - Player name
- `{rank}` - Rank/role
- `{timestamp}` - Formatted timestamp
- `{guild}` - Guild name
- Custom variables as needed

## Configuration Files

### Main Configuration (config.json)

**Location:** Project root or specified path

**Required Sections:**
- `discord` - Discord bot settings
- `minecraft` - Minecraft bot settings
- `bridge` - Bridge behavior settings

**Optional Sections:**
- `logging` - Logging configuration
- `features` - Feature flags
- `advanced` - Advanced settings

### Pattern Configuration (patterns.json)

**Location:** Config directory

**Structure:**
```json
{
  "messages": { /* message patterns */ },
  "events": { /* event patterns */ },
  "commands": { /* command patterns */ }
}
```

**Pattern Guidelines:**
- Use named capture groups for data extraction
- Escape special regex characters
- Test patterns with real server messages
- Document pattern purpose in comments

### Template Configuration (templates.json)

**Location:** Config directory

**Structure:**
```json
{
  "discord": { /* Discord formatting */ },
  "minecraft": { /* Minecraft formatting */ },
  "embeds": { /* Embed templates */ }
}
```

**Template Guidelines:**
- Use clear variable names
- Include all necessary formatting
- Test with various inputs
- Keep templates maintainable


## Configuration Loading Process

```
1. Load Main Config
   ↓
2. Apply Environment Variables
   ↓
3. Validate Structure
   ↓
4. Load Patterns
   ↓
5. Load Templates
   ↓
6. Configuration Ready
```

## Validation

### Configuration Validation

**Checks Performed:**
- Required fields present
- Data types correct
- URLs properly formatted
- IDs valid format
- Arrays not empty
- Numeric values in range

**Validation Example:**
```javascript
const validation = ConfigLoader.validate();
if (!validation.valid) {
  console.error('Configuration errors:');
  validation.errors.forEach(error => {
    console.error(`- ${error.field}: ${error.message}`);
  });
}
```

### Pattern Validation

**Checks Performed:**
- Valid regex syntax
- Capture groups balanced
- No catastrophic backtracking
- Patterns compile successfully

**Validation Example:**
```javascript
const validation = PatternLoader.validate();
if (!validation.valid) {
  console.error('Pattern errors:');
  validation.errors.forEach(error => {
    console.error(`- ${error.pattern}: ${error.message}`);
  });
}
```

## Best Practices

### Security

1. **Never commit sensitive data:**
   - Use environment variables
   - Add config files to `.gitignore`
   - Use config templates with placeholders

2. **Token Management:**
   - Rotate tokens regularly
   - Use least-privilege access
   - Monitor token usage

3. **Configuration Protection:**
   - Restrict file permissions
   - Validate input data
   - Sanitize user-provided config

### Organization

1. **File Structure:**
   - Keep main config minimal
   - Separate concerns (patterns, templates)
   - Use consistent naming

2. **Documentation:**
   - Comment complex patterns
   - Document template variables
   - Maintain example configs

3. **Maintenance:**
   - Version control configs
   - Test after changes
   - Backup configurations

### Configuration

See `config.example.json` in project root for complete configuration example with all available options.

## Troubleshooting

**Configuration not loading:**
- Check file path is correct
- Verify JSON syntax is valid
- Review file permissions
- Check for missing required fields

**Patterns not matching:**
- Test regex with online tools
- Check escape characters
- Verify capture groups
- Enable debug logging

**Templates not formatting:**
- Verify variable names match
- Check template syntax
- Test with sample data
- Review string interpolation

---

For overall project documentation, see the [main README](../README.md).