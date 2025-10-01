/**
 * Message Handler - Discord Message Processing
 * 
 * This file handles incoming Discord messages and processes them for bridging to Minecraft.
 * It filters messages, handles commands, and formats messages for transmission to Minecraft bots.
 * 
 * The handler provides:
 * - Message filtering (bot messages, monitored channels)
 * - Command detection and processing
 * - Message formatting for Minecraft chat limits
 * - Channel validation and caching
 * - Event emission for processed messages
 * 
 * Messages from Discord are cleaned (mentions, emojis, formatting) and truncated
 * to fit Minecraft's chat length limits before being sent to the bridge.
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { EmbedBuilder: DiscordEmbedBuilder } = require('discord.js');
const EventEmitter = require('events');

// Specific Imports
const BridgeLocator = require("../../../bridgeLocator.js");
const MessageFormatter = require("../../../shared/MessageFormatter.js");
const logger = require("../../../shared/logger");

/**
 * MessageHandler - Process incoming Discord messages
 * 
 * Extends EventEmitter to emit processed messages for the bridge system.
 * Handles message validation, filtering, and formatting.
 * 
 * @class
 * @extends EventEmitter
 */
class MessageHandler extends EventEmitter {
    /**
     * Create a new MessageHandler instance
     * Initializes configuration and message filtering
     */
    constructor() {
        super();

        const mainBridge = BridgeLocator.getInstance();
        this.config = mainBridge.config;

        this.client = null;
        this.messageFormatter = null;

        this.channels = {
            chat: null,
            staff: null
        };

        // Message filtering
        this.botUsers = new Set(); // Bot users to ignore
        this.commandPrefix = this.config.get('bridge.commandPrefix') || '!';

        // Initialize components that don't require Discord client
        this.initializeComponents();
    }

    /**
     * Initialize components that don't require Discord client
     * 
     * Sets up the message formatter with appropriate configuration
     * for processing Discord messages into Minecraft-compatible format.
     * 
     * @private
     */
    initializeComponents() {
        try {
            // Initialize message formatter for processing Discord messages
            const formatterConfig = {
                showTags: this.config.get('bridge.interGuild.showTags') || false,
                showSourceTag: false, // We don't need source tags for incoming messages
                enableDebugLogging: this.config.get('features.messageSystem.enableDebugLogging') || false,
                maxMessageLength: 256, // Minecraft chat limit
                fallbackToBasic: true
            };

            this.messageFormatter = new MessageFormatter(formatterConfig);

            logger.debug('MessageHandler components initialized');

        } catch (error) {
            logger.logError(error, 'Failed to initialize MessageHandler components');
            throw error;
        }
    }

    /**
     * Initialize with Discord client
     * 
     * Called after Discord client is ready. Validates and caches channels,
     * and adds the bot's own user ID to the ignore list.
     * 
     * @async
     * @param {Client} client - Discord client instance
     * @throws {Error} If client is not provided or channel validation fails
     */
    async initialize(client) {
        if (!client) {
            throw new Error('Discord client is required for MessageHandler initialization');
        }

        this.client = client;

        try {
            // Get and cache channels
            await this.validateAndCacheChannels();

            // Add bot user to ignore list
            if (client.user) {
                this.botUsers.add(client.user.id);
            }

            logger.discord('MessageHandler initialized with Discord client');

        } catch (error) {
            logger.logError(error, 'Failed to initialize MessageHandler with client');
            throw error;
        }
    }

