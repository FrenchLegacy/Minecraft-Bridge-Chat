/**
 * Hypixel Strategy - Server-specific implementation for Hypixel network
 * 
 * This file manages bot connections and message processing specifically for the Hypixel
 * Minecraft server. It handles connection lifecycle, language configuration, limbo management,
 * and guild message detection using dynamic pattern matching from PatternLoader.
 * 
 * Key features:
 * - Connection and reconnection handling with automatic limbo navigation
 * - Language configuration to English for consistent message patterns
 * - Guild message detection (chat, officer, events, system)
 * - Own-bot message filtering to prevent infinite loops
 * - Pattern-based message classification using PatternLoader
 * - Inter-guild message processing support
 * - Performance optimization through pattern caching
 * 
 * The strategy uses PatternLoader to dynamically load and compile message detection
 * patterns from patterns.json, allowing for flexible message matching without hardcoded
 * regex patterns in the code.
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Specific Imports
const logger = require("../../shared/logger");
const { getPatternLoader } = require("../../config/PatternLoader.js");

/**
 * HypixelStrategy - Server strategy for Hypixel network
 * 
 * Implements server-specific behavior for managing Minecraft bots on Hypixel,
 * including connection management, message detection, and guild event processing.
 * 
 * @class
 */
class HypixelStrategy {
    /**
     * Initialize the Hypixel strategy
     * Sets up pattern loader, cache, and configuration
     */
    constructor() {
        this.name = "HypixelStrategy";
        this.serverName = "Hypixel";
        this.limboDelay = 3000;
        
        this.patternLoader = getPatternLoader();
        
        // Cache for detection patterns
        this.detectionCache = new Map();
        
        logger.debug(`${this.name} initialized with PatternLoader`);
    }

    /**
     * Get detection patterns for a specific type with caching
     * 
     * Retrieves patterns from PatternLoader and caches them for performance.
     * Cache is checked first before loading from PatternLoader.
     * 
     * @param {string} type - Detection type (guildChat, officerChat, guildEvent, guildSystem)
     * @returns {Array} Array of detection pattern objects
     * 
     * @example
     * const patterns = strategy.getDetectionPatterns('guildChat');
     */
    getDetectionPatterns(type) {
        if (this.detectionCache.has(type)) {
            return this.detectionCache.get(type);
        }

        const patterns = this.patternLoader.getDetectionPatterns(this.serverName, type);
        this.detectionCache.set(type, patterns);
        
        logger.debug(`Loaded ${patterns.length} detection patterns for ${type}`);
        return patterns;
    }

    /**
     * Test message against detection patterns
     * 
     * Uses short-circuit evaluation to return true on first matching pattern.
     * Safely handles invalid pattern objects.
     * 
     * @param {string} messageText - Message text to test
     * @param {string} type - Detection type
     * @returns {boolean} Whether message matches any pattern
     * 
     * @example
     * const isGuild = strategy.testDetectionPatterns("Guild > Player: Hi", 'guildChat');
     */
    testDetectionPatterns(messageText, type) {
        const patterns = this.getDetectionPatterns(type);
        
        return patterns.some(patternObj => {
            if (!patternObj || !patternObj.pattern) return false;
            return patternObj.pattern.test(messageText);
        });
    }

    /**
     * Handle initial bot connection to Hypixel
     * 
     * Process:
     * 1. Wait for connection to stabilize
     * 2. Change language to English
     * 3. Navigate to limbo
     * 
     * @param {object} bot - Mineflayer bot instance
     * @param {object} guildConfig - Guild configuration
     * @returns {Promise<void>}
     * 
     * @example
     * await strategy.onConnect(bot, guildConfig);
     */
    async onConnect(bot, guildConfig) {
        logger.minecraft(`🏰 Hypixel connection strategy for ${guildConfig.name}`);
        
        // Wait for connection to stabilize
        await this.wait(this.limboDelay);
        
        // Change Hypixel Language to detect all messages
        await this.changeLanguage(bot, guildConfig);

        // Go to limbo to avoid disconnections
        await this.goToLimbo(bot, guildConfig);
    }

