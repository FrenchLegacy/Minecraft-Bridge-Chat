/**
 * Webhook Sender - Discord Webhook Message Relay System
 * 
 * This file handles sending Minecraft messages to Discord channels using webhooks.
 * Webhooks allow messages to appear with custom usernames and avatars, making the
 * bridge experience more immersive by displaying Minecraft player names and skins
 * directly in Discord instead of showing messages from a single bot account.
 * 
 * The sender provides:
 * - Webhook management for chat and staff channels
 * - Automatic webhook creation with proper permissions
 * - Message formatting with custom usernames and avatars
 * - Minecraft skin avatar integration (via Minotar API)
 * - Avatar caching system to reduce API calls
 * - Guild tag support for multi-guild setups
 * - Security features (disabled mentions)
 * - Thread support compatibility
 * - Dynamic configuration updates
 * 
 * Webhook Benefits:
 * - Messages appear with Minecraft player names
 * - Player skins shown as Discord avatars
 * - More natural conversation flow
 * - Better visual distinction between players
 * - Supports guild tags for multi-guild bridging
 * 
 * Avatar System:
 * - Uses configurable avatar API (default: Minotar)
 * - Caches avatars for 5 minutes to reduce API load
 * - Automatic cache cleanup for expired entries
 * - Fallback to Steve skin for unknown players
 * 
 * Security:
 * - Disables all mentions by default to prevent abuse
 * - Requires ManageWebhooks permission for creation
 * - Validates channel types before webhook operations
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { WebhookClient } = require('discord.js');

// Specific Imports
const BridgeLocator = require("../../../bridgeLocator.js");
const logger = require("../../../shared/logger");

/**
 * WebhookSender - Manages Discord webhook message delivery
 * 
 * Handles webhook initialization, message sending, avatar management, and
 * provides a seamless integration between Minecraft player identities and Discord.
 * 
 * @class
 */
class WebhookSender {
    /**
     * Create a new WebhookSender instance
     * Initializes configuration, webhook storage, and avatar caching system
     */
    constructor() {
        const mainBridge = BridgeLocator.getInstance();
        this.config = mainBridge.config;

        this.client = null;
        this.webhooks = {
            chat: null,
            staff: null
        };

        this.webhookConfig = this.config.get('bridge.webhook') || {};
        this.avatarAPI = this.webhookConfig.avatarAPI || 'https://minotar.net/helm/{username}/64.png';

        // Cache for user avatars to reduce API calls
        this.avatarCache = new Map();
        this.avatarCacheTimeout = 5 * 60 * 1000; // 5 minutes

        logger.debug('WebhookSender initialized');
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize with Discord client
     * 
     * Sets up webhook clients for chat and staff channels.
     * Attempts to use configured webhook URLs or creates new webhooks if needed.
     * 
     * @async
     * @param {Client} client - Discord client instance
     * @throws {Error} If webhook initialization fails
     */
    async initialize(client) {
        this.client = client;

        try {
            await this.setupWebhooks();
            logger.discord('WebhookSender initialized with Discord client');
        } catch (error) {
            logger.logError(error, 'Failed to initialize WebhookSender');
            throw error;
        }
    }

    /**
     * Setup webhooks for chat and staff channels
     * 
     * Initializes webhook clients from configuration URLs or creates new webhooks
     * if no URLs are configured. Handles both chat and staff channel webhooks.
     * 
     * @async
     * @private
     */
    async setupWebhooks() {
        const bridgeConfig = this.config.get('bridge.channels');

        // Setup chat channel webhook
        if (bridgeConfig.chat.webhookUrl) {
            try {
                this.webhooks.chat = new WebhookClient({ url: bridgeConfig.chat.webhookUrl });
                logger.debug('Chat channel webhook initialized');
            } catch (error) {
                logger.logError(error, 'Failed to initialize chat webhook');
            }
        } else {
            // Try to create webhook for chat channel
            await this.createWebhookForChannel('chat');
        }

        // Setup staff channel webhook
        if (bridgeConfig.staff.webhookUrl) {
            try {
                this.webhooks.staff = new WebhookClient({ url: bridgeConfig.staff.webhookUrl });
                logger.debug('Staff channel webhook initialized');
            } catch (error) {
                logger.logError(error, 'Failed to initialize staff webhook');
            }
        } else {
            // Try to create webhook for staff channel
            await this.createWebhookForChannel('staff');
        }

        logger.discord(`WebhookSender setup complete - Chat: ${!!this.webhooks.chat}, Staff: ${!!this.webhooks.staff}`);
    }

    /**
     * Create webhook for a specific channel
     * 
     * Creates a new webhook in the specified channel if the bot has ManageWebhooks permission.
     * Logs the webhook URL that should be added to configuration.
     * 
     * @async
     * @private
     * @param {string} channelType - Channel type ('chat' or 'staff')
     */
    async createWebhookForChannel(channelType) {
        try {
            const bridgeConfig = this.config.get('bridge.channels');
            const channelId = bridgeConfig[channelType].id;

            const channel = await this.client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) {
                throw new Error(`Invalid channel for webhook creation: ${channelType}`);
            }

            // Check if we have permission to create webhooks
            const botMember = await channel.guild.members.fetch(this.client.user.id);
            if (!botMember.permissions.has('ManageWebhooks')) {
                logger.warn(`Missing ManageWebhooks permission for ${channelType} channel`);
                return;
            }

            // Create webhook
            const webhook = await channel.createWebhook({
                name: `Minecraft Bridge - ${channelType.charAt(0).toUpperCase() + channelType.slice(1)}`,
                avatar: 'https://minotar.net/helm/steve/64.png', // Default Minecraft avatar
                reason: 'Created by Minecraft Bridge Chat bot for message relaying'
            });

            this.webhooks[channelType] = webhook;
            
            logger.discord(`Created webhook for ${channelType} channel: ${webhook.id}`);
            logger.info(`💡 Add this webhook URL to your config: ${webhook.url}`);

        } catch (error) {
            logger.logError(error, `Failed to create webhook for ${channelType} channel`);
        }
    }

