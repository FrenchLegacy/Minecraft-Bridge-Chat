/**
 * Guild Promote Command - Discord Slash Command for Promoting Guild Members
 * 
 * This file handles the Discord slash command for promoting guild members in Minecraft.
 * It provides an interactive interface with real-time feedback through embeds, allowing
 * Discord users to promote players within their Minecraft guilds remotely.
 * 
 * The command provides:
 * - Validation of guild name and username format
 * - Real-time command execution feedback with embeds
 * - Response listening system to capture Minecraft feedback
 * - Timeout handling (15 seconds)
 * - Comprehensive error handling and user-friendly error messages
 * - Singleton pattern for command response listener
 * 
 * Command flow:
 * 1. Validate guild existence and connection status
 * 2. Validate Minecraft username format (3-16 alphanumeric + underscore)
 * 3. Send promote command to Minecraft via bot manager
 * 4. Listen for response from Minecraft game chat
 * 5. Display result to user with formatted embed (success, timeout, or error)
 * 
 * Required permissions: moderator
 * Command format: /guild promote <guildname> <username>
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
 * Guild Promote Command Module
 * 
 * Exports the command configuration and execution handler for Discord.js
 * slash command system.
 * 
 * @module guild/promote
 */
module.exports = {
  permission: "moderator",

  /**
   * Execute the promote command
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
    await handlePromoteCommand(interaction, context);
  },
};

/**
 * Handle the promote command execution
 * 
 * Processes the promote command by:
 * 1. Extracting and validating command parameters
 * 2. Checking guild configuration and connection status
 * 3. Validating username format
 * 4. Setting up response listener
 * 5. Executing command on Minecraft
 * 6. Waiting for and displaying results
 * 
 * @async
 * @param {ChatInputCommandInteraction} interaction - Discord interaction object
 * @param {object} context - Application context
 * @param {object} context.bridgeLocator - Bridge locator for accessing managers
 * @param {ConfigManager} context.config - Configuration manager instance
 * 
 * @throws {Error} If Minecraft manager is unavailable
 * @throws {Error} If guild is not found or not connected
 * @throws {Error} If username format is invalid
 * @throws {Error} If command execution fails
 */
async function handlePromoteCommand(interaction, context) {
  const guildName = interaction.options.getString("guildname");
  const username = interaction.options.getString("username");

  try {
    logger.discord(
      `[GUILD-PROMOTE] Processing promote command: ${guildName} -> ${username}`
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

    // Validate username format
    if (!isValidMinecraftUsername(username)) {
      await interaction.editReply({
        content: `❌ Invalid username format: \`${username}\`.`,
        ephemeral: true,
      });
      return;
    }

    const command = `/g promote ${username}`;

    // Set up response listener for Minecraft feedback
    const responseListener = getCommandResponseListener();
    const listenerId = responseListener.createListener(
      guildConfig.id,
      "promote",
      username,
      command,
      15000,
      interaction
    );

    // Display initial processing embed
    const initialEmbed = new EmbedBuilder()
      .setTitle("🔄 Processing Guild Promotion")
      .setDescription(`Promoting \`${username}\` in guild \`${guildName}\`...`)
      .setColor(0xffa500)
      .addFields(
        { name: "👤 Player", value: username, inline: true },
        { name: "🏰 Guild", value: guildName, inline: true },
        {
          name: "⏱️ Status",
          value: "Sending promote command...",
          inline: false,
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [initialEmbed] });

    try {
      // Execute command on Minecraft server
      await botManager.executeCommand(guildConfig.id, command);
      logger.discord(
        `[GUILD-PROMOTE] Command sent to ${guildName}: ${command}`
      );

      // Wait for Minecraft response (15 second timeout)
      const result = await responseListener.waitForResult(listenerId);
      const responseEmbed = createResponseEmbed(guildName, username, result);
      await interaction.editReply({ embeds: [responseEmbed] });
    } catch (commandError) {
      logger.logError(
        commandError,
        `[GUILD-PROMOTE] Failed to execute promote command`
      );
      responseListener.cancelListener(listenerId);

      // Display command execution error embed
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Command Execution Failed")
        .setDescription(`Failed to execute promote command for \`${username}\``)
        .setColor(0xff0000)
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
    logger.logError(
      error,
      `[GUILD-PROMOTE] Unexpected error processing promote command`
    );
    
    // Display unexpected error embed
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Unexpected Error")
      .setDescription(
        "An unexpected error occurred while processing the promote command."
      )
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
 * Create response embed based on command result
 * 
 * Generates a formatted Discord embed showing the result of the promote command.
 * Handles three types of results:
 * - Success: Green embed with success message
 * - Timeout: Orange embed indicating no response received
 * - Error/Failure: Red embed with error details
 * 
 * @param {string} guildName - Name of the guild
 * @param {string} username - Username of the player being promoted
 * @param {object} result - Result object from command response listener
 * @param {boolean} result.success - Whether the command succeeded
 * @param {string} [result.message] - Success message from Minecraft
 * @param {string} [result.error] - Error message if failed
 * @param {string} [result.type] - Result type ('timeout', 'cancelled', or default)
 * @returns {EmbedBuilder} Formatted Discord embed with result
 * 
 * @example
 * // Success result
 * const result = { success: true, message: "Player promoted to Member" };
 * const embed = createResponseEmbed("MyGuild", "Player123", result);
 * 
 * @example
 * // Timeout result
 * const result = { success: false, type: "timeout", error: "No response" };
 * const embed = createResponseEmbed("MyGuild", "Player123", result);
 */
function createResponseEmbed(guildName, username, result) {
  const embed = new EmbedBuilder()
    .addFields(
      { name: "👤 Player", value: username, inline: true },
      { name: "🏰 Guild", value: guildName, inline: true }
    )
    .setTimestamp();

  if (result.success) {
    embed
      .setTitle("✅ Guild Promotion Successful")
      .setDescription(
        `Successfully promoted \`${username}\` in guild \`${guildName}\`.`
      )
      .setColor(0x00ff00)
      .addFields({
        name: "📝 Response",
        value: result.message || "Promotion successful",
        inline: false,
      });
  } else {
    let title = "❌ Promotion Failed";
    let description = `Failed to promote \`${username}\` in guild \`${guildName}\`.`;
    let color = 0xff0000;
    
    if (result.type === "timeout") {
      title = "⏰ Command Timeout";
      description = "No response received from Minecraft within 15 seconds.";
      color = 0xffa500;
    } else if (result.type === "cancelled") {
      title = "🚫 Command Cancelled";
      description = "The promote command was cancelled.";
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