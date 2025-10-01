/**
 * Guild Demote Subcommand - Player Rank Demotion
 * 
 * This subcommand handles demoting players to the previous rank in a Minecraft guild.
 * It sends the demotion command to the Minecraft bot, tracks the response through
 * CommandResponseListener, and provides real-time feedback to Discord users through
 * rich embeds showing the demotion status and results.
 * 
 * Command Features:
 * - Demote player to previous rank in guild hierarchy
 * - Real-time status updates through embed messages
 * - Response tracking with 15-second timeout
 * - Comprehensive error handling and validation
 * - Guild and connection validation
 * - Username format validation (Minecraft standards)
 * - Visual feedback with color-coded embeds
 * - Command execution logging for audit trail
 * 
 * Validation Checks:
 * - Minecraft manager availability
 * - Guild existence and enabled status
 * - Guild connection status
 * - Username format (3-16 alphanumeric characters with underscores)
 * 
 * Response Types:
 * - Success: Green embed with confirmation message
 * - Failure: Red embed with error details
 * - Timeout: Orange embed indicating no response within 15s
 * - Cancelled: Gray embed for cancelled operations
 * - Command Error: Red embed with execution error details
 * 
 * Embed Stages:
 * 1. Initial: Orange processing embed while command is sent
 * 2. Final: Color-coded result embed based on command outcome
 * 
 * Integration:
 * - CommandResponseListener: Tracks Minecraft chat for demotion confirmation
 * - BotManager: Executes guild commands in Minecraft
 * - Logger: Records all operations for debugging and audit
 * 
 * Usage: /guild demote <guildname> <username>
 * Permission: Moderator (requires moderator role)
 * Response: Ephemeral (only visible to command executor)
 * 
 * Example:
 * /guild demote FrenchLegacy PlayerName
 * Result: Demotes PlayerName to the previous rank in FrenchLegacy guild
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { EmbedBuilder } = require("discord.js");

// Specific Imports
const CommandResponseListener = require("../../handlers/CommandResponseListener.js");
const logger = require("../../../../shared/logger");

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
 * Demote Subcommand Module
 * 
 * Exports configuration and execution function for the demote subcommand.
 * 
 * @module guild/demote
 * @type {object}
 * @property {string} permission - Required permission level ('moderator')
 * @property {Function} execute - Command execution function
 */
module.exports = {
  /**
   * Permission level required to execute this subcommand
   * 
   * Requires moderator role to prevent unauthorized rank changes.
   * This ensures only trusted users can modify guild member ranks.
   * 
   * @type {string}
   */
  permission: "moderator",

  /**
   * Execute the demote subcommand
   * 
   * Entry point for the demote command. Defers the reply immediately
   * to prevent timeout, then delegates to handleDemoteCommand for processing.
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
    await handleDemoteCommand(interaction, context);
  },
};

/**
 * Handle demote command execution
 * 
 * Main logic for demoting a player in a guild. Performs validation,
 * sends the demotion command to Minecraft, tracks the response, and
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
 * 8. Execute demotion command in Minecraft
 * 9. Wait for response from listener (15s timeout)
 * 10. Update embed with final result
 * 
 * Error Handling:
 * - Manager unavailable: Error message to user
 * - Guild not found: List available guilds
 * - Guild not connected: Connection status message
 * - Invalid username: Format validation message
 * - Command execution failure: Error details
 * - Unexpected errors: Generic error message with details
 * 
 * @async
 * @private
 * @param {ChatInputCommandInteraction} interaction - Discord interaction object
 * @param {object} context - Command execution context
 * @returns {Promise<void>}
 */
async function handleDemoteCommand(interaction, context) {
  const guildName = interaction.options.getString("guildname");
  const username = interaction.options.getString("username");

  try {
    logger.discord(
      `[GUILD-DEMOTE] Processing demote command: ${guildName} -> ${username}`
    );

    // Validate Minecraft manager availability
    const minecraftManager = context.bridgeLocator.getMinecraftManager?.();
    if (!minecraftManager) {
      await interaction.editReply({
        content: "❌ Minecraft manager not available. Please try again later.",
        ephemeral: true,
      });
      return;
    }

    // Find and validate guild configuration
    const guildConfig = findGuildByName(context.config, guildName);
    if (!guildConfig) {
      await interaction.editReply({
        content: `❌ Guild \`${guildName}\` not found. Available guilds: ${getAvailableGuilds(
          context.config
        ).join(", ")}`,
        ephemeral: true,
      });
      return;
    }

    // Verify guild connection status
    const botManager = minecraftManager._botManager;
    if (!botManager || !botManager.isGuildConnected(guildConfig.id)) {
      await interaction.editReply({
        content: `❌ Guild \`${guildName}\` is not currently connected to Minecraft.`,
        ephemeral: true,
      });
      return;
    }

    // Validate username format
    if (!isValidMinecraftUsername(username)) {
      await interaction.editReply({
        content: `❌ Invalid username format: \`${username}\`.`,
        ephemeral: true,
      });
      return;
    }

    // Prepare Minecraft command
    const command = `/g demote ${username}`;

    // Create response listener for tracking
    const responseListener = getCommandResponseListener();
    const listenerId = responseListener.createListener(
      guildConfig.id,
      "demote",
      username,
      command,
      15000, // 15 second timeout
      interaction
    );

    // Send initial processing embed
    const initialEmbed = new EmbedBuilder()
      .setTitle("🔄 Processing Guild Demotion")
      .setDescription(`Demoting \`${username}\` in guild \`${guildName}\`...`)
      .setColor(0xffa500) // Orange
      .addFields(
        { name: "👤 Player", value: username, inline: true },
        { name: "🏰 Guild", value: guildName, inline: true },
        { name: "⏱️ Status", value: "Sending demote command...", inline: false }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [initialEmbed] });

    try {
      // Execute command in Minecraft
      await botManager.executeCommand(guildConfig.id, command);
      logger.discord(`[GUILD-DEMOTE] Command sent to ${guildName}: ${command}`);

      // Wait for response from listener
      const result = await responseListener.waitForResult(listenerId);
      
      // Create and send final result embed
      const responseEmbed = createResponseEmbed(guildName, username, result);
      await interaction.editReply({ embeds: [responseEmbed] });
      
    } catch (commandError) {
      logger.logError(
        commandError,
        `[GUILD-DEMOTE] Failed to execute demote command`
      );
      responseListener.cancelListener(listenerId);

      // Send command execution error embed
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Command Execution Failed")
        .setDescription(`Failed to execute demote command for \`${username}\``)
        .setColor(0xff0000) // Red
        .addFields(
          { name: "👤 Player", value: username, inline: true },
          { name: "🏰 Guild", value: guildName, inline: true },
          {
            name: "🚫 Error",
            value: commandError.message || "Unknown error occurred",
            inline: false,
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  } catch (error) {
    // Handle unexpected errors
    logger.logError(
      error,
      `[GUILD-DEMOTE] Unexpected error processing demote command`
    );
    
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Unexpected Error")
      .setDescription(
        "An unexpected error occurred while processing the demote command."
      )
      .setColor(0xff0000) // Red
      .addFields({
        name: "🚫 Error",
        value: error.message || "Unknown error",
        inline: false,
      })
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
 * @returns {object|undefined} Guild configuration or undefined if not found
 */
function findGuildByName(config, guildName) {
  const guilds = config.get("guilds") || [];
  return guilds.find(
    (guild) =>
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
  const guilds = config.get("guilds") || [];
  return guilds.filter((guild) => guild.enabled).map((guild) => guild.name);
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
  const minecraftUsernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
  return minecraftUsernameRegex.test(username);
}

/**
 * Create response embed based on command result
 * 
 * Generates a color-coded embed displaying the demotion command result.
 * Different colors and messages are used based on success, failure type,
 * timeout, or cancellation.
 * 
 * Embed Colors:
 * - Success: Green (0x00ff00)
 * - Failure: Red (0xff0000)
 * - Timeout: Orange (0xffa500)
 * - Cancelled: Gray (0x808080)
 * 
 * @param {string} guildName - Guild name
 * @param {string} username - Player username
 * @param {object} result - Command result from listener
 * @param {boolean} result.success - Whether command succeeded
 * @param {string} result.message - Success message (if success)
 * @param {string} result.error - Error message (if failure)
 * @param {string} result.type - Result type (success, timeout, cancelled, etc.)
 * @returns {EmbedBuilder} Configured embed builder
 */
function createResponseEmbed(guildName, username, result) {
  const embed = new EmbedBuilder()
    .addFields(
      { name: "👤 Player", value: username, inline: true },
      { name: "🏰 Guild", value: guildName, inline: true }
    )
    .setTimestamp();

  if (result.success) {
    // Success case
    embed
      .setTitle("✅ Guild Demotion Successful")
      .setDescription(
        `Successfully demoted \`${username}\` in guild \`${guildName}\`.`
      )
      .setColor(0x00ff00) // Green
      .addFields({
        name: "📝 Response",
        value: result.message || "Demotion successful",
        inline: false,
      });
  } else {
    // Failure cases
    let title = "❌ Demotion Failed";
    let description = `Failed to demote \`${username}\` in guild \`${guildName}\`.`;
    let color = 0xff0000; // Red
    
    // Handle specific failure types
    if (result.type === "timeout") {
      title = "⏰ Command Timeout";
      description = "No response received from Minecraft within 15 seconds.";
      color = 0xffa500; // Orange
    } else if (result.type === "cancelled") {
      title = "🚫 Command Cancelled";
      description = "The demote command was cancelled.";
      color = 0x808080; // Gray
    }

    embed
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .addFields({
        name: "🚫 Error",
        value: result.error || "Unknown error",
        inline: false,
      });
  }

  return embed;
}