    /**
     * Handle bot reconnection to Hypixel
     * 
     * Similar to onConnect but with reconnection-specific logging.
     * Always returns bot to limbo after reconnection.
     * 
     * @param {object} bot - Mineflayer bot instance
     * @param {object} guildConfig - Guild configuration
     * @returns {Promise<void>}
     * 
     * @example
     * await strategy.onReconnect(bot, guildConfig);
     */
    async onReconnect(bot, guildConfig) {
        logger.minecraft(`🔄 Hypixel reconnection strategy for ${guildConfig.name}`);
        
        // Wait longer after reconnection
        await this.wait(this.limboDelay);

        // Change Hypixel Language to detect all messages
        await this.changeLanguage(bot, guildConfig);

        // Always return to limbo after reconnection
        await this.goToLimbo(bot, guildConfig);
    }

    /**
     * Change Hypixel language to English
     * 
     * Sets language to English for consistent message pattern detection.
     * Retries up to 3 times on failure. Does not throw errors (non-critical operation).
     * 
     * @param {object} bot - Mineflayer bot instance
     * @param {object} guildConfig - Guild configuration
     * @param {number} [retryCount=0] - Current retry attempt
     * @returns {Promise<void>}
     * 
     * @example
     * await strategy.changeLanguage(bot, guildConfig);
     */
    async changeLanguage(bot, guildConfig, retryCount = 0) {
        try {
            logger.minecraft(`🌌 Change Hypixel Language to English for ${guildConfig.name}`);

            bot.chat(`/language English`);

            await this.wait(1000);

            logger.minecraft(`✅ Successfully change Hypixel Language to English`);
        } catch (error) {
            if (retryCount < 3) {
                logger.minecraft(`⚠️ Failed to switch Hypixel Language, retrying... (${retryCount + 1}/3)`);
                await this.wait(1000);
                return this.changeLanguage(bot, guildConfig, retryCount + 1);
            } else {
                logger.logError(error, `Failed to switch Hypixel Language for ${guildConfig.name} after 3 retries`);
                // No throw error
            }
        }
    }

    /**
     * Send bot to Hypixel limbo
     * 
     * Navigates bot to limbo to avoid AFK disconnections.
     * Retries up to 3 times on failure. Throws error after exhausting retries.
     * 
     * @param {object} bot - Mineflayer bot instance
     * @param {object} guildConfig - Guild configuration
     * @param {number} [retryCount=0] - Current retry attempt
     * @returns {Promise<void>}
     * @throws {Error} After 3 failed retry attempts
     * 
     * @example
     * await strategy.goToLimbo(bot, guildConfig);
     */
    async goToLimbo(bot, guildConfig, retryCount = 0) {
        try {
            logger.minecraft(`🌌 Going to limbo for ${guildConfig.name}...`);
            
            // Send limbo command
            bot.chat('/limbo');
            
            // Wait for confirmation
            await this.wait(this.limboDelay);
            
            logger.minecraft(`✅ Successfully went to limbo for ${guildConfig.name}`);
            
        } catch (error) {
            if (retryCount < 3) {
                logger.minecraft(`⚠️ Failed to go to limbo, retrying... (${retryCount + 1}/3)`);
                await this.wait(this.limboDelay);
                return this.goToLimbo(bot, guildConfig, retryCount + 1);
            } else {
                logger.logError(error, `Failed to go to limbo for ${guildConfig.name} after 3 retries`);
                throw error;
            }
        }
    }

    /**
     * Handle bot joining a guild
     * 
     * Ensures bot stays in limbo after joining a guild.
     * 
     * @param {object} bot - Mineflayer bot instance
     * @param {object} guildConfig - Guild configuration
     * @returns {Promise<void>}
     * 
     * @example
     * await strategy.onGuildJoin(bot, guildConfig);
     */
    async onGuildJoin(bot, guildConfig) {
        // After joining a guild, stay in limbo
        logger.minecraft(`🏰 Guild joined, staying in limbo for ${guildConfig.name}`);
        await this.wait(this.limboDelay);
        await this.goToLimbo(bot, guildConfig);
    }

