/**
 * Discord Embed Builder - Rich Embed Creation for Guild Messages and Events
 * 
 * This utility class provides a centralized system for creating rich Discord embeds
 * for all types of guild-related content. It handles formatting, styling, and
 * presentation of messages, events, system notifications, and connection status
 * updates sent to Discord channels.
 * 
 * The EmbedBuilder provides:
 * - Consistent embed styling across all guild messages and events
 * - Dynamic color and emoji configuration from templates
 * - Specialized embed creation for different content types
 * - Guild branding with icons and footer information
 * - Automatic timestamp and formatting
 * - Rich field layouts for complex data presentation
 * - Error and system notification formatting
 * 
 * Embed types supported:
 * - Guild messages: Regular guild chat and officer chat
 * - Guild events: Join, leave, kick, promote, demote, level, MOTD, invite, online
 * - Connection status: Connected, disconnected, reconnected
 * - System messages: Errors, warnings, success, general system notifications
 * - Info/Error embeds: Generic information and error displays
 * 
 * Configuration is loaded from templates.json defaults section for colors and emojis,
 * allowing easy customization without code changes.
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { EmbedBuilder: DiscordEmbedBuilder } = require('discord.js');

// Specific Imports
const BridgeLocator = require("../../bridgeLocator.js");
const { getTemplateLoader } = require("../../config/TemplateLoader.js");
const logger = require("../../shared/logger");

/**
 * EmbedBuilder - Create rich Discord embeds for guild content
 * 
 * Utility class that creates formatted Discord embeds with consistent styling,
 * colors, and emojis for all types of guild-related content including messages,
 * events, and system notifications.
 * 
 * @class
 */
class EmbedBuilder {
    /**
     * Create a new EmbedBuilder instance
     * 
     * Initializes the embed builder by loading configuration and template defaults
     * for colors and emojis. These defaults can be customized in templates.json
     * without modifying code.
     * 
     * Default color scheme:
     * - guild: Blue (3447003)
     * - officer: Orange (15844367)
     * - event: Green (3066993)
     * - system: Gray (9807270)
     * - error: Red (15158332)
     * - success: Green (3066993)
     * - warning: Orange (15844367)
     * 
     * Default emojis:
     * - guild: 💬, officer: 🛡️
     * - join/leave: 👋, kick: 🚫
     * - promote: ⬆️, demote: ⬇️
     * - level: 🎉, motd: 📝
     * - system: ⚙️, error: ❌, success: ✅, warning: ⚠️
     */
    constructor() {
        const mainBridge = BridgeLocator.getInstance();
        this.config = mainBridge.config;
        this.templateLoader = getTemplateLoader();

        // Default colors from templates (merge so missing keys use hardcoded defaults)
        this.colors = {
            guild: 3447003,      // Blue
            officer: 15844367,   // Orange
            event: 3066993,      // Green
            system: 9807270,     // Gray
            error: 15158332,     // Red
            success: 3066993,    // Green
            warning: 15844367,   // Orange
            ...this.templateLoader.getDefaults('colors')
        };

        // Default emojis from templates
        this.emojis = this.templateLoader.getDefaults('emojis') || {
            guild: '💬',
            officer: '🛡️',
            join: '👋',
            leave: '👋',
            kick: '🚫',
            promote: '⬆️',
            demote: '⬇️',
            level: '🎉',
            motd: '📝',
            system: '⚙️',
            error: '❌',
            success: '✅',
            warning: '⚠️'
        };

        logger.debug('EmbedBuilder initialized');
    }

