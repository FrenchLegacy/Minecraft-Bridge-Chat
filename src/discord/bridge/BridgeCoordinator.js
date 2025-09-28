// Specific Imports
const BridgeLocator = require("../../bridgeLocator.js");
const logger = require("../../shared/logger");

const CommandResponseListener = require("../client/handlers/CommandResponseListener.js");

class BridgeCoordinator {
    constructor() {
        const mainBridge = BridgeLocator.getInstance();
        this.config = mainBridge.config;

        this.bridgeConfig = this.config.get('bridge');
        
        // References to managers
        this.discordManager = null;
        this.minecraftManager = null;

        // Message routing configuration
        this.routingConfig = {
            guildChatToDiscord: true,
            officerChatToDiscord: true,
            eventsToDiscord: true,
            discordToMinecraft: true,
            systemMessagesToDiscord: true
        };

        logger.debug('BridgeCoordinator initialized');
    }

    /**
     * Initialize coordinator with manager references
     * @param {object} discordManager - Discord manager instance
     * @param {object} minecraftManager - Minecraft manager instance
     */
    initialize(discordManager, minecraftManager) {
        logger.debug('[BRIDGE] BridgeCoordinator.initialize called');
        
        this.discordManager = discordManager;
        this.minecraftManager = minecraftManager;

        logger.debug(`[BRIDGE] Managers set - Discord: ${!!discordManager}, Minecraft: ${!!minecraftManager}`);
        
        this.setupMinecraftToDiscordBridge();
        this.setupDiscordToMinecraftBridge();

        logger.bridge('BridgeCoordinator initialized with manager references');
    }

    /**
     * Setup Minecraft to Discord message bridging
     */
    setupMinecraftToDiscordBridge() {
        if (!this.minecraftManager) {
            logger.warn('Minecraft manager not available for bridge setup');
            return;
        }

        if (!this.discordManager) {
            logger.warn('Discord manager not available for bridge setup');
            return;
        }

        logger.debug('[BRIDGE] Setting up Minecraft to Discord event handlers...');

        // Handle Minecraft messages
        this.minecraftManager.onMessage((messageData) => {
            logger.debug(`[BRIDGE] Received Minecraft message event: ${JSON.stringify(messageData)}`);
            this.handleMinecraftMessage(messageData);
        });

        // Handle Minecraft events
        this.minecraftManager.onEvent((eventData) => {
            logger.debug(`[BRIDGE] Received Minecraft event: ${JSON.stringify(eventData)}`);
            this.handleMinecraftEvent(eventData);
        });

        // Handle Minecraft connection events
        this.minecraftManager.onConnection((connectionData) => {
            logger.debug(`[BRIDGE] Received Minecraft connection event: ${JSON.stringify(connectionData)}`);
            this.handleMinecraftConnection(connectionData);
        });

        logger.bridge('✅ Minecraft to Discord bridge setup completed');
    }

    /**
     * Setup Discord to Minecraft message bridging
     */
    setupDiscordToMinecraftBridge() {
        if (!this.discordManager) {
            logger.warn('Discord manager not available for bridge setup');
            return;
        }

        if (!this.minecraftManager) {
            logger.warn('Minecraft manager not available for bridge setup');
            return;
        }

        logger.debug('[BRIDGE] Setting up Discord to Minecraft event handlers...');

        // Handle Discord messages
        this.discordManager.onMessage((messageData) => {
            logger.debug(`[BRIDGE] Received Discord message event: ${JSON.stringify(messageData)}`);
            this.handleDiscordMessage(messageData);
        });

        logger.bridge('✅ Discord to Minecraft bridge setup completed');
    }

    /**
     * Handle Minecraft message (Minecraft to Discord bridging)
     * @param {object} messageData - Minecraft message data
     */
    async handleMinecraftMessage(messageData) {
        try {
            logger.debug(`[MC→DC] Processing message: ${JSON.stringify(messageData)}`);
            
            // Skip if Discord manager is not connected
            if (!this.discordManager.isConnected()) {
                logger.warn(`[MC→DC] Discord not connected, skipping message`);
                return;
            }

            // Get guild configuration
            const guildConfig = this.getGuildConfig(messageData.guildId);
            if (!guildConfig) {
                logger.warn(`Guild configuration not found for message: ${messageData.guildId}`);
                return;
            }

            logger.discord(`[MC→DC] Processing message from ${guildConfig.name}: ${messageData.username}`);

            // Send to Discord
            await this.discordManager.sendGuildMessage(messageData, guildConfig);

            logger.discord(`[MC→DC] ✅ Message successfully bridged to Discord`);

        } catch (error) {
            logger.logError(error, `Error bridging Minecraft message to Discord from guild ${messageData.guildId}`);
        }
    }

