/**
 * Guild Mute Subcommand - Chat Muting System
 * 
 * This subcommand handles muting guild chat either globally (entire guild) or for
 * specific players. It sends the mute command to Minecraft, tracks the response through
 * CommandResponseListener, and provides feedback to Discord users through rich embeds
 * showing mute status, duration, and results.
 * 
 * Command Features:
 * - Mute entire guild chat (global scope)
 * - Mute specific player in guild chat (player scope)
 * - Flexible time duration format (hours, minutes, days, seconds)
 * - Real-time status updates through embed messages
 * - Response tracking with 15-second timeout
 * - Comprehensive error handling and validation
 * - Guild and connection validation
 * - Username format validation (when muting player)
 * - Time format validation (ensures proper duration syntax)
 * - Visual feedback with color-coded embeds
 * 
 * Scope Types:
 * - global: Mutes entire guild chat for all members
 *   Command: /g mute everyone <time>
 *   Use case: Temporary chat silence during events, maintenance, etc.
 * 
 * - player: Mutes specific player in guild chat
 *   Command: /g mute <username> <time>
 *   Use case: Temporary chat restriction for individual members
 * 
 * Time Format:
 * Supports flexible duration formats combining multiple units:
 * - s: seconds (45s)
 * - m: minutes (30m)
 * - h: hours (2h)
 * - d: days (7d)
 * - Combined: (1h30m, 2d12h, etc.)
 * 
 * Examples:
 * - "1h" → 1 hour
 * - "30m" → 30 minutes
 * - "2d" → 2 days
 * - "1h30m" → 1 hour and 30 minutes
 * - "45s" → 45 seconds
 * 
 * Validation Checks:
 * - Minecraft manager availability
 * - Guild existence and enabled status
 * - Guild connection status
 * - Scope-specific validation (username required for player scope)
 * - Username format (3-16 alphanumeric with underscores)
 * - Time format (valid duration syntax)
 * 
 * Response Types:
 * - Success: Green embed with confirmation message
 * - Failure: Red embed with error details
 * - Timeout: Orange embed indicating no response within 15s
 * - Cancelled: Gray embed for cancelled operations
 * 
 * Integration:
 * - CommandResponseListener: Tracks Minecraft chat for mute confirmation
 * - BotManager: Executes guild commands through connection
 * - Logger: Records all operations for debugging and audit
 * 
 * Usage: 
 * - /guild mute <guildname> global <time>
 * - /guild mute <guildname> player <time> <username>
 * 
 * Permission: Moderator (requires moderator role)
 * Response: Ephemeral (only visible to command executor)
 * 
 * Example Usage:
 * - /guild mute FrenchLegacy global 1h
 *   Result: Mutes entire guild chat for 1 hour
 * 
 * - /guild mute FrenchLegacy player 30m PlayerName
 *   Result: Mutes PlayerName in guild chat for 30 minutes
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
 * Mute Subcommand Module
 * 
 * Exports configuration and execution function for the mute subcommand.
 * 
 * @module guild/mute
 * @type {object}
 * @property {string} permission - Required permission level ('moderator')
 * @property {Function} execute - Command execution function
 */