    /**
     * Main message handler for Hypixel strategy
     * 
     * Processes incoming messages and classifies guild-related messages.
     * Filters out own bot messages to prevent infinite loops.
     * Logs all guild messages with appropriate prefixes.
     * 
     * Return object structure:
     * {
     *   type: string,              // Message type (e.g., 'GUILD_CHAT')
     *   category: string,          // Category (e.g., 'chat', 'event', 'system')
     *   subtype: string,           // Subtype (e.g., 'guild', 'officer', 'join')
     *   raw: string,               // Original message text
     *   isGuildRelated: boolean,   // Always true for returned messages
     *   sourceGuildConfig: object, // Reference to source guild config
     *   needsInterGuildProcessing: boolean // Whether to process for inter-guild
     * }
     * 
     * @param {object} bot - Mineflayer bot instance
     * @param {object} message - Raw message from Minecraft
     * @param {object} guildConfig - Guild configuration
     * @returns {Promise<object|null>} Processed guild message or null if not a guild message
     * 
     * @example
     * const result = await strategy.onMessage(bot, message, guildConfig);
     * if (result) {
     *   console.log(result.type); // "GUILD_CHAT"
     * }
     */
    async onMessage(bot, message, guildConfig) {
        const messageText = message.toString();

        // Check if this is a guild-related message using detection patterns
        const guildMessageResult = this.processGuildMessage(messageText, guildConfig);
        
        if (guildMessageResult) {
            // CRITICAL: Check if this message was sent by our own bot to avoid infinite loops
            if (this.isOwnBotMessage(messageText, guildConfig)) {
                logger.debug(`[${guildConfig.name}] Ignoring own bot message: ${messageText}`);
                return null;
            }

            // Log all guild messages with [GUILD] prefix and chat type
            const chatTypeLabel = guildMessageResult.subtype === 'officer' ? '[OFFICER]' : '[GUILD]';
            logger.bridge(`${chatTypeLabel} [${guildConfig.name}] ${guildMessageResult.type}: ${messageText}`);
            
            // For inter-guild processing, we need to set additional metadata
            guildMessageResult.sourceGuildConfig = guildConfig;
            guildMessageResult.needsInterGuildProcessing = this.shouldProcessForInterGuild(guildMessageResult.type);
            
            return guildMessageResult;
        }

        // Not a guild message, ignore
        return null;
    }

