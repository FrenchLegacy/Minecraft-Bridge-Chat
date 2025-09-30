/**
 * Message Patterns - Pattern Matching for Chat Messages
 * 
 * This file provides pattern matching functionality for Minecraft chat messages,
 * supporting multiple server types and message categories. It integrates with
 * PatternLoader to access server-specific patterns and provides caching for
 * optimal performance.
 * 
 * Key responsibilities:
 * - Pattern retrieval from PatternLoader with caching
 * - Multi-server support (Hypixel, Vanilla, custom servers)
 * - Message type matching (guild, officer, private, party, system)
 * - Ignore pattern filtering
 * - Custom pattern management at runtime
 * - Match result parsing and data extraction
 * - Configuration management and updates
 * 
 * Supported message types:
 * - Guild chat: Regular guild messages
 * - Officer chat: Officer-only messages
 * - Private messages: Whispers/DMs (with direction: from/to)
 * - Party messages: Party chat
 * - System messages: Server notifications and events
 * - Ignore patterns: Messages to filter out
 * 
 * Pattern sources:
 * 1. Server-specific patterns from patterns.json (via PatternLoader)
 * 2. Custom patterns from configuration
 * 3. Runtime custom patterns added via addCustomPattern()
 * 
 * Performance optimization:
 * - Pattern caching by server and type
 * - Cache keys: "{serverType}-{category}-{subCategory}"
 * - Cache invalidation on server change or custom pattern addition
 * 
 * Match result structure:
 * {
 *   username: string,          // Extracted username
 *   message: string,           // Extracted message content
 *   rank: string,              // User rank if applicable
 *   patternIndex: number,      // Index of matched pattern
 *   hasColorCodes: boolean,    // Whether match contains color codes
 *   description: string,       // Pattern description
 *   custom: boolean,           // Whether custom pattern
 *   direction: string,         // 'from' or 'to' for private messages
 *   ...                        // Additional type-specific fields
 * }
 * 
 * Server support:
 * - Validates server support on initialization
 * - Falls back to Vanilla for unsupported servers
 * - Allows runtime server type changes
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Specific Imports
const logger = require("../../../../shared/logger");
const { getPatternLoader } = require("../../../../config/PatternLoader.js");

/**
 * MessagePatterns - Pattern matching for Minecraft messages
 * 
 * Provides pattern matching functionality for various message types,
 * with caching and multi-server support.
 * 
 * @class
 */
class MessagePatterns {
    /**
     * Initialize message patterns with configuration
     * 
     * Sets up:
     * - Configuration storage
     * - PatternLoader instance
     * - Server type from config (default: Hypixel)
     * - Pattern cache for performance
     * - Server support validation
     * 
     * @param {object} config - Pattern configuration
     * @param {string} [config.serverType='Hypixel'] - Server type
     * @param {object} [config.customPatterns] - Custom pattern definitions
     * @param {Array<string>} [config.customPatterns.guild] - Custom guild patterns
     * @param {Array<string>} [config.customPatterns.officer] - Custom officer patterns
     * @param {Array<string>} [config.customPatterns.ignore] - Custom ignore patterns
     * 
     * @example
     * const patterns = new MessagePatterns({
     *   serverType: 'Hypixel',
     *   customPatterns: {
     *     guild: ['^Custom > (\\w+): (.+)$']
     *   }
     * });
     */
    constructor(config) {
        this.config = config;
        this.patternLoader = getPatternLoader();
        this.serverType = config.serverType || 'Hypixel';

        // Pattern cache for performance
        this.patternCache = new Map();
        
        // Validate server support
        this.validateServerSupport();
        
        logger.debug(`MessagePatterns initialized for server: ${this.serverType}`);
    }