    /**
     * Validate and cache Discord channels
     * 
     * Fetches and validates the configured chat and staff channels from Discord.
     * Caches channel references for efficient message processing.
     * 
     * @async
     * @private
     * @throws {Error} If channels are not found or configuration is invalid
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

            logger.discord(`Validated Discord channels - Chat: ${chatChannel.name}, Staff: ${staffChannel.name}`);

        } catch (error) {
            logger.logError(error, 'Failed to validate Discord channels');
            throw error;
        }
    }

    // ==================== MESSAGE HANDLING ====================

    /**
     * Handle incoming Discord message
     * 
     * Main entry point for processing Discord messages. Filters out bot messages,
     * validates channel source, detects commands, and processes regular messages
     * for bridging to Minecraft. Includes error handling with reaction feedback.
     * 
     * @async
     * @param {Message} message - Discord.js message object
     */
    async handleMessage(message) {
        try {
            // Skip bot messages to prevent loops
            if (message.author.bot || this.botUsers.has(message.author.id)) {
                return;
            }

            // Only process messages from monitored channels
            if (!this.isMonitoredChannel(message.channel.id)) {
                return;
            }

            // Skip empty messages
            if (!message.content || message.content.trim().length === 0) {
                return;
            }

            // Handle commands
            if (message.content.startsWith(this.commandPrefix)) {
                await this.handleCommand(message);
                return;
            }

            // Process regular message for bridging
            await this.processMessageForBridge(message);

        } catch (error) {
            logger.logError(error, `Error processing Discord message from ${message.author.username}`);
            
            // Add error reaction to message to indicate processing failed
            try {
                await message.react('⚠️');
            } catch (reactionError) {
                logger.debug('Could not add error reaction to message');
            }
        }
    }

    /**
     * Process message for bridging to Minecraft
     * 
     * Cleans and formats the message content, determines the channel type,
     * adds processing reactions for user feedback, and emits a message event
     * for the bridge to handle.
     * 
     * @async
     * @private
     * @param {Message} message - Discord.js message object
     */
    async processMessageForBridge(message) {
        try {
            // Determine channel type
            let channelType = null;
            if (message.channel.id === this.channels.chat?.id) {
                channelType = 'chat';
            } else if (message.channel.id === this.channels.staff?.id) {
                channelType = 'staff';
            }

            if (!channelType) {
                return; // Not a bridged channel
            }

            // Clean and process message content
            const cleanedContent = this.cleanMessageContent(message.content);
            if (!cleanedContent || cleanedContent.trim().length === 0) {
                return; // Nothing to bridge after cleaning
            }

            // Create enhanced message data with message reference for error handling
            const messageData = this.processDiscordMessage({
                messageRef: message, // Add reference to original message for reactions
                channel: message.channel,
                channelType: channelType,
                author: {
                    id: message.author.id,
                    username: message.author.username,
                    displayName: message.author.displayName || message.author.username,
                    tag: message.author.tag,
                    avatar: message.author.displayAvatarURL()
                },
                content: cleanedContent,
                timestamp: message.createdAt,
                id: message.id,
                attachments: message.attachments.size > 0 ? Array.from(message.attachments.values()) : null,
                embeds: message.embeds.length > 0 ? message.embeds : null,
                reference: message.reference ? {
                    messageId: message.reference.messageId,
                    channelId: message.reference.channelId,
                    guildId: message.reference.guildId
                } : null
            });

            if (!messageData) {
                logger.warn('Failed to process Discord message for bridging');
                return;
            }

            // Add temporary processing reaction
            let processingReaction = null;
            try {
                processingReaction = await message.react('⏳');
            } catch (error) {
                logger.debug('Could not add processing reaction');
            }

            // Emit message event for bridge processing
            this.emit('message', messageData);

            // Remove processing reaction after a short delay
            if (processingReaction) {
                setTimeout(async () => {
                    try {
                        await processingReaction.users.remove(this.client.user);
                    } catch (error) {
                        logger.debug('Could not remove processing reaction');
                    }
                }, 2000);
            }

            logger.debug(`Processed Discord message for bridging: ${message.author.username} -> "${cleanedContent}"`);

        } catch (error) {
            logger.logError(error, 'Error processing message for bridge');
            throw error;
        }
    }