    /**
     * CRITICAL: Check if a message was sent by our own bot
     * 
     * Prevents infinite message loops by detecting messages sent by the bot itself.
     * Extracts username from various guild chat formats and compares with bot username.
     * Also detects inter-guild relay patterns that might indicate bot relaying.
     * 
     * Supported message formats:
     * - Standard: "Guild > [rank] username [rank]: message"
     * - With color codes: "§2Guild > §rusername: message"
     * - Officer chat: "Officer > username: message"
     * - Inter-guild relay: "BotName: OriginalUser: message"
     * 
     * @param {string} messageText - Message text to check
     * @param {object} guildConfig - Guild configuration with account.username
     * @returns {boolean} Whether this message was sent by our own bot
     * 
     * @example
     * const isOwn = strategy.isOwnBotMessage("Guild > MyBot: Hello", guildConfig);
     * // Returns: true if guildConfig.account.username === "MyBot"
     */
    isOwnBotMessage(messageText, guildConfig) {
        const botUsername = guildConfig.account.username;
        
        if (!botUsername) {
            logger.warn(`[${guildConfig.name}] No bot username configured, cannot filter own messages`);
            return false;
        }

        // Extract username from various guild chat patterns
        const guildPatterns = [
            // Standard patterns: "Guild > [rank] username [rank]: message"
            /^Guild > (?:\[.*?\]\s+)?(\w+)(?:\s+\[.*?\])?\s*:\s*(.+)$/,
            /^G > (?:\[.*?\]\s+)?(\w+)(?:\s+\[.*?\])?\s*:\s*(.+)$/,
            
            // With color codes
            /^§[0-9a-fklmnor]Guild > §[0-9a-fklmnor](?:\[.*?\]\s+)?(\w+)§[0-9a-fklmnor](?:\s+\[.*?\])?\s*:\s*(.+)$/,
            /^§[0-9a-fklmnor]G > §[0-9a-fklmnor](?:\[.*?\]\s+)?(\w+)§[0-9a-fklmnor](?:\s+\[.*?\])?\s*:\s*(.+)$/,
            
            // Alternative formats
            /^Guild Chat > (?:\[.*?\]\s+)?(\w+)(?:\s+\[.*?\])?\s*:\s*(.+)$/,
            /^§[0-9a-fklmnor]Guild Chat > §[0-9a-fklmnor](?:\[.*?\]\s+)?(\w+)§[0-9a-fklmnor](?:\s+\[.*?\])?\s*:\s*(.+)$/,
            
            // Officer chat patterns
            /^Officer > (?:\[.*?\]\s+)?(\w+)(?:\s+\[.*?\])?\s*:\s*(.+)$/,
            /^O > (?:\[.*?\]\s+)?(\w+)(?:\s+\[.*?\])?\s*:\s*(.+)$/,
            /^§[0-9a-fklmnor]Officer > §[0-9a-fklmnor](?:\[.*?\]\s+)?(\w+)§[0-9a-fklmnor](?:\s+\[.*?\])?\s*:\s*(.+)$/,
            /^§[0-9a-fklmnor]O > §[0-9a-fklmnor](?:\[.*?\]\s+)?(\w+)§[0-9a-fklmnor](?:\s+\[.*?\])?\s*:\s*(.+)$/
        ];
        
        for (const pattern of guildPatterns) {
            const match = messageText.match(pattern);
            if (match && match[1]) {
                const extractedUsername = match[1].trim();
                const extractedMessage = match[2] ? match[2].trim() : '';
                
                // Case-insensitive comparison
                if (extractedUsername.toLowerCase() === botUsername.toLowerCase()) {
                    const chatType = messageText.toLowerCase().includes('officer') ? 'officer' : 'guild';
                    logger.debug(`[${guildConfig.name}] Detected own bot ${chatType} message from ${extractedUsername}: "${extractedMessage.substring(0, 50)}${extractedMessage.length > 50 ? '...' : ''}"`);
                    return true;
                }
            }
        }
        
        // Additional check: look for inter-guild patterns that might indicate bot relaying
        // Check if the message contains patterns typical of inter-guild relaying
        const interGuildPatterns = [
            // Messages that look like "BotName: OriginalUser: message"
            /^(\w+):\s*(\w+):\s*(.+)$/,
            // Messages that look like repeated username chains
            /^(\w+):\s*\1:\s*(.+)$/,
        ];
        
        for (const pattern of interGuildPatterns) {
            const match = messageText.match(pattern);
            if (match) {
                // If we detect a potential inter-guild relay pattern in our own message,
                // it's likely our bot relaying, so we should ignore it
                const potentialBotName = match[1];
                if (potentialBotName && potentialBotName.toLowerCase() === botUsername.toLowerCase()) {
                    logger.debug(`[${guildConfig.name}] Detected potential inter-guild relay from bot: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}"`);
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Check if a message type should be processed for inter-guild transfer
     * 
     * Determines which message types should be relayed between guilds.
     * Currently includes guild chat, officer chat, and guild events.
     * 
     * @param {string} messageType - Message type to check
     * @returns {boolean} Whether message should be processed for inter-guild
     * 
     * @example
     * strategy.shouldProcessForInterGuild('GUILD_CHAT');  // true
     * strategy.shouldProcessForInterGuild('GUILD_SYSTEM'); // false
     */
    shouldProcessForInterGuild(messageType) {
        const interGuildTypes = [
            'GUILD_CHAT',
            'OFFICER_CHAT', 
            'GUILD_EVENT'
        ];
        
        return interGuildTypes.includes(messageType);
    }

    /**
     * Process and classify guild messages using PatternLoader
     * 
     * Attempts to classify message into one of four categories:
     * 1. Guild chat
     * 2. Officer chat
     * 3. Guild events
     * 4. Guild system messages
     * 
     * @param {string} messageText - Raw message text
     * @param {object} guildConfig - Guild configuration
     * @returns {object|null} Guild message data or null if not guild-related
     * 
     * @example
     * const result = strategy.processGuildMessage("Guild > Player: Hi", guildConfig);
     * // Returns: { type: 'GUILD_CHAT', category: 'chat', subtype: 'guild', ... }
     */
    processGuildMessage(messageText, guildConfig) {
        // Guild Chat Messages - use detection patterns
        if (this.isGuildChatMessage(messageText)) {
            return {
                type: 'GUILD_CHAT',
                category: 'chat',
                subtype: 'guild',
                raw: messageText,
                isGuildRelated: true
            };
        }

        // Officer Chat Messages - use detection patterns
        if (this.isOfficerChatMessage(messageText)) {
            return {
                type: 'OFFICER_CHAT',
                category: 'chat',
                subtype: 'officer',
                raw: messageText,
                isGuildRelated: true
            };
        }

        // Guild Events - use detection patterns
        if (this.isGuildEventMessage(messageText)) {
            return {
                type: 'GUILD_EVENT',
                category: 'event',
                subtype: this.getGuildEventType(messageText),
                raw: messageText,
                isGuildRelated: true
            };
        }

        // Guild System Messages - use detection patterns
        if (this.isGuildSystemMessage(messageText)) {
            return {
                type: 'GUILD_SYSTEM',
                category: 'system',
                subtype: this.getGuildSystemType(messageText),
                raw: messageText,
                isGuildRelated: true
            };
        }

        return null;
    }

    /**
     * Check if message is guild chat using detection patterns
     * 
     * Excludes join/leave messages which are treated as events.
     * 
     * @param {string} message - Message text
     * @returns {boolean} Whether message is guild chat
     * 
     * @example
     * strategy.isGuildChatMessage("Guild > Player: Hi");   // true
     * strategy.isGuildChatMessage("Guild > Player joined."); // false
     */
    isGuildChatMessage(message) {
        // Exclude join/leave messages that appear in guild chat
        if (this.isJoinLeaveMessage(message)) {
            return false;
        }
        
        return this.testDetectionPatterns(message, 'guildChat');
    }

    /**
     * Check if message is officer chat using detection patterns
     * 
     * Excludes join/leave messages which are treated as events.
     * 
     * @param {string} message - Message text
     * @returns {boolean} Whether message is officer chat
     * 
     * @example
     * strategy.isOfficerChatMessage("Officer > Admin: Secret"); // true
     */
    isOfficerChatMessage(message) {
        // Exclude join/leave messages that might appear with officer prefixes
        if (this.isJoinLeaveMessage(message)) {
            return false;
        }
        
        return this.testDetectionPatterns(message, 'officerChat');
    }

    /**
     * Check if message is a join/leave message
     * 
     * Join/leave messages are treated as events rather than chat.
     * 
     * @param {string} message - Message text
     * @returns {boolean} Whether message is join/leave
     * 
     * @example
     * strategy.isJoinLeaveMessage("Player joined.");  // true
     * strategy.isJoinLeaveMessage("Player: hello");   // false
     */
    isJoinLeaveMessage(message) {
        const joinLeavePatterns = [
            /joined\.?$/,
            /left\.?$/,
            /joined the guild/,
            /left the guild/
        ];
        
        return joinLeavePatterns.some(pattern => pattern.test(message));
    }

    /**
     * Check if message is a guild event using detection patterns
     * 
     * Guild events include joins, leaves, promotions, demotions, kicks, etc.
     * 
     * @param {string} message - Message text
     * @returns {boolean} Whether message is guild event
     * 
     * @example
     * strategy.isGuildEventMessage("Player was promoted to Officer"); // true
     */
    isGuildEventMessage(message) {
        return this.testDetectionPatterns(message, 'guildEvent');
    }

    /**
     * Check if message is guild system message using detection patterns
     * 
     * System messages include guild info displays, online lists, command errors.
     * 
     * @param {string} message - Message text
     * @returns {boolean} Whether message is guild system message
     * 
     * @example
     * strategy.isGuildSystemMessage("Online Members: 5"); // true
     */
    isGuildSystemMessage(message) {
        return this.testDetectionPatterns(message, 'guildSystem');
    }

    /**
     * Get specific guild event type
     * 
     * Determines the specific type of guild event (join, leave, promote, etc.).
     * Uses PatternLoader first, then falls back to legacy detection.
     * 
     * Event types: join, leave, kick, promote, demote, invite, level, motd, misc, unknown
     * 
     * @param {string} message - Message text
     * @returns {string} Event type
     * 
     * @example
     * strategy.getGuildEventType("Player joined.");  // "join"
     */
    getGuildEventType(message) {
        // Get event patterns to determine specific type
        const eventTypes = this.patternLoader.getEventTypes(this.serverName);
        
        for (const eventType of eventTypes) {
            const patterns = this.patternLoader.getPatterns(this.serverName, 'events', eventType);
            
            for (const patternObj of patterns) {
                if (patternObj && patternObj.pattern && patternObj.pattern.test(message)) {
                    return eventType;
                }
            }
        }
        
        // Fallback to legacy detection method
        return this.getLegacyEventType(message);
    }

    /**
     * Get specific guild system type
     * 
     * Determines the specific type of system message (guild_online, guild_info, etc.).
     * Uses PatternLoader first, then falls back to legacy detection.
     * 
     * System types: guild_online, guild_info, command_error, unknown
     * 
     * @param {string} message - Message text
     * @returns {string} System type
     * 
     * @example
     * strategy.getGuildSystemType("Online Members: 10"); // "guild_online"
     */
    getGuildSystemType(message) {
        // Get system patterns to determine specific type
        const systemPatterns = this.patternLoader.getPatterns(this.serverName, 'system');
        
        for (const patternObj of systemPatterns) {
            if (patternObj && patternObj.pattern && patternObj.pattern.test(message)) {
                return patternObj.type || 'unknown';
            }
        }
        
        // Fallback to legacy detection method
        return this.getLegacySystemType(message);
    }

    /**
     * Legacy event type detection (fallback)
     * 
     * Fallback method for event detection when PatternLoader patterns don't match.
     * Uses hardcoded regex patterns for common event types.
     * 
     * @param {string} message - Message text
     * @returns {string} Event type
     */
    getLegacyEventType(message) {
        // Join events (including "Guild > username joined.")
        if (/joined\.?$/.test(message) || /joined the guild/.test(message)) return 'join';
        
        // Leave events (including "Guild > username left.")
        if (/left\.?$/.test(message) || /left the guild/.test(message)) return 'leave';
        
        // Kick events
        if (/was kicked|was removed/.test(message)) return 'kick';
        
        // Promotion events (including rank prefixes like [MVP+])
        if (/was promoted/.test(message)) return 'promote';
        
        // Demotion events (including rank prefixes like [MVP+])
        if (/was demoted/.test(message)) return 'demote';
        
        // Invite events
        if (/invited .+ to/.test(message)) return 'invite';
        
        // Guild level events
        if (/Guild.*Level/.test(message)) return 'level';
        
        // MOTD events
        if (/MOTD/.test(message)) return 'motd';
        
        // Guild tag events
        if (/guild tag/.test(message)) return 'misc';
        
        // Guild name events
        if (/renamed the guild/.test(message)) return 'misc';
        
        return 'unknown';
    }

    /**
     * Legacy system type detection (fallback)
     * 
     * Fallback method for system message detection when PatternLoader patterns don't match.
     * Uses hardcoded regex patterns for common system message types.
     * 
     * @param {string} message - Message text
     * @returns {string} System type
     */
    getLegacySystemType(message) {
        if (/Online Members/.test(message)) return 'guild_online';
        if (/Guild Name/.test(message)) return 'guild_info';
        if (/Guild Level/.test(message)) return 'guild_info';
        if (/Guild Tag/.test(message)) return 'guild_info';
        if (/Guild MOTD/.test(message)) return 'guild_info';
        if (/cannot use|permission/.test(message)) return 'command_error';
        
        return 'unknown';
    }

    /**
     * Legacy method for backward compatibility
     * 
     * Checks if message is any type of guild-related message.
     * 
     * @param {string} message - Message text
     * @returns {boolean} Whether message is guild related
     */
    isGuildMessage(message) {
        return this.isGuildChatMessage(message) || 
               this.isOfficerChatMessage(message) || 
               this.isGuildEventMessage(message) || 
               this.isGuildSystemMessage(message);
    }

    /**
     * Legacy method for backward compatibility
     * 
     * Checks if message is a system message (events or system).
     * 
     * @param {string} message - Message text
     * @returns {boolean} Whether message is system message
     */
    isSystemMessage(message) {
        return this.isGuildEventMessage(message) || this.isGuildSystemMessage(message);
    }

    /**
     * Clear detection pattern cache
     * 
     * Clears all cached detection patterns, forcing reload from PatternLoader
     * on next pattern retrieval. Useful when patterns are updated at runtime.
     */
    clearCache() {
        this.detectionCache.clear();
        logger.debug(`${this.name} detection pattern cache cleared`);
    }

    /**
     * Wait for specified milliseconds
     * 
     * Utility method for creating delays in async operations.
     * 
     * @param {number} ms - Milliseconds to wait
     * @returns {Promise<void>}
     * 
     * @example
     * await strategy.wait(1000); // Wait 1 second
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = HypixelStrategy;