    /**
     * Create guild message embed
     * 
     * Creates a rich embed for guild chat messages (regular guild chat or officer chat).
     * Automatically styles the embed with appropriate colors and emojis based on chat type.
     * Includes username, message content, guild branding, and optional rank display.
     * 
     * @param {object} messageData - Parsed message data from Minecraft
     * @param {string} messageData.username - Username of the message sender
     * @param {string} messageData.message - Message content
     * @param {string} [messageData.chatType='guild'] - Chat type ('guild' or 'officer')
     * @param {string} [messageData.rank] - Player's guild rank (optional)
     * @param {object} guildConfig - Guild configuration object
     * @param {string} guildConfig.name - Guild name
     * @param {string} guildConfig.tag - Guild tag
     * @param {object} guildConfig.account - Bot account info for icon
     * @returns {DiscordEmbedBuilder} Formatted Discord embed ready to send
     * 
     * @example
     * const messageData = {
     *   username: "Player123",
     *   message: "Hello guild!",
     *   chatType: "guild",
     *   rank: "Member"
     * };
     * const embed = embedBuilder.createGuildMessageEmbed(messageData, guildConfig);
     * await channel.send({ embeds: [embed] });
     */
    createGuildMessageEmbed(messageData, guildConfig) {
        const embed = new DiscordEmbedBuilder();
        
        const chatType = messageData.chatType || 'guild';
        const emoji = chatType === 'officer' ? this.emojis.officer : this.emojis.guild;
        const color = chatType === 'officer' ? this.colors.officer : this.colors.guild;

        embed
            .setColor(color)
            .setTitle(`${emoji} ${chatType.charAt(0).toUpperCase() + chatType.slice(1)} Chat - ${guildConfig.name}`)
            .setDescription(`**${messageData.username}**: ${messageData.message}`)
            .setFooter({
                text: `From ${guildConfig.name} [${guildConfig.tag}]`,
                iconURL: this.getGuildIcon(guildConfig)
            })
            .setTimestamp();

        // Add rank if available
        if (messageData.rank) {
            embed.addFields({
                name: 'Rank',
                value: messageData.rank,
                inline: true
            });
        }

        return embed;
    }

    /**
     * Create guild event embed
     * 
     * Creates a rich embed for guild events (join, leave, kick, promote, demote, etc.).
     * Automatically formats the embed based on event type with appropriate styling,
     * emojis, and field layout. Delegates field creation to addEventFields().
     * 
     * @param {object} eventData - Parsed event data from Minecraft
     * @param {string} eventData.type - Event type (join, leave, kick, promote, demote, level, motd, invite, online)
     * @param {string} [eventData.username] - Username involved in event (if applicable)
     * @param {string} [eventData.fromRank] - Previous rank (for promote/demote)
     * @param {string} [eventData.toRank] - New rank (for promote/demote)
     * @param {object} guildConfig - Guild configuration object
     * @param {string} guildConfig.name - Guild name
     * @param {string} guildConfig.tag - Guild tag
     * @returns {DiscordEmbedBuilder} Formatted Discord embed ready to send
     * 
     * @example
     * const eventData = {
     *   type: "promote",
     *   username: "Player123",
     *   fromRank: "Member",
     *   toRank: "Officer",
     *   promoter: "GuildLeader"
     * };
     * const embed = embedBuilder.createGuildEventEmbed(eventData, guildConfig);
     */
    createGuildEventEmbed(eventData, guildConfig) {
        const embed = new DiscordEmbedBuilder();
        
        const eventType = eventData.type;
        const emoji = this.emojis[eventType] || this.emojis.system;
        const color = this.colors.event;

        embed
            .setColor(color)
            .setTitle(`${emoji} Guild Event - ${this.formatEventType(eventType)}`)
            .setFooter({
                text: `${guildConfig.name} [${guildConfig.tag}]`,
                iconURL: this.getGuildIcon(guildConfig)
            })
            .setTimestamp();

        // Add event-specific fields
        this.addEventFields(embed, eventData);

        return embed;
    }

