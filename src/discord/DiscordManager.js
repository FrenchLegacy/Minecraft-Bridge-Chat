/**
 * Discord Manager - Main Discord Integration Manager
 * 
 * This file manages the complete Discord integration for the bridge application.
 * It orchestrates the Discord bot connection, message handling, slash commands,
 * and communication with the Minecraft manager through the bridge coordinator.
 * 
 * The manager provides:
 * - Discord bot lifecycle management (start, stop, reconnect)
 * - Message sending to Discord channels
 * - Event emission for Discord messages and commands
 * - Connection status monitoring and reporting
 * - Integration with the bridge system for bidirectional communication
 * 
 * Key Components:
 * - DiscordBot: Core Discord.js client wrapper
 * - MessageSender: Handles sending messages to Discord channels
 * - Event handlers for bridging messages between Minecraft and Discord
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const EventEmitter = require('events');

// Specific Imports
const BridgeLocator = require("../bridgeLocator.js");
const DiscordBot = require("./client/DiscordBot.js");
const MessageSender = require("./client/senders/MessageSender.js");
const logger = require("../shared/logger");

/**
 * DiscordManager - Manages Discord bot and integration
 * 
 * Handles the complete Discord integration lifecycle including bot connection,
 * message routing, and event management. Provides high-level API for sending
 * messages and managing Discord communication.
 * 
 * @class
 * @extends EventEmitter
 */
class DiscordManager extends EventEmitter {
    /**
     * Create a new DiscordManager instance
     * Initializes configuration and sets up internal state
     */
    constructor() {
        super();
        
        const mainBridge = BridgeLocator.getInstance();
        this.config = mainBridge.config;

        this._isInitialized = false;
        this._isStarted = false;
        this._discordBot = null;
        this._messageSender = null;

        // Event handlers for cross-manager communication
        this.messageHandlers = [];
        this.eventHandlers = [];
        this.connectionHandlers = [];
        this.errorHandlers = [];

        this.initialize();
    }

    /**
     * Initialize Discord manager components
     * 
     * Sets up the Discord bot and message sender instances.
     * Validates configuration before initialization.
     * 
     * @async
     * @private
     */
    async initialize() {
        if (this._isInitialized) {
            logger.warn("DiscordManager already initialized");
            return;
        }

        try {
            logger.discord("Initializing Discord module...");

            // Validate configuration before proceeding
            this.validateConfiguration();

            // Initialize Discord bot
            this._discordBot = new DiscordBot();

            // Initialize message sender
            this._messageSender = new MessageSender();

            this._isInitialized = true;
            logger.discord("✅ Discord module initialized");

        } catch (error) {
            logger.logError(error, 'Failed to initialize Discord module');
            throw error;
        }
    }

    /**
     * Start the Discord manager and connect to Discord
     * 
     * Connects the bot to Discord and sets up all event forwarding.
     * Ensures bot is fully ready before completing startup.
     * 
     * @async
     * @throws {Error} If manager is not initialized or startup fails
     */
    async start() {
        if (!this._isInitialized) {
            throw new Error('DiscordManager must be initialized before starting');
        }

        if (this._isStarted) {
            logger.warn('DiscordManager already started');
            return;
        }

        try {
            logger.discord('Starting Discord connections...');

            // Step 1: Start Discord bot and wait for it to be ready
            await this._discordBot.start();

            // Step 2: Wait to ensure bot is fully authenticated
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Step 3: Verify bot connection
            if (!this._discordBot.isConnected()) {
                // Try to restart the bot
                await this._discordBot.start();
            }

            // Step 4: Initialize message sender with Discord client
            const client = this._discordBot.getClient();
            if (!client) {
                throw new Error('Discord client not available after bot start');
            }

            await this._messageSender.initialize(client);

            // Step 5: Setup event forwarding
            this.setupEventForwarding();

            this._isStarted = true;
            logger.discord('✅ Discord connections started successfully');

        } catch (error) {
            logger.logError(error, 'Failed to start Discord connections');
            
            // Provide helpful error messages
            if (error.message && error.message.includes('TOKEN_INVALID')) {
                logger.error('');
                logger.error('============================================================');
                logger.error('   DISCORD BOT TOKEN ERROR');
                logger.error('============================================================');
                logger.error('❌ The Discord bot token in your configuration is invalid.');
                logger.error('   Please check your config/settings.json file');
                logger.error('   Make sure you have set a valid Discord bot token');
            }
            
            throw error;
        }
    }

