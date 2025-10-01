/**
 * Server Info Command - Discord Server Information Display
 * 
 * This slash command provides comprehensive information about the current Discord server
 * including statistics, configuration, and metadata. It presents data in a rich embed
 * format with organized fields showing member counts, channels, roles, boost status,
 * and server settings.
 * 
 * Command Features:
 * - Member, channel, role, and emoji counts
 * - Server boost level and boost count
 * - Verification level information
 * - Server creation date with relative timestamp
 * - Server owner information
 * - Server icon display
 * - Ephemeral response (only visible to command user)
 * 
 * Information Displayed:
 * - 👥 Members: Total member count in the server
 * - 📁 Channels: Total number of channels (text, voice, categories)
 * - 🎭 Roles: Total number of roles configured
 * - 😀 Emojis: Total number of custom emojis
 * - 🚀 Boost Level: Current server boost tier and boost count
 * - 🔒 Verification Level: Required verification level for members
 * - 📅 Created: Server creation date (absolute and relative)
 * - 👑 Owner: Server owner username and ID (if available)
 * 
 * Verification Levels:
 * - None (0): No verification required
 * - Low (1): Must have verified email
 * - Medium (2): Must be registered for 5+ minutes
 * - High (3): Must be server member for 10+ minutes
 * - Very High (4): Must have verified phone number
 * 
 * Usage: /serverinfo
 * Permission: User (available to all server members)
 * Response: Ephemeral (only visible to command executor)
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

/**
 * Server Info Command Module
 * 
 * Exports a command object with slash command definition and execution logic.
 * 
 * @module serverinfo
 * @type {object}
 * @property {SlashCommandBuilder} data - Slash command definition
 * @property {string} permission - Permission level required ('user', 'mod', 'admin')
 * @property {Function} execute - Command execution function
 */
module.exports = {
    /**
     * Slash command definition
     * 
     * Defines the command name and description for Discord's slash command system.
     * 
     * @type {SlashCommandBuilder}
     */
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Displays information about the current server'),
    
    /**
     * Permission level required to execute this command
     * 
     * Determines who can use this command based on configured permission roles.
     * 
     * Permission Levels:
     * - 'user': Available to all server members (default)
     * - 'mod': Requires moderator role
     * - 'admin': Requires administrator role
     * 
     * @type {string}
     */
    permission: 'user', // 'user', 'mod', 'admin'
    
    /**
     * Execute the serverinfo command
     * 
     * Fetches and displays comprehensive server information in a rich embed format.
     * Defers the reply initially to prevent timeout on large servers, then collects
     * server statistics and displays them in an organized embed.
     * 
     * The embed includes:
     * - Server statistics (members, channels, roles, emojis)
     * - Boost information (level and count)
     * - Server settings (verification level)
     * - Timestamps (creation date)
     * - Owner information (if available)
     * - Server icon thumbnail
     * 
     * Error Handling:
     * - Validates command is used in a server context
     * - Handles unavailable owner information gracefully
     * - Catches and reports any errors during execution
     * 
     * @async
     * @param {ChatInputCommandInteraction} interaction - Discord interaction object
     * @param {object} context - Command execution context (optional)
     * @param {Client} context.client - Discord client instance
     * @param {object} context.config - Configuration object
     * @param {object} context.bridgeLocator - Bridge locator instance
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        // Defer the reply to prevent timeout on large servers
        await interaction.deferReply({ ephemeral: true });
        
        const guild = interaction.guild;
        
        // Validate server context
        if (!guild) {
            await interaction.editReply({
                content: 'This command can only be used in a server!',
                ephemeral: true
            });
            return;
        }

        try {
            // Get server statistics
            const memberCount = guild.memberCount;
            const channelCount = guild.channels.cache.size;
            const roleCount = guild.roles.cache.size;
            const emojiCount = guild.emojis.cache.size;
            
            // Get boost information
            const boostLevel = guild.premiumTier;
            const boostCount = guild.premiumSubscriptionCount || 0;
            
            // Get creation date
            const createdAt = guild.createdAt;
            const createdTimestamp = Math.floor(createdAt.getTime() / 1000);
            
            // Map verification levels to readable names
            const verificationLevels = {
                0: 'None',
                1: 'Low',
                2: 'Medium',
                3: 'High',
                4: 'Very High'
            };
            
            const verificationLevel = verificationLevels[guild.verificationLevel] || 'Unknown';
            
            // Create embed with server information
            const embed = new EmbedBuilder()
                .setTitle(`📊 ${guild.name} Server Information`)
                .setThumbnail(guild.iconURL({ dynamic: true, size: 1024 }))
                .setColor(0x0099FF)
                .addFields(
                    {
                        name: '👥 Members',
                        value: `${memberCount.toLocaleString()}`,
                        inline: true
                    },
                    {
                        name: '📁 Channels',
                        value: `${channelCount.toLocaleString()}`,
                        inline: true
                    },
                    {
                        name: '🎭 Roles',
                        value: `${roleCount.toLocaleString()}`,
                        inline: true
                    },
                    {
                        name: '😀 Emojis',
                        value: `${emojiCount.toLocaleString()}`,
                        inline: true
                    },
                    {
                        name: '🚀 Boost Level',
                        value: `Level ${boostLevel} (${boostCount} boosts)`,
                        inline: true
                    },
                    {
                        name: '🔒 Verification Level',
                        value: verificationLevel,
                        inline: true
                    },
                    {
                        name: '📅 Created',
                        value: `<t:${createdTimestamp}:F>\n(<t:${createdTimestamp}:R>)`,
                        inline: false
                    }
                )
                .setFooter({
                    text: `Server ID: ${guild.id}`,
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setTimestamp();

            // Add owner information if available
            if (guild.ownerId) {
                try {
                    const owner = await guild.members.fetch(guild.ownerId);
                    embed.addFields({
                        name: '👑 Owner',
                        value: `${owner.user.tag} (${owner.user.id})`,
                        inline: false
                    });
                } catch (error) {
                    // Owner might not be cached, skip this field
                }
            }

            // Send the embed
            await interaction.editReply({
                embeds: [embed],
                ephemeral: true
            });
            
        } catch (error) {
            console.error('Error in serverinfo command:', error);
            await interaction.editReply({
                content: 'An error occurred while fetching server information.',
                ephemeral: true
            });
        }
    },
};