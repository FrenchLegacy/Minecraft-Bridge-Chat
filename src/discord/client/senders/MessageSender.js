/**
 * Message Sender - Discord Message Delivery System
 * 
 * This file handles sending messages from Minecraft to Discord channels. It manages
 * message formatting, delivery through webhooks or regular channels, rate limiting,
 * and provides specialized methods for different message types (guild messages, events,
 * system messages, connection status).
 * 
 * The sender provides:
 * - Guild chat message delivery to Discord
 * - Event message delivery (joins, leaves, promotions, etc.)
 * - System message delivery for bot notifications
 * - Connection status updates with embeds
 * - Webhook integration for immersive messaging
 * - Regular channel fallback when webhooks unavailable
 * - Rate limiting to prevent Discord API abuse
 * - Channel validation and caching
 * - Message formatting through MessageFormatter
 * - Embed creation through EmbedBuilder
 * 
 * Message Types:
 * - Guild Messages: Regular chat and officer chat from guilds
 * - Events: Player joins, leaves, promotions, demotes, kicks
 * - System: Bot notifications and status updates
 * - Connection Status: Bot connection state changes with rich embeds
 * 
 * Delivery Methods:
 * - Webhook: Messages appear with custom usernames and avatars
 * - Channel: Standard bot messages with optional embeds
 * - Automatic fallback from webhook to channel if webhook unavailable
 * 
 * Rate Limiting:
 * - Configurable message limit per time window
 * - Per-channel rate limiting tracking
 * - Automatic cleanup of old timestamps
 * - Protection against Discord API rate limits
 * 
 * Channel Routing:
 * - Chat channel: Regular guild messages, events, connection status
 * - Staff channel: Officer chat messages, admin notifications
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { EmbedBuilder: DiscordEmbedBuilder } = require('discord.js');

// Specific Imports
const BridgeLocator = require("../../../bridgeLocator.js");
const MessageFormatter = require("../../../shared/MessageFormatter.js");
const WebhookSender = require("./WebhookSender.js");
const EmbedBuilder = require("../../utils/EmbedBuilder.js");
const logger = require("../../../shared/logger");

/**
 * MessageSender - Manages message delivery to Discord
 * 
 * Handles all outgoing messages from the bridge to Discord, including
 * formatting, channel routing, rate limiting, and delivery method selection.
 * 
 * @class
 */