    /**
     * Validate that the configured server is supported
     * 
     * Checks if server type exists in PatternLoader configuration.
     * Falls back to Vanilla server type if not supported.
     * Logs warning when fallback occurs.
     * 
     * @example
     * patterns.validateServerSupport();
     * // Falls back to Vanilla if server not found
     */
    validateServerSupport() {
        if (!this.patternLoader.isServerSupported(this.serverType)) {
            logger.warn(`Server '${this.serverType}' not found in pattern configuration, falling back to Vanilla`);
            this.serverType = 'Vanilla';
        }
    }

    /**
     * Get patterns for a specific message type
     * 
     * Retrieves patterns from PatternLoader with caching.
     * Merges server patterns with custom patterns from configuration.
     * 
     * Cache key format: "{serverType}-messages-{messageType}"
     * 
     * Custom patterns are converted from strings to pattern objects:
     * - pattern: Compiled RegExp
     * - originalPattern: Original pattern string
     * - groups: Default groups for message type
     * - custom: true flag
     * - description: Auto-generated description
     * 
     * @param {string} messageType - Message type (guild, officer, private, party)
     * @returns {Array<object>} Array of pattern objects with compiled RegExp
     * 
     * @example
     * const guildPatterns = patterns.getMessagePatterns('guild');
     * // Returns: [{ pattern: RegExp, groups: [...], description: '...' }, ...]
     */
    getMessagePatterns(messageType) {
        const cacheKey = `${this.serverType}-messages-${messageType}`;
        
        if (this.patternCache.has(cacheKey)) {
            return this.patternCache.get(cacheKey);
        }

        const patterns = this.patternLoader.getPatterns(this.serverType, 'messages', messageType);
        
        // Add custom patterns from configuration if any
        if (this.config.customPatterns && this.config.customPatterns[messageType]) {
            const customPatterns = this.config.customPatterns[messageType].map(patternStr => ({
                pattern: new RegExp(patternStr),
                originalPattern: patternStr,
                groups: this.getDefaultGroups(messageType),
                custom: true,
                description: `Custom ${messageType} pattern`
            }));
            patterns.push(...customPatterns);
        }

        this.patternCache.set(cacheKey, patterns);
        return patterns;
    }

    /**
     * Get system patterns
     * 
     * Retrieves system message patterns from PatternLoader with caching.
     * System patterns match server notifications and system events.
     * 
     * Cache key: "{serverType}-system"
     * 
     * @returns {Array<object>} Array of system pattern objects
     * 
     * @example
     * const systemPatterns = patterns.getSystemPatterns();
     * // Returns patterns for guild_online, reward, etc.
     */
    getSystemPatterns() {
        const cacheKey = `${this.serverType}-system`;
        
        if (this.patternCache.has(cacheKey)) {
            return this.patternCache.get(cacheKey);
        }

        const patterns = this.patternLoader.getPatterns(this.serverType, 'system');
        this.patternCache.set(cacheKey, patterns);
        return patterns;
    }

    /**
     * Get ignore patterns
     * 
     * Retrieves ignore patterns from PatternLoader with caching.
     * Merges server patterns with custom ignore patterns from configuration.
     * 
     * Cache key: "{serverType}-ignore"
     * 
     * Custom ignore patterns use case-insensitive flag by default.
     * 
     * @returns {Array<object>} Array of ignore pattern objects
     * 
     * @example
     * const ignorePatterns = patterns.getIgnorePatterns();
     * // Returns patterns for spam, advertisements, etc.
     */
    getIgnorePatterns() {
        const cacheKey = `${this.serverType}-ignore`;
        
        if (this.patternCache.has(cacheKey)) {
            return this.patternCache.get(cacheKey);
        }

        const patterns = this.patternLoader.getPatterns(this.serverType, 'ignore');
        
        // Add custom ignore patterns from configuration if any
        if (this.config.customPatterns && this.config.customPatterns.ignore) {
            const customPatterns = this.config.customPatterns.ignore.map(patternStr => ({
                pattern: new RegExp(patternStr, 'i'),
                originalPattern: patternStr,
                custom: true,
                description: 'Custom ignore pattern'
            }));
            patterns.push(...customPatterns);
        }

        this.patternCache.set(cacheKey, patterns);
        return patterns;
    }