module.exports = {
  /**
   * Permission level required to execute this subcommand
   * 
   * Requires moderator role to prevent unauthorized chat muting.
   * This ensures only trusted users can silence guild chat.
   * 
   * @type {string}
   */
  permission: "moderator",

  /**
   * Execute the mute subcommand
   * 
   * Entry point for the mute command. Defers the reply immediately
   * to prevent timeout, then delegates to handleMuteCommand for processing.
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
    await handleMuteCommand(interaction, context);
  },
};

/**
 * Handle mute command execution
 * 
 * Main logic for muting guild chat. Performs validation based on scope,
 * constructs appropriate Minecraft command, sends it through bot connection,
 * tracks the response, and updates Discord user with the result.
 * 
 * Execution Flow:
 * 1. Extract parameters (guild name, scope, username, time)
 * 2. Validate Minecraft manager availability
 * 3. Find and validate guild configuration
 * 4. Verify guild connection status
 * 5. Validate inputs based on scope (username for player, time format)
 * 6. Construct appropriate mute command (global or player-specific)
 * 7. Create response listener for tracking
 * 8. Execute command through bot connection
 * 9. Wait for response from listener (15s timeout)
 * 10. Update embed with final result
 * 
 * Scope-Based Logic:
 * - Global scope: No username required, mutes "everyone"
 * - Player scope: Username required and validated
 * 
 * Error Handling:
 * - Manager unavailable: Error message to user
 * - Guild not found: List available guilds
 * - Guild not connected: Connection status message
 * - Missing username (player scope): Validation message
 * - Invalid username format: Format validation message
 * - Invalid time format: Format examples provided
 * - No connection found: Connection error message
 * - Command execution failure: Error details with cancellation
 * - Unexpected errors: Generic error message with details
 * 
 * @async
 * @private
 * @param {ChatInputCommandInteraction} interaction - Discord interaction object
 * @param {object} context - Command execution context
 * @returns {Promise<void>}
 */
async function handleMuteCommand(interaction, context) {
  const guildName = interaction.options.getString("guildname");
  const scope = interaction.options.getString("scope");
  const username = interaction.options.getString("username");
  const time = interaction.options.getString("time");

  try {
    logger.discord(
      `[GUILD-MUTE] Processing mute command: ${guildName} -> ${scope} ${username ? `(${username})` : ''} for ${time}`
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

    // Validate inputs based on scope
    if (scope === "player") {
      if (!username) {
        await interaction.editReply({
          content: "❌ Username is required when muting a specific player.",
          ephemeral: true,
        });
        return;
      }

      if (!isValidMinecraftUsername(username)) {
        await interaction.editReply({
          content: `❌ Invalid username format: \`${username}\`.`,
          ephemeral: true,
        });
        return;
      }
    }

    // Validate time format
    if (!isValidTimeFormat(time)) {
      await interaction.editReply({
        content: "❌ Invalid time format. Use formats like: 1h, 30m, 2d, etc.",
        ephemeral: true,
      });
      return;
    }

    // Construct the appropriate command based on scope
    let command;
    if (scope === "global") {
      command = `/g mute everyone ${time}`;
    } else {
      command = `/g mute ${username} ${time}`;
    }

    // Create command response listener
    const responseListener = getCommandResponseListener();
    const listenerId = responseListener.createListener(
      guildConfig.id,
      "mute",
      username || "everyone",
      command,
      15000, // 15 second timeout
      interaction
    );

    try {
      // Get the connection for this guild
      const connection = botManager.connections.get(guildConfig.id);
      if (!connection) {
        responseListener.cancelListener(listenerId);
        await interaction.editReply({
          content: `❌ No active connection found for guild \`${guildName}\`.`,
          ephemeral: true,
        });
        return;
      }

      logger.discord(`[GUILD-MUTE] Executing command: ${command}`);

      // Execute the command through connection
      await connection.executeCommand(command);

      // Wait for response from listener
      const result = await responseListener.waitForResult(listenerId);

      // Create and send response embed
      const embed = createMuteResponseEmbed(guildName, scope, username, time, result);
      await interaction.editReply({ embeds: [embed] });

    } catch (commandError) {
      logger.logError(commandError, `[GUILD-MUTE] Command execution failed`);

      // Cancel listener since command execution failed
      responseListener.cancelListener(listenerId);

      // Send command execution error embed
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Command Execution Failed")
        .setDescription(`Failed to execute mute command for \`${scope === "global" ? "guild" : username}\``)
        .setColor(0xff0000) // Red
        .addFields(
          { name: "🏰 Guild", value: guildName, inline: true },
          { name: "🔇 Scope", value: scope, inline: true },
          { name: "⏰ Duration", value: time, inline: true },
          { name: "🚫 Error", value: commandError.message || "Unknown error occurred", inline: false }
        )
        .setTimestamp();

      if (scope === "player") {
        errorEmbed.addFields({ name: "👤 Player", value: username, inline: true });
      }

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  } catch (error) {
    // Handle unexpected errors
    logger.logError(error, `[GUILD-MUTE] Unexpected error processing mute command`);

    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Unexpected Error")
      .setDescription("An unexpected error occurred while processing the mute command.")
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
 * @returns {object|null} Guild configuration or null if not found
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
 * Validate time format
 * 
 * Checks if time string follows valid duration format. Supports multiple
 * time units that can be combined: seconds (s), minutes (m), hours (h), days (d).
 * 
 * Valid formats:
 * - Single unit: "1h", "30m", "45s", "7d"
 * - Multiple units: "1h30m", "2d12h", "1h30m45s"
 * - Case insensitive: "1H", "30M", "2D"
 * 
 * Invalid formats:
 * - No unit: "30" (rejected)
 * - Invalid unit: "30x" (rejected)
 * - Spaces: "1h 30m" (rejected)
 * - Decimals: "1.5h" (rejected)
 * 
 * @param {string} timeString - Time string to validate
 * @returns {boolean} True if format is valid
 */
function isValidTimeFormat(timeString) {
  // Accept formats like: 1h, 30m, 2d, 1h30m, 45s, etc.
  const timeRegex = /^(\d+[smhd])+$/i;
  return timeRegex.test(timeString);
}

/**
 * Create mute response embed based on command result
 * 
 * Generates a color-coded embed displaying the mute command result.
 * Different titles, descriptions, and colors are used based on success,
 * timeout, or cancellation. Includes scope-specific information.
 * 
 * Embed Colors:
 * - Success: Green (0x00ff00)
 * - Failure: Red (0xff0000)
 * - Timeout: Orange (0xffa500)
 * - Cancelled: Gray (0x808080)
 * 
 * Fields Included:
 * - Guild name
 * - Scope (global/player)
 * - Duration (time)
 * - Player name (only for player scope)
 * - Response message or error details
 * 
 * @param {string} guildName - Guild name
 * @param {string} scope - Mute scope ('global' or 'player')
 * @param {string} username - Player username (optional, only for player scope)
 * @param {string} time - Mute duration
 * @param {object} result - Command result from listener
 * @param {boolean} result.success - Whether command succeeded
 * @param {string} result.message - Success message (if success)
 * @param {string} result.error - Error message (if failure)
 * @param {string} result.type - Result type (success, timeout, cancelled)
 * @returns {EmbedBuilder} Configured embed builder
 */
function createMuteResponseEmbed(guildName, scope, username, time, result) {
  const embed = new EmbedBuilder()
    .addFields(
      { name: "🏰 Guild", value: guildName, inline: true },
      { name: "🔇 Scope", value: scope, inline: true },
      { name: "⏰ Duration", value: time, inline: true }
    )
    .setTimestamp();

  // Add player field only for player scope
  if (scope === "player") {
    embed.addFields({ name: "👤 Player", value: username, inline: true });
  }

  if (result.success) {
    // Success case
    embed
      .setTitle("✅ Guild Mute Successful")
      .setDescription(
        scope === "global"
          ? `Successfully muted guild \`${guildName}\` for ${time}.`
          : `Successfully muted \`${username}\` in guild \`${guildName}\` for ${time}.`
      )
      .setColor(0x00ff00) // Green
      .addFields({
        name: "📝 Response",
        value: result.message || "Mute applied successfully",
        inline: false,
      });
  } else {
    // Failure cases - determine title, description, and color based on error type
    let title = "❌ Mute Failed";
    let description = scope === "global"
      ? `Failed to mute guild \`${guildName}\`.`
      : `Failed to mute \`${username}\` in guild \`${guildName}\`.`;
    let color = 0xff0000; // Red

    // Handle specific failure types
    if (result.type === "timeout") {
      title = "⏰ Command Timeout";
      description = "No response received from Minecraft within 15 seconds.";
      color = 0xffa500; // Orange
    } else if (result.type === "cancelled") {
      title = "🚫 Command Cancelled";
      description = "The mute command was cancelled.";
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