    // ==================== MESSAGE SENDING ====================

    /**
     * Send message via webhook
     * 
     * Sends a formatted message to Discord using the webhook for the specified channel.
     * Builds a webhook payload with custom username and avatar, then sends it.
     * 
     * @async
     * @param {string} message - Formatted message content
     * @param {object} messageData - Original message data from Minecraft
     * @param {object} guildConfig - Guild configuration object
     * @param {string} channelType - Channel type ('chat' or 'staff')
     * @returns {Promise<Message>} Sent Discord message
     * @throws {Error} If webhook is not available or send fails
     */
    async sendMessage(message, messageData, guildConfig, channelType) {
        try {
            const webhook = this.webhooks[channelType];
            if (!webhook) {
                throw new Error(`No webhook available for ${channelType} channel`);
            }

            // Build webhook payload
            const payload = await this.buildWebhookPayload(message, messageData, guildConfig);

            // Send via webhook
            const result = await webhook.send(payload);
            
            logger.debug(`[DISCORD] Sent webhook message to ${channelType} channel as ${payload.username}`);

            return result;

        } catch (error) {
            logger.logError(error, `Failed to send webhook message to ${channelType} channel`);
            throw error;
        }
    }

    /**
     * Build webhook payload
     * 
     * Constructs the webhook payload object with formatted content, custom username,
     * player avatar, and security settings (disabled mentions).
     * 
     * @async
     * @private
     * @param {string} message - Message content
     * @param {object} messageData - Original message data
     * @param {string} messageData.username - Minecraft username
     * @param {object} guildConfig - Guild configuration
     * @returns {Promise<object>} Webhook payload object
     */
    async buildWebhookPayload(message, messageData, guildConfig) {
        const username = messageData.username || 'Unknown';
        const avatarUrl = await this.getUserAvatar(username);

        const payload = {
            content: message,
            username: this.formatWebhookUsername(username, guildConfig),
            avatarURL: avatarUrl,
            allowedMentions: {
                parse: [] // Disable all mentions for security
            }
        };

        // Add thread support if message is in a thread
        // This would be expanded based on Discord.js version and thread requirements

        return payload;
    }

    /**
     * Format username for webhook display
     * 
     * Formats the username for display in Discord, optionally adding guild tags
     * for multi-guild setups when source tagging is enabled.
     * 
     * @private
     * @param {string} username - Original Minecraft username
     * @param {object} guildConfig - Guild configuration
     * @param {string} guildConfig.tag - Guild tag for display
     * @returns {string} Formatted username with optional guild tag
     */
    formatWebhookUsername(username, guildConfig) {
        const interGuildConfig = this.config.get('bridge.interGuild');
        
        // Add guild tag if enabled
        if (interGuildConfig.showSourceTag && guildConfig.tag) {
            return `[${guildConfig.tag}] ${username}`;
        }

        return username;
    }

    // ==================== AVATAR MANAGEMENT ====================

    /**
     * Get user avatar URL with caching
     * 
     * Retrieves the avatar URL for a Minecraft username, using cached values
     * when available to reduce API calls. Cache entries expire after 5 minutes.
     * 
     * @async
     * @param {string} username - Minecraft username
     * @returns {Promise<string>} Avatar URL for the player
     */
    async getUserAvatar(username) {
        if (!username) {
            return this.getDefaultAvatar();
        }

        // Check cache first
        const cacheKey = username.toLowerCase();
        const cachedAvatar = this.avatarCache.get(cacheKey);
        
        if (cachedAvatar && (Date.now() - cachedAvatar.timestamp) < this.avatarCacheTimeout) {
            return cachedAvatar.url;
        }

        // Generate avatar URL
        const avatarUrl = this.avatarAPI.replace('{username}', username);

        // Cache the avatar
        this.avatarCache.set(cacheKey, {
            url: avatarUrl,
            timestamp: Date.now()
        });

        return avatarUrl;
    }

    /**
     * Get default avatar URL
     * 
     * Returns the default Minecraft Steve avatar URL for use when
     * a player-specific avatar is not available.
     * 
     * @returns {string} Default avatar URL (Steve skin)
     */
    getDefaultAvatar() {
        return 'https://minotar.net/helm/steve/64.png';
    }

    /**
     * Clean up avatar cache
     * 
     * Removes expired entries from the avatar cache to prevent memory leaks.
     * Called periodically to maintain cache efficiency.
     */
    cleanupAvatarCache() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, data] of this.avatarCache.entries()) {
            if (now - data.timestamp > this.avatarCacheTimeout) {
                this.avatarCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug(`Cleaned up ${cleaned} expired avatar cache entries`);
        }
    }

    // ==================== CONFIGURATION ====================

    /**
     * Update webhook configuration
     * 
     * Updates webhook configuration with new settings. Clears avatar cache
     * if the avatar API URL has changed to ensure fresh data.
     * 
     * @async
     * @param {object} newConfig - New webhook configuration
     * @param {string} newConfig.avatarAPI - New avatar API URL (optional)
     */
    async updateConfig(newConfig) {
        const oldAvatarAPI = this.avatarAPI;
        
        this.webhookConfig = { ...this.webhookConfig, ...newConfig };
        this.avatarAPI = newConfig.avatarAPI || this.avatarAPI;

        // Clear avatar cache if API changed
        if (oldAvatarAPI !== this.avatarAPI) {
            this.avatarCache.clear();
            logger.debug('Avatar cache cleared due to API change');
        }

        logger.debug('WebhookSender configuration updated');
    }

    // ==================== WEBHOOK ACCESS ====================

    /**
     * Check if webhook is available for channel type
     * 
     * Verifies whether a webhook is configured and available for
     * the specified channel type.
     * 
     * @param {string} channelType - Channel type ('chat' or 'staff')
     * @returns {boolean} Whether webhook is available
     */
    hasWebhook(channelType) {
        return !!this.webhooks[channelType];
    }

    /**
     * Get webhook client for channel type
     * 
     * Returns the webhook client for the specified channel type,
     * or null if no webhook is configured.
     * 
     * @param {string} channelType - Channel type ('chat' or 'staff')
     * @returns {WebhookClient|null} Webhook client or null
     */
    getWebhook(channelType) {
        return this.webhooks[channelType] || null;
    }

    // ==================== CLEANUP ====================

    /**
     * Cleanup resources
     * 
     * Clears avatar cache and destroys webhook clients.
     * Should be called before disposing of the sender instance.
     */
    cleanup() {
        // Clear avatar cache
        this.avatarCache.clear();

        // Destroy webhook clients
        for (const [channelType, webhook] of Object.entries(this.webhooks)) {
            if (webhook && typeof webhook.destroy === 'function') {
                try {
                    webhook.destroy();
                } catch (error) {
                    logger.debug(`Error destroying ${channelType} webhook: ${error.message}`);
                }
            }
        }

        this.webhooks = { chat: null, staff: null };

        logger.debug('WebhookSender cleaned up');
    }
}

module.exports = WebhookSender;