    /**
     * Get default groups for a message type
     * 
     * Returns default capture group names for different message types.
     * Used when patterns don't specify custom groups.
     * 
     * Default groups by type:
     * - guild: ['username', 'message']
     * - officer: ['username', 'message']
     * - private: ['username', 'message']
     * - party: ['username', 'message']
     * 
     * @param {string} messageType - Message type
     * @returns {Array<string>} Default group names for the message type
     * 
     * @example
     * const groups = patterns.getDefaultGroups('guild');
     * // Returns: ['username', 'message']
     */
    getDefaultGroups(messageType) {
        const defaultGroups = {
            'guild': ['username', 'message'],
            'officer': ['username', 'message'],
            'private': ['username', 'message'],
            'party': ['username', 'message']
        };

        return defaultGroups[messageType] || [];
    }

    /**
     * Match guild message patterns
     * 
     * Tests message against all guild patterns in order.
     * Returns first successful match with parsed data.
     * 
     * @param {string} messageText - Message text to match
     * @returns {object|null} Match result with extracted data or null
     * 
     * @example
     * const match = patterns.matchGuildMessage("Guild > [MVP+] Player: Hello!");
     * // Returns: { username: 'Player', message: 'Hello!', rank: 'MVP+', ... }
     */
    matchGuildMessage(messageText) {
        const patterns = this.getMessagePatterns('guild');
        
        for (let i = 0; i < patterns.length; i++) {
            const patternObj = patterns[i];
            if (!patternObj || !patternObj.pattern) continue;

            const match = messageText.match(patternObj.pattern);
            if (match) {
                return this.parseMatch(match, 'guild', patternObj, i);
            }
        }
        return null;
    }

    /**
     * Match officer message patterns
     * 
     * Tests message against all officer patterns in order.
     * Returns first successful match with parsed data.
     * 
     * @param {string} messageText - Message text to match
     * @returns {object|null} Match result with extracted data or null
     * 
     * @example
     * const match = patterns.matchOfficerMessage("Officer > Admin: Secret");
     * // Returns: { username: 'Admin', message: 'Secret', ... }
     */
    matchOfficerMessage(messageText) {
        const patterns = this.getMessagePatterns('officer');
        
        for (let i = 0; i < patterns.length; i++) {
            const patternObj = patterns[i];
            if (!patternObj || !patternObj.pattern) continue;

            const match = messageText.match(patternObj.pattern);
            if (match) {
                return this.parseMatch(match, 'officer', patternObj, i);
            }
        }
        return null;
    }

    /**
     * Match private message patterns
     * 
     * Tests message against all private message patterns in order.
     * Returns first successful match with parsed data and direction.
     * 
     * Direction detection:
     * 1. Use direction from pattern configuration if specified
     * 2. Otherwise detect from message content:
     *    - Starts with "from" → 'from' (incoming)
     *    - Otherwise → 'to' (outgoing)
     * 
     * @param {string} messageText - Message text to match
     * @returns {object|null} Match result with username, message, direction or null
     * 
     * @example
     * const match = patterns.matchPrivateMessage("From Player: Hi there");
     * // Returns: { username: 'Player', message: 'Hi there', direction: 'from', ... }
     * 
     * @example
     * const match = patterns.matchPrivateMessage("To Friend: Hello");
     * // Returns: { username: 'Friend', message: 'Hello', direction: 'to', ... }
     */
    matchPrivateMessage(messageText) {
        const patterns = this.getMessagePatterns('private');
        
        for (let i = 0; i < patterns.length; i++) {
            const patternObj = patterns[i];
            if (!patternObj || !patternObj.pattern) continue;

            const match = messageText.match(patternObj.pattern);
            if (match) {
                const result = this.parseMatch(match, 'private', patternObj, i);
                // Add direction from pattern configuration
                if (patternObj.direction) {
                    result.direction = patternObj.direction;
                } else {
                    // Fallback to detecting from message content
                    result.direction = match[0].toLowerCase().startsWith('from') ? 'from' : 'to';
                }
                return result;
            }
        }
        return null;
    }

