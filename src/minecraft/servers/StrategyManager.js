/**
 * Strategy Manager - Server-Specific Strategy Pattern Implementation
 * 
 * This class implements the Strategy pattern to handle different Minecraft server types
 * with server-specific logic for connections, reconnections, and message processing.
 * It provides a unified interface for interacting with various server implementations
 * while delegating server-specific behavior to appropriate strategy classes.
 * 
 * The manager provides:
 * - Server-specific strategy registration and retrieval
 * - Post-connection strategy execution
 * - Reconnection strategy handling
 * - Message processing through server-specific strategies
 * - Guild message detection and classification
 * - Fallback behavior for unknown servers
 * - Extensible architecture for adding new server types
 * 
 * Strategy pattern benefits:
 * - Encapsulates server-specific logic in strategy classes
 * - Makes adding new server types easy (just add new strategy)
 * - Keeps bot connection code clean and server-agnostic
 * - Allows runtime strategy selection based on configuration
 * 
 * Supported servers:
 * - Hypixel: Full strategy implementation (HypixelStrategy)
 * - Others: Commented out (Mineplex, 2b2t, Vanilla, Custom)
 * 
 * Strategy lifecycle:
 * 1. Bot connects to server
 * 2. StrategyManager selects appropriate strategy
 * 3. onConnect() executes post-connection setup
 * 4. onMessage() processes incoming messages
 * 5. onReconnect() handles reconnection if needed
 * 
 * Message flow:
 * Raw message → Strategy.onMessage() → Processed guild data → Return to bot
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Specific Imports
const logger = require("../../shared/logger");
const HypixelStrategy = require("./HypixelStrategy.js");

/**
 * StrategyManager - Manage server-specific strategies
 * 
 * Central manager that maintains server strategy instances and provides
 * a unified interface for executing server-specific operations.
 * 
 * @class
 */
class StrategyManager {
    /**
     * Create a new StrategyManager instance
     * 
     * Initializes the strategy registry with available server strategies.
     * Currently only HypixelStrategy is active, but the structure supports
     * multiple server types. Additional strategies can be uncommented or added
     * as needed for other server types.
     * 
     * Strategy registry structure:
     * - Key: Server name (matches serverName in guild config)
     * - Value: Strategy instance implementing required interface
     * 
     * Required strategy interface:
     * - onConnect(bot, guildConfig): Post-connection setup
     * - onReconnect(bot, guildConfig): Reconnection handling
     * - onMessage(bot, message, guildConfig): Message processing
     * - isGuildMessage(messageText): Guild message detection
     * 
     * @example
     * const strategyManager = new StrategyManager();
     * // Strategies registered and ready to use
     */
    constructor() {
        this.strategies = {
            "Hypixel": new HypixelStrategy()
            // 'Mineplex': new VanillaStrategy(), 
            // '2b2t': new VanillaStrategy(),
            // 'Vanilla': new VanillaStrategy(),
            // 'Custom': new VanillaStrategy()
        };
    }

    /**
     * Get strategy for server
     * 
     * Retrieves the appropriate strategy instance for a given server name.
     * Returns null if no strategy is registered for the server, with a warning
     * logged for debugging. This allows the bot to fail gracefully for unknown servers.
     * 
     * @param {string} serverName - Server name to get strategy for (e.g., 'Hypixel')
     * @returns {object|null} Strategy instance or null if not found
     * 
     * @example
     * const strategy = strategyManager.getStrategy('Hypixel');
     * if (strategy) {
     *   await strategy.onConnect(bot, guildConfig);
     * }
     * 
     * @example
     * // Unknown server handling
     * const strategy = strategyManager.getStrategy('UnknownServer');
     * // Returns null, warning logged
     */
    getStrategy(serverName) {
        const strategy = this.strategies[serverName];
        if (!strategy) {
            logger.warn(`No strategy found for server: ${serverName}, using default behavior`);
            return null;
        }
        return strategy;
    }

    /**
     * Execute post-connect strategy
     * 
     * Executes server-specific post-connection setup through the appropriate strategy.
     * Called immediately after bot successfully connects to server. Handles tasks like
     * joining guild channels, sending initial commands, or configuring chat settings.
     * 
     * Execution flow:
     * 1. Determine server type from guild config
     * 2. Get appropriate strategy
     * 3. Skip if no strategy found (with warning)
     * 4. Execute strategy's onConnect() method
     * 5. Log success or handle errors
     * 
     * @async
     * @param {object} bot - Mineflayer bot instance
     * @param {object} guildConfig - Guild configuration object
     * @param {object} guildConfig.server - Server configuration
     * @param {string} guildConfig.server.serverName - Server type name
     * @param {string} guildConfig.name - Guild name
     * @throws {Error} If strategy execution fails
     * 
     * @example
     * // After bot connects
     * await strategyManager.executePostConnectStrategy(bot, guildConfig);
     * // Bot now configured for guild chat
     * 
     * @example
     * try {
     *   await strategyManager.executePostConnectStrategy(bot, config);
     *   console.log('Post-connect setup complete');
     * } catch (error) {
     *   console.error('Setup failed:', error);
     * }
     */
    async executePostConnectStrategy(bot, guildConfig) {
        const serverName = guildConfig.server.serverName;
        const strategy = this.getStrategy(serverName);
        
        if (!strategy) {
            logger.warn(`Skipping post-connect strategy for unknown server: ${serverName}`);
            return;
        }
        
        logger.minecraft(`Executing post-connect strategy for ${serverName}`);
        
        try {
            await strategy.onConnect(bot, guildConfig);
            logger.minecraft(`Post-connect strategy completed for ${guildConfig.name}`);
        } catch (error) {
            logger.logError(error, `Post-connect strategy failed for ${guildConfig.name}`);
            throw error;
        }
    }