    /**
     * Add event-specific fields to embed
     * 
     * Internal method that adds appropriate fields and descriptions to an embed
     * based on the event type. Handles all supported guild events with proper
     * formatting and field layout.
     * 
     * Supported events:
     * - join/welcome: Player joining guild
     * - leave: Player leaving guild
     * - kick: Player kicked from guild
     * - promote: Player promoted with rank change
     * - demote: Player demoted with rank change
     * - level: Guild level up
     * - motd: MOTD changed
     * - invite: Player invited or invitation accepted
     * - online: Online member count and list
     * 
     * @private
     * @param {DiscordEmbedBuilder} embed - Discord embed builder to modify
     * @param {object} eventData - Event data containing type-specific information
     * @param {string} eventData.type - Event type identifier
     * 
     * @example
     * // Internal usage only
     * this.addEventFields(embed, { type: 'promote', username: 'Player', toRank: 'Officer' });
     */
    addEventFields(embed, eventData) {
        const eventType = eventData.type;

        switch (eventType) {
            case 'join':
            case 'welcome':
                embed.setDescription(`**${eventData.username}** joined the guild! 👋`);
                if (eventData.rank) {
                    embed.addFields({
                        name: 'Rank',
                        value: eventData.rank,
                        inline: true
                    });
                }
                break;

            case 'leave':
                embed.setDescription(`**${eventData.username}** left the guild 👋`);
                if (eventData.reason) {
                    embed.addFields({
                        name: 'Reason',
                        value: eventData.reason,
                        inline: true
                    });
                }
                break;

            case 'kick':
                embed.setDescription(`**${eventData.username}** was kicked from the guild 🚫`);
                if (eventData.reason) {
                    embed.addFields({
                        name: 'Reason',
                        value: eventData.reason,
                        inline: true
                    });
                }
                break;

            case 'promote':
                embed.setDescription(`**${eventData.username}** was promoted! ⬆️`);
                if (eventData.fromRank && eventData.toRank) {
                    embed.addFields({
                        name: 'Promotion',
                        value: `${eventData.fromRank} → ${eventData.toRank}`,
                        inline: true
                    });
                } else if (eventData.toRank) {
                    embed.addFields({
                        name: 'New Rank',
                        value: eventData.toRank,
                        inline: true
                    });
                }
                if (eventData.promoter) {
                    embed.addFields({
                        name: 'Promoted by',
                        value: eventData.promoter,
                        inline: true
                    });
                }
                break;

            case 'demote':
                embed.setDescription(`**${eventData.username}** was demoted ⬇️`);
                if (eventData.fromRank && eventData.toRank) {
                    embed.addFields({
                        name: 'Demotion',
                        value: `${eventData.fromRank} → ${eventData.toRank}`,
                        inline: true
                    });
                } else if (eventData.toRank) {
                    embed.addFields({
                        name: 'New Rank',
                        value: eventData.toRank,
                        inline: true
                    });
                }
                if (eventData.demoter) {
                    embed.addFields({
                        name: 'Demoted by',
                        value: eventData.demoter,
                        inline: true
                    });
                }
                break;

            case 'level':
                embed.setDescription(`Guild reached level **${eventData.level}**! 🎉`);
                if (eventData.previousLevel) {
                    embed.addFields({
                        name: 'Level Up',
                        value: `${eventData.previousLevel} → ${eventData.level}`,
                        inline: true
                    });
                }
                break;

            case 'motd':
                embed.setDescription(`**${eventData.changer}** changed the guild MOTD 📝`);
                if (eventData.motd) {
                    embed.addFields({
                        name: 'New MOTD',
                        value: eventData.motd.length > 1024 ? eventData.motd.substring(0, 1021) + '...' : eventData.motd,
                        inline: false
                    });
                }
                break;

            case 'invite':
                if (eventData.inviteAccepted) {
                    embed.setDescription(`**${eventData.invited}** accepted **${eventData.inviter}**'s guild invitation`);
                } else {
                    embed.setDescription(`**${eventData.inviter}** invited **${eventData.invited}** to the guild`);
                }
                break;

            case 'online':
                embed.setDescription(`Guild members online: **${eventData.onlineCount}**`);
                if (eventData.members && eventData.members.length <= 10) {
                    embed.addFields({
                        name: 'Online Members',
                        value: eventData.members.join(', '),
                        inline: false
                    });
                } else if (eventData.members && eventData.members.length > 10) {
                    embed.addFields({
                        name: 'Online Members',
                        value: eventData.members.slice(0, 10).join(', ') + ` and ${eventData.members.length - 10} more...`,
                        inline: false
                    });
                }
                break;

            default:
                embed.setDescription(`Guild event: **${eventType}**`);
                if (eventData.username) {
                    embed.addFields({
                        name: 'User',
                        value: eventData.username,
                        inline: true
                    });
                }
                break;
        }
    }