    /**
     * Process Discord message data
     * 
     * Validates and structures Discord message data for the bridge system.
     * Creates a standardized message object with all necessary information.
     * 
     * @private
     * @param {object} messageObject - Raw Discord message object
     * @returns {object|null} Processed message data or null if invalid
     */
    processDiscordMessage(messageObject) {
        try {
            // Validate basic message structure
            if (!messageObject || !messageObject.author || !messageObject.content) {
                logger.debug('Invalid message object provided');
                return null;
            }

            // Basic message data structure
            const processedData = {
                messageRef: messageObject.messageRef, // For error handling reactions
                channel: messageObject.channel,
                channelType: messageObject.channelType,
                author: {
                    id: messageObject.author.id,
                    username: messageObject.author.username,
                    displayName: messageObject.author.displayName || messageObject.author.username,
                    tag: messageObject.author.tag,
                    avatar: messageObject.author.avatar,
                    bot: messageObject.author.bot || false
                },
                content: messageObject.content,
                cleanedContent: this.cleanMessageContent(messageObject.content),
                timestamp: messageObject.timestamp || new Date(),
                id: messageObject.id,
                guild: messageObject.guild ? {
                    id: messageObject.guild.id,
                    name: messageObject.guild.name
                } : null,
                attachments: messageObject.attachments || null,
                embeds: messageObject.embeds || null,
                reference: messageObject.reference || null
            };

            return processedData;

        } catch (error) {
            logger.logError(error, 'Error processing Discord message');
            return null;
        }
    }

    /**
     * Handle Discord commands
     * 
     * Processes commands that start with the command prefix.
     * Supports ping, status, and help commands.
     * 
     * @async
     * @private
     * @param {Message} message - Discord message object
     */
    async handleCommand(message) {
        try {
            const args = message.content.slice(this.commandPrefix.length).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            logger.debug(`Processing command: ${command} from ${message.author.username}`);

            // Add command handling logic here
            switch (command) {
                case 'ping':
                    await message.reply('🏓 Pong! Bridge is running.');
                    break;
                
                case 'status':
                    await this.handleStatusCommand(message);
                    break;
                
                case 'help':
                    await this.handleHelpCommand(message);
                    break;
                
                default:
                    await message.reply(`❌ Unknown command: \`${command}\`. Use \`${this.commandPrefix}help\` for available commands.`);
            }

        } catch (error) {
            logger.logError(error, `Error handling command from ${message.author.username}`);
            await message.reply('❌ An error occurred while processing your command.');
        }
    }

