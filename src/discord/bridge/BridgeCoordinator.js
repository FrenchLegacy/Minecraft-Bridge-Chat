// BridgeCoordinator.js - Complete updated file with event logging functionality

// Specific Imports
const BridgeLocator = require("../../bridgeLocator.js");
const logger = require("../../shared/logger");

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
     * Handle Minecraft guild message
     * @param {object} messageData - Guild message data
     */
    async handleMinecraftMessage(messageData) {
        try {
            logger.debug(`[MC→DC] Processing message: ${JSON.stringify(messageData)}`);
            
            // Skip if message bridging is disabled
            if (!this.routingConfig.guildChatToDiscord && !this.routingConfig.officerChatToDiscord) {
                logger.debug(`[MC→DC] Message bridging disabled, skipping message`);
                return;
            }

            // Get guild configuration
            const guildConfig = this.getGuildConfig(messageData.guildId);
            if (!guildConfig) {
                logger.warn(`Guild configuration not found for message: ${messageData.guildId}`);
                return;
            }

            logger.discord(`[MC→DC] Processing ${messageData.chatType} message from ${guildConfig.name}: ${messageData.username}`);

            // Check if Discord manager is ready
            if (!this.discordManager.isConnected()) {
                logger.warn(`[MC→DC] Discord not connected, skipping message`);
                return;
            }

            // Send to Discord
            logger.debug(`[MC→DC] Sending message to Discord...`);
            const result = await this.discordManager.sendGuildMessage(messageData, guildConfig);
            logger.debug(`[MC→DC] Discord send result: ${JSON.stringify(result)}`);

            logger.discord(`[MC→DC] ✅ Message successfully bridged to Discord`);

        } catch (error) {
            logger.logError(error, `Error bridging Minecraft message to Discord from guild ${messageData.guildId}`);
        }
    }

    /**
     * Handle Minecraft guild event (UPDATED with logging)
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

            logger.debug(`[MC→DC] Sending event log to Discord channels...`);
            await this.sendEventLog(eventData, guildConfig);

            logger.discord(`[MC→DC] ✅ Event successfully bridged to Discord with logging`);

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
            
            // Skip if system message bridging is disabled
            if (!this.routingConfig.systemMessagesToDiscord) {
                logger.debug(`[MC→DC] System message bridging disabled, skipping connection event`);
                return;
            }

            const guildId = connectionData.guildId || connectionData.guild;
            if (!guildId) {
                logger.warn(`No guild ID found in connection data`);
                return;
            }

            // Get guild configuration
            const guildConfig = this.getGuildConfig(guildId);
            if (!guildConfig) {
                logger.warn(`Guild configuration not found for connection event: ${guildId}`);
                return;
            }

            logger.discord(`[MC→DC] Processing connection ${connectionData.type} for ${guildConfig.name}`);

            // Check if Discord manager is ready
            if (!this.discordManager.isConnected()) {
                logger.warn(`[MC→DC] Discord not connected, skipping connection event`);
                return;
            }

            // Send connection status to Discord
            logger.debug(`[MC→DC] Sending connection status to Discord...`);
            const result = await this.discordManager.sendConnectionStatus(
                connectionData.type, 
                guildConfig, 
                connectionData
            );
            logger.debug(`[MC→DC] Discord connection status send result: ${JSON.stringify(result)}`);

            logger.discord(`[MC→DC] ✅ Connection event successfully bridged to Discord`);

        } catch (error) {
            logger.logError(error, `Error bridging Minecraft connection to Discord from guild ${connectionData.guildId || connectionData.guild}`);
        }
    }

    /**
     * Handle Discord message
     * @param {object} messageData - Discord message data
     */
    async handleDiscordMessage(messageData) {
        try {
            logger.debug(`[DC→MC] Processing message: ${JSON.stringify(messageData)}`);
            
            // Skip if Discord to Minecraft bridging is disabled
            if (!this.routingConfig.discordToMinecraft) {
                logger.debug(`[DC→MC] Discord to Minecraft bridging disabled, skipping message`);
                return;
            }

            // Get guild configuration
            const guildConfig = this.getGuildConfig(messageData.guildId);
            if (!guildConfig) {
                logger.warn(`Guild configuration not found for Discord message: ${messageData.guildId}`);
                return;
            }

            logger.discord(`[DC→MC] Processing message from ${guildConfig.name}: ${messageData.author.username}`);

            // Check if Minecraft manager is ready
            if (!this.minecraftManager.isConnected(messageData.guildId)) {
                logger.warn(`[DC→MC] Minecraft not connected for guild ${messageData.guildId}, skipping message`);
                await this.addErrorReaction(messageData);
                return;
            }

            // Send to Minecraft
            logger.debug(`[DC→MC] Sending message to Minecraft...`);
            const result = await this.minecraftManager.sendMessage(messageData, guildConfig);
            logger.debug(`[DC→MC] Minecraft send result: ${JSON.stringify(result)}`);

            logger.discord(`[DC→MC] ✅ Message successfully bridged to Minecraft`);

        } catch (error) {
            logger.logError(error, `Error bridging Discord message to Minecraft from guild ${messageData.guildId}`);
            await this.addErrorReaction(messageData);
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
            .setFooter({ text: '🔧 Guild Command System' });

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
        
                    embed.addFields({ 
                        name: '🎯 Target Player', 
                        value: playerValue, 
                        inline: false 
                    });
                }
            } catch (error) {
                logger.debug(`Failed to fetch UUID for ${eventData.username}`, error);
            }
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
            details.push(`**Raw Message: **${rawMessage}`);
        }

        return details.length > 0 ? details.join('\n') : 'Event detected successfully';
    }

    /**
     * Capitalize first letter of a string (matching command format)
     * @param {string} str - String to capitalize
     * @returns {string} Capitalized string
     */
    capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // ==================== HELPER METHODS ====================

    /**
     * Get guild configuration by ID
     * @param {string} guildId - Guild ID
     * @returns {object|null} Guild configuration
     */
    getGuildConfig(guildId) {
        const guilds = this.config.get('guilds') || [];
        return guilds.find(guild => guild.id === guildId);
    }

    /**
     * Add error reaction to Discord message
     * @param {object} messageData - Original Discord message data
     */
    async addErrorReaction(messageData) {
        try {
            if (!messageData.messageRef) {
                logger.warn('Cannot add error reaction - message reference not available');
                return;
            }

            const message = messageData.messageRef;
            await message.react('❌');
            
            logger.debug(`Added error reaction to message from ${messageData.author.username}`);
        } catch (error) {
            logger.logError(error, 'Failed to add error reaction');
        }
    }

    /**
     * Clean up bridge coordinator
     */
    cleanup() {
        logger.debug('BridgeCoordinator cleanup completed');
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