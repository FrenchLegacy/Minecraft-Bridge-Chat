/**
 * Discord Bot - Core Discord.js Client Wrapper
 * 
 * This file wraps the Discord.js client and manages the bot's lifecycle, event handling,
 * and connection to Discord's gateway. It coordinates between multiple handlers including
 * message handling, slash commands, and command detection from Discord messages.
 * 
 * The bot provides:
 * - Discord gateway connection management with auto-reconnect
 * - Event forwarding to handlers (messages, interactions, errors)
 * - Bot presence/status management
 * - Handler initialization and coordination
 * - Connection status monitoring
 * 
 * Handlers:
 * - MessageHandler: Processes incoming Discord messages for bridging
 * - SlashCommandHandler: Handles slash command registration and execution
 * - CommandDetectionHandler: Detects text-based commands in messages
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const EventEmitter = require('events');

// Specific Imports
const BridgeLocator = require("../../bridgeLocator.js");
const MessageHandler = require("./handlers/MessageHandler.js");
const SlashCommandHandler = require("./handlers/SlashCommandHandler.js");
const CommandDetectionHandler = require('./handlers/CommandDetectionHandler');
const logger = require("../../shared/logger");

/**
 * DiscordBot - Discord.js client wrapper with handler management
 * 
 * Extends EventEmitter to provide custom event handling for the bridge application.
 * Manages Discord connection, handlers, and event forwarding.
 * 
 * @class
 * @extends EventEmitter
 */
class DiscordBot extends EventEmitter {
    /**
     * Create a new DiscordBot instance
     * Initializes configuration and prepares handlers
     */
    constructor() {
        super();

        const mainBridge = BridgeLocator.getInstance();
        this.config = mainBridge.config;

        // Discord.js client
        this.client = null;
        
        // Connection state
        this._isConnected = false;
        this._isReady = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;
        this.reconnectTimeout = null;

        // Handler instances
        this.messageHandler = null;
        this.slashCommandHandler = null;
        this.commandDetectionHandler = null;

        this.initializeClient();
    }