    /**
     * Handle Minecraft guild event (UPDATED with double-logging prevention)
     * @param {object} eventData - Parsed guild event data
     */
    async handleMinecraftEvent(eventData) {
        try {
            logger.debug(`[MC→DC] Processing event: ${JSON.stringify(eventData)}`);
            
            // Skip if event bridging is disabled
            if (!this.routingConfig.eventsToDiscord) {
                logger.debug(`[MC→DC] Event bridging disabled, skipping event`);
                return;
            }

            // Get guild configuration
            const guildConfig = this.getGuildConfig(eventData.guildId);
            if (!guildConfig) {
                logger.warn(`Guild configuration not found for event: ${eventData.guildId}`);
                return;
            }

            logger.discord(`[MC→DC] Processing ${eventData.type} event from ${guildConfig.name}: ${eventData.username || 'system'}`);

            // Check if Discord manager is ready
            if (!this.discordManager.isConnected()) {
                logger.warn(`[MC→DC] Discord not connected, skipping event`);
                return;
            }

            // Send to Discord chat (existing functionality)
            logger.debug(`[MC→DC] Sending event to Discord chat...`);
            const result = await this.discordManager.sendGuildEvent(eventData, guildConfig);
            logger.debug(`[MC→DC] Discord event send result: ${JSON.stringify(result)}`);

            // DOUBLE-LOGGING FIX: Check if there's an active Discord command listener for this event
            logger.debug(`[MC→DC] ================================`);
            logger.debug(`[MC→DC] DOUBLE-LOGGING CHECK START`);
            logger.debug(`[MC→DC] Event: ${eventData.type} - Player: ${eventData.username} - Guild: ${eventData.guildId}`);
            logger.debug(`[MC→DC] ================================`);
            
            const CommandResponseListener = require("../client/handlers/CommandResponseListener.js");
            
            // Check if CommandResponseListener class exists
            logger.debug(`[MC→DC] CommandResponseListener class available: ${!!CommandResponseListener}`);
            
            // Check if singleton instance exists
            logger.debug(`[MC→DC] CommandResponseListener.instance exists: ${!!CommandResponseListener.instance}`);
            
            // Try to get instance
            let instance = null;
            try {
                instance = CommandResponseListener.getInstance();
                logger.debug(`[MC→DC] Got singleton instance: ${!!instance}`);
            } catch (error) {
                logger.debug(`[MC→DC] Error getting singleton instance:`, error);
            }
            
            const hasActiveListener = CommandResponseListener.hasActiveListenerForEvent(eventData);
            logger.debug(`[MC→DC] ================================`);
            logger.debug(`[MC→DC] FINAL RESULT: hasActiveListener = ${hasActiveListener}`);
            logger.debug(`[MC→DC] ================================`);
            
            if (hasActiveListener) {
                logger.debug(`[MC→DC] ✅ Skipping event log - Discord command listener will handle logging for ${eventData.type} event`);
            } else {
                logger.debug(`[MC→DC] ❌ No active listener found - sending event log to Discord channels...`);
                await this.sendEventLog(eventData, guildConfig);
            }

            logger.discord(`[MC→DC] ✅ Event successfully bridged to Discord ${hasActiveListener ? 'without duplicate logging' : 'with logging'}`);

        } catch (error) {
            logger.logError(error, `Error bridging Minecraft event to Discord from guild ${eventData.guildId}`);
        }
    }

    /**
     * Handle Minecraft connection events
     * @param {object} connectionData - Connection event data
     */
    async handleMinecraftConnection(connectionData) {
        try {
            logger.debug(`[MC→DC] Processing connection event: ${JSON.stringify(connectionData)}`);
            
            // Skip if Discord manager is not connected
            if (!this.discordManager.isConnected()) {
                logger.warn(`[MC→DC] Discord not connected, skipping connection event`);
                return;
            }

            // Get guild configuration
            const guildConfig = this.getGuildConfig(connectionData.guildId);
            if (!guildConfig) {
                logger.warn(`Guild configuration not found for connection event: ${connectionData.guildId}`);
                return;
            }

            logger.discord(`[MC→DC] Processing ${connectionData.type} connection event from ${guildConfig.name}`);

            // Send to Discord
            await this.discordManager.sendConnectionEvent(connectionData, guildConfig);

            logger.discord(`[MC→DC] ✅ Connection event successfully bridged to Discord`);

        } catch (error) {
            logger.logError(error, `Error bridging Minecraft connection event to Discord from guild ${connectionData.guildId}`);
        }
    }