    /**
     * Stop the Discord manager and disconnect from Discord
     * 
     * Performs graceful shutdown of all Discord components.
     * 
     * @async
     */
    async stop() {
        if (!this._isStarted) {
            return;
        }

        try {
            logger.discord('Stopping Discord connections...');

            if (this._discordBot) {
                await this._discordBot.stop();
            }

            if (this._messageSender) {
                this._messageSender.cleanup();
            }

            this._isStarted = false;
            logger.discord('✅ Discord connections stopped');

        } catch (error) {
            logger.logError(error, 'Error stopping Discord connections');
            throw error;
        }
    }

    /**
     * Setup event forwarding from Discord bot to manager
     * 
     * Forwards Discord bot events to registered external handlers.
     * Handles errors in individual handlers to prevent cascade failures.
     * 
     * @private
     */
    setupEventForwarding() {
        // Forward Discord bot message events to external handlers
        this._discordBot.onMessage((data) => {
            this.messageHandlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    logger.logError(error, 'Error in Discord message handler');
                }
            });
        });

        // Forward Discord bot connection events to external handlers
        this._discordBot.onConnection((data) => {
            this.connectionHandlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    logger.logError(error, 'Error in Discord connection handler');
                }
            });
        });

        // Forward Discord bot error events to external handlers
        this._discordBot.onError((error) => {
            this.errorHandlers.forEach(handler => {
                try {
                    handler(error);
                } catch (handlerError) {
                    logger.logError(handlerError, 'Error in Discord error handler');
                }
            });
        });
    }

    /**
     * Validate Discord configuration
     * 
     * Ensures all required configuration values are present before
     * attempting to connect to Discord.
     * 
     * @private
     * @throws {Error} If any required configuration is missing
     */
    validateConfiguration() {
        const appConfig = this.config.get('app');
        const bridgeConfig = this.config.get('bridge');

        if (!appConfig.token) {
            throw new Error('Discord bot token is required');
        }

        if (!appConfig.clientId) {
            throw new Error('Discord bot client ID is required');
        }

        if (!bridgeConfig.channels) {
            throw new Error('Discord bridge channels configuration is required');
        }

        if (!bridgeConfig.channels.chat || !bridgeConfig.channels.chat.id) {
            throw new Error('Discord chat channel ID is required');
        }

        if (!bridgeConfig.channels.staff || !bridgeConfig.channels.staff.id) {
            throw new Error('Discord staff channel ID is required');
        }
    }

    // ==================== MESSAGE SENDING METHODS ====================

    /**
     * Send guild chat message to Discord
     * 
     * Formats and sends a guild chat message from Minecraft to the appropriate
     * Discord channel.
     * 
     * @async
     * @param {object} messageData - Parsed guild message data
     * @param {object} guildConfig - Guild configuration
     * @returns {Promise<object>} Send result
     * @throws {Error} If manager not started or send fails
     */
    async sendGuildMessage(messageData, guildConfig) {
        if (!this._isStarted || !this._messageSender) {
            throw new Error('DiscordManager not started');
        }

        try {
            // Send the message through MessageSender
            const result = await this._messageSender.sendGuildMessage(messageData, guildConfig);

            logger.discord(`[DISCORD] ✅ Guild message sent successfully from ${guildConfig.name}`);
            return result;

        } catch (error) {
            logger.logError(error, `Failed to send guild message to Discord from ${guildConfig.name}`);
            throw error;
        }
    }

    /**
     * Send guild event to Discord
     * 
     * Formats and sends guild events (join, leave, promote, etc.) to Discord.
     * 
     * @async
     * @param {object} eventData - Parsed event data
     * @param {object} guildConfig - Guild configuration
     * @returns {Promise<object>} Send result
     * @throws {Error} If manager not started or send fails
     */
    async sendGuildEvent(eventData, guildConfig) {
        if (!this._isStarted || !this._messageSender) {
            throw new Error('DiscordManager not started');
        }

        try {
            // Send the event through MessageSender
            const result = await this._messageSender.sendEvent(eventData, guildConfig);

            logger.discord(`[DISCORD] ✅ Guild event sent successfully from ${guildConfig.name}`);
            return result;

        } catch (error) {
            logger.logError(error, `Failed to send guild event to Discord from ${guildConfig.name}`);
            throw error;
        }
    }

    /**
     * Send system message to Discord
     * 
     * Sends system notifications to Discord channels.
     * 
     * @async
     * @param {string} type - System message type
     * @param {object} data - System message data
     * @param {object} guildConfig - Guild configuration
     * @param {string} channelType - Channel type ('chat' or 'staff')
     * @returns {Promise<object>} Send result
     * @throws {Error} If manager not started or send fails
     */
    async sendSystemMessage(type, data, guildConfig, channelType = 'chat') {
        if (!this._isStarted || !this._messageSender) {
            throw new Error('DiscordManager not started');
        }

        try {
            // Send the system message through MessageSender
            const result = await this._messageSender.sendSystemMessage(type, data, channelType);

            logger.discord(`[DISCORD] ✅ System message sent successfully from ${guildConfig.name}`);
            return result;

        } catch (error) {
            logger.logError(error, `Failed to send system message to Discord from ${guildConfig.name}`);
            throw error;
        }
    }

    /**
     * Send connection status to Discord
     * 
     * Sends a connection status message with embed to the appropriate Discord channel.
     * Used for notifying users of bot connection/disconnection events.
     * 
     * @async
     * @param {string} guildId - Guild ID
     * @param {string} status - Connection status ('connected', 'disconnected', 'error')
     * @param {object} details - Additional status details
     * @returns {Promise<object|null>} Send result or null if skipped
     */
    async sendConnectionStatus(guildId, status, details = {}) {
        if (!this._isStarted || !this._messageSender) {
            return;
        }

        try {
            const guildConfig = this.config.getEnabledGuilds().find(g => g.id === guildId);
            if (!guildConfig) {
                logger.warn(`Guild config not found for ID: ${guildId}`);
                return;
            }

            // Send the connection status through MessageSender
            const result = await this._messageSender.sendConnectionStatus(status, guildConfig, details);

            logger.discord(`[DISCORD] ✅ Connection status sent successfully for ${guildConfig.name}: ${status}`);
            return result;

        } catch (error) {
            logger.logError(error, `Failed to send connection status to Discord for guild ${guildId}`);
        }
    }

    // ==================== EVENT REGISTRATION METHODS ====================

    /**
     * Register a message handler callback
     * 
     * Handler will be called for each message received from Discord.
     * Used by the bridge coordinator to route messages to Minecraft.
     * 
     * @param {Function} callback - Message handler function
     */
    onMessage(callback) {
        this.messageHandlers.push(callback);
    }

    /**
     * Register a connection handler callback
     * 
     * Handler will be called for connection status changes.
     * 
     * @param {Function} callback - Connection handler function
     */
    onConnection(callback) {
        this.connectionHandlers.push(callback);
    }

    /**
     * Register an error handler callback
     * 
     * Handler will be called when errors occur in the Discord manager.
     * 
     * @param {Function} callback - Error handler function
     */
    onError(callback) {
        this.errorHandlers.push(callback);
    }

    // ==================== STATUS METHODS ====================

    /**
     * Check if Discord bot is connected
     * 
     * @returns {boolean} True if connected and ready
     */
    isConnected() {
        return this._discordBot ? this._discordBot.isConnected() : false;
    }

    /**
     * Get Discord connection status
     * 
     * @returns {object} Connection status object
     */
    getConnectionStatus() {
        if (!this._discordBot) {
            return {
                connected: false,
                ready: false,
                error: 'Discord bot not initialized'
            };
        }

        return this._discordBot.getConnectionStatus();
    }

    /**
     * Get Discord bot information
     * 
     * @returns {object|null} Bot information or null if not available
     */
    getBotInfo() {
        if (!this._discordBot) {
            return null;
        }

        return this._discordBot.getBotInfo();
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Get Discord client instance (for advanced usage)
     * 
     * Provides access to the raw Discord.js client for advanced operations.
     * 
     * @returns {Client|null} Discord.js client instance or null
     */
    getClient() {
        return this._discordBot ? this._discordBot.getClient() : null;
    }

    /**
     * Get message sender instance (for advanced usage)
     * 
     * @returns {MessageSender|null} Message sender instance or null
     */
    getMessageSender() {
        return this._messageSender;
    }

    /**
     * Update Discord configuration
     * 
     * Note: Configuration updates require a restart to take effect.
     * 
     * @param {object} newConfig - New configuration object
     */
    updateConfig(newConfig) {
        // Update configuration would require restart
        logger.warn('Discord configuration update requires restart');
    }
}

module.exports = DiscordManager;