    /**
     * Match party message patterns
     * 
     * Tests message against all party patterns in order.
     * Returns first successful match with parsed data.
     * 
     * @param {string} messageText - Message text to match
     * @returns {object|null} Match result with extracted data or null
     * 
     * @example
     * const match = patterns.matchPartyMessage("Party > Member: Ready?");
     * // Returns: { username: 'Member', message: 'Ready?', ... }
     */
    matchPartyMessage(messageText) {
        const patterns = this.getMessagePatterns('party');
        
        for (let i = 0; i < patterns.length; i++) {
            const patternObj = patterns[i];
            if (!patternObj || !patternObj.pattern) continue;

            const match = messageText.match(patternObj.pattern);
            if (match) {
                return this.parseMatch(match, 'party', patternObj, i);
            }
        }
        return null;
    }

    /**
     * Match system message patterns
     * 
     * Tests message against all system patterns.
     * Returns first successful match with system-specific data extraction.
     * 
     * System types include:
     * - guild_join, guild_leave: Member events
     * - guild_promotion, guild_demotion: Rank changes
     * - guild_online: Online members list
     * - reward: Coins/XP rewards
     * 
     * @param {string} messageText - Message text to match
     * @returns {object|null} Match result with systemType and extracted data or null
     * 
     * @example
     * const match = patterns.matchSystemMessage("Online Members: Player1, Player2");
     * // Returns: { systemType: 'guild_online', data: { members: [...] }, ... }
     */
    matchSystemMessage(messageText) {
        const patterns = this.getSystemPatterns();
        
        for (const patternObj of patterns) {
            if (!patternObj || !patternObj.pattern) continue;

            const match = messageText.match(patternObj.pattern);
            if (match) {
                return {
                    systemType: patternObj.type || 'unknown',
                    data: this.extractSystemData(match, patternObj.type || 'unknown'),
                    fullMatch: match[0],
                    originalText: messageText,
                    description: patternObj.description
                };
            }
        }
        return null;
    }

    /**
     * Check if message should be ignored
     * 
     * Tests message against all ignore patterns.
     * Returns true if any pattern matches.
     * 
     * Common ignore patterns:
     * - Spam and advertisements
     * - Automated server messages
     * - Bot commands
     * - Join/leave notifications (if configured)
     * 
     * @param {string} messageText - Message text to check
     * @returns {boolean} Whether message should be ignored
     * 
     * @example
     * const shouldIgnore = patterns.shouldIgnore("BUY COINS AT EXAMPLE.COM");
     * // Returns: true (if spam pattern matches)
     */
    shouldIgnore(messageText) {
        const patterns = this.getIgnorePatterns();
        
        return patterns.some(patternObj => {
            if (!patternObj || !patternObj.pattern) return false;
            return patternObj.pattern.test(messageText);
        });
    }