    /**
     * Create connection status embed
     * 
     * Creates a rich embed displaying bot connection status changes for a guild.
     * Shows connection/disconnection/reconnection events with appropriate styling,
     * guild information, and optional connection details.
     * 
     * @param {object} guildConfig - Guild configuration object
     * @param {string} guildConfig.name - Guild name
     * @param {string} guildConfig.tag - Guild tag
     * @param {object} guildConfig.server - Server information
     * @param {string} guildConfig.server.serverName - Server name (e.g., 'Hypixel')
     * @param {object} guildConfig.account - Bot account information
     * @param {string} guildConfig.account.username - Bot username
     * @param {string} status - Connection status ('connected', 'disconnected', 'reconnected', or custom)
     * @param {object} [details={}] - Additional connection details
     * @param {string} [details.connectionTime] - Time of connection
     * @param {number} [details.attempt] - Connection attempt number
     * @param {string} [details.reason] - Reason for status change
     * @returns {DiscordEmbedBuilder} Formatted Discord embed ready to send
     * 
     * @example
     * const embed = embedBuilder.createConnectionEmbed(
     *   guildConfig,
     *   'connected',
     *   { connectionTime: '2:30 PM', attempt: 1 }
     * );
     * await statusChannel.send({ embeds: [embed] });
     */
    createConnectionEmbed(guildConfig, status, details = {}) {
        const embed = new DiscordEmbedBuilder();

        let color, emoji, title, description;

        switch (status) {
            case 'connected':
                color = this.colors.success;
                emoji = this.emojis.success;
                title = `${emoji} Guild Connected`;
                description = `**${guildConfig.name}** bot successfully connected to Hypixel`;
                break;

            case 'disconnected':
                color = this.colors.error;
                emoji = this.emojis.error;
                title = `${emoji} Guild Disconnected`;
                description = `**${guildConfig.name}** bot disconnected from Hypixel`;
                break;

            case 'reconnected':
                color = this.colors.warning;
                emoji = this.emojis.warning;
                title = `🔄 Guild Reconnected`;
                description = `**${guildConfig.name}** bot reconnected to Hypixel`;
                break;

            default:
                color = this.colors.system;
                emoji = this.emojis.system;
                title = `${emoji} Guild Status`;
                description = `**${guildConfig.name}** status: ${status}`;
                break;
        }

        embed
            .setColor(color)
            .setTitle(title)
            .setDescription(description)
            .setFooter({
                text: `${guildConfig.name} [${guildConfig.tag}]`,
                iconURL: this.getGuildIcon(guildConfig)
            })
            .setTimestamp();

        // Add connection details
        if (details.connectionTime) {
            embed.addFields({
                name: 'Connection Time',
                value: details.connectionTime,
                inline: true
            });
        }

        if (details.attempt) {
            embed.addFields({
                name: 'Attempt',
                value: details.attempt.toString(),
                inline: true
            });
        }

        if (details.reason) {
            embed.addFields({
                name: 'Reason',
                value: details.reason,
                inline: true
            });
        }

        // Add server info
        embed.addFields({
            name: 'Server',
            value: guildConfig.server.serverName,
            inline: true
        });

        embed.addFields({
            name: 'Bot Account',
            value: guildConfig.account.username,
            inline: true
        });

        return embed;
    }