    /**
     * Initialize Discord client and handlers
     * 
     * Creates the Discord.js client with required intents and initializes
     * all handler instances (but doesn't connect them to the client yet).
     * 
     * @private
     */
    initializeClient() {
        try {
            // Create Discord client with necessary intents
            // GuildMessageReactions added for error handling (adding reaction emojis)
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                    GatewayIntentBits.GuildMembers,
                    GatewayIntentBits.GuildMessageReactions
                ]
            });

            // Initialize handlers (they will be connected to client later)
            this.messageHandler = new MessageHandler();
            this.slashCommandHandler = new SlashCommandHandler();
            this.commandDetectionHandler = new CommandDetectionHandler();

            this.setupEventHandlers();
            
            logger.discord('Discord client initialized with intents');

        } catch (error) {
            logger.logError(error, 'Failed to initialize Discord client');
            throw error;
        }
    }

    /**
     * Setup Discord client event handlers
     * 
     * Registers event listeners for Discord events including ready, disconnect,
     * reconnecting, errors, messages, and member events. Forwards events to
     * appropriate handlers and emits custom events for the application.
     * 
     * @private
     */
    setupEventHandlers() {
        // Ready event - bot is connected and ready
        this.client.on('clientReady', async () => {
            this._isConnected = true;
            this._isReady = true;
            
            const botInfo = {
                username: this.client.user.username,
                id: this.client.user.id,
                discriminator: this.client.user.discriminator,
                tag: this.client.user.tag
            };

            logger.discord(`✅ Discord bot logged in as ${botInfo.tag}`);

            try {
                // Initialize handlers with the Discord client now that it's ready
                await this.initializeHandlers();

                // Set bot activity/status
                this.setBotActivity();

                // Emit connection event
                this.emit('connection', {
                    type: 'connected',
                    bot: botInfo,
                    guilds: this.client.guilds.cache.size,
                    users: this.client.users.cache.size
                });

            } catch (error) {
                logger.logError(error, 'Failed to initialize handlers after Discord ready');
                this.emit('error', error);
            }
        });

        // Disconnect event
        this.client.on('disconnect', () => {
            this._isConnected = false;
            this._isReady = false;
            
            logger.discord('🔴 Discord bot disconnected');
            
            this.emit('connection', {
                type: 'disconnected'
            });

            // Schedule reconnection
            this.scheduleReconnection();
        });

        // Error event
        this.client.on('error', (error) => {
            logger.logError(error, 'Discord bot error');
            this.emit('error', error);
        });

        // Warning event
        this.client.on('warn', (warning) => {
            logger.warn(`Discord bot warning: ${warning}`);
        });

        // Message create event - forward to message handler
        this.client.on('messageCreate', async (message) => {
            if (!this._isReady)
                return;

            if (this.messageHandler) {
                await this.messageHandler.handleMessage(message);
            }
        });

        // Guild member add event
        this.client.on('guildMemberAdd', (member) => {
            this.emit('memberJoin', member);
        });

        // Guild member remove event
        this.client.on('guildMemberRemove', (member) => {
            this.emit('memberLeave', member);
        });

        // Rate limit event
        this.client.on('rateLimit', (info) => {
            logger.warn(`Discord rate limit hit: ${JSON.stringify(info)}`);
        });

        // Shard events
        this.client.on('shardError', (error) => {
            logger.logError(error, 'Discord shard error');
        });

        this.client.on('shardReady', () => {
            // Shard ready
        });
    }

    /**
     * Setup message handler event forwarding
     * 
     * Forwards message and command events from the MessageHandler to the bot's
     * event emitter for other components to consume.
     * 
     * @private
     */
    setupMessageHandlerEvents() {
        if (!this.messageHandler) {
            logger.warn('MessageHandler not available for event setup');
            return;
        }

        // Forward message events from MessageHandler
        this.messageHandler.on('message', (messageData) => {
            this.emit('message', messageData);
        });

        // Forward command events from MessageHandler  
        this.messageHandler.on('command', (commandData) => {
            this.emit('command', commandData);
        });
    }

    /**
     * Setup slash command handler event forwarding
     * 
     * Forwards interaction events from the SlashCommandHandler.
     * 
     * @private
     */
    setupSlashCommandHandlerEvents() {
        if (!this.slashCommandHandler) {
            logger.warn('SlashCommandHandler not available for event setup');
            return;
        }

        // Forward slash command events
        this.slashCommandHandler.on('slashCommand', (commandData) => {
            this.emit('slashCommand', commandData);
        });
    }

    /**
     * Initialize all handlers with Discord client
     * 
     * Called after Discord client is ready. Initializes message handler,
     * slash command handler, and command detection handler with the client.
     * 
     * @async
     * @private
     */
    async initializeHandlers() {
        try {
            // Initialize message handler
            if (this.messageHandler) {
                await this.messageHandler.initialize(this.client);
                this.setupMessageHandlerEvents();
            }

            // Initialize slash command handler
            if (this.slashCommandHandler) {
                await this.slashCommandHandler.initialize(this.client);
                this.setupSlashCommandHandlerEvents();
            }

            // Initialize command detection handler
            if (this.commandDetectionHandler) {
                await this.commandDetectionHandler.initialize(this.client);
                this.commandDetectionHandler.registerCommands(this.slashCommandHandler.commands);
            }

        } catch (error) {
            logger.logError(error, 'Failed to initialize Discord bot handlers');
            throw error;
        }
    }

    /**
     * Set bot presence status
     * 
     * Sets the bot's activity and status message visible to Discord users.
     * 
     * @private
     */
    setBotActivity() {
        try {
            const activityConfig = this.config.get('bridge.activity') || {};
            
            if (activityConfig.enabled !== false) {
                const activity = {
                    name: activityConfig.name || 'Minecraft Bridge',
                    type: ActivityType[activityConfig.type] || ActivityType.Playing
                };

                this.client.user.setActivity(activity.name, { type: activity.type });
            }

        } catch (error) {
            logger.logError(error, 'Failed to set bot activity');
        }
    }

    // ==================== CONNECTION METHODS ====================

    /**
     * Connect to Discord
     * 
     * Logs in to Discord using the bot token from configuration.
     * Implements retry logic with exponential backoff.
     * 
     * @async
     * @returns {Promise<void>}
     * @throws {Error} If connection fails after max attempts
     */
    async start() {
        try {
            logger.discord('Starting Discord bot...');

            const token = this.config.get('app.token');
            if (!token) {
                throw new Error('Discord bot token not configured');
            }

            // Reset connection state before starting
            this._isConnected = false;
            this._isReady = false;
            this.connectionAttempts++;

            logger.discord(`Starting Discord bot (attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`);

            // Login to Discord
            await this.client.login(token);

            // Wait for bot to be ready
            await this.waitForReady();

            logger.discord('✅ Discord bot started successfully');

        } catch (error) {
            logger.logError(error, 'Failed to start Discord bot');

            if (this.connectionAttempts < this.maxConnectionAttempts) {
                this.scheduleReconnection();
                logger.logError(error, `Discord bot startup failed (attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`);
            }

            throw error;
        }
    }

    /**
     * Wait for Discord bot to be fully ready
     * 
     * Waits for the bot to be ready with a timeout mechanism.
     * 
     * @async
     * @param {number} timeout - Maximum time to wait in milliseconds (default: 30000)
     * @returns {Promise<void>}
     * @throws {Error} If bot doesn't become ready within timeout
     */
    async waitForReady(timeout = 30000) {
        return new Promise((resolve, reject) => {
            if (this._isReady) {
                resolve();
                return;
            }

            const timeoutId = setTimeout(() => {
                reject(new Error('Discord bot ready timeout'));
            }, timeout);

            const onReady = () => {
                clearTimeout(timeoutId);
                this.removeListener('error', onError);
                resolve();
            };

            const onError = (error) => {
                clearTimeout(timeoutId);
                this.removeListener('ready', onReady);
                reject(error);
            };

            this.once('connection', (data) => {
                if (data.type === 'connected') {
                    onReady();
                }
            });

            this.once('error', onError);
        });
    }

    /**
     * Disconnect from Discord
     * 
     * Gracefully disconnects the Discord bot and cleans up resources.
     * 
     * @async
     * @returns {Promise<void>}
     */
    async stop() {
        try {
            logger.discord('Stopping Discord bot...');

            // Clear reconnection timeout
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }

            // Reset states
            this._isConnected = false;
            this._isReady = false;

            // Cleanup handlers
            if (this.messageHandler) {
                this.messageHandler.cleanup();
            }

            if (this.slashCommandHandler) {
                this.slashCommandHandler.cleanup();
            }

            // Destroy Discord client
            if (this.client) {
                await this.client.destroy();
                this.client = null;
            }

            logger.discord('✅ Discord bot stopped');

        } catch (error) {
            logger.logError(error, 'Error stopping Discord bot');
            throw error;
        }
    }

    /**
     * Schedule automatic reconnection
     * 
     * Schedules a reconnection attempt with exponential backoff.
     * Only schedules if max attempts hasn't been reached.
     * 
     * @private
     */
    scheduleReconnection() {
        if (this.reconnectTimeout) {
            return; // Reconnection already scheduled
        }

        if (this.connectionAttempts >= this.maxConnectionAttempts) {
            logger.error('Max reconnection attempts reached. Giving up.');
            this.emit('error', new Error('Max reconnection attempts reached'));
            return;
        }

        const reconnectDelay = Math.min(5000 * this.connectionAttempts, 30000); // Exponential backoff, max 30s
        
        logger.discord(`Scheduling reconnection in ${reconnectDelay}ms...`);
        
        this.reconnectTimeout = setTimeout(async () => {
            this.reconnectTimeout = null;
            
            try {
                logger.discord('Attempting to reconnect...');
                await this.start();
            } catch (error) {
                logger.logError(error, 'Reconnection failed');
                this.scheduleReconnection(); // Schedule another attempt
            }
        }, reconnectDelay);
    }

    // ==================== EVENT REGISTRATION METHODS ====================

    /**
     * Register a message handler callback
     * 
     * @param {Function} callback - Message event callback
     */
    onMessage(callback) {
        this.on('message', callback);
    }

    /**
     * Register a connection handler callback
     * 
     * @param {Function} callback - Connection event callback
     */
    onConnection(callback) {
        this.on('connection', callback);
    }

    /**
     * Register an error handler callback
     * 
     * @param {Function} callback - Error event callback
     */
    onError(callback) {
        this.on('error', callback);
    }

    // ==================== STATUS METHODS ====================

    /**
     * Check if bot is connected to Discord
     * 
     * @returns {boolean} True if connected and ready
     */
    isConnected() {
        return this._isConnected && this._isReady;
    }

    /**
     * Check if bot is fully ready
     * 
     * @returns {boolean} True if ready
     */
    isReady() {
        return this._isReady;
    }

    /**
     * Get connection status details
     * 
     * @returns {object} Connection status object
     */
    getConnectionStatus() {
        return {
            connected: this._isConnected,
            ready: this._isReady,
            attempts: this.connectionAttempts,
            maxAttempts: this.maxConnectionAttempts
        };
    }

    /**
     * Get bot user information
     * 
     * @returns {object|null} Bot user info or null if not connected
     */
    getBotInfo() {
        if (!this.client?.user) {
            return null;
        }

        return {
            username: this.client.user.username,
            tag: this.client.user.tag,
            id: this.client.user.id,
            avatar: this.client.user.displayAvatarURL(),
            guilds: this.client.guilds.cache.size,
            users: this.client.users.cache.size
        };
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Get Discord.js client instance
     * 
     * Provides access to the raw Discord.js client for advanced usage.
     * 
     * @returns {Client|null} Discord.js client or null
     */
    getClient() {
        return this.client;
    }

    /**
     * Reload slash commands
     * 
     * Reloads all slash commands from the command directory.
     * 
     * @async
     * @returns {Promise<object>} Bot information after reload
     * @throws {Error} If slash command handler not available
     */
    async reloadSlashCommands() {
        if (!this.slashCommandHandler) {
            throw new Error('SlashCommandHandler not available');
        }

        await this.slashCommandHandler.reloadCommands();
        return this.getBotInfo();
    }
}

module.exports = DiscordBot;