    /**
     * Parse message match result
     * 
     * Converts regex match array into structured object using pattern groups.
     * Handles complex patterns with multiple rank groups and fallback username detection.
     * 
     * Parsing process:
     * 1. Map regex groups to named fields using pattern.groups
     * 2. Handle rank groups (rank1, rank2 → rank, secondaryRank)
     * 3. Fallback username detection for complex patterns
     * 4. Extract message content (usually last match group)
     * 5. Add metadata (patternIndex, hasColorCodes, description, custom)
     * 
     * Special handling for guild/officer:
     * - rank1 → primary rank
     * - rank2 → secondary rank
     * - Username fallback: finds first valid word (3+ chars, alphanumeric)
     * - Message fallback: uses last match group
     * 
     * @param {Array} match - Regex match result array
     * @param {string} messageType - Type of message (guild, officer, private, party)
     * @param {object} patternObj - Pattern object that matched
     * @param {Array<string>} patternObj.groups - Group names for extraction
     * @param {string} [patternObj.description] - Pattern description
     * @param {boolean} [patternObj.custom] - Whether custom pattern
     * @param {number} patternIndex - Index of pattern in array
     * @returns {object} Parsed match data with extracted fields
     * 
     * @example
     * const match = messageText.match(pattern);
     * const parsed = patterns.parseMatch(match, 'guild', patternObj, 0);
     * // Returns: { username: 'Player', message: 'Hello', rank: 'MVP+', ... }
     */
    parseMatch(match, messageType, patternObj, patternIndex) {
        const groups = patternObj.groups || this.getDefaultGroups(messageType);
        const result = {
            patternIndex: patternIndex,
            hasColorCodes: this.hasColorCodes(match[0]),
            description: patternObj.description,
            custom: patternObj.custom || false
        };

        // Map groups to result object
        for (let i = 0; i < groups.length && i + 1 < match.length; i++) {
            const groupName = groups[i];
            const groupValue = match[i + 1];
            
            if (groupValue !== undefined) {
                result[groupName] = groupValue;
            }
        }

        // Handle complex patterns with multiple rank groups
        if (messageType === 'guild' || messageType === 'officer') {
            // If we have rank1, rank2, use the first one as primary rank
            if (result.rank1) {
                result.rank = result.rank1;
                result.secondaryRank = result.rank2 || null;
            }
            
            // If we don't have a username but have multiple potential matches, use the best one
            if (!result.username && match.length > 2) {
                // Find the most likely username (usually the second or third match)
                for (let i = 1; i < match.length; i++) {
                    const potential = match[i];
                    if (potential && /^\w+$/.test(potential) && potential.length > 2) {
                        result.username = potential;
                        break;
                    }
                }
            }
            
            // Message is usually the last match
            if (!result.message && match.length > 1) {
                result.message = match[match.length - 1];
            }
        }

        return result;
    }

    /**
     * Extract system message data
     * 
     * Extracts type-specific data from system message matches.
     * Different extraction logic for each system message type.
     * 
     * Extraction by type:
     * - guild_join/leave/promotion/demotion: Extract username from match[1]
     * - guild_online: Parse members list, create array
     * - reward: Extract amount from "+number" pattern
     * - default: Extract any numbers and potential usernames
     * 
     * @param {Array} match - Regex match result
     * @param {string} systemType - Type of system message
     * @returns {object} Extracted system data with type-specific fields
     * 
     * @example
     * const data = patterns.extractSystemData(
     *   ["Online Members: Player1, Player2", "Player1, Player2"],
     *   'guild_online'
     * );
     * // Returns: { type: 'guild_online', membersList: '...', members: [...] }
     */
    extractSystemData(match, systemType) {
        const data = {
            type: systemType,
            fullText: match[0]
        };

        switch (systemType) {
            case 'guild_join':
            case 'guild_leave':
            case 'guild_promotion':
            case 'guild_demotion':
                if (match[1]) {
                    data.username = match[1];
                }
                break;
            
            case 'guild_online':
                // Extract online members list if present
                const onlineMatch = match[0].match(/Online Members: (.+)/);
                if (onlineMatch) {
                    data.membersList = onlineMatch[1];
                    data.members = onlineMatch[1].split(', ').map(m => m.trim());
                }
                break;
            
            case 'reward':
                // Extract coin/XP amounts
                const rewardMatch = match[0].match(/\+(\d+)/);
                if (rewardMatch) {
                    data.amount = parseInt(rewardMatch[1]);
                }
                break;

            default:
                // For other system types, try to extract any numbers or usernames
                const numberMatch = match[0].match(/(\d+)/);
                if (numberMatch) {
                    data.number = parseInt(numberMatch[1]);
                }
                
                const usernameMatch = match[0].match(/(\w{3,16})/);
                if (usernameMatch) {
                    data.possibleUsername = usernameMatch[1];
                }
                break;
        }

        return data;
    }

    /**
     * Check if text contains Minecraft color codes
     * 
     * Uses PatternLoader default color code pattern if available,
     * otherwise falls back to standard pattern.
     * 
     * Detects: §[0-9a-fklmnor]
     * 
     * @param {string} text - Text to check
     * @returns {boolean} Whether text contains color codes
     * 
     * @example
     * patterns.hasColorCodes("§aGreen text");  // true
     * patterns.hasColorCodes("Plain text");     // false
     */
    hasColorCodes(text) {
        if (!text || typeof text !== 'string') {
            return false;
        }

        const colorCodePattern = this.patternLoader.getDefaults('colorCodes').all;
        if (colorCodePattern) {
            return new RegExp(colorCodePattern).test(text);
        }
        
        // Fallback pattern
        return /§[0-9a-fklmnor]/g.test(text);
    }

    /**
     * Add custom pattern to specific type at runtime
     * 
     * Adds a pattern dynamically without restarting or reloading configuration.
     * Pattern is registered with PatternLoader and cache is invalidated.
     * 
     * Process:
     * 1. Determine category and subcategory
     * 2. Create pattern object with groups
     * 3. Register with PatternLoader
     * 4. Clear relevant cache entry
     * 5. Log addition
     * 
     * @param {string} type - Pattern type (guild, officer, private, party, ignore)
     * @param {string} patternString - Regex pattern string
     * @param {Array<string>} [groups=[]] - Group names (uses defaults if empty)
     * 
     * @example
     * patterns.addCustomPattern('guild', '^Custom > (\\w+): (.+)$', ['username', 'message']);
     * // Pattern now available for matching
     * 
     * @example
     * patterns.addCustomPattern('ignore', 'SPAM_PATTERN');
     * // Messages matching pattern will be ignored
     */
    addCustomPattern(type, patternString, groups = []) {
        let category = 'messages';
        let subCategory = type;

        // Handle special cases
        if (type === 'ignore') {
            category = 'ignore';
            subCategory = null;
        }

        const patternObj = {
            pattern: patternString,
            groups: groups.length > 0 ? groups : this.getDefaultGroups(type),
            custom: true,
            description: `Runtime custom ${type} pattern`
        };

        this.patternLoader.addCustomPattern(this.serverType, category, subCategory, patternObj);
        
        // Clear our cache
        const cacheKey = subCategory ? 
            `${this.serverType}-${category}-${subCategory}` : 
            `${this.serverType}-${category}`;
        this.patternCache.delete(cacheKey);

        logger.debug(`Added custom ${type} pattern: ${patternString}`);
    }

    /**
     * Update configuration at runtime
     * 
     * Updates configuration and handles server type changes.
     * Clears cache when server type changes since patterns are server-specific.
     * 
     * @param {object} newConfig - New configuration to merge
     * @param {string} [newConfig.serverType] - New server type
     * 
     * @example
     * patterns.updateConfig({ serverType: 'Vanilla' });
     * // Switches to Vanilla patterns, cache cleared
     */
    updateConfig(newConfig) {
        const oldServerType = this.config.serverType;
        this.config = { ...this.config, ...newConfig };
        
        // Update server type if changed
        if (newConfig.serverType && newConfig.serverType !== oldServerType) {
            this.serverType = newConfig.serverType;
            this.validateServerSupport();
            this.patternCache.clear(); // Clear cache since server changed
            logger.debug(`Server type changed from ${oldServerType} to ${this.serverType}`);
        }

        logger.debug('MessagePatterns configuration updated');
    }

    /**
     * Get current configuration
     * 
     * Returns a copy of configuration to prevent external modification.
     * 
     * @returns {object} Copy of current configuration
     * 
     * @example
     * const config = patterns.getConfig();
     * console.log(config.serverType);
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Clear pattern cache
     * 
     * Clears all cached patterns, forcing reload on next access.
     * Useful after configuration changes or for memory management.
     * 
     * @example
     * patterns.clearCache();
     * // Next pattern access will reload from PatternLoader
     */
    clearCache() {
        this.patternCache.clear();
        logger.debug('MessagePatterns cache cleared');
    }
}

module.exports = MessagePatterns;