class MessageSender {
    /**
     * Create a new MessageSender instance
     * Initializes configuration, components, and rate limiting system
     */
    constructor() {
        const mainBridge = BridgeLocator.getInstance();
        this.config = mainBridge.config;

        this.client = null;
        this.messageFormatter = null;
        this.webhookSender = null;
        this.embedBuilder = null;

        this.channels = {
            chat: null,
            staff: null,
            statusLog: null
        };

        // Rate limiting
        this.rateLimiter = new Map(); // channelId -> last message times
        this.rateLimit = this.config.get('bridge.rateLimit.discord') || { limit: 5, window: 10000 };

        // Initialize only the components that don't require Discord client
        this.initializeComponents();
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize components that don't require Discord client
     * 
     * Sets up message formatter, webhook sender (if enabled), and embed builder.
     * Called automatically in constructor before Discord client is available.
     * 
     * @private
     */
    initializeComponents() {
        try {
            // Initialize message formatter for Discord
            const formatterConfig = {
                showTags: this.config.get('bridge.interGuild.showTags') || false,
                showSourceTag: this.config.get('bridge.interGuild.showSourceTag') !== false,
                enableDebugLogging: this.config.get('features.messageSystem.enableDebugLogging') || false,
                maxMessageLength: 2000, // Discord limit
                fallbackToBasic: true
            };

            this.messageFormatter = new MessageFormatter(formatterConfig);

            // Initialize webhook sender if enabled
            const webhookConfig = this.config.get('bridge.webhook');
            if (webhookConfig && webhookConfig.enabled) {
                this.webhookSender = new WebhookSender();
            }

            // Initialize embed builder
            this.embedBuilder = new EmbedBuilder();

            logger.discord('MessageSender components initialized');

        } catch (error) {
            logger.logError(error, 'Failed to initialize MessageSender components');
            throw error;
        }
    }

    /**
     * Initialize with Discord client
     * 
     * Completes initialization with Discord client reference, validates channels,
     * and initializes webhook sender if enabled. Called after Discord client is ready.
     * 
     * @async
     * @param {Client} client - Discord client instance
     * @throws {Error} If client is not provided
     * @throws {Error} If channel validation fails
     */
    async initialize(client) {
        if (!client) {
            throw new Error('Discord client is required for MessageSender initialization');
        }

        this.client = client;

        try {
            // Get and validate channels
            await this.validateAndCacheChannels();

            // Initialize webhook sender if enabled
            if (this.webhookSender) {
                await this.webhookSender.initialize(client);
            }

            logger.discord('MessageSender initialized with Discord client');

        } catch (error) {
            logger.logError(error, 'Failed to initialize MessageSender with client');
            throw error;
        }
    }

    /**
     * Validate and cache Discord channels
     * 
     * Fetches and validates chat and staff channels from Discord using
     * configured channel IDs. Caches channel references for efficient access.
     * 
     * @async
     * @private
     * @throws {Error} If client is not available
     * @throws {Error} If channel configuration is missing
     * @throws {Error} If channels cannot be fetched
     */
    async validateAndCacheChannels() {
        if (!this.client) {
            throw new Error('Discord client not available for channel validation');
        }

        const bridgeConfig = this.config.get('bridge.channels');

        if (!bridgeConfig) {
            throw new Error('Bridge channels configuration not found');
        }

        try {
            // Validate chat channel
            if (!bridgeConfig.chat || !bridgeConfig.chat.id) {
                throw new Error('Chat channel ID not configured');
            }

            const chatChannel = await this.client.channels.fetch(bridgeConfig.chat.id);
            if (!chatChannel) {
                throw new Error(`Chat channel not found: ${bridgeConfig.chat.id}`);
            }
            this.channels.chat = chatChannel;

            // Validate staff channel
            if (!bridgeConfig.staff || !bridgeConfig.staff.id) {
                throw new Error('Staff channel ID not configured');
            }

            const staffChannel = await this.client.channels.fetch(bridgeConfig.staff.id);
            if (!staffChannel) {
                throw new Error(`Staff channel not found: ${bridgeConfig.staff.id}`);
            }
            this.channels.staff = staffChannel;

            // Load status log channel (optional)
            const statusChannelId = this.config.get('discord.logChannels.botStatus');
            if (statusChannelId) {
                const statusLogChannel = await this.client.channels.fetch(statusChannelId);
                if (statusLogChannel) {
                    this.channels.statusLog = statusLogChannel;
                    logger.discord(`Validated Discord channels - Chat: ${chatChannel.name}, Staff: ${staffChannel.name}, StatusLog: ${statusLogChannel.name}`);
                } else {
                    logger.warn(`Status log channel not found: ${statusChannelId}`);
                    logger.discord(`Validated Discord channels - Chat: ${chatChannel.name}, Staff: ${staffChannel.name}`);
                }
            } else {
                logger.discord(`Validated Discord channels - Chat: ${chatChannel.name}, Staff: ${staffChannel.name}`);
            }

        } catch (error) {
            logger.logError(error, 'Failed to validate Discord channels');
            throw error;
        }
    }

    // ==================== MAIN SENDING METHODS ====================

    /**
     * Send guild chat message to Discord
     * 
     * Routes guild messages to appropriate Discord channel (chat or staff based on
     * chat type). Uses webhooks when available, falls back to regular channel sending.
     * Applies rate limiting and message formatting.
     * 
     * @async
     * @param {object} messageData - Parsed guild message data
     * @param {string} messageData.chatType - Chat type ('guild' or 'officer')
     * @param {string} messageData.username - Player username
     * @param {string} messageData.message - Message content
     * @param {object} guildConfig - Guild configuration
     * @returns {Promise<Message|null>} Sent Discord message or null if rate limited
     * @throws {Error} If client is not initialized
     * @throws {Error} If channel is not available
     */
    async sendGuildMessage(messageData, guildConfig) {
        if (!this.client) {
            throw new Error('Discord client not initialized');
        }

        try {
            // Determine target channel based on chat type
            const channelType = messageData.chatType === 'officer' ? 'staff' : 'chat';
            const channel = this.channels[channelType];

            if (!channel) {
                throw new Error(`Discord ${channelType} channel not available`);
            }

            // Check rate limiting
            if (this.isRateLimited(channel.id)) {
                logger.warn(`Rate limit hit for Discord channel ${channel.name}`);
                return null;
            }

            // Get formatted message
            const formattedMessage = this.messageFormatter.formatGuildMessage(messageData, guildConfig, guildConfig, 'messagesToDiscord');
            if (!formattedMessage) {
                logger.warn(`No formatted message generated for Discord`);
                return null;
            }

            let result;

            // Use webhook if available and preferred
            if (this.webhookSender && this.webhookSender.hasWebhook(channelType) && 
                this.config.get('bridge.webhook.useForGuildMessages') !== false) {
                
                result = await this.sendViaWebhook(messageData, guildConfig, channelType);
            } else {
                // Send via regular channel
                result = await this.sendViaChannel(formattedMessage, channel);
            }

            // Update rate limiting
            this.updateRateLimit(channel.id);

            logger.discord(`[DISCORD] Sent guild message to ${channelType} channel: "${formattedMessage}"`);

            return result;

        } catch (error) {
            logger.logError(error, 'Failed to send guild message to Discord');
            throw error;
        }
    }

    /**
     * Send event to Discord
     * 
     * Sends guild events (joins, leaves, promotions, demotes, kicks) to Discord
     * chat channel. Formats events using MessageFormatter and applies rate limiting.
     * 
     * @async
     * @param {object} eventData - Parsed event data
     * @param {string} eventData.type - Event type (join, leave, promote, demote, kick)
     * @param {string} eventData.username - Player username
     * @param {object} guildConfig - Guild configuration
     * @returns {Promise<Message|null>} Sent Discord message or null if rate limited
     * @throws {Error} If client is not initialized
     * @throws {Error} If chat channel is not available
     */
    async sendEvent(eventData, guildConfig) {
        if (!this.client) {
            throw new Error('Discord client not initialized');
        }

        try {
            const channel = this.channels.chat; // Events go to chat channel

            if (!channel) {
                throw new Error('Discord chat channel not available');
            }

            // Check rate limiting
            if (this.isRateLimited(channel.id)) {
                logger.warn(`Rate limit hit for Discord channel ${channel.name}`);
                return null;
            }

            // Get formatted message
            const formattedMessage = this.messageFormatter.formatGuildEvent(eventData, guildConfig, guildConfig, 'messagesToDiscord');

            if (!formattedMessage || formattedMessage === "unknown_event_type") {
                logger.debug(`No formatted event message generated for Discord`);
                return null;
            }

            // Send the message
            const result = await this.sendViaChannel(formattedMessage, channel);

            // Update rate limiting
            this.updateRateLimit(channel.id);

            logger.discord(`[DISCORD] Sent event to chat channel: "${formattedMessage}"`);

            return result;

        } catch (error) {
            logger.logError(error, 'Failed to send event to Discord');
            throw error;
        }
    }

    /**
     * Send system message to Discord
     * 
     * Sends system notifications (bot status, errors, info) to specified Discord channel.
     * Used for bridge-level notifications and status updates.
     * 
     * @async
     * @param {string} type - System message type (status, error, info, etc.)
     * @param {object} data - Message data
     * @param {string} channelType - Target channel type ('chat' or 'staff')
     * @returns {Promise<Message|null>} Sent Discord message or null if rate limited
     * @throws {Error} If client is not initialized
     * @throws {Error} If target channel is not available
     */
    async sendSystemMessage(type, data, channelType = 'chat') {
        if (!this.client) {
            throw new Error('Discord client not initialized');
        }

        try {
            const channel = this.channels[channelType];

            if (!channel) {
                throw new Error(`Discord ${channelType} channel not available`);
            }

            // Check rate limiting
            if (this.isRateLimited(channel.id)) {
                logger.warn(`Rate limit hit for Discord channel ${channel.name}`);
                return null;
            }

            // Get formatted system message
            const formattedMessage = this.messageFormatter.formatSystem(type, data, 'discord');

            if (!formattedMessage) {
                logger.warn(`[DISCORD] No formatted system message generated for ${type}`);
                return null;
            }

            // Send via channel
            const result = await this.sendViaChannel(formattedMessage, channel);

            logger.discord(`[DISCORD] Sent system message to ${channelType} channel: "${formattedMessage}"`);

            return result;

        } catch (error) {
            logger.logError(error, `Failed to send system message to Discord ${channelType} channel`);
            throw error;
        }
    }

    /**
     * Send connection status to Discord
     * 
     * Sends bot connection status updates with rich embeds showing connection state,
     * guild information, and additional details. Supports connected, disconnected,
     * reconnecting, and error states.
     * 
     * @async
     * @param {string} status - Connection status ('connected', 'disconnected', 'reconnecting', 'error')
     * @param {object} guildConfig - Guild configuration
     * @param {string} guildConfig.name - Guild name for display
     * @param {object} details - Additional status details
     * @param {string} details.reason - Disconnection reason (optional)
     * @param {string} details.error - Error message (optional)
     * @returns {Promise<Message>} Sent Discord message with embed
     * @throws {Error} If client is not initialized
     * @throws {Error} If chat channel is not available
     */
    async sendConnectionStatus(status, guildConfig, details = {}) {
        if (!this.client) {
            throw new Error('Discord client not initialized');
        }

        try {
            const channel = this.channels.statusLog || this.channels.chat;

            if (!channel) {
                throw new Error('Discord chat channel not available');
            }

            let message;
            let embed = null;

            switch (status) {
                case 'connected':
                    message = `✅ **${guildConfig.name}** bot connected to Hypixel`;
                    embed = this.embedBuilder.createConnectionEmbed(guildConfig, status, details);
                    break;
                    
                case 'disconnected':
                    const reason = details.reason ? ` (${details.reason})` : '';
                    message = `❌ **${guildConfig.name}** bot disconnected from Hypixel${reason}`;
                    embed = this.embedBuilder.createConnectionEmbed(guildConfig, status, details);
                    break;
                    
                case 'reconnecting':
                    message = `🔄 **${guildConfig.name}** bot reconnecting to Hypixel...`;
                    break;
                    
                case 'error':
                    const errorMsg = details.error ? ` - ${details.error}` : '';
                    message = `⚠️ **${guildConfig.name}** connection error${errorMsg}`;
                    embed = this.embedBuilder.createConnectionEmbed(guildConfig, status, details);
                    break;
                    
                default:
                    message = `ℹ️ **${guildConfig.name}** status: ${status}`;
            }

            // Send the message
            const result = await this.sendViaChannel(message, channel, embed);

            logger.discord(`[DISCORD] Sent connection status to chat channel: "${message}"`);

            return result;

        } catch (error) {
            logger.logError(error, 'Failed to send connection status to Discord');
            throw error;
        }
    }

    // ==================== INTERNAL SENDING METHODS ====================

    /**
     * Send message via webhook
     * 
     * Internal method to send messages through webhook system for immersive
     * messaging with custom usernames and avatars.
     * 
     * @async
     * @private
     * @param {object} messageData - Message data
     * @param {object} guildConfig - Guild configuration
     * @param {string} channelType - Channel type ('chat' or 'staff')
     * @returns {Promise<Message>} Sent webhook message
     * @throws {Error} If webhook sender is not available
     * @throws {Error} If webhook is not configured for channel
     */
    async sendViaWebhook(messageData, guildConfig, channelType) {
        if (!this.webhookSender) {
            throw new Error('Webhook sender not available');
        }

        const webhook = this.webhookSender.getWebhook(channelType);
        if (!webhook) {
            throw new Error(`Webhook not available for ${channelType} channel`);
        }

        // Format message content
        const content = this.messageFormatter.formatGuildMessage(messageData, guildConfig, guildConfig, 'messagesToDiscord');

        // Send via webhook
        return await this.webhookSender.sendMessage(
            content,
            messageData,
            guildConfig,
            channelType
        );
    }

    /**
     * Send message via channel
     * 
     * Internal method to send messages through regular Discord channel as bot.
     * Supports optional embed attachments.
     * 
     * @async
     * @private
     * @param {string} content - Message content
     * @param {Channel} channel - Discord channel
     * @param {EmbedBuilder|null} embed - Optional embed object
     * @returns {Promise<Message>} Sent channel message
     */
    async sendViaChannel(content, channel, embed = null) {
        const options = { content };

        if (embed) {
            options.embeds = [embed];
        }

        return await channel.send(options);
    }

    // ==================== RATE LIMITING ====================

    /**
     * Check if channel is rate limited
     * 
     * Determines if the channel has exceeded the configured message rate limit.
     * Automatically cleans up old timestamps outside the rate limit window.
     * 
     * @param {string} channelId - Channel ID to check
     * @returns {boolean} True if channel is rate limited
     */
    isRateLimited(channelId) {
        if (!this.rateLimit || this.rateLimit.limit <= 0) {
            return false;
        }

        const now = Date.now();
        const channelTimes = this.rateLimiter.get(channelId) || [];

        // Remove old timestamps
        const validTimes = channelTimes.filter(time => now - time < this.rateLimit.window);

        return validTimes.length >= this.rateLimit.limit;
    }

    /**
     * Update rate limiting for channel
     * 
     * Records the current message timestamp for rate limiting tracking.
     * Automatically cleans up old timestamps outside the rate limit window.
     * 
     * @param {string} channelId - Channel ID to update
     */
    updateRateLimit(channelId) {
        if (!this.rateLimit || this.rateLimit.limit <= 0) {
            return;
        }

        const now = Date.now();
        const channelTimes = this.rateLimiter.get(channelId) || [];

        // Add current time
        channelTimes.push(now);

        // Remove old timestamps
        const validTimes = channelTimes.filter(time => now - time < this.rateLimit.window);

        this.rateLimiter.set(channelId, validTimes);
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Get channel by type
     * 
     * Returns the cached Discord channel reference for the specified type.
     * 
     * @param {string} channelType - Channel type ('chat' or 'staff')
     * @returns {Channel|null} Discord channel or null if not found
     */
    getChannel(channelType) {
        return this.channels[channelType] || null;
    }

    /**
     * Clear rate limiter
     * 
     * Clears all rate limiting data. Useful for testing or resetting state.
     */
    clearRateLimit() {
        this.rateLimiter.clear();
        logger.debug('Discord MessageSender rate limiter cleared');
    }

    /**
     * Update configuration
     * 
     * Updates sender configuration, particularly message formatter settings
     * for tag display and source tag visibility.
     * 
     * @param {object} newConfig - New configuration
     * @param {boolean} newConfig.showTags - Show guild tags (optional)
     * @param {boolean} newConfig.showSourceTag - Show source tag (optional)
     */
    updateConfig(newConfig) {
        // Update message formatter config
        if (this.messageFormatter) {
            const formatterConfig = {
                showTags: newConfig.showTags !== undefined ? newConfig.showTags : this.config.get('bridge.interGuild.showTags'),
                showSourceTag: newConfig.showSourceTag !== undefined ? newConfig.showSourceTag : this.config.get('bridge.interGuild.showSourceTag')
            };
            
            this.messageFormatter.updateConfig(formatterConfig);
        }

        logger.debug('Discord MessageSender configuration updated');
    }

    // ==================== CLEANUP ====================

    /**
     * Cleanup resources
     * 
     * Clears rate limiter, cleans up webhook sender, and releases channel references.
     * Should be called before disposing of the sender instance.
     */
    cleanup() {
        this.rateLimiter.clear();
        
        if (this.webhookSender) {
            this.webhookSender.cleanup();
        }

        this.client = null;
        this.channels = { chat: null, staff: null, statusLog: null };

        logger.debug('Discord MessageSender cleaned up');
    }
}

module.exports = MessageSender;