    /**
     * Handle status command
     * 
     * Displays the current bridge connection status with an embed.
     * 
     * @async
     * @private
     * @param {Message} message - Discord message object
     */
    async handleStatusCommand(message) {
        try {
            // This would integrate with your bridge status
            const embed = {
                color: 0x00FF00,
                title: '🔗 Bridge Status',
                fields: [
                    {
                        name: 'Discord Connection',
                        value: '✅ Connected',
                        inline: true
                    },
                    {
                        name: 'Minecraft Connections',
                        value: 'ℹ️ Check logs for details',
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await message.reply({ embeds: [embed] });
        } catch (error) {
            logger.logError(error, 'Error handling status command');
            await message.reply('❌ Could not retrieve status information.');
        }
    }

    /**
     * Handle help command
     * 
     * Displays available commands with descriptions in an embed.
     * 
     * @async
     * @private
     * @param {Message} message - Discord message object
     */
    async handleHelpCommand(message) {
        try {
            const embed = {
                color: 0x3498DB,
                title: '❓ Available Commands',
                description: `Commands use the prefix: \`${this.commandPrefix}\``,
                fields: [
                    {
                        name: `${this.commandPrefix}ping`,
                        value: 'Check if the bridge bot is responsive',
                        inline: false
                    },
                    {
                        name: `${this.commandPrefix}status`,
                        value: 'Show current bridge connection status',
                        inline: false
                    },
                    {
                        name: `${this.commandPrefix}help`,
                        value: 'Show this help message',
                        inline: false
                    }
                ],
                footer: {
                    text: 'Discord to Minecraft Bridge'
                }
            };

            await message.reply({ embeds: [embed] });
        } catch (error) {
            logger.logError(error, 'Error handling help command');
            await message.reply('❌ Could not display help information.');
        }
    }

    /**
     * Clean message content for Minecraft compatibility
     * 
     * Removes Discord-specific formatting, converts mentions to plain text,
     * handles emojis, and truncates to Minecraft's character limit (200 chars).
     * 
     * @private
     * @param {string} content - Original Discord message content
     * @returns {string} Cleaned message content suitable for Minecraft
     */
    cleanMessageContent(content) {
        if (!content) return '';

        let cleaned = content;

        // Remove Discord formatting that doesn't translate well to Minecraft
        cleaned = cleaned.replace(/```[\s\S]*?```/g, '[code block]'); // Code blocks
        cleaned = cleaned.replace(/`([^`]+)`/g, '$1'); // Inline code
        cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1'); // Bold
        cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1'); // Italic
        cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1'); // Strikethrough
        cleaned = cleaned.replace(/__([^_]+)__/g, '$1'); // Underline
        cleaned = cleaned.replace(/\|\|([^|]+)\|\|/g, '[spoiler]'); // Spoilers

        // Convert mentions to readable format
        cleaned = cleaned.replace(/<@!?(\d+)>/g, '@user'); // User mentions
        cleaned = cleaned.replace(/<#(\d+)>/g, '#channel'); // Channel mentions
        cleaned = cleaned.replace(/<@&(\d+)>/g, '@role'); // Role mentions

        // Convert custom emojis to names
        cleaned = cleaned.replace(/<a?:(\w+):\d+>/g, ':$1:');

        // Remove excessive whitespace and trim
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        // Limit length for Minecraft chat
        const maxLength = 200;
        if (cleaned.length > maxLength) {
            cleaned = cleaned.substring(0, maxLength - 3) + '...';
        }

        return cleaned;
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Add bot user to ignore list
     * 
     * Prevents messages from specific bot users from being processed
     * to avoid message loops.
     * 
     * @param {string} userId - Discord user ID to ignore
     */
    addBotUser(userId) {
        this.botUsers.add(userId);
        logger.debug(`Added bot user to ignore list: ${userId}`);
    }

    /**
     * Remove bot user from ignore list
     * 
     * @param {string} userId - Discord user ID to remove from ignore list
     */
    removeBotUser(userId) {
        this.botUsers.delete(userId);
        logger.debug(`Removed bot user from ignore list: ${userId}`);
    }

    /**
     * Get channel by type
     * 
     * Retrieves cached Discord channel reference.
     * 
     * @param {string} channelType - Channel type ('chat' or 'staff')
     * @returns {Channel|null} Discord channel object or null if not found
     */
    getChannel(channelType) {
        return this.channels[channelType] || null;
    }

    /**
     * Check if channel is monitored
     * 
     * Determines if messages from the given channel should be processed.
     * 
     * @param {string} channelId - Discord channel ID
     * @returns {boolean} True if channel should be monitored
     */
    isMonitoredChannel(channelId) {
        return channelId === this.channels.chat?.id || channelId === this.channels.staff?.id;
    }

    /**
     * Update configuration
     * 
     * Allows runtime updates to handler configuration such as command prefix
     * and message formatter settings.
     * 
     * @param {object} newConfig - New configuration object
     */
    updateConfig(newConfig) {
        // Update command prefix
        if (newConfig.commandPrefix !== undefined) {
            this.commandPrefix = newConfig.commandPrefix;
        }

        // Update message formatter config
        if (this.messageFormatter && newConfig.messageFormatter) {
            this.messageFormatter.updateConfig(newConfig.messageFormatter);
        }

        logger.debug('MessageHandler configuration updated');
    }

    /**
     * Cleanup resources
     * 
     * Cleans up resources and removes all event listeners when handler is destroyed.
     * Should be called before disposing of the handler instance.
     */
    cleanup() {
        this.botUsers.clear();
        this.client = null;
        this.channels = { chat: null, staff: null };

        // Remove all listeners
        this.removeAllListeners();

        logger.debug('MessageHandler cleaned up');
    }
}

module.exports = MessageHandler;