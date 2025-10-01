/**
 * Guild Invite Subcommand - Player Invitation to Guild
 * 
 * This subcommand handles inviting players to join a Minecraft guild. It sends the
 * invitation command to the Minecraft bot, tracks the response through CommandResponseListener,
 * and provides real-time feedback to Discord users through rich embeds showing the
 * invitation status and results.
 * 
 * Command Features:
 * - Send guild invitation to Minecraft players
 * - Real-time status updates through embed messages
 * - Response tracking with 15-second timeout
 * - Comprehensive error handling and validation
 * - Guild and connection validation
 * - Username format validation (Minecraft standards)
 * - Visual feedback with color-coded embeds
 * - Multiple error type handling (timeout, command error, system error, cancelled)
 * - Command execution logging for audit trail
 * 
 * Validation Checks:
 * - Minecraft manager availability
 * - Guild existence and enabled status
 * - Guild connection status (bot must be online)
 * - Username format (3-16 alphanumeric characters with underscores)
 * 
 * Response Types:
 * - Success: Green embed with confirmation message
 * - Command Error: Red embed with error details from Minecraft
 * - Timeout: Orange embed indicating no response within 15s
 * - System Error: Red embed for system-level failures
 * - Cancelled: Gray embed for cancelled operations
 * - Unknown Error: Red embed for unidentified failures
 * 
 * Embed Stages:
 * 1. Initial: Orange processing embed while command is sent
 * 2. Final: Color-coded result embed based on command outcome
 * 
 * Integration:
 * - CommandResponseListener: Tracks Minecraft chat for invitation confirmation/rejection
 * - BotManager: Executes guild commands in Minecraft
 * - Logger: Records all operations for debugging and audit
 * 
 * Usage: /guild invite <guildname> <username>
 * Permission: Moderator (requires moderator role)
 * Response: Ephemeral (only visible to command executor)
 * 
 * Example:
 * /guild invite FrenchLegacy PlayerName
 * Result: Sends invitation to PlayerName to join FrenchLegacy guild
 * 
 * Possible Outcomes:
 * - Success: Player receives invitation in-game
 * - Already in guild: Error message indicating player is already a member
 * - Guild full: Error message indicating guild has reached member limit
 * - Player not found: Error message if player doesn't exist or is offline
 * - Timeout: No response from Minecraft within 15 seconds
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { EmbedBuilder } = require('discord.js');

// Specific Imports
const CommandResponseListener = require('../../handlers/CommandResponseListener.js');
const logger = require('../../../../shared/logger');

/**
 * Command response listener singleton instance
 * Cached to avoid creating multiple instances
 * @type {CommandResponseListener|null}
 */
let commandResponseListener = null;

/**
 * Get or create CommandResponseListener singleton
 * 
 * Returns the existing singleton instance or creates a new one if needed.
 * Ensures only one listener instance exists throughout the application.
 * 
 * @returns {CommandResponseListener} Singleton instance
 */
function getCommandResponseListener() {
    if (!commandResponseListener) {
        commandResponseListener = new CommandResponseListener();
    }
    return commandResponseListener;
}

/**
 * Invite Subcommand Module
 * 
 * Exports configuration and execution function for the invite subcommand.
 * 
 * @module guild/invite
 * @type {object}
 * @property {string} permission - Required permission level ('moderator')
 * @property {Function} execute - Command execution function
 */
module.exports = {
    /**
     * Permission level required to execute this subcommand
     * 
     * Requires moderator role to prevent unauthorized invitations.
     * This ensures only trusted users can invite players to guilds.
     * 
     * @type {string}
     */
    permission: 'moderator',
    
    /**
     * Execute the invite subcommand
     * 
     * Entry point for the invite command. Defers the reply immediately
     * to prevent timeout, then delegates to handleInviteCommand for processing.
     * 
     * @async
     * @param {ChatInputCommandInteraction} interaction - Discord interaction object
     * @param {object} context - Command execution context
     * @param {Client} context.client - Discord client instance
     * @param {object} context.config - Configuration object
     * @param {object} context.bridgeLocator - BridgeLocator instance
     * @returns {Promise<void>}
     */
    async execute(interaction, context) {
        // Defer the reply since this might take some time
        await interaction.deferReply({ ephemeral: true });
        
        await handleInviteCommand(interaction, context);
    },
};

/**
 * Handle invite command execution
 * 
 * Main logic for inviting a player to a guild. Performs validation,
 * sends the invitation command to Minecraft, tracks the response, and
 * updates the Discord user with the result through embeds.
 * 
 * Execution Flow:
 * 1. Extract command parameters (guild name, username)
 * 2. Validate Minecraft manager availability
 * 3. Find and validate guild configuration
 * 4. Verify guild connection status
 * 5. Validate username format
 * 6. Create response listener for tracking
 * 7. Send initial processing embed
 * 8. Execute invitation command in Minecraft
 * 9. Wait for response from listener (15s timeout)
 * 10. Update embed with final result
 * 11. Log the outcome for audit
 * 
 * Error Handling:
 * - Manager unavailable: Error message to user
 * - Guild not found: List available guilds
 * - Guild not connected: Connection status message
 * - Invalid username: Format validation message with requirements
 * - Command execution failure: Error details with cancellation
 * - Unexpected errors: Generic error message with details
 * 
 * @async
 * @private
 * @param {ChatInputCommandInteraction} interaction - Discord interaction object
 * @param {object} context - Command execution context
 * @returns {Promise<void>}
 */
async function handleInviteCommand(interaction, context) {
    const guildName = interaction.options.getString('guildname');
    const username = interaction.options.getString('username');
    
    try {
        logger.discord(`[GUILD-INVITE] Processing invite command: ${guildName} -> ${username}`);

        // Get Minecraft manager
        const minecraftManager = context.bridgeLocator.getMinecraftManager?.();
        if (!minecraftManager) {
            await interaction.editReply({
                content: '❌ Minecraft manager not available. Please try again later.',
                ephemeral: true
            });
            return;
        }

        // Find guild configuration by name
        const guildConfig = findGuildByName(context.config, guildName);
        if (!guildConfig) {
            await interaction.editReply({
                content: `❌ Guild \`${guildName}\` not found. Available guilds: ${getAvailableGuilds(context.config).join(', ')}`,
                ephemeral: true
            });
            return;
        }

        // Check if guild is connected
        const botManager = minecraftManager._botManager;
        if (!botManager || !botManager.isGuildConnected(guildConfig.id)) {
            await interaction.editReply({
                content: `❌ Guild \`${guildName}\` is not currently connected to Minecraft.`,
                ephemeral: true
            });
            return;
        }

        // Validate username format
        if (!isValidMinecraftUsername(username)) {
            await interaction.editReply({
                content: `❌ Invalid username format: \`${username}\`. Minecraft usernames must be 3-16 characters long and contain only letters, numbers, and underscores.`,
                ephemeral: true
            });
            return;
        }

        // Prepare Minecraft command
        const command = `/g invite ${username}`;

        // Set up command response listener
        const responseListener = getCommandResponseListener();
        const listenerId = responseListener.createListener(
            guildConfig.id,
            'invite',
            username,
            command,
            15000, // 15 second timeout
            interaction
        );

        // Send initial response
        const initialEmbed = new EmbedBuilder()
            .setTitle('🔄 Processing Guild Invite')
            .setDescription(`Inviting \`${username}\` to guild \`${guildName}\`...`)
            .setColor(0xFFA500) // Orange color for "in progress"
            .addFields(
                { name: '👤 Player', value: username, inline: true },
                { name: '🏰 Guild', value: guildName, inline: true },
                { name: '⏱️ Status', value: 'Sending invite command...', inline: false }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [initialEmbed] });

        try {
            // Execute command in Minecraft
            await botManager.executeCommand(guildConfig.id, command);
            
            logger.discord(`[GUILD-INVITE] Command sent to ${guildName}: ${command}`);

            // Wait for response
            const result = await responseListener.waitForResult(listenerId);
            
            // Create response embed based on result
            const responseEmbed = createResponseEmbed(guildName, username, result);
            await interaction.editReply({ embeds: [responseEmbed] });

            // Log the result
            if (result.success) {
                logger.discord(`[GUILD-INVITE] ✅ Successfully invited ${username} to ${guildName}`);
            } else {
                logger.discord(`[GUILD-INVITE] ❌ Failed to invite ${username} to ${guildName}: ${result.error}`);
            }

        } catch (commandError) {
            logger.logError(commandError, `[GUILD-INVITE] Failed to execute invite command`);
            
            // Cancel the listener since command execution failed
            responseListener.cancelListener(listenerId);
            
            // Send command execution error embed
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Command Execution Failed')
                .setDescription(`Failed to execute invite command for \`${username}\``)
                .setColor(0xFF0000) // Red color for error
                .addFields(
                    { name: '👤 Player', value: username, inline: true },
                    { name: '🏰 Guild', value: guildName, inline: true },
                    { name: '🚫 Error', value: commandError.message || 'Unknown error occurred', inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }

    } catch (error) {
        // Handle unexpected errors
        logger.logError(error, `[GUILD-INVITE] Unexpected error processing invite command`);
        
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Unexpected Error')
            .setDescription('An unexpected error occurred while processing the invite command.')
            .setColor(0xFF0000)
            .addFields(
                { name: '🚫 Error', value: error.message || 'Unknown error', inline: false }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

/**
 * Find guild configuration by name
 * 
 * Searches for a guild in the configuration by name (case-insensitive)
 * and verifies it is enabled. Only returns enabled guilds.
 * 
 * @param {object} config - Configuration object
 * @param {string} guildName - Guild name to search for
 * @returns {object|null} Guild configuration or null if not found
 */
function findGuildByName(config, guildName) {
    const guilds = config.get('guilds') || [];
    return guilds.find(guild => 
        guild.name.toLowerCase() === guildName.toLowerCase() && guild.enabled
    );
}

/**
 * Get list of available guild names
 * 
 * Returns an array of enabled guild names from configuration.
 * Used for displaying available options when a guild is not found.
 * 
 * @param {object} config - Configuration object
 * @returns {Array<string>} Array of enabled guild names
 */
function getAvailableGuilds(config) {
    const guilds = config.get('guilds') || [];
    return guilds
        .filter(guild => guild.enabled)
        .map(guild => guild.name);
}

/**
 * Validate Minecraft username format
 * 
 * Checks if username follows Minecraft's username requirements:
 * - 3 to 16 characters long
 * - Alphanumeric characters (a-z, A-Z, 0-9)
 * - Underscores allowed
 * - No other special characters
 * 
 * @param {string} username - Username to validate
 * @returns {boolean} True if username is valid
 */
function isValidMinecraftUsername(username) {
    // Minecraft usernames: 3-16 characters, letters, numbers, underscores
    const minecraftUsernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
    return minecraftUsernameRegex.test(username);
}

/**
 * Create response embed based on command result
 * 
 * Generates a color-coded embed displaying the invitation command result.
 * Different colors, titles, and messages are used based on success, failure type,
 * timeout, system error, or cancellation.
 * 
 * Embed Colors:
 * - Success: Green (0x00FF00)
 * - Command Error: Red (0xFF0000)
 * - Timeout: Orange (0xFFA500)
 * - System Error: Red (0xFF0000)
 * - Cancelled: Gray (0x808080)
 * - Unknown Error: Red (0xFF0000)
 * 
 * Result Types:
 * - success: Invitation sent successfully
 * - timeout: No response from Minecraft within 15s
 * - command_error: Minecraft rejected the invitation (player already in guild, guild full, etc.)
 * - system_error: System-level failure in command processing
 * - cancelled: Command was cancelled before completion
 * 
 * @param {string} guildName - Guild name
 * @param {string} username - Player username
 * @param {object} result - Command result from listener
 * @param {boolean} result.success - Whether command succeeded
 * @param {string} result.message - Success message (if success)
 * @param {string} result.error - Error message (if failure)
 * @param {string} result.type - Result type (success, timeout, command_error, system_error, cancelled)
 * @returns {EmbedBuilder} Configured embed builder
 */
function createResponseEmbed(guildName, username, result) {
    const embed = new EmbedBuilder()
        .addFields(
            { name: '👤 Player', value: username, inline: true },
            { name: '🏰 Guild', value: guildName, inline: true }
        )
        .setTimestamp();

    if (result.success) {
        // Success case
        embed
            .setTitle('✅ Guild Invite Successful')
            .setDescription(`Successfully invited \`${username}\` to guild \`${guildName}\`!`)
            .setColor(0x00FF00) // Green color for success
            .addFields(
                { name: '📝 Response', value: result.message || 'Invite sent successfully', inline: false }
            );
    } else {
        // Failure cases - determine title, description, and color based on error type
        let title, description, color;

        switch (result.type) {
            case 'timeout':
                title = '⏰ Command Timeout';
                description = `No response received from Minecraft within 15 seconds.`;
                color = 0xFFA500; // Orange
                break;
            case 'command_error':
                title = '❌ Invite Failed';
                description = `Failed to invite \`${username}\` to guild \`${guildName}\`.`;
                color = 0xFF0000; // Red
                break;
            case 'system_error':
                title = '🔧 System Error';
                description = `A system error occurred while processing the invite.`;
                color = 0xFF0000; // Red
                break;
            case 'cancelled':
                title = '🚫 Command Cancelled';
                description = `The invite command was cancelled.`;
                color = 0x808080; // Gray
                break;
            default:
                title = '❌ Unknown Error';
                description = `An unknown error occurred.`;
                color = 0xFF0000; // Red
        }

        embed
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .addFields(
                { name: '🚫 Error', value: result.error || 'Unknown error', inline: false }
            );
    }

    return embed;
}