    /**
     * Create system message embed
     * 
     * Creates a rich embed for system messages and notifications. Automatically
     * styles the embed based on message type (error, warning, success, or general).
     * Useful for internal system notifications and status updates.
     * 
     * @param {string} type - System message type (should include 'error', 'warning', 'success' for auto-styling)
     * @param {object} data - System message data
     * @param {string} data.message - Main message content
     * @param {string} [data.context] - Additional context information
     * @param {object|string} [data.details] - Detailed information (will be JSON stringified if object)
     * @param {object} guildConfig - Guild configuration object
     * @param {string} guildConfig.name - Guild name
     * @param {string} guildConfig.tag - Guild tag
     * @returns {DiscordEmbedBuilder} Formatted Discord embed ready to send
     * 
     * @example
     * const data = {
     *   message: "Command queue full",
     *   context: "Rate limiting active",
     *   details: { queueSize: 100, maxSize: 100 }
     * };
     * const embed = embedBuilder.createSystemEmbed('warning', data, guildConfig);
     */
    createSystemEmbed(type, data, guildConfig) {
        const embed = new DiscordEmbedBuilder();

        const color = type.includes('error') ? this.colors.error : 
                     type.includes('warning') ? this.colors.warning :
                     type.includes('success') ? this.colors.success :
                     this.colors.system;

        const emoji = type.includes('error') ? this.emojis.error :
                     type.includes('warning') ? this.emojis.warning :
                     type.includes('success') ? this.emojis.success :
                     this.emojis.system;

        embed
            .setColor(color)
            .setTitle(`${emoji} System Message`)
            .setDescription(data.message || `System event: ${type}`)
            .setFooter({
                text: `${guildConfig.name} [${guildConfig.tag}]`,
                iconURL: this.getGuildIcon(guildConfig)
            })
            .setTimestamp();

        // Add system data fields
        if (data.context) {
            embed.addFields({
                name: 'Context',
                value: data.context,
                inline: true
            });
        }

        if (data.details) {
            embed.addFields({
                name: 'Details',
                value: typeof data.details === 'object' ? JSON.stringify(data.details, null, 2) : data.details,
                inline: false
            });
        }

        return embed;
    }

    /**
     * Format event type for display
     * 
     * Converts underscore-separated event type strings to human-readable
     * title case format. For example: 'guild_member_join' → 'Guild Member Join'
     * 
     * @param {string} eventType - Raw event type string
     * @returns {string} Formatted event type in title case
     * 
     * @example
     * formatEventType('guild_member_join'); // "Guild Member Join"
     * formatEventType('promote'); // "Promote"
     * formatEventType('motd_change'); // "Motd Change"
     */
    formatEventType(eventType) {
        return eventType
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Get guild icon URL
     * 
     * Generates a Minecraft player head icon URL using the bot's username.
     * Uses the Minotar service to fetch rendered Minecraft head images.
     * This provides visual branding for each guild based on their bot account.
     * 
     * @param {object} guildConfig - Guild configuration object
     * @param {object} guildConfig.account - Bot account information
     * @param {string} guildConfig.account.username - Bot's Minecraft username
     * @returns {string} URL to 64x64 Minecraft head icon
     * 
     * @example
     * const iconUrl = embedBuilder.getGuildIcon(guildConfig);
     * // Returns: "https://minotar.net/helm/BotUsername/64.png"
     */
    getGuildIcon(guildConfig) {
        // Use Minecraft head as guild icon
        const username = guildConfig.account.username;
        return `https://minotar.net/helm/${username}/64.png`;
    }

    /**
     * Create info embed
     * 
     * Creates a simple informational embed with custom title, description, and color.
     * Useful for general purpose notifications and information displays.
     * 
     * @param {string} title - Embed title
     * @param {string} description - Embed description/content
     * @param {string|number} [color='system'] - Color name from this.colors or hex color code
     * @returns {DiscordEmbedBuilder} Formatted Discord embed ready to send
     * 
     * @example
     * // Using color name
     * const embed = embedBuilder.createInfoEmbed(
     *   "Maintenance Notice",
     *   "Bot will restart in 5 minutes",
     *   "warning"
     * );
     * 
     * @example
     * // Using hex color
     * const embed = embedBuilder.createInfoEmbed(
     *   "Custom Info",
     *   "This is a custom message",
     *   0x00FF00
     * );
     */
    createInfoEmbed(title, description, color = 'system') {
        const embedColor = typeof color === 'string' ? (this.colors[color] || this.colors.system) : color;
        
        return new DiscordEmbedBuilder()
            .setColor(embedColor)
            .setTitle(title)
            .setDescription(description)
            .setTimestamp();
    }

    /**
     * Create error embed
     * 
     * Creates a standardized error embed with red color and error emoji.
     * Optionally includes context information for debugging.
     * 
     * @param {string} error - Error message to display
     * @param {string} [context=null] - Additional context about the error
     * @returns {DiscordEmbedBuilder} Formatted error embed ready to send
     * 
     * @example
     * const embed = embedBuilder.createErrorEmbed(
     *   "Failed to connect to Minecraft server",
     *   "Connection timeout after 30 seconds"
     * );
     * await channel.send({ embeds: [embed] });
     * 
     * @example
     * // Without context
     * const embed = embedBuilder.createErrorEmbed("Invalid command");
     */
    createErrorEmbed(error, context = null) {
        const embed = new DiscordEmbedBuilder()
            .setColor(this.colors.error)
            .setTitle(`${this.emojis.error} Error`)
            .setDescription(error)
            .setTimestamp();

        if (context) {
            embed.addFields({
                name: 'Context',
                value: context,
                inline: false
            });
        }

        return embed;
    }

    /**
     * Update colors configuration
     * 
     * Dynamically updates the color configuration for embeds. Merges new colors
     * with existing ones, allowing partial updates without replacing all colors.
     * Useful for runtime theme customization.
     * 
     * @param {object} newColors - New color configuration to merge
     * @param {number} [newColors.guild] - Guild chat color
     * @param {number} [newColors.officer] - Officer chat color
     * @param {number} [newColors.event] - Event color
     * @param {number} [newColors.system] - System message color
     * @param {number} [newColors.error] - Error color
     * @param {number} [newColors.success] - Success color
     * @param {number} [newColors.warning] - Warning color
     * 
     * @example
     * embedBuilder.updateColors({
     *   guild: 0x0099FF,
     *   officer: 0xFF9900
     * });
     */
    updateColors(newColors) {
        this.colors = { ...this.colors, ...newColors };
        logger.debug('EmbedBuilder colors updated');
    }

    /**
     * Update emojis configuration
     * 
     * Dynamically updates the emoji configuration for embeds. Merges new emojis
     * with existing ones, allowing partial updates without replacing all emojis.
     * Useful for runtime customization with custom Discord emojis.
     * 
     * @param {object} newEmojis - New emoji configuration to merge
     * @param {string} [newEmojis.guild] - Guild chat emoji
     * @param {string} [newEmojis.officer] - Officer chat emoji
     * @param {string} [newEmojis.join] - Join event emoji
     * @param {string} [newEmojis.leave] - Leave event emoji
     * @param {string} [newEmojis.kick] - Kick event emoji
     * @param {string} [newEmojis.promote] - Promote event emoji
     * @param {string} [newEmojis.demote] - Demote event emoji
     * 
     * @example
     * embedBuilder.updateEmojis({
     *   guild: '<:guild:123456789>',
     *   officer: '<:officer:987654321>'
     * });
     */
    updateEmojis(newEmojis) {
        this.emojis = { ...this.emojis, ...newEmojis };
        logger.debug('EmbedBuilder emojis updated');
    }
}

module.exports = EmbedBuilder;