    /**
     * Execute reconnect strategy
     * 
     * Executes server-specific reconnection handling through the appropriate strategy.
     * Called when bot reconnects after a disconnection. May differ from initial connection
     * as server state might be different or require special handling.
     * 
     * Reconnection scenarios:
     * - Network interruption recovery
     * - Server restart recovery
     * - Bot crash recovery
     * - Intentional reconnection
     * 
     * @async
     * @param {object} bot - Mineflayer bot instance
     * @param {object} guildConfig - Guild configuration object
     * @param {object} guildConfig.server - Server configuration
     * @param {string} guildConfig.server.serverName - Server type name
     * @param {string} guildConfig.name - Guild name
     * @throws {Error} If strategy execution fails
     * 
     * @example
     * // After bot reconnects
     * await strategyManager.executeReconnectStrategy(bot, guildConfig);
     * 
     * @example
     * bot.on('spawn', async () => {
     *   if (isReconnect) {
     *     await strategyManager.executeReconnectStrategy(bot, config);
     *   }
     * });
     */
    async executeReconnectStrategy(bot, guildConfig) {
        const serverName = guildConfig.server.serverName;
        const strategy = this.getStrategy(serverName);
        
        if (!strategy) {
            logger.warn(`Skipping reconnect strategy for unknown server: ${serverName}`);
            return;
        }
        
        logger.minecraft(`Executing reconnect strategy for ${serverName}`);
        
        try {
            await strategy.onReconnect(bot, guildConfig);
            logger.minecraft(`Reconnect strategy completed for ${guildConfig.name}`);
        } catch (error) {
            logger.logError(error, `Reconnect strategy failed for ${guildConfig.name}`);
            throw error;
        }
    }

    /**
     * Handle incoming message through strategy
     * 
     * Processes incoming Minecraft messages through the server-specific strategy.
     * The strategy parses the message, determines if it's guild-related, and extracts
     * relevant data (username, message content, chat type, rank, etc.).
     * 
     * Return value indicates message type:
     * - Object: Guild-related message with processed data
     * - null: Not a guild message or processing failed
     * 
     * Processed message structure:
     * - type: Message type ('message' or 'event')
     * - chatType: 'guild' or 'officer'
     * - username: Sender username
     * - message: Message content
     * - rank: Player rank (if available)
     * - guildId: Guild identifier
     * 
     * @async
     * @param {object} bot - Mineflayer bot instance
     * @param {object} message - Raw message from Minecraft chat
     * @param {object} guildConfig - Guild configuration object
     * @param {object} guildConfig.server - Server configuration
     * @param {string} guildConfig.server.serverName - Server type name
     * @param {string} guildConfig.name - Guild name
     * @returns {Promise<object|null>} Processed guild message data or null
     * 
     * @example
     * bot.on('message', async (message) => {
     *   const guildData = await strategyManager.handleMessage(bot, message, config);
     *   if (guildData) {
     *     console.log(`${guildData.username}: ${guildData.message}`);
     *   }
     * });
     * 
     * @example
     * // Processing guild message
     * const data = await strategyManager.handleMessage(bot, msg, config);
     * if (data && data.type === 'message') {
     *   // Forward to Discord
     *   await bridgeMessage(data);
     * }
     */
    async handleMessage(bot, message, guildConfig) {
        const serverName = guildConfig.server.serverName;
        const strategy = this.getStrategy(serverName);
        
        if (!strategy) {
            logger.debug(`No strategy for ${serverName}, ignoring message`);
            return null;
        }
        
        try {
            // Let the strategy process the message
            const guildMessageData = await strategy.onMessage(bot, message, guildConfig);
            
            if (guildMessageData) {
                // This is a guild-related message, log it and return for further processing
                logger.debug(`[${guildConfig.name}] Strategy processed guild message: ${guildMessageData.type}`);
                return guildMessageData;
            }
            
            // Not a guild message, ignore it
            return null;
            
        } catch (error) {
            logger.logError(error, `Message handling failed for ${guildConfig.name}`);
            return null;
        }
    }

    /**
     * Check if message is guild-related
     * 
     * Quick check to determine if a message is guild-related without full processing.
     * Uses strategy's pattern matching to identify guild messages. More efficient than
     * full processing when only classification is needed.
     * 
     * Use cases:
     * - Pre-filtering messages before full processing
     * - Quick validation for message routing
     * - Statistics gathering (guild vs non-guild messages)
     * - Debugging and logging
     * 
     * @param {object} message - Raw message from Minecraft
     * @param {object} guildConfig - Guild configuration object
     * @param {object} guildConfig.server - Server configuration
     * @param {string} guildConfig.server.serverName - Server type name
     * @returns {boolean} True if message is guild-related, false otherwise
     * 
     * @example
     * bot.on('message', (message) => {
     *   if (strategyManager.isGuildMessage(message, config)) {
     *     // Process as guild message
     *     processGuildMessage(message);
     *   }
     * });
     * 
     * @example
     * // Message filtering
     * const messages = allMessages.filter(msg => 
     *   strategyManager.isGuildMessage(msg, guildConfig)
     * );
     * 
     * @example
     * // Statistics
     * const isGuild = strategyManager.isGuildMessage(message, config);
     * stats.increment(isGuild ? 'guild' : 'other');
     */
    isGuildMessage(message, guildConfig) {
        const serverName = guildConfig.server.serverName;
        const strategy = this.getStrategy(serverName);
        
        if (!strategy) {
            return false;
        }
        
        try {
            const messageText = message.toString();
            return strategy.isGuildMessage(messageText);
        } catch (error) {
            logger.logError(error, `Error checking if message is guild message for ${guildConfig.name}`);
            return false;
        }
    }
}

module.exports = StrategyManager;