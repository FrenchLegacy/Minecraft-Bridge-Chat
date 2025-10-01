/**
 * Guild Unmute Command - Discord Slash Command for Unmuting Guild Chat
 * 
 * This file handles the Discord slash command for unmuting guild members or the entire
 * guild chat in Minecraft. It provides dual-mode functionality with real-time feedback
 * through embeds, allowing Discord users to remove chat restrictions from their guilds.
 * 
 * The command supports two operation modes:
 * 1. Global unmute: Unmutes the entire guild chat for all members
 * 2. Player unmute: Unmutes a specific player in the guild
 * 
 * The command provides:
 * - Dual-mode operation (global/player scope)
 * - Validation of guild name and username format (when applicable)
 * - Real-time command execution feedback with embeds
 * - Response listening system to capture Minecraft feedback
 * - Timeout handling (15 seconds)
 * - Comprehensive error handling and user-friendly error messages
 * - Singleton pattern for command response listener
 * - Dynamic embed content based on operation scope
 * 
 * Command flow:
 * 1. Validate guild existence and connection status
 * 2. Validate scope and required parameters (username for player scope)
 * 3. Validate Minecraft username format (only for player scope)
 * 4. Construct appropriate command based on scope
 * 5. Send unmute command to Minecraft via bot manager
 * 6. Listen for response from Minecraft game chat
 * 7. Display result to user with formatted embed (success, timeout, or error)
 * 
 * Required permissions: moderator
 * Command formats:
 * - Global: /guild unmute <guildname> global
 * - Player: /guild unmute <guildname> player <username>
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

// Singleton instance for command response listener
let commandResponseListener = null;

/**
 * Get or create CommandResponseListener singleton instance
 * 
 * Ensures only one instance of the command response listener exists
 * throughout the application lifecycle for efficient resource management.
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
 * Guild Unmute Command Module
 * 
 * Exports the command configuration and execution handler for Discord.js
 * slash command system. This command allows moderators to unmute either
 * the entire guild chat or specific players.
 * 
 * @module guild/unmute
 */
module.exports = {
  permission: "moderator",

  /**
   * Execute the unmute command
   * 
   * Main entry point for the slash command. Defers the reply for ephemeral
   * response and delegates to the main handler function.
   * 
   * @async
   * @param {ChatInputCommandInteraction} interaction - Discord interaction object
   * @param {object} context - Application context containing config and managers
   * @param {object} context.bridgeLocator - Bridge locator for accessing managers
   * @param {object} context.config - Configuration object
   */
  async execute(interaction, context) {
    await interaction.deferReply({ ephemeral: true });
    await handleUnmuteCommand(interaction, context);
  },
};

/**
 * Handle the unmute command execution
 * 
 * Processes the unmute command by:
 * 1. Extracting and validating command parameters (guildname, scope, username)
 * 2. Checking guild configuration and connection status
 * 3. Validating scope-specific requirements (username for player scope)
 * 4. Validating username format (only for player scope)
 * 5. Constructing appropriate command based on scope
 * 6. Setting up response listener
 * 7. Executing command on Minecraft
 * 8. Waiting for and displaying results
 * 
 * The function handles two distinct modes:
 * - Global mode: Unmutes entire guild chat with `/g unmute everyone`
 * - Player mode: Unmutes specific player with `/g unmute <username>`
 * 
 * @async
 * @param {ChatInputCommandInteraction} interaction - Discord interaction object
 * @param {object} context - Application context
 * @param {object} context.bridgeLocator - Bridge locator for accessing managers
 * @param {ConfigManager} context.config - Configuration manager instance
 * 
 * @throws {Error} If Minecraft manager is unavailable
 * @throws {Error} If guild is not found or not connected
 * @throws {Error} If username is missing for player scope
 * @throws {Error} If username format is invalid (player scope only)
 * @throws {Error} If command execution fails
 */
async function handleUnmuteCommand(interaction, context) {
  const guildName = interaction.options.getString("guildname");
  const scope = interaction.options.getString("scope");
  const username = interaction.options.getString("username");

  try {
    logger.discord(
      `[GUILD-UNMUTE] Processing unmute command: ${guildName} -> ${scope} ${username ? `(${username})` : ''}`
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

    // Check guild connection status
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
          content: "❌ Username is required when unmuting a specific player.",
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

    // Construct the appropriate command based on scope
    let command;
    if (scope === "global") {
      command = `/g unmute everyone`;
    } else {
      command = `/g unmute ${username}`;
    }

    // Create command response listener
    const responseListener = getCommandResponseListener();
    const listenerId = responseListener.createListener(
      guildConfig.id,
      "unmute",
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

      logger.discord(`[GUILD-UNMUTE] Executing command: ${command}`);

      // Execute the command on Minecraft server
      await connection.executeCommand(command);

      // Wait for Minecraft response (15 second timeout)
      const result = await responseListener.waitForResult(listenerId);

      // Create and send response embed
      const embed = createUnmuteResponseEmbed(guildName, scope, username, result);
      await interaction.editReply({ embeds: [embed] });

    } catch (commandError) {
      logger.logError(commandError, `[GUILD-UNMUTE] Command execution failed`);

      // Cancel listener since command execution failed
      responseListener.cancelListener(listenerId);

      // Display command execution error embed
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Command Execution Failed")
        .setDescription(`Failed to execute unmute command for \`${scope === "global" ? "guild" : username}\``)
        .setColor(0xff0000)
        .addFields(
          { name: "🏰 Guild", value: guildName, inline: true },
          { name: "🔊 Scope", value: scope, inline: true },
          { name: "🚫 Error", value: commandError.message || "Unknown error occurred", inline: false }
        )
        .setTimestamp();

      if (scope === "player") {
        errorEmbed.addFields({ name: "👤 Player", value: username, inline: true });
      }

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  } catch (error) {
    logger.logError(error, `[GUILD-UNMUTE] Unexpected error processing unmute command`);

    // Display unexpected error embed
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Unexpected Error")
      .setDescription("An unexpected error occurred while processing the unmute command.")
      .setColor(0xff0000)
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
 * Searches through the guilds array in config to find a guild matching
 * the provided name (case-insensitive) and that is enabled.
 * 
 * @param {ConfigManager} config - Configuration manager instance
 * @param {string} guildName - Name of the guild to find
 * @returns {object|undefined} Guild configuration object or undefined if not found
 * 
 * @example
 * const guild = findGuildByName(config, "MyGuild");
 * if (guild) {
 *   console.log(`Found guild: ${guild.name} (ID: ${guild.id})`);
 * }
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
 * Retrieves all enabled guilds from configuration and returns their names
 * for display in error messages or command options.
 * 
 * @param {ConfigManager} config - Configuration manager instance
 * @returns {string[]} Array of guild names that are enabled
 * 
 * @example
 * const guilds = getAvailableGuilds(config);
 * console.log(`Available guilds: ${guilds.join(", ")}`);
 * // Output: "Available guilds: Guild1, Guild2, Guild3"
 */
function getAvailableGuilds(config) {
  const guilds = config.get("guilds") || [];
  return guilds.filter((guild) => guild.enabled).map((guild) => guild.name);
}

/**
 * Validate Minecraft username format
 * 
 * Checks if the provided username matches Minecraft's username requirements:
 * - 3 to 16 characters in length
 * - Only alphanumeric characters (a-z, A-Z, 0-9) and underscores
 * - No spaces or special characters
 * 
 * This validation is only performed when the scope is "player".
 * 
 * @param {string} username - Username to validate
 * @returns {boolean} True if username is valid, false otherwise
 * 
 * @example
 * isValidMinecraftUsername("Player123"); // true
 * isValidMinecraftUsername("Valid_Name"); // true
 * isValidMinecraftUsername("ab"); // false (too short)
 * isValidMinecraftUsername("Name with spaces"); // false (invalid chars)
 * isValidMinecraftUsername("VeryLongUsername123"); // false (too long)
 */
function isValidMinecraftUsername(username) {
  const minecraftUsernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
  return minecraftUsernameRegex.test(username);
}

/**
 * Create response embed based on unmute command result
 * 
 * Generates a formatted Discord embed showing the result of the unmute command.
 * The embed content adapts based on the scope:
 * - Global scope: Shows guild unmute status
 * - Player scope: Shows player unmute status with username field
 * 
 * Handles three types of results:
 * - Success: Green embed with success message
 * - Timeout: Orange embed indicating no response received
 * - Error/Failure: Red embed with error details
 * 
 * @param {string} guildName - Name of the guild
 * @param {string} scope - Scope of unmute operation ('global' or 'player')
 * @param {string|null} username - Username of the player (null for global scope)
 * @param {object} result - Result object from command response listener
 * @param {boolean} result.success - Whether the command succeeded
 * @param {string} [result.message] - Success message from Minecraft
 * @param {string} [result.error] - Error message if failed
 * @param {string} [result.type] - Result type ('timeout', 'cancelled', or default)
 * @returns {EmbedBuilder} Formatted Discord embed with result
 * 
 * @example
 * // Success result - global scope
 * const result = { success: true, message: "Guild chat unmuted" };
 * const embed = createUnmuteResponseEmbed("MyGuild", "global", null, result);
 * 
 * @example
 * // Success result - player scope
 * const result = { success: true, message: "Player unmuted successfully" };
 * const embed = createUnmuteResponseEmbed("MyGuild", "player", "Player123", result);
 * 
 * @example
 * // Timeout result
 * const result = { success: false, type: "timeout", error: "No response" };
 * const embed = createUnmuteResponseEmbed("MyGuild", "global", null, result);
 * 
 * @example
 * // Error result - player scope
 * const result = { success: false, error: "Player not found" };
 * const embed = createUnmuteResponseEmbed("MyGuild", "player", "Player123", result);
 */
function createUnmuteResponseEmbed(guildName, scope, username, result) {
  const embed = new EmbedBuilder()
    .addFields(
      { name: "🏰 Guild", value: guildName, inline: true },
      { name: "🔊 Scope", value: scope, inline: true }
    )
    .setTimestamp();

  // Add player field only for player scope
  if (scope === "player") {
    embed.addFields({ name: "👤 Player", value: username, inline: true });
  }

  if (result.success) {
    embed
      .setTitle("✅ Guild Unmute Successful")
      .setDescription(
        scope === "global"
          ? `Successfully unmuted guild \`${guildName}\`.`
          : `Successfully unmuted \`${username}\` in guild \`${guildName}\`.`
      )
      .setColor(0x00ff00)
      .addFields({
        name: "📝 Response",
        value: result.message || "Unmute applied successfully",
        inline: false,
      });
  } else {
    let title = "❌ Unmute Failed";
    let description = scope === "global"
      ? `Failed to unmute guild \`${guildName}\`.`
      : `Failed to unmute \`${username}\` in guild \`${guildName}\`.`;
    let color = 0xff0000;

    if (result.type === "timeout") {
      title = "⏰ Command Timeout";
      description = "No response received from Minecraft within 15 seconds.";
      color = 0xffa500;
    } else if (result.type === "cancelled") {
      title = "🚫 Command Cancelled";
      description = "The unmute command was cancelled.";
      color = 0x808080;
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