    /**
     * Handle Discord message (Discord to Minecraft bridging)
     * @param {object} messageData - Discord message data
     */
    async handleDiscordMessage(messageData) {
        let successCount = 0;
        let errorCount = 0;
        let connectedGuilds = [];

        try {
            logger.debug(`[DC→MC] Processing message: ${JSON.stringify(messageData)}`);
            
            // Skip if Discord to Minecraft bridging is disabled
            if (!this.routingConfig.discordToMinecraft) {
                logger.debug(`[DC→MC] Discord to Minecraft bridging disabled, skipping message`);
                return;
            }

            // Validate message data
            if (!messageData || !messageData.content || !messageData.author) {
                logger.debug(`[DC→MC] Invalid message data, skipping`);
                return;
            }

            // Check if Minecraft manager is ready
            if (!this.minecraftManager || !this.minecraftManager._isStarted) {
                const error = new Error('Minecraft manager not ready');
                await this.handleBridgeError(messageData, error, 0, 0);
                return;
            }

            // Determine target chat type based on Discord channel
            const chatType = this.determineChatTypeFromChannel(messageData.channelType);
            if (!chatType) {
                logger.debug(`[DC→MC] Unknown channel type: ${messageData.channelType}, skipping message`);
                return;
            }

            // Get connected Minecraft guilds
            connectedGuilds = this.minecraftManager.getConnectedGuilds();
            if (!connectedGuilds || connectedGuilds.length === 0) {
                const error = new Error('No connected Minecraft guilds available');
                await this.handleBridgeError(messageData, error, 0, 0);
                return;
            }

            // Format message for Minecraft
            const formattedMessage = this.formatDiscordMessageForMinecraft(messageData, chatType);
            
            logger.discord(`[DC→MC] Processing ${chatType} message from Discord: ${messageData.author.displayName} -> "${messageData.content}"`);

            // Send message to all connected guilds with error tracking
            const deliveryPromises = connectedGuilds.map(async (guildInfo) => {
                try {
                    await this.sendMessageToMinecraft(guildInfo.guildId, formattedMessage, chatType);
                    logger.bridge(`[DC→MC] ✅ ${chatType} message sent to ${guildInfo.guildName}`);
                    return { success: true, guildInfo };
                } catch (error) {
                    logger.logError(error, `Failed to send ${chatType} message to guild ${guildInfo.guildName}`);
                    return { success: false, guildInfo, error };
                }
            });

            // Wait for all deliveries to complete
            const results = await Promise.allSettled(deliveryPromises);
            
            // Count actual successes and failures
            successCount = 0;
            errorCount = 0;
            let firstError = null;

            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    if (result.value.success) {
                        successCount++;
                    } else {
                        errorCount++;
                        if (!firstError) {
                            firstError = result.value.error || new Error('Unknown delivery error');
                        }
                    }
                } else {
                    errorCount++;
                    if (!firstError) {
                        firstError = result.reason || new Error('Unknown delivery error');
                    }
                }
            });

            if (errorCount > 0) {
                // Some deliveries failed
                await this.handleBridgeError(messageData, firstError, successCount, connectedGuilds.length);
            } else {
                // All deliveries successful - no success reaction, just log
                logger.discord(`[DC→MC] ✅ Discord message bridged successfully to all ${connectedGuilds.length} Minecraft guilds`);
            }

        } catch (error) {
            logger.logError(error, `Unexpected error bridging Discord message to Minecraft`);
            await this.handleBridgeError(messageData, error, successCount, connectedGuilds.length);
        }
    }

    /**
     * Get appropriate log channel for event type
     * @param {string} eventType - Type of event
     * @param {object} logChannels - Log channels configuration
     * @returns {string} Channel ID to use
     */
    determineChatTypeFromChannel(channelType) {
        switch (channelType) {
            case 'chat':
                return 'guild';
            case 'staff':
                return 'officer';
            default:
                return null;
        }
    }

    /**
     * Format Discord message for Minecraft
     * @param {object} messageData - Discord message data
     * @param {string} chatType - Target chat type (guild/officer)
     * @returns {string} Formatted message
     */
    formatDiscordMessageForMinecraft(messageData, chatType) {
        const username = messageData.author.displayName || messageData.author.username;
        const content = messageData.content;
        
        // Add Discord prefix to distinguish from native Minecraft messages
        const prefix = "Discord >";
        
        // Format: Discord > Username: message content
        return `${prefix} ${username}: ${content}`;
    }

    /**
     * Send message to Minecraft guild
     * @param {string} guildId - Guild ID
     * @param {string} message - Formatted message
     * @param {string} chatType - Chat type (guild/officer)
     */
    async sendMessageToMinecraft(guildId, message, chatType) {
        try {
            // For officer chat, use /oc command, for guild chat use /gc command
            const command = chatType === 'officer' ? `/oc ${message}` : `/gc ${message}`;
            
            // Use executeCommand instead of sendMessage for proper guild chat commands
            await this.minecraftManager.executeCommand(guildId, command);
            
        } catch (error) {
            logger.logError(error, `Failed to send ${chatType} message to guild ${guildId}`);
            throw error;
        }
    }

    /**
     * Send event log to Discord channel
     * @param {object} eventData - Event data from Minecraft
     * @param {object} guildConfig - Guild configuration
     */
    async sendEventLog(eventData, guildConfig) {
        try {
            const mainBridge = BridgeLocator.getInstance();
            const discordManager = mainBridge.getDiscordManager?.();
            
            if (!discordManager || !discordManager.isConnected()) {
                logger.debug('Discord manager not available for event logging');
                return;
            }

            // Get Discord bot client
            const client = discordManager._discordBot?.getClient();
            if (!client) {
                logger.debug('Discord client not available for event logging');
                return;
            }

            // Get log channels configuration
            const config = mainBridge.config;
            const logChannels = config.get('discord.logChannels');
            if (!logChannels) {
                logger.debug('No log channels configured for event logging');
                return;
            }

            // Determine which channel to use based on event type
            const channelId = this.getEventLogChannel(eventData.type, logChannels);
            
            if (!channelId || channelId.trim() === '') {
                logger.debug(`No log channel configured for event type: ${eventData.type}`);
                return;
            }

            // Get the channel
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                logger.warn(`Could not find Discord log channel: ${channelId}`);
                return;
            }

            // Create embed for the event log
            const embed = await this.createEventLogEmbed(eventData, guildConfig);

            // Send the log
            await channel.send({ embeds: [embed] });

            logger.discord(`[EVENT-LOG] Logged ${eventData.type} event to Discord channel ${channel.name}`);

        } catch (error) {
            logger.logError(error, `Failed to send event log to Discord for ${eventData.type} event`);
        }
    }

    /**
     * Get appropriate log channel for event type
     * @param {string} eventType - Type of event
     * @param {object} logChannels - Log channels configuration
     * @returns {string} Channel ID to use
     */
    getEventLogChannel(eventType, logChannels) {
        // Map event types to channel configurations
        const eventChannelMap = {
            'join': logChannels.invite || logChannels.default,
            'leave': logChannels.kick || logChannels.default, 
            'kick': logChannels.kick || logChannels.default,
            'promote': logChannels.promote || logChannels.default,
            'demote': logChannels.demote || logChannels.default,
            'setrank': logChannels.setrank || logChannels.default,
            'invite': logChannels.invite || logChannels.default,
            'level': logChannels.default,
            'motd': logChannels.default,
            'misc': logChannels.default
        };

        return eventChannelMap[eventType] || logChannels.default;
    }

    /**
     * Create Discord embed for event log (matching command log format)
     * @param {object} eventData - Event data
     * @param {object} guildConfig - Guild configuration
     * @returns {EmbedBuilder} Discord embed
     */
    async createEventLogEmbed(eventData, guildConfig) {
        const { EmbedBuilder } = require('discord.js');
        
        // Use green color like successful commands (events detected are always "successful")
        const statusColor = 0x00FF00; // Green
        const statusEmoji = '✅';

        const embed = new EmbedBuilder()
            .setTitle(`${statusEmoji} ${this.capitalizeFirst(eventData.type)} Event Detected`)
            .setColor(statusColor)
            .setTimestamp()
            .setFooter({ text: '🔧 Guild Event System' });

        // Add guild information (same format as commands)
        embed.addFields({ 
            name: '🏰 Guild', 
            value: `**${guildConfig.name}**`, 
            inline: false 
        });

        // Add player information if available (equivalent to "Target Player")
        if (eventData.username && eventData.username !== 'system') {
            let playerValue = `\`${eventData.username}\``;
            
            try {
                const uuid = await fetchMinecraftUUID(eventData.username);
                if (uuid) {
                    // Format UUID with dashes (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
                    const formattedUUID = uuid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
                    playerValue = `\`${eventData.username}\` • \`${formattedUUID}\``;
                }
            } catch (error) {
                logger.debug(`Failed to fetch UUID for ${eventData.username}`, error);
            }
        
            embed.addFields({ 
                name: '🎯 Target Player', 
                value: playerValue, 
                inline: false 
            });
        }

        // Add event details (equivalent to "Response")
        const eventDetails = this.buildEventDetails(eventData);
        embed.addFields({
            name: '📝 Details',
            value: eventDetails,
            inline: false
        });

        return embed;
    }

    /**
     * Build event details string (matching command response format)
     * @param {object} eventData - Event data
     * @returns {string} Event details
     */
    buildEventDetails(eventData) {
        let details = [];

        // Add event-specific information
        switch (eventData.type) {
            case 'promote':
            case 'demote':
                if (eventData.fromRank && eventData.toRank) {
                    details.push(`**Rank Change:** ${eventData.fromRank} → ${eventData.toRank}`);
                }
                break;
                
            case 'setrank':
                if (eventData.rank) {
                    details.push(`**New Rank:** ${eventData.rank}`);
                }
                break;
                
            case 'level':
                if (eventData.level) {
                    details.push(`**Guild Level:** ${eventData.level}`);
                }
                break;
                
            case 'kick':
                if (eventData.reason) {
                    details.push(`**Reason:** ${eventData.reason}`);
                }
                break;
        }

        // Add raw message if available (formatted like command logs)
        if (eventData.raw) {
            const rawMessage = eventData.raw.length > 500 ? eventData.raw.substring(0, 500) + '...' : eventData.raw;
            details.push(`**Raw Message:** \`${rawMessage}\``);
        }

        return details.length > 0 ? details.join('\n') : 'Event detected successfully';
    }

    /**
     * Capitalize first letter of a string
     * @param {string} str - String to capitalize
     * @returns {string} Capitalized string
     */
    capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Get guild configuration by guild ID
     * @param {string} guildId - Guild ID
     * @returns {object|null} Guild configuration
     */
    getGuildConfig(guildId) {
        try {
            const guildConfigs = this.config.get('guilds') || [];
            return guildConfigs.find(guild => guild.id === guildId) || null;
        } catch (error) {
            logger.logError(error, `Error getting guild config for ID: ${guildId}`);
            return null;
        }
    }

    /**
     * Add error reaction to Discord message
     * @param {object} messageData - Discord message data
     */
    async addErrorReaction(messageData) {
        try {
            if (messageData.message && typeof messageData.message.react === 'function') {
                await messageData.message.react('❌');
            }
        } catch (error) {
            logger.debug('Failed to add error reaction:', error);
        }
    }

    /**
     * Cleanup all listeners
     */
    cleanup() {
        try {
            try {
                if (CommandResponseListener.instance) {
                    CommandResponseListener.instance.cleanup();
                }
            } catch (error) {
                logger.error('Error cleaning up CommandResponseListener:', error);
            }
            
            // Reset manager references
            if (this.discordManager) {
                this.discordManager = null;
            }
            
            if (this.minecraftManager) {
                this.minecraftManager = null;
            }
            
            // Reset routing configuration to defaults
            this.routingConfig = {
                guildChatToDiscord: true,
                officerChatToDiscord: true,
                eventsToDiscord: true,
                discordToMinecraft: true,
                systemMessagesToDiscord: true
            };
            
            logger.bridge('✅ BridgeCoordinator cleanup completed');
            
        } catch (error) {
            logger.logError(error, 'Error during BridgeCoordinator cleanup');
        }
    }

    /**
     * Get current routing configuration
     * @returns {object} Current routing configuration
     */
    getRoutingConfig() {
        return { ...this.routingConfig };
    }
}

// Function to fetch Minecraft UUID
async function fetchMinecraftUUID(username) {
    try {
        const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`);
        if (response.ok) {
            const data = await response.json();
            return data.id;
        }
    } catch (error) {
        logger.debug(`Could not fetch UUID for player ${username}`, error);
    }
    return null;
}

module.exports = BridgeCoordinator;