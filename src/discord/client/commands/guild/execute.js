/**
 * Guild Execute Subcommand - Custom Command Execution
 * 
 * This subcommand allows administrators to execute arbitrary guild commands in Minecraft.
 * Unlike other guild subcommands that track responses, this command only confirms the
 * command was sent to Minecraft without waiting for a response. This provides flexibility
 * for executing any guild command while maintaining security through admin-only access.
 * 
 * Command Features:
 * - Execute any custom guild command in Minecraft
 * - Admin-only access for security
 * - Automatic /g prefix addition
 * - Prefix validation (prevents duplicate /g or /guild)
 * - Immediate confirmation of command sending
 * - No response tracking (fire-and-forget)
 * - Comprehensive error handling and validation
 * - Guild and connection validation
 * 
 * Security:
 * - Requires admin permission level
 * - Validates guild existence and enabled status
 * - Verifies guild connection status
 * - Prevents command injection through prefix validation
 * 
 * Validation Checks:
 * - Minecraft manager availability
 * - Guild existence and enabled status
 * - Guild connection status
 * - Command prefix validation (no /g or /guild allowed)
 * 
 * Response Types:
 * - Success: Green embed confirming command was sent
 * - Command Error: Red embed with execution error details
 * - Unexpected Error: Red embed for system-level errors
 * 
 * Important Note:
 * This command only confirms the command was SENT to Minecraft, not that it was
 * successfully executed or what the game's response was. For commands requiring
 * response validation (invite, kick, promote, demote, setrank), use the dedicated
 * subcommands which track responses through CommandResponseListener.
 * 
 * Usage: /guild execute <guildname> <command_to_execute>
 * Permission: Admin (requires administrator role)
 * Response: Ephemeral (only visible to command executor)
 * 
 * Examples:
 * - /guild execute FrenchLegacy top
 *   Executes: /g top
 * 
 * - /guild execute FrenchLegacy online
 *   Executes: /g online
 * 
 * - /guild execute FrenchLegacy setdescription New guild description
 *   Executes: /g setdescription New guild description
 * 
 * Invalid Usage:
 * - /guild execute FrenchLegacy /g top (❌ includes prefix)
 * - /guild execute FrenchLegacy /guild online (❌ includes prefix)
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { EmbedBuilder } = require('discord.js');

// Specific Imports
const logger = require('../../../../shared/logger');

/**
 * Create success response embed
 * 
 * Generates a green embed confirming the command was sent successfully.
 * Includes an important footer note explaining this only confirms sending,
 * not game response.
 * 
 * @param {string} guildName - Guild name where command was sent
 * @param {string} command - Full command that was executed (including /g prefix)
 * @returns {EmbedBuilder} Configured success embed
 */
function createSuccessEmbed(guildName, command) {
    return new EmbedBuilder()
        .setTitle('✅ Command Sent Successfully')
        .setDescription(`Command has been sent to guild \`${guildName}\``)
        .setColor(0x00FF00) // Green
        .addFields(
            { name: '🏰 Guild', value: guildName, inline: true },
            { name: '📝 Command', value: `\`${command}\``, inline: false }
        )
        .setFooter({ text: 'Note: This only confirms the command was sent, not the game response.' })
        .setTimestamp();
}

/**
 * Create error response embed
 * 
 * Generates a red embed displaying command execution error.
 * Shows the guild name, attempted command, and error details.
 * 
 * @param {string} guildName - Guild name where command failed
 * @param {string} command - Full command that failed (including /g prefix)
 * @param {string} errorMessage - Error message describing the failure
 * @returns {EmbedBuilder} Configured error embed
 */
function createErrorEmbed(guildName, command, errorMessage) {
    return new EmbedBuilder()
        .setTitle('❌ Command Execution Failed')
        .setDescription(`Failed to send command to guild \`${guildName}\``)
        .setColor(0xFF0000) // Red
        .addFields(
            { name: '🏰 Guild', value: guildName, inline: true },
            { name: '📝 Command', value: `\`${command}\``, inline: false },
            { name: '🚫 Error', value: errorMessage || 'Unknown error occurred', inline: false }
        )
        .setTimestamp();
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
 * Execute Subcommand Module
 * 
 * Exports configuration and execution function for the execute subcommand.
 * 
 * @module guild/execute
 * @type {object}
 * @property {string} permission - Required permission level ('admin')
 * @property {Function} execute - Command execution function
 */
module.exports = {
    /**
     * Permission level required to execute this subcommand
     * 
     * Requires admin role due to the unrestricted nature of custom command execution.
     * This prevents unauthorized users from executing potentially dangerous commands.
     * 
     * @type {string}
     */
    permission: 'admin',

    /**
     * Execute the execute subcommand
     * 
     * Entry point for the execute command. Defers the reply immediately
     * to prevent timeout, then delegates to handleExecuteCommand for processing.
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
        await interaction.deferReply({ ephemeral: true });
        await handleExecuteCommand(interaction, context);
    }
};

/**
 * Handle execute command execution
 * 
 * Main logic for executing a custom guild command. Performs validation,
 * formats the command with /g prefix, sends it to Minecraft, and provides
 * immediate confirmation without tracking the response.
 * 
 * Execution Flow:
 * 1. Extract command parameters (guild name, command to execute)
 * 2. Validate Minecraft manager availability
 * 3. Find and validate guild configuration
 * 4. Verify guild connection status
 * 5. Validate command prefix (reject if /g or /guild already present)
 * 6. Format command with /g prefix
 * 7. Execute command in Minecraft
 * 8. Send success confirmation embed
 * 
 * Key Differences from Other Subcommands:
 * - No CommandResponseListener tracking
 * - No response waiting or validation
 * - Immediate success confirmation after sending
 * - Admin-only for security
 * 
 * Prefix Validation:
 * The command checks if the user accidentally included the /g or /guild prefix
 * in their command. If found, it rejects the command to prevent sending
 * duplicate prefixes like "/g /g top" which would fail in Minecraft.
 * 
 * Error Handling:
 * - Manager unavailable: Error message to user
 * - Guild not found: List available guilds
 * - Guild not connected: Connection status message
 * - Invalid prefix: Validation message
 * - Command execution failure: Error details
 * - Unexpected errors: Generic error message
 * 
 * @async
 * @private
 * @param {ChatInputCommandInteraction} interaction - Discord interaction object
 * @param {object} context - Command execution context
 * @returns {Promise<void>}
 */
async function handleExecuteCommand(interaction, context) {
    const guildName = interaction.options.getString('guildname');
    const commandToExecute = interaction.options.getString('command_to_execute');
    
    try {
        logger.discord(`[GUILD-EXECUTE] Processing execute command: ${guildName} -> ${commandToExecute}`);
        
        // Get Minecraft manager
        const minecraftManager = context.bridgeLocator.getMinecraftManager?.();
        if (!minecraftManager) {
            await interaction.editReply({
                content: '❌ Minecraft manager not available. Please try again later.'
            });
            return;
        }

        // Find guild configuration
        const guildConfig = findGuildByName(context.config, guildName);
        if (!guildConfig) {
            await interaction.editReply({
                content: `❌ Guild \`${guildName}\` not found. Available guilds: ${getAvailableGuilds(context.config).join(', ')}`
            });
            return;
        }

        // Get bot manager and check connection
        const botManager = minecraftManager._botManager;
        if (!botManager || !botManager.isGuildConnected(guildConfig.id)) {
            await interaction.editReply({
                content: `❌ Guild \`${guildName}\` is not currently connected to Minecraft.`
            });
            return;
        }

        // Check if user accidentally included /g or /guild prefix
        if (commandToExecute.startsWith('/g ') || commandToExecute.startsWith('/guild ')) {
            await interaction.editReply({
                content: '❌ Do not include `/g` or `/guild` prefix in the command. Just provide the command itself.'
            });
            return;
        }

        // Format the final command with /g prefix
        const finalCommand = `/g ${commandToExecute}`;
        
        try {
            // Execute the command (fire-and-forget, no response tracking)
            await botManager.executeCommand(guildConfig.id, finalCommand);
            
            logger.discord(`[GUILD-EXECUTE] Command sent to ${guildName}: ${finalCommand}`);
            
            // Create and send success response
            const successEmbed = createSuccessEmbed(guildName, finalCommand);
            await interaction.editReply({ embeds: [successEmbed] });

        } catch (commandError) {
            logger.logError(commandError, `[GUILD-EXECUTE] Failed to execute command: ${finalCommand}`);
            
            // Create and send error response
            const errorEmbed = createErrorEmbed(guildName, finalCommand, commandError.message);
            await interaction.editReply({ embeds: [errorEmbed] });
        }

    } catch (error) {
        logger.logError(error, `[GUILD-EXECUTE] Unexpected error processing execute command`);
        
        // Send unexpected error embed
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Unexpected Error')
            .setDescription('An unexpected error occurred while processing the execute command.')
            .setColor(0xFF0000) // Red
            .setTimestamp();
        
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}