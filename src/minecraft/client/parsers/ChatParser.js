/**
 * Chat Parser - Minecraft Message Detection and Parsing
 * 
 * This file handles the detection, parsing, and structuring of chat messages from
 * Minecraft servers. It transforms raw chat messages into structured data objects
 * that can be processed by the bridge system and forwarded to Discord or other platforms.
 * 
 * Key responsibilities:
 * - Chat message detection using pattern matching (MessagePatterns)
 * - Message cleaning and normalization (MessageCleaner)
 * - Message parsing and data extraction
 * - Message type classification and routing
 * - Structured message result creation with metadata
 * - Content filtering and ignore patterns
 * - Error handling and fallback parsing
 * 
 * Supported message types:
 * - guild_chat: Regular guild chat messages (chatType: 'guild')
 * - guild_chat: Officer chat messages (chatType: 'officer')
 * - private_message: Private/whisper messages (direction: 'from' or 'to')
 * - party_message: Party chat messages
 * - system_message: System notifications and messages
 * - ignored: Filtered messages based on ignore patterns
 * - unknown: Messages that don't match any pattern
 * - error: Messages that caused parsing errors
 * 
 * Parsing pipeline:
 * 1. Clean and normalize raw message text
 * 2. Check if message should be ignored (filter patterns)
 * 3. Attempt guild chat parsing (guild + officer)
 * 4. Attempt other message type parsing (private, party, system)
 * 5. Return structured result or unknown/error result
 * 
 * Message result structure:
 * {
 *   type: string,              // Message type
 *   chatType: string,          // Chat category (guild, officer, private, etc.)
 *   username: string,          // Sender username
 *   message: string,           // Cleaned message content
 *   rank: string,              // User rank if applicable
 *   raw: string,               // Cleaned raw text
 *   guildId: string,           // Guild identifier
 *   guildName: string,         // Guild name
 *   guildTag: string,          // Guild tag
 *   timestamp: number,         // Unix timestamp
 *   parsedSuccessfully: bool,  // Parse success flag
 *   parser: string,            // Parser name
 *   parserVersion: string,     // Parser version
 *   messageCategory: string,   // Message category
 *   parsed: object             // Original match data
 * }
 * 
 * @author Fabien83560
 * @version 2.0.0
 * @license ISC
 */

// Specific Imports
const logger = require("../../../shared/logger");
const BridgeLocator = require("../../../bridgeLocator.js");
const MessagePatterns = require("./patterns/MessagePatterns.js");
const MessageCleaner = require("./utils/MessageCleaner.js");

/**
 * ChatParser - Parses chat messages from Minecraft
 * 
 * Handles message detection, parsing, and classification for all
 * chat-related messages on Minecraft servers.
 * 
 * @class
 */
class ChatParser {
    /**
     * Initialize the chat parser
     * 
     * Sets up:
     * - Configuration from main bridge
     * - Chat parser configuration
     * - MessagePatterns instance for pattern matching
     * - MessageCleaner instance for message normalization
     * 
     * @example
     * const parser = new ChatParser();
     * const message = parser.parseMessage(rawMessage, guildConfig);
     */
    constructor() {
        const mainBridge = BridgeLocator.getInstance();
        this.config = mainBridge.config;

        this.chatParserConfig = this.config.get("features.chatParser");

        this._patterns = new MessagePatterns(this.chatParserConfig);
        this._cleaner = new MessageCleaner(this.config.get("advanced.messageCleaner"));
    }

    /**
     * Parse a raw Minecraft message
     * 
     * Main entry point for message parsing. Processes raw Minecraft messages
     * through cleaning, filtering, and pattern matching to create structured results.
     * 
     * Processing pipeline:
     * 1. Clean and normalize message text
     * 2. Check ignore patterns
     * 3. Attempt guild chat parsing (guild + officer)
     * 4. Attempt other message type parsing (private, party, system)
     * 5. Return unknown result if no matches
     * 
     * Message classification priority:
     * 1. Ignored messages (filter patterns)
     * 2. Guild chat (guild + officer)
     * 3. Private messages
     * 4. Party messages
     * 5. System messages
     * 6. Unknown messages
     * 
     * @param {string|object} rawMessage - Raw message from Minecraft client
     * @param {object} guildConfig - Guild configuration
     * @param {string} guildConfig.id - Guild ID
     * @param {string} guildConfig.name - Guild name
     * @param {string} guildConfig.tag - Guild tag
     * @returns {object} Parsed message object with type and data
     * 
     * @example
     * const result = parser.parseMessage(
     *   "Guild > [MVP+] Player: Hello!",
     *   guildConfig
     * );
     * // Returns: { type: 'guild_chat', chatType: 'guild', username: 'Player', ... }
     * 
     * @example
     * const result = parser.parseMessage(
     *   "Officer > Admin: Secret info",
     *   guildConfig
     * );
     * // Returns: { type: 'guild_chat', chatType: 'officer', username: 'Admin', ... }
     */
    parseMessage(rawMessage, guildConfig) {
        const startTime = Date.now();
        
        try {            
            // Clean and normalize the message
            const messageText = this._cleaner.cleanMessage(rawMessage);
            
            if (this.config.enableDebugLogging) {
                logger.debug(`[${guildConfig.name}] Parsing: "${messageText}"`);
            }
            
            // Check if message should be ignored
            if (this.shouldIgnoreMessage(messageText)) {
                return this.createIgnoredMessageResult(messageText, 'filtered_content');
            }
            
            // Try to parse as guild chat message
            const guildChatResult = this.parseGuildChatMessage(messageText, guildConfig);
            if (guildChatResult) {
                return guildChatResult;
            }
            
            // Try to parse as other message types
            const otherMessageResult = this.parseOtherMessageTypes(messageText, guildConfig);
            if (otherMessageResult) {
                return otherMessageResult;
            }
            
            // Unknown message type
            return this.createUnknownMessageResult(messageText, guildConfig);
            
        } catch (error) {
            logger.logError(error, `Error parsing message from ${guildConfig.name}`);
            return this.createErrorMessageResult(rawMessage, error, guildConfig);
        }
    }

    /**
     * Parse guild chat message (guild and officer chat)
     * 
     * Attempts to parse message as either regular guild chat or officer chat.
     * Uses MessagePatterns to match against known guild/officer patterns.
     * 
     * Processing:
     * 1. Try guild message patterns (Guild > username: message)
     * 2. Try officer message patterns (Officer > username: message)
     * 3. Return null if neither matches
     * 
     * @param {string} messageText - Cleaned message text
     * @param {object} guildConfig - Guild configuration
     * @returns {object|null} Parsed guild/officer message or null if no match
     * 
     * @example
     * const result = parser.parseGuildChatMessage(
     *   "Guild > Player: Hello",
     *   guildConfig
     * );
     * // Returns: { type: 'guild_chat', chatType: 'guild', ... }
     * 
     * @example
     * const result = parser.parseGuildChatMessage(
     *   "Officer > Admin: Plans",
     *   guildConfig
     * );
     * // Returns: { type: 'guild_chat', chatType: 'officer', isOfficerChat: true, ... }
     */
    parseGuildChatMessage(messageText, guildConfig) {
        // Try guild message patterns
        const guildMatch = this._patterns.matchGuildMessage(messageText);
        if (guildMatch) {
            return this.createGuildMessageResult(guildMatch, messageText, guildConfig);
        }
        
        // Try officer message patterns
        const officerMatch = this._patterns.matchOfficerMessage(messageText);
        if (officerMatch) {
            return this.createOfficerMessageResult(officerMatch, messageText, guildConfig);
        }
        
        return null;
    }

    /**
     * Parse other message types (private, party, system, etc.)
     * 
     * Attempts to parse message as private message, party message, or system message.
     * Used as fallback after guild chat parsing fails.
     * 
     * Processing priority:
     * 1. Private message patterns (From/To username: message)
     * 2. Party message patterns (Party > username: message)
     * 3. System message patterns (server notifications)
     * 4. Return null if none match
     * 
     * @param {string} messageText - Cleaned message text
     * @param {object} guildConfig - Guild configuration
     * @returns {object|null} Parsed message or null if no match
     * 
     * @example
     * const result = parser.parseOtherMessageTypes(
     *   "From Player: Hi there",
     *   guildConfig
     * );
     * // Returns: { type: 'private_message', direction: 'from', ... }
     */
    parseOtherMessageTypes(messageText, guildConfig) {
        // Try private message patterns
        const privateMatch = this._patterns.matchPrivateMessage(messageText);
        if (privateMatch) {
            return this.createPrivateMessageResult(privateMatch, messageText, guildConfig);
        }
        
        // Try party message patterns
        const partyMatch = this._patterns.matchPartyMessage(messageText);
        if (partyMatch) {
            return this.createPartyMessageResult(partyMatch, messageText, guildConfig);
        }
        
        // Try system message patterns
        const systemMatch = this._patterns.matchSystemMessage(messageText);
        if (systemMatch) {
            return this.createSystemMessageResult(systemMatch, messageText, guildConfig);
        }
        
        return null;
    }

    /**
     * Check if message should be ignored
     * 
     * Uses MessagePatterns ignore patterns to filter out unwanted messages
     * like spam, advertisements, or specific content patterns.
     * 
     * @param {string} messageText - Cleaned message text
     * @returns {boolean} Whether to ignore the message
     * 
     * @example
     * const shouldIgnore = parser.shouldIgnoreMessage("Advertisement spam");
     * // Returns: true if matches ignore pattern
     */
    shouldIgnoreMessage(messageText) {
        return this._patterns.shouldIgnore(messageText);
    }

    // ==================== RESULT CREATION METHODS ====================

    /**
     * Create guild message result
     * 
     * Constructs a structured result for regular guild chat messages.
     * Includes username, cleaned message content, rank, and metadata.
     * 
     * Result structure:
     * - type: 'guild_chat'
     * - chatType: 'guild'
     * - username: Sender's username
     * - message: Cleaned message content
     * - rank: User's rank (if available)
     * - messageCategory: 'chat'
     * - parsed: Original match data
     * 
     * @param {object} match - Pattern match result from MessagePatterns
     * @param {string} match.username - Sender username
     * @param {string} match.message - Message content
     * @param {string} [match.rank] - User rank
     * @param {string} rawText - Original cleaned message text
     * @param {object} guildConfig - Guild configuration
     * @returns {object} Structured guild message result
     * 
     * @example
     * const result = parser.createGuildMessageResult(
     *   { username: 'Player', message: 'Hello', rank: 'MVP+' },
     *   "Guild > [MVP+] Player: Hello",
     *   guildConfig
     * );
     */
    createGuildMessageResult(match, rawText, guildConfig) {
        const baseResult = this.createBaseMessageResult('guild_chat', rawText, guildConfig);
        
        return {
            ...baseResult,
            chatType: 'guild',
            username: match.username,
            message: this._cleaner.cleanMessageContent(match.message),
            rank: match.rank || null,
            messageCategory: 'chat',
            parsed: {
                username: match.username,
                message: match.message,
                rank: match.rank,
                rawMatch: match
            }
        };
    }

    /**
     * Create officer message result
     * 
     * Constructs a structured result for officer chat messages.
     * Similar to guild messages but with chatType: 'officer' and isOfficerChat flag.
     * 
     * Result structure:
     * - type: 'guild_chat'
     * - chatType: 'officer'
     * - username: Sender's username
     * - message: Cleaned message content
     * - rank: User's rank (if available)
     * - messageCategory: 'chat'
     * - isOfficerChat: true (distinguishes from guild chat)
     * - parsed: Original match data
     * 
     * @param {object} match - Pattern match result from MessagePatterns
     * @param {string} match.username - Sender username
     * @param {string} match.message - Message content
     * @param {string} [match.rank] - User rank
     * @param {string} rawText - Original cleaned message text
     * @param {object} guildConfig - Guild configuration
     * @returns {object} Structured officer message result
     * 
     * @example
     * const result = parser.createOfficerMessageResult(
     *   { username: 'Admin', message: 'Secret plans', rank: 'Officer' },
     *   "Officer > [Officer] Admin: Secret plans",
     *   guildConfig
     * );
     */
    createOfficerMessageResult(match, rawText, guildConfig) {
        const baseResult = this.createBaseMessageResult('guild_chat', rawText, guildConfig);
        
        return {
            ...baseResult,
            chatType: 'officer',
            username: match.username,
            message: this._cleaner.cleanMessageContent(match.message),
            rank: match.rank || null,
            messageCategory: 'chat',
            isOfficerChat: true,
            parsed: {
                username: match.username,
                message: match.message,
                rank: match.rank,
                rawMatch: match
            }
        };
    }

    /**
     * Create private message result
     * 
     * Constructs a structured result for private/whisper messages.
     * Includes direction flag to distinguish incoming vs outgoing messages.
     * 
     * Result structure:
     * - type: 'private_message'
     * - chatType: 'private'
     * - username: Other party's username
     * - message: Cleaned message content
     * - direction: 'from' (incoming) or 'to' (outgoing)
     * - messageCategory: 'private'
     * - parsed: Original match data
     * 
     * @param {object} match - Pattern match result from MessagePatterns
     * @param {string} match.username - Other party's username
     * @param {string} match.message - Message content
     * @param {string} match.direction - Message direction ('from' or 'to')
     * @param {string} rawText - Original cleaned message text
     * @param {object} guildConfig - Guild configuration
     * @returns {object} Structured private message result
     * 
     * @example
     * const result = parser.createPrivateMessageResult(
     *   { username: 'Friend', message: 'Hi', direction: 'from' },
     *   "From Friend: Hi",
     *   guildConfig
     * );
     */
    createPrivateMessageResult(match, rawText, guildConfig) {
        const baseResult = this.createBaseMessageResult('private_message', rawText, guildConfig);
        
        return {
            ...baseResult,
            chatType: 'private',
            username: match.username,
            message: this._cleaner.cleanMessageContent(match.message),
            direction: match.direction, // 'from' or 'to'
            messageCategory: 'private',
            parsed: {
                username: match.username,
                message: match.message,
                direction: match.direction,
                rawMatch: match
            }
        };
    }

    /**
     * Create party message result
     * 
     * Constructs a structured result for party chat messages.
     * 
     * Result structure:
     * - type: 'party_message'
     * - chatType: 'party'
     * - username: Sender's username
     * - message: Cleaned message content
     * - messageCategory: 'party'
     * - parsed: Original match data
     * 
     * @param {object} match - Pattern match result from MessagePatterns
     * @param {string} match.username - Sender username
     * @param {string} match.message - Message content
     * @param {string} rawText - Original cleaned message text
     * @param {object} guildConfig - Guild configuration
     * @returns {object} Structured party message result
     * 
     * @example
     * const result = parser.createPartyMessageResult(
     *   { username: 'PartyMember', message: 'Ready?' },
     *   "Party > PartyMember: Ready?",
     *   guildConfig
     * );
     */
    createPartyMessageResult(match, rawText, guildConfig) {
        const baseResult = this.createBaseMessageResult('party_message', rawText, guildConfig);
        
        return {
            ...baseResult,
            chatType: 'party',
            username: match.username,
            message: this._cleaner.cleanMessageContent(match.message),
            messageCategory: 'party',
            parsed: {
                username: match.username,
                message: match.message,
                rawMatch: match
            }
        };
    }

    /**
     * Create system message result
     * 
     * Constructs a structured result for system messages and notifications.
     * System messages don't have a username but include systemType classification.
     * 
     * Result structure:
     * - type: 'system_message'
     * - chatType: 'system'
     * - messageCategory: 'system'
     * - systemType: Type of system message
     * - parsed: Original match data with system-specific fields
     * 
     * @param {object} match - Pattern match result from MessagePatterns
     * @param {string} match.systemType - Type of system message
     * @param {object} [match.data] - System message data
     * @param {string} rawText - Original cleaned message text
     * @param {object} guildConfig - Guild configuration
     * @returns {object} Structured system message result
     * 
     * @example
     * const result = parser.createSystemMessageResult(
     *   { systemType: 'server_restart', data: { minutes: 5 } },
     *   "Server restarting in 5 minutes",
     *   guildConfig
     * );
     */
    createSystemMessageResult(match, rawText, guildConfig) {
        const baseResult = this.createBaseMessageResult('system_message', rawText, guildConfig);
        
        return {
            ...baseResult,
            chatType: 'system',
            messageCategory: 'system',
            systemType: match.systemType,
            parsed: {
                systemType: match.systemType,
                data: match.data,
                rawMatch: match
            }
        };
    }

    /**
     * Create ignored message result
     * 
     * Constructs result for messages that match ignore patterns.
     * Minimal structure since these messages are filtered out.
     * 
     * Result structure:
     * - type: 'ignored'
     * - raw: Original message text
     * - reason: Why message was ignored
     * - timestamp: Unix timestamp
     * - parsedSuccessfully: false
     * 
     * @param {string} rawText - Original message text
     * @param {string} reason - Reason for ignoring the message
     * @returns {object} Ignored message result
     * 
     * @example
     * const result = parser.createIgnoredMessageResult(
     *   "Spam advertisement",
     *   'filtered_content'
     * );
     */
    createIgnoredMessageResult(rawText, reason) {        
        return {
            type: 'ignored',
            raw: rawText,
            reason: reason,
            timestamp: Date.now(),
            parsedSuccessfully: false
        };
    }

    /**
     * Create unknown message result
     * 
     * Constructs result for messages that don't match any pattern.
     * Includes full base metadata for debugging purposes.
     * 
     * Result structure:
     * - type: 'unknown'
     * - raw: Original message text
     * - reason: 'no_pattern_match'
     * - parsedSuccessfully: false
     * - Full base metadata (guildId, timestamp, etc.)
     * 
     * @param {string} rawText - Original message text
     * @param {object} guildConfig - Guild configuration
     * @returns {object} Unknown message result
     * 
     * @example
     * const result = parser.createUnknownMessageResult(
     *   "Unrecognized format",
     *   guildConfig
     * );
     */
    createUnknownMessageResult(rawText, guildConfig) {        
        const baseResult = this.createBaseMessageResult('unknown', rawText, guildConfig);
        
        if (this.config.enableDebugLogging) {
            logger.debug(`[${guildConfig.name}] UNKNOWN: ${rawText.substring(0, 100)}`);
        }
        
        return {
            ...baseResult,
            reason: 'no_pattern_match',
            parsedSuccessfully: false
        };
    }

    /**
     * Create error message result
     * 
     * Constructs result when parsing throws an exception.
     * Includes error details for debugging and monitoring.
     * 
     * Result structure:
     * - type: 'error'
     * - raw: Original raw message
     * - error: { message, stack }
     * - guildId, guildName: Guild identifiers
     * - timestamp: Unix timestamp
     * - parsedSuccessfully: false
     * 
     * @param {string} rawMessage - Original raw message
     * @param {Error} error - Error that occurred during parsing
     * @param {object} guildConfig - Guild configuration
     * @returns {object} Error message result
     * 
     * @example
     * const result = parser.createErrorMessageResult(
     *   rawMessage,
     *   new Error('Pattern matching failed'),
     *   guildConfig
     * );
     */
    createErrorMessageResult(rawMessage, error, guildConfig) {
        return {
            type: 'error',
            raw: typeof rawMessage === 'string' ? rawMessage : String(rawMessage),
            error: {
                message: error.message,
                stack: error.stack
            },
            guildId: guildConfig.id,
            guildName: guildConfig.name,
            timestamp: Date.now(),
            parsedSuccessfully: false
        };
    }

    /**
     * Create base message result with common properties
     * 
     * Constructs the base structure shared by all successful message results.
     * Contains metadata about the message, guild, and parser.
     * 
     * Base structure:
     * - type: Message type
     * - raw: Cleaned message text
     * - guildId, guildName, guildTag: Guild identifiers
     * - timestamp: Unix timestamp
     * - parsedSuccessfully: true (for successful parses)
     * - parser: 'ChatParser'
     * - parserVersion: '2.0.0'
     * 
     * @param {string} type - Message type identifier
     * @param {string} rawText - Cleaned message text
     * @param {object} guildConfig - Guild configuration
     * @returns {object} Base message result structure
     * 
     * @example
     * const base = parser.createBaseMessageResult(
     *   'guild_chat',
     *   "Guild > Player: Hello",
     *   guildConfig
     * );
     */
    createBaseMessageResult(type, rawText, guildConfig) {
        return {
            type: type,
            raw: rawText,
            guildId: guildConfig.id,
            guildName: guildConfig.name,
            guildTag: guildConfig.tag,
            timestamp: Date.now(),
            parsedSuccessfully: true,
            parser: 'ChatParser',
            parserVersion: '2.0.0'
        };
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Check if a message is a guild chat message (for external use)
     * 
     * Quick check method to determine if a message is guild chat
     * without needing to inspect the full parse result.
     * 
     * @param {string|object} rawMessage - Raw message to check
     * @param {object} guildConfig - Guild configuration
     * @returns {boolean} Whether message is guild chat (guild or officer)
     * 
     * @example
     * if (parser.isGuildMessage(message, guildConfig)) {
     *   console.log('This is a guild chat message');
     * }
     */
    isGuildMessage(rawMessage, guildConfig) {
        try {
            const parsed = this.parseMessage(rawMessage, guildConfig);
            return parsed.type === 'guild_chat';
        } catch (error) {
            logger.logError(error, 'Error checking if message is guild message');
            return false;
        }
    }

    /**
     * Get current configuration
     * 
     * Provides access to the parser's configuration for inspection
     * or modification.
     * 
     * @returns {object} Current parser configuration
     * 
     * @example
     * const config = parser.getChatParserConfig();
     * console.log(config.enableDebugLogging);
     */
    getChatParserConfig() {
        return this.config;
    }

    /**
     * Get pattern matcher for external access
     * 
     * Provides access to the MessagePatterns instance for external
     * pattern management, testing, or inspection.
     * 
     * @returns {MessagePatterns} Pattern matcher instance
     * 
     * @example
     * const patterns = parser.getPatterns();
     * const customPatterns = patterns.getCustomPatterns('guild');
     */
    getPatterns() {
        return this._patterns;
    }

    /**
     * Get message cleaner for external access
     * 
     * Provides access to the MessageCleaner instance for external
     * message cleaning operations.
     * 
     * @returns {MessageCleaner} Message cleaner instance
     * 
     * @example
     * const cleaner = parser.getCleaner();
     * const cleaned = cleaner.cleanMessage(rawMessage);
     */
    getCleaner() {
        return this._cleaner;
    }
}

module.exports = ChatParser;