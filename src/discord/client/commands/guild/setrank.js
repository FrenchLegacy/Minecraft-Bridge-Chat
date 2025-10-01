/**
 * Guild SetRank Command - Discord Slash Command for Setting Guild Member Ranks
 * 
 * This file handles the Discord slash command for setting specific ranks for guild members
 * in Minecraft. It provides an interactive interface with real-time feedback through embeds,
 * allowing Discord users to directly assign ranks to players within their Minecraft guilds.
 * 
 * The command provides:
 * - Validation of guild name, username format, and rank validity
 * - Dynamic rank validation based on guild configuration
 * - Real-time command execution feedback with embeds
 * - Response listening system to capture Minecraft feedback
 * - Timeout handling (15 seconds)
 * - Comprehensive error handling and user-friendly error messages
 * - Singleton pattern for command response listener
 * 
 * Command flow:
 * 1. Validate guild existence and connection status
 * 2. Validate Minecraft username format (3-16 alphanumeric + underscore)
 * 3. Validate rank against guild's configured ranks
 * 4. Send setrank command to Minecraft via bot manager
 * 5. Listen for response from Minecraft game chat
 * 6. Display result to user with formatted embed (success, timeout, or error)
 * 
 * Note: Unlike promote/demote which move players up/down one rank, setrank allows
 * direct assignment to any valid rank in the guild hierarchy.
 * 
 * Required permissions: moderator
 * Command format: /guild setrank <guildname> <username> <rank>
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { EmbedBuilder } = require("discord.js");

// Specific Imports
const CommandResponseListener = require("../../handlers/CommandResponseListener.js");
const BridgeLocator = require('../../../../bridgeLocator.js');
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
 * Guild SetRank Command Module
 * 
 * Exports the command configuration and execution handler for Discord.js
 * slash command system. This command allows moderators to set any valid
 * rank for guild members directly.
 * 
 * @module guild/setrank
 */
module.exports = {
  permission: "moderator",

  /**
   * Execute the setrank command
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
    await handleSetRankCommand(interaction, context);
  },
};

/**
 * Handle the setrank command execution
 * 
 * Processes the setrank command by:
 * 1. Extracting and validating command parameters (guildname, username, rank)
 * 2. Checking guild configuration and connection status
 * 3. Validating username format
 * 4. Validating rank against guild's configured valid ranks
 * 5. Setting up response listener
 * 6. Executing command on Minecraft
 * 7. Waiting for and displaying results
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
 * @throws {Error} If rank is not valid for the guild
 * @throws {Error} If command execution fails
 */
async function handleSetRankCommand(interaction, context) {
  const guildName = interaction.options.getString("guildname");
  const username = interaction.options.getString("username");
  const rank = interaction.options.getString("rank");

  try {
    logger.discord(
      `[GUILD-SETRANK] Processing setrank command: ${guildName} -> ${username} = ${rank}`
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

    // Validate rank is valid for this guild
    const validRanks = getValidRanksForGuild(guildName);
    if (!validRanks.map((r) => r.toLowerCase()).includes(rank.toLowerCase())) {
      await interaction.editReply({
        content: `❌ Invalid rank: \`${rank}\`. Valid ranks for ${guildName}: ${validRanks.join(
          ", "
        )}`,
        ephemeral: true,
      });
      return;
    }

    const command = `/g setrank ${username} ${rank}`;

    // Set up response listener for Minecraft feedback
    const responseListener = getCommandResponseListener();
    const listenerId = responseListener.createListener(
      guildConfig.id,
      "setrank",
      username,
      command,
      15000,
      interaction
    );

    // Display initial processing embed
    const initialEmbed = new EmbedBuilder()
      .setTitle("🔄 Processing Guild Rank Change")
      .setDescription(
        `Setting rank for \`${username}\` in guild \`${guildName}\` to \`${rank}\`...`
      )
      .setColor(0xffa500)
      .addFields(
        { name: "👤 Player", value: username, inline: true },
        { name: "🏰 Guild", value: guildName, inline: true },
        { name: "🎖️ Rank", value: rank, inline: true },
        {
          name: "⏱️ Status",
          value: "Sending setrank command...",
          inline: false,
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [initialEmbed] });

    try {
      // Execute command on Minecraft server
      await botManager.executeCommand(guildConfig.id, command);
      logger.discord(
        `[GUILD-SETRANK] Command sent to ${guildName}: ${command}`
      );

      // Wait for Minecraft response (15 second timeout)
      const result = await responseListener.waitForResult(listenerId);
      const responseEmbed = createResponseEmbed(
        guildName,
        username,
        rank,
        result
      );
      await interaction.editReply({ embeds: [responseEmbed] });
    } catch (commandError) {
      logger.logError(
        commandError,
        `[GUILD-SETRANK] Failed to execute setrank command`
      );
      responseListener.cancelListener(listenerId);

      // Display command execution error embed
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Command Execution Failed")
        .setDescription(`Failed to execute setrank command for \`${username}\``)
        .setColor(0xff0000)
        .addFields(
          { name: "👤 Player", value: username, inline: true },
          { name: "🏰 Guild", value: guildName, inline: true },
          { name: "🎖️ Rank", value: rank, inline: true },
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
      `[GUILD-SETRANK] Unexpected error processing setrank command`
    );
    
    // Display unexpected error embed
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Unexpected Error")
      .setDescription(
        "An unexpected error occurred while processing the setrank command."
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
 * Get valid ranks for a guild dynamically from configuration
 * 
 * Retrieves the list of valid ranks for a specific guild from the configuration.
 * This allows each guild to have its own custom rank hierarchy defined in the
 * configuration file. The function uses BridgeLocator singleton to access the
 * global configuration.
 * 
 * Rank validation is case-insensitive when comparing with user input.
 * 
 * @param {string} guildName - Name of the guild (case-insensitive)
 * @returns {string[]} Array of valid rank names for the guild, empty array if guild not found
 * 
 * @example
 * // Assuming guild has ranks: ["Member", "Officer", "Admin"]
 * const ranks = getValidRanksForGuild("MyGuild");
 * console.log(ranks); // ["Member", "Officer", "Admin"]
 * 
 * @example
 * // Guild not found
 * const ranks = getValidRanksForGuild("NonExistent");
 * console.log(ranks); // []
 */
function getValidRanksForGuild(guildName) {
    try {
        const guilds = BridgeLocator.getInstance().config.get("guilds") || [];
        
        // Find guild configuration (case-insensitive)
        const guild = guilds.find(g => 
            g.name.toLowerCase() === guildName.toLowerCase() && g.enabled
        );
        
        if (!guild) {
            logger.warn(`Guild '${guildName}' not found in configuration`);
            return [];
        }
        
        // Return configured ranks or empty array if not defined
        return guild.ranks || [];
        
    } catch (error) {
        logger.logError(error, `Error getting ranks for guild '${guildName}'`);
        return [];
    }
}

/**
 * Create response embed based on command result
 * 
 * Generates a formatted Discord embed showing the result of the setrank command.
 * Handles three types of results:
 * - Success: Green embed with success message and new rank
 * - Timeout: Orange embed indicating no response received
 * - Error/Failure: Red embed with error details
 * 
 * The embed includes the player name, guild name, and target rank regardless
 * of success or failure for context.
 * 
 * @param {string} guildName - Name of the guild
 * @param {string} username - Username of the player whose rank is being set
 * @param {string} rank - Target rank to set
 * @param {object} result - Result object from command response listener
 * @param {boolean} result.success - Whether the command succeeded
 * @param {string} [result.message] - Success message from Minecraft
 * @param {string} [result.error] - Error message if failed
 * @param {string} [result.type] - Result type ('timeout', 'cancelled', or default)
 * @returns {EmbedBuilder} Formatted Discord embed with result
 * 
 * @example
 * // Success result
 * const result = { success: true, message: "Rank updated to Officer" };
 * const embed = createResponseEmbed("MyGuild", "Player123", "Officer", result);
 * 
 * @example
 * // Timeout result
 * const result = { success: false, type: "timeout", error: "No response" };
 * const embed = createResponseEmbed("MyGuild", "Player123", "Member", result);
 * 
 * @example
 * // Error result
 * const result = { success: false, error: "Player not in guild" };
 * const embed = createResponseEmbed("MyGuild", "Player123", "Admin", result);
 */
function createResponseEmbed(guildName, username, rank, result) {
  const embed = new EmbedBuilder()
    .addFields(
      { name: "👤 Player", value: username, inline: true },
      { name: "🏰 Guild", value: guildName, inline: true },
      { name: "🎖️ Rank", value: rank, inline: true }
    )
    .setTimestamp();

  if (result.success) {
    embed
      .setTitle("✅ Rank Set Successful")
      .setDescription(
        `Successfully set \`${username}\`'s rank to \`${rank}\` in \`${guildName}\`.`
      )
      .setColor(0x00ff00)
      .addFields({
        name: "📝 Response",
        value: result.message || "Rank updated",
        inline: false,
      });
  } else {
    let title = "❌ Rank Set Failed";
    let description = `Failed to set rank for \`${username}\`.`;
    let color = 0xff0000;
    
    if (result.type === "timeout") {
      title = "⏰ Command Timeout";
      description = "No response received from Minecraft within 15 seconds.";
      color = 0xffa500;
    } else if (result.type === "cancelled") {
      title = "🚫 Command Cancelled";
      description = "The setrank command was cancelled.";
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