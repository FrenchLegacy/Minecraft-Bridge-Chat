/**
 * Event Patterns - Pattern Matching for Guild Events
 * 
 * This file provides pattern matching functionality for Minecraft guild events,
 * supporting multiple server types and event categories. It integrates with
 * PatternLoader to access server-specific patterns and provides caching for
 * optimal performance.
 * 
 * Key responsibilities:
 * - Event pattern retrieval from PatternLoader with caching
 * - Multi-server support (Hypixel, Vanilla, custom servers)
 * - Event type matching (join, leave, kick, promote, demote, etc.)
 * - Event data extraction and processing
 * - Custom event pattern management at runtime
 * - Online members list parsing
 * - Configuration management and updates
 * 
 * Supported event types (12 types):
 * - join: Member joins guild
 * - disconnect: Member disconnects temporarily
 * - leave: Member leaves guild permanently
 * - welcome: Welcome message for new members
 * - kick: Member is kicked from guild
 * - promote: Member rank promotion
 * - demote: Member rank demotion
 * - invite: Guild invite sent/accepted
 * - online: Online members list
 * - level: Guild level up
 * - motd: Message of the day changed
 * - misc: Other changes (tag, name, description, settings)
 * 
 * Pattern sources:
 * 1. Server-specific patterns from patterns.json (via PatternLoader)
 * 2. Custom patterns from configuration
 * 3. Runtime custom patterns added via addCustomEventPattern()
 * 
 * Performance optimization:
 * - Pattern caching by server and event type
 * - Cache keys: "{serverType}-events-{eventType}"
 * - Cache invalidation on server change or custom pattern addition
 * 
 * Event match result structure:
 * {
 *   type: string,              // Event type
 *   username: string,          // User involved (if applicable)
 *   raw: string,               // Original match text
 *   patternIndex: number,      // Index of matched pattern
 *   isCustomPattern: boolean,  // Whether custom pattern
 *   groups: Array,             // Group names from pattern
 *   description: string,       // Pattern description
 *   ...                        // Event-specific fields
 * }
 * 
 * 
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Specific Imports
const logger = require("../../../../shared/logger");
const { getPatternLoader } = require("../../../../config/PatternLoader.js");

/**
 * EventPatterns - Pattern matching for guild events
 * 
 * Provides comprehensive pattern matching functionality for guild events,
 * with caching, multi-server support, and event-specific data processing.
 * 
 * @class
 */
class EventPatterns {
    /**
     * Initialize event patterns with configuration
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
     * @param {object} [config.customEventPatterns] - Custom event pattern definitions
     * @param {boolean} [config.enableColorCodes] - Enable color code preservation
     * @param {boolean} [config.enableDebugLogging] - Enable debug logging
     * 
     * @example
     * const patterns = new EventPatterns({
     *   serverType: 'Hypixel',
     *   customEventPatterns: {
     *     join: ['^Custom join pattern$']
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
        
        logger.debug(`EventPatterns initialized for server: ${this.serverType}`);
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
     * Get patterns for a specific event type
     * 
     * Retrieves patterns from PatternLoader with caching.
     * Merges server patterns with custom patterns from configuration.
     * 
     * Cache key format: "{serverType}-events-{eventType}"
     * 
     * Custom patterns are converted from strings to pattern objects:
     * - pattern: Compiled RegExp
     * - originalPattern: Original pattern string
     * - groups: Default groups for event type
     * - custom: true flag
     * - description: Auto-generated description
     * 
     * @param {string} eventType - Event type (join, leave, kick, promote, etc.)
     * @returns {Array<object>} Array of pattern objects with compiled RegExp
     * 
     * @example
     * const joinPatterns = patterns.getEventPatterns('join');
     * // Returns: [{ pattern: RegExp, groups: ['username'], ... }, ...]
     */
    getEventPatterns(eventType) {
        const cacheKey = `${this.serverType}-events-${eventType}`;
        
        if (this.patternCache.has(cacheKey)) {
            return this.patternCache.get(cacheKey);
        }

        const patterns = this.patternLoader.getPatterns(this.serverType, 'events', eventType);
        
        // Add custom patterns from configuration if any
        if (this.config.customEventPatterns && this.config.customEventPatterns[eventType]) {
            const customPatterns = this.config.customEventPatterns[eventType].map(patternStr => ({
                pattern: new RegExp(patternStr),
                originalPattern: patternStr,
                groups: this.getDefaultGroups(eventType),
                custom: true,
                description: `Custom ${eventType} pattern`
            }));
            patterns.push(...customPatterns);
        }

        this.patternCache.set(cacheKey, patterns);
        return patterns;
    }

    /**
     * Get default groups for an event type
     * 
     * Returns default capture group names for different event types.
     * Used when patterns don't specify custom groups.
     * 
     * Default groups by type:
     * - join: ['username']
     * - disconnect: ['username']
     * - leave: ['username']
     * - welcome: ['username']
     * - kick: ['username', 'kicker']
     * - promote: ['username', 'toRank']
     * - demote: ['username', 'toRank']
     * - invite: ['inviter', 'invited']
     * - online: ['membersList']
     * - level: ['level']
     * - motd: ['changer', 'motd']
     * - misc: ['changer']
     * 
     * @param {string} eventType - Event type
     * @returns {Array<string>} Default group names for the event type
     * 
     * @example
     * const groups = patterns.getDefaultGroups('promote');
     * // Returns: ['username', 'toRank']
     */
    getDefaultGroups(eventType) {
        const defaultGroups = {
            'join': ['username'],
            'disconnect': ['username'],
            'leave': ['username'],
            'welcome': ['username'],
            'kick': ['username', 'kicker'],
            'promote': ['username', 'toRank'],
            'demote': ['username', 'toRank'],
            'invite': ['inviter', 'invited'],
            'online': ['membersList'],
            'level': ['level'],
            'motd': ['changer', 'motd'],
            'misc': ['changer']
        };

        return defaultGroups[eventType] || [];
    }

    /**
     * Match an event against all patterns
     * 
     * Main event matching method. Tests message against all available event types
     * and patterns in order until a match is found.
     * 
     * Matching process:
     * 1. Clean message text (remove color codes if configured)
     * 2. Get all event types for server
     * 3. For each event type:
     *    a. Get patterns for that type
     *    b. Test each pattern in order
     *    c. Return first match with parsed data
     * 4. Return null if no matches
     * 
     * Debug logging (if enabled):
     * - Logs cleaned message and server type
     * - Lists available event types
     * - Shows pattern testing progress
     * - Displays match results and extracted groups
     * 
     * @param {string} messageText - Message text to match
     * @returns {object|null} Matched event with extracted data or null
     * 
     * @example
     * const match = patterns.matchEvent("Guild > Player joined.");
     * // Returns: { type: 'join', username: 'Player', raw: '...', ... }
     * 
     * @example
     * const match = patterns.matchEvent("Guild > Player was promoted to Officer");
     * // Returns: { type: 'promote', username: 'Player', toRank: 'Officer', ... }
     */
    matchEvent(messageText) {
        // Clean message text
        const cleanText = this.cleanMessageForMatching(messageText);
        
        if (this.config.enableDebugLogging) {
            logger.debug(`[EventPatterns] Trying to match: "${cleanText}"`);
            logger.debug(`[EventPatterns] Server: ${this.serverType}, Message length: ${cleanText.length}`);
        }
        
        // Get all event types for this server
        const eventTypes = this.patternLoader.getEventTypes(this.serverType);
        
        if (this.config.enableDebugLogging) {
            logger.debug(`[EventPatterns] Available event types: ${eventTypes.join(', ')}`);
        }

        // Try each event type
        for (const eventType of eventTypes) {
            const patterns = this.getEventPatterns(eventType);
            
            if (this.config.enableDebugLogging) {
                logger.debug(`[EventPatterns] Testing ${eventType} patterns (${patterns.length} patterns)`);
            }
            
            for (let i = 0; i < patterns.length; i++) {
                const patternObj = patterns[i];
                if (!patternObj || !patternObj.pattern) continue;

                const match = cleanText.match(patternObj.pattern);
                
                if (this.config.enableDebugLogging) {
                    logger.debug(`[EventPatterns] Pattern ${i} (${patternObj.description}): ${patternObj.originalPattern || patternObj.pattern} -> ${match ? 'MATCH' : 'NO MATCH'}`);
                }
                
                if (match) {
                    if (this.config.enableDebugLogging) {
                        logger.debug(`[EventPatterns] MATCHED! Groups: [${match.slice(1).join(', ')}]`);
                    }
                    return this.parseEventMatch(match, eventType, patternObj, i);
                }
            }
        }

        if (this.config.enableDebugLogging) {
            logger.debug(`[EventPatterns] No patterns matched for: "${cleanText}"`);
        }
        return null;
    }

    /**
     * Parse a matched event
     * 
     * Converts regex match array into structured event object.
     * Maps capture groups to named fields and applies event-specific processing.
     * 
     * Process:
     * 1. Create base event data with metadata
     * 2. Map regex groups to named properties
     * 3. Apply event-specific processing
     * 
     * Base event data includes:
     * - type: Event type
     * - raw: Original match text
     * - patternIndex: Index of matched pattern
     * - isCustomPattern: Whether custom pattern
     * - groups: Group names from pattern
     * - description: Pattern description
     * 
     * @param {Array} match - Regex match result array
     * @param {string} eventType - Type of event
     * @param {object} patternObj - Pattern object that matched
     * @param {Array<string>} patternObj.groups - Group names for extraction
     * @param {string} [patternObj.description] - Pattern description
     * @param {boolean} [patternObj.custom] - Whether custom pattern
     * @param {number} patternIndex - Index of pattern in array
     * @returns {object} Parsed event data with type-specific fields
     * 
     * @example
     * const parsed = patterns.parseEventMatch(
     *   ["Player joined", "Player"],
     *   'join',
     *   patternObj,
     *   0
     * );
     * // Returns: { type: 'join', username: 'Player', rank: null, ... }
     */
    parseEventMatch(match, eventType, patternObj, patternIndex) {
        const eventData = {
            type: eventType,
            raw: match[0],
            patternIndex: patternIndex,
            isCustomPattern: patternObj.custom || false,
            groups: patternObj.groups || [],
            description: patternObj.description || 'No description'
        };

        // Map match groups to named properties based on event type and groups definition
        const groups = patternObj.groups || this.getDefaultGroups(eventType);
        
        for (let i = 0; i < groups.length && i + 1 < match.length; i++) {
            const groupName = groups[i];
            const groupValue = match[i + 1];
            
            if (groupValue !== undefined) {
                eventData[groupName] = groupValue;
            }
        }

        // Apply event-specific processing
        return this.processEventData(eventData, eventType, match);
    }

    /**
     * Process event data based on event type
     * 
     * Routes event data to type-specific processing methods.
     * Each event type has its own processing logic to add
     * additional fields or normalize data.
     * 
     * Processing methods:
     * - join → processJoinEvent
     * - disconnect → processDisconnect
     * - leave → processLeaveEvent
     * - welcome → processWelcomeEvent
     * - kick → processKickEvent
     * - promote → processPromoteEvent
     * - demote → processDemoteEvent
     * - invite → processInviteEvent
     * - online → processOnlineEvent
     * - level → processLevelEvent
     * - motd → processMotdEvent
     * - misc → processMiscEvent
     * 
     * @param {object} eventData - Base event data
     * @param {string} eventType - Event type
     * @param {Array} match - Regex match result
     * @returns {object} Processed event data with type-specific fields
     * 
     * @example
     * const processed = patterns.processEventData(
     *   { type: 'join', username: 'Player' },
     *   'join',
     *   matchArray
     * );
     * // Returns: { type: 'join', username: 'Player', rank: null }
     */
    processEventData(eventData, eventType, match) {
        switch (eventType) {
            case 'join':
                return this.processJoinEvent(eventData, match);
            case 'disconnect':
                return this.processDisconnect(eventData, match);
            case 'leave':
                return this.processLeaveEvent(eventData, match);
            case 'welcome':
                return this.processWelcomeEvent(eventData, match);
            case 'kick':
                return this.processKickEvent(eventData, match);
            case 'promote':
                return this.processPromoteEvent(eventData, match);
            case 'demote':
                return this.processDemoteEvent(eventData, match);
            case 'invite':
                return this.processInviteEvent(eventData, match);
            case 'online':
                return this.processOnlineEvent(eventData, match);
            case 'level':
                return this.processLevelEvent(eventData, match);
            case 'motd':
                return this.processMotdEvent(eventData, match);
            case 'misc':
                return this.processMiscEvent(eventData, match);
            default:
                return eventData;
        }
    }

    /**
     * Process join event data
     * 
     * Adds rank field (null if not present).
     * 
     * @param {object} eventData - Base event data
     * @param {Array} match - Regex match result
     * @returns {object} Processed join event
     */
    processJoinEvent(eventData, match) {
        return {
            ...eventData,
            rank: eventData.rank || null
        };
    }

    /**
     * Process disconnect event data
     * 
     * Adds rank field (null if not present).
     * 
     * @param {object} eventData - Base event data
     * @param {Array} match - Regex match result
     * @returns {object} Processed disconnect event
     */
    processDisconnect(eventData, match) {
        return {
            ...eventData,
            rank: eventData.rank || null
        }
    }

    /**
     * Process leave event data
     * 
     * Adds reason field and wasKicked flag (false for leave).
     * 
     * @param {object} eventData - Base event data
     * @param {Array} match - Regex match result
     * @returns {object} Processed leave event
     */
    processLeaveEvent(eventData, match) {
        return {
            ...eventData,
            reason: eventData.reason || null,
            wasKicked: false
        };
    }

    /**
     * Process welcome event data
     * 
     * No additional processing needed for welcome events.
     * 
     * @param {object} eventData - Base event data
     * @param {Array} match - Regex match result
     * @returns {object} Processed welcome event
     */
    processWelcomeEvent(eventData, match) {
        return {
            ...eventData,
        }
    }

    /**
     * Process kick event data
     * 
     * Adds reason field and wasKicked flag (true for kick).
     * 
     * @param {object} eventData - Base event data
     * @param {Array} match - Regex match result
     * @returns {object} Processed kick event
     */
    processKickEvent(eventData, match) {
        return {
            ...eventData,
            reason: eventData.reason || null,
            wasKicked: true
        };
    }

    /**
     * Process promote event data
     * 
     * Adds rank-related fields and isPromotion flag.
     * 
     * Fields added:
     * - fromRank: Previous rank (default: 'Unknown')
     * - toRank: New rank
     * - promoter: Who promoted (null if not specified)
     * - isPromotion: true
     * 
     * @param {object} eventData - Base event data
     * @param {Array} match - Regex match result
     * @returns {object} Processed promote event
     */
    processPromoteEvent(eventData, match) {
        return {
            ...eventData,
            fromRank: eventData.fromRank || 'Unknown',
            toRank: eventData.toRank,
            promoter: eventData.promoter || null,
            isPromotion: true
        };
    }

    /**
     * Process demote event data
     * 
     * Adds rank-related fields and isPromotion flag.
     * 
     * Fields added:
     * - fromRank: Previous rank (default: 'Unknown')
     * - toRank: New rank
     * - demoter: Who demoted (null if not specified)
     * - isPromotion: false
     * 
     * @param {object} eventData - Base event data
     * @param {Array} match - Regex match result
     * @returns {object} Processed demote event
     */
    processDemoteEvent(eventData, match) {
        return {
            ...eventData,
            fromRank: eventData.fromRank || 'Unknown',
            toRank: eventData.toRank,
            demoter: eventData.demoter || null,
            isPromotion: false
        };
    }

    /**
     * Process invite event data
     * 
     * Adds inviteAccepted flag based on message content.
     * Checks if raw message contains "accepted" (case-insensitive).
     * 
     * @param {object} eventData - Base event data
     * @param {Array} match - Regex match result
     * @returns {object} Processed invite event
     */
    processInviteEvent(eventData, match) {
        return {
            ...eventData,
            inviteAccepted: eventData.raw && eventData.raw.toLowerCase().includes('accepted')
        };
    }

    /**
     * Process online event data
     * 
     * Parses members list and adds online count fields.
     * 
     * Fields added:
     * - count: Configured count or parsed member count
     * - members: Array of member names (parsed from list)
     * - onlineCount: Actual count of parsed members
     * 
     * @param {object} eventData - Base event data
     * @param {Array} match - Regex match result
     * @returns {object} Processed online event
     * 
     * @example
     * const processed = patterns.processOnlineEvent(
     *   { membersList: "Player1, [VIP] Player2, §aPlayer3" },
     *   match
     * );
     * // Returns: { members: ['Player1', 'Player2', 'Player3'], onlineCount: 3 }
     */
    processOnlineEvent(eventData, match) {
        const membersList = eventData.membersList || '';
        const members = this.parseOnlineMembers(membersList);
        
        return {
            ...eventData,
            count: eventData.count || members.length,
            members: members,
            onlineCount: members.length
        };
    }

    /**
     * Process level event data
     * 
     * Converts level to integer and calculates previous level.
     * 
     * Fields added:
     * - level: Parsed integer level
     * - previousLevel: Current level - 1 (minimum 1)
     * - isLevelUp: true
     * 
     * @param {object} eventData - Base event data
     * @param {Array} match - Regex match result
     * @returns {object} Processed level event
     */
    processLevelEvent(eventData, match) {
        const level = parseInt(eventData.level);
        return {
            ...eventData,
            level: level,
            previousLevel: Math.max(1, level - 1),
            isLevelUp: true
        };
    }

    /**
     * Process MOTD event data
     * 
     * Adds previousMotd field (null - could be tracked if needed).
     * 
     * @param {object} eventData - Base event data
     * @param {Array} match - Regex match result
     * @returns {object} Processed MOTD event
     */
    processMotdEvent(eventData, match) {
        return {
            ...eventData,
            previousMotd: null // Could be tracked if needed
        };
    }

    /**
     * Process misc event data
     * 
     * Determines and adds change type based on event data.
     * 
     * Change types:
     * - tag_change: Guild tag changed
     * - name_change: Guild name changed
     * - description_change: Guild description changed
     * - settings_change: Guild settings changed
     * - unknown_change: Other changes
     * 
     * @param {object} eventData - Base event data
     * @param {Array} match - Regex match result
     * @returns {object} Processed misc event
     */
    processMiscEvent(eventData, match) {
        return {
            ...eventData,
            changeType: this.determineChangeType(eventData)
        };
    }

    /**
     * Clean message text for matching
     * 
     * Prepares message for pattern matching:
     * - Removes color codes (if not enabled in config)
     * - Trims whitespace
     * 
     * Color code removal uses PatternLoader default pattern.
     * 
     * @param {string} messageText - Raw message text
     * @returns {string} Cleaned text ready for matching
     * 
     * @example
     * const cleaned = patterns.cleanMessageForMatching("§aGuild > Player joined.");
     * // Returns: "Guild > Player joined." (if color codes disabled)
     */
    cleanMessageForMatching(messageText) {
        if (!messageText || typeof messageText !== 'string') {
            return '';
        }

        let cleaned = messageText;

        // Remove color codes if not enabled
        if (!this.config.enableColorCodes) {
            const colorCodePattern = this.patternLoader.getDefaults('colorCodes').all;
            if (colorCodePattern) {
                cleaned = cleaned.replace(new RegExp(colorCodePattern, 'g'), '');
            }
        }

        return cleaned.trim();
    }

    /**
     * Parse online members list
     * 
     * Extracts individual member names from comma-separated list.
     * Cleans each member name by:
     * - Removing rank prefixes like [VIP], [MVP+]
     * - Removing color codes (§[0-9a-fklmnor])
     * - Trimming whitespace
     * - Filtering empty strings
     * 
     * @param {string} membersList - Comma-separated string of members
     * @returns {Array<string>} Array of cleaned member names
     * 
     * @example
     * const members = patterns.parseOnlineMembers("[VIP] Player1, §aPlayer2, Player3");
     * // Returns: ['Player1', 'Player2', 'Player3']
     */
    parseOnlineMembers(membersList) {
        if (!membersList || typeof membersList !== 'string') {
            return [];
        }

        return membersList
            .split(',')
            .map(member => member.trim())
            .filter(member => member.length > 0)
            .map(member => {
                // Remove rank prefixes like [VIP] or color codes
                return member
                    .replace(/\[[^\]]+\]/g, '')
                    .replace(/§[0-9a-fklmnor]/g, '')
                    .trim();
            })
            .filter(member => member.length > 0);
    }

    /**
     * Determine change type for misc events
     * 
     * Analyzes event data to categorize miscellaneous changes.
     * 
     * Detection logic (in order):
     * 1. Check for newTag field → 'tag_change'
     * 2. Check for newName field → 'name_change'
     * 3. Check raw message for "description" → 'description_change'
     * 4. Check raw message for "settings" → 'settings_change'
     * 5. Default → 'unknown_change'
     * 
     * @param {object} eventData - Event data with possible change indicators
     * @param {string} [eventData.newTag] - New guild tag
     * @param {string} [eventData.newName] - New guild name
     * @param {string} [eventData.raw] - Raw message text
     * @returns {string} Change type identifier
     * 
     * @example
     * const type = patterns.determineChangeType({ newTag: '[NEW]' });
     * // Returns: 'tag_change'
     */
    determineChangeType(eventData) {
        if (eventData.newTag) return 'tag_change';
        if (eventData.newName) return 'name_change';
        if (eventData.raw && eventData.raw.toLowerCase().includes('description')) return 'description_change';
        if (eventData.raw && eventData.raw.toLowerCase().includes('settings')) return 'settings_change';
        return 'unknown_change';
    }

    /**
     * Check if message is a guild event
     * 
     * Quick check method to determine if a message matches any event pattern.
     * 
     * @param {string} messageText - Message text to check
     * @returns {boolean} Whether message is a guild event
     * 
     * @example
     * if (patterns.isGuildEvent("Guild > Player joined.")) {
     *   console.log('This is an event');
     * }
     */
    isGuildEvent(messageText) {
        return this.matchEvent(messageText) !== null;
    }

    /**
     * Get event type from message
     * 
     * Determines event type without returning full match data.
     * 
     * @param {string} messageText - Message text
     * @returns {string|null} Event type or null if not an event
     * 
     * @example
     * const type = patterns.getEventType("Guild > Player joined.");
     * // Returns: "join"
     */
    getEventType(messageText) {
        const match = this.matchEvent(messageText);
        return match ? match.type : null;
    }

    /**
     * Add custom event pattern at runtime
     * 
     * Dynamically adds a pattern without restarting or reloading configuration.
     * Pattern is registered with PatternLoader and cache is invalidated.
     * 
     * Process:
     * 1. Create pattern object with groups
     * 2. Register with PatternLoader
     * 3. Clear cache for this event type
     * 4. Log addition
     * 
     * @param {string} eventType - Event type (join, leave, kick, etc.)
     * @param {string} patternString - Regex pattern string
     * @param {Array<string>} [groups=[]] - Group names (uses defaults if empty)
     * 
     * @example
     * patterns.addCustomEventPattern('join', '^Custom > (\\w+) joined$', ['username']);
     * // Pattern now available for matching
     */
    addCustomEventPattern(eventType, patternString, groups = []) {
        // Add to PatternLoader
        const patternObj = {
            pattern: patternString,
            groups: groups || this.getDefaultGroups(eventType),
            custom: true,
            description: `Runtime custom ${eventType} pattern`
        };

        this.patternLoader.addCustomPattern(this.serverType, 'events', eventType, patternObj);
        
        // Clear our cache
        const cacheKey = `${this.serverType}-events-${eventType}`;
        this.patternCache.delete(cacheKey);

        logger.debug(`Added custom ${eventType} event pattern: ${patternString}`);
    }

    /**
     * Get total pattern count
     * 
     * Counts all patterns across all event types for current server.
     * 
     * @returns {number} Total number of patterns
     * 
     * @example
     * const total = patterns.getTotalPatternCount();
     * console.log(`${total} patterns loaded`);
     */
    getTotalPatternCount() {
        const eventTypes = this.patternLoader.getEventTypes(this.serverType);
        return eventTypes.reduce((total, eventType) => {
            return total + this.getEventPatterns(eventType).length;
        }, 0);
    }

    /**
     * Get custom pattern count
     * 
     * Counts only custom patterns (from config or runtime) across all event types.
     * 
     * @returns {number} Number of custom patterns
     * 
     * @example
     * const custom = patterns.getCustomPatternCount();
     * console.log(`${custom} custom patterns`);
     */
    getCustomPatternCount() {
        const eventTypes = this.patternLoader.getEventTypes(this.serverType);
        return eventTypes.reduce((total, eventType) => {
            const patterns = this.getEventPatterns(eventType);
            const customCount = patterns.filter(p => p.custom).length;
            return total + customCount;
        }, 0);
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

        logger.debug('EventPatterns configuration updated');
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
        logger.debug('EventPatterns cache cleared');
    }
}

module.exports = EventPatterns;