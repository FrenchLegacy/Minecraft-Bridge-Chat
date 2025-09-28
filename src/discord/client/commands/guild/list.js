// Globals Imports
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
  } = require("discord.js");
  
  // Specific Imports
  const CommandResponseListener = require("../../handlers/CommandResponseListener.js");
  const logger = require("../../../../shared/logger");
  
  // Singleton instance for command response listener
  let commandResponseListener = null;
  
  function getCommandResponseListener() {
    if (!commandResponseListener) {
      commandResponseListener = new CommandResponseListener();
    }
    return commandResponseListener;
  }
  
  module.exports = {
    permission: "user",
  
    async execute(interaction, context) {
      // Defer the reply since this might take some time
      await interaction.deferReply({ ephemeral: true });
  
      await handleListCommand(interaction, context);
    },
  };
  
  /**
   * Handle the guild list command
   * @param {ChatInputCommandInteraction} interaction - Discord interaction
   * @param {object} context - Command context with client, config, etc.
   */
  async function handleListCommand(interaction, context) {
    const guildName = interaction.options.getString("guildname");
    const listType = interaction.options.getString("type");
    const sortType = interaction.options.getString("sort") || "rank";
  
    try {
      logger.discord(
        `[GUILD-LIST] Processing list command: ${guildName} -> ${listType}`
      );
  
      // Get Minecraft manager
      const minecraftManager = context.bridgeLocator.getMinecraftManager?.();
      if (!minecraftManager) {
        await interaction.editReply({
          content: "❌ Minecraft manager not available. Please try again later.",
          ephemeral: true,
        });
        return;
      }
  
      // Find guild configuration by name
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
  
      // Check if guild is connected
      const botManager = minecraftManager._botManager;
      if (!botManager || !botManager.isGuildConnected(guildConfig.id)) {
        await interaction.editReply({
          content: `❌ Guild \`${guildName}\` is not currently connected to Minecraft.`,
          ephemeral: true,
        });
        return;
      }
  
      // Send initial response
      const initialEmbed = new EmbedBuilder()
        .setTitle("🔄 Processing Guild List")
        .setDescription(
          `Getting ${listType} members from guild \`${guildName}\`...`
        )
        .setColor(0xffa500) // Orange color for "in progress"
        .addFields(
          { name: "🏰 Guild", value: guildName, inline: true },
          { name: "📋 Type", value: listType, inline: true },
          { name: "⏱️ Status", value: "Fetching member list...", inline: false }
        )
        .setTimestamp();
  
      await interaction.editReply({ embeds: [initialEmbed], ephemeral: true });
  
      // Execute the appropriate commands based on list type
      let result;
      switch (listType) {
        case "online":
          result = await handleOnlineList(
            botManager,
            guildConfig,
            interaction,
            context.config
          );
          break;
        case "offline":
          result = await handleOfflineList(
            botManager,
            guildConfig,
            interaction,
            context.config
          );
          break;
        case "all":
          result = await handleAllList(
            botManager,
            guildConfig,
            interaction,
            context.config
          );
          break;
        default:
          throw new Error(`Invalid list type: ${listType}`);
      }
  
      // Create and send response with pagination
      await sendPaginatedResponse(
        interaction,
        guildName,
        listType,
        result,
        sortType,
        context.config
      );
  
      // Log the result
      logger.discord(
        `[GUILD-LIST] ✅ Successfully retrieved ${listType} members for ${guildName}: ${result.members.length} members`
      );
    } catch (error) {
      logger.logError(
        error,
        `[GUILD-LIST] Unexpected error processing list command`
      );
  
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Unexpected Error")
        .setDescription(
          "An unexpected error occurred while processing the list command."
        )
        .setColor(0xff0000)
        .addFields({
          name: "🚫 Error",
          value: error.message || "Unknown error",
          inline: false,
        })
        .setTimestamp();
  
      await interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
  
  /**
   * Handle online members list
   * @param {object} botManager - Bot manager instance
   * @param {object} guildConfig - Guild configuration
   * @param {object} interaction - Discord interaction
   * @param {object} config - Configuration object
   * @returns {object} Result with members list
   */
  async function handleOnlineList(botManager, guildConfig, interaction, config) {
    return new Promise(async (resolve, reject) => {
      const messages = [];
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for online members"));
      }, 10000);
  
      try {
        // Get the bot connection directly
        const mainBridge = require("../../../../bridgeLocator.js").getInstance();
        const minecraftManager = mainBridge.getMinecraftManager();
        const botManagerInstance = minecraftManager._botManager;
        const connection = botManagerInstance.connections.get(guildConfig.id);
  
        if (!connection || !connection._bot) {
          clearTimeout(timeout);
          reject(new Error("No bot connection found"));
          return;
        }
  
        const bot = connection._bot;
  
        // Listen to all messages for a short period
        const messageHandler = (message) => {
          const messageText = message.toString
            ? message.toString()
            : String(message);
          const cleanMessage = messageText.replace(/§[0-9a-fklmnor]/g, "").trim();
  
          if (cleanMessage && cleanMessage.length > 0) {
            messages.push(cleanMessage);
          }
        };
  
        bot.on("message", messageHandler);
  
        // Execute the command to get online members only
        await botManager.executeCommand(guildConfig.id, "/g online");
  
        // Wait for messages to arrive
        setTimeout(() => {
          bot.removeListener("message", messageHandler);
          clearTimeout(timeout);
  
          // Combine all messages and extract members
          const allMessages = messages.join("\n");
          const members = extractMembersFromMessage(
            allMessages,
            config,
            guildConfig.name
          );
  
          resolve({ success: true, members, total: members.length });
        }, 3000); // Wait 3 seconds for all messages
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  
  /**
   * Handle offline members list
   * @param {object} botManager - Bot manager instance
   * @param {object} guildConfig - Guild configuration
   * @param {object} interaction - Discord interaction
   * @param {object} config - Configuration object
   * @returns {object} Result with members list
   */
  async function handleOfflineList(botManager, guildConfig, interaction, config) {
    return new Promise(async (resolve, reject) => {
      const messages = [];
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for offline members"));
      }, 15000); // Longer timeout for two commands
  
      try {
        // Get the bot connection directly
        const mainBridge = require("../../../../bridgeLocator.js").getInstance();
        const minecraftManager = mainBridge.getMinecraftManager();
        const botManagerInstance = minecraftManager._botManager;
        const connection = botManagerInstance.connections.get(guildConfig.id);
  
        if (!connection || !connection._bot) {
          clearTimeout(timeout);
          reject(new Error("No bot connection found"));
          return;
        }
  
        const bot = connection._bot;
  
        // Listen to all messages for a short period
        let isFirstCommand = true;
        const messageHandler = (message) => {
          const messageText = message.toString
            ? message.toString()
            : String(message);
          const cleanMessage = messageText.replace(/§[0-9a-fklmnor]/g, "").trim();
  
          if (cleanMessage && cleanMessage.length > 0) {
            // Mark the end of first command when we see "Total Members:"
            if (cleanMessage.includes("Total Members:")) {
              isFirstCommand = false;
            }
  
            // Add a marker to distinguish between commands
            const messageWithMarker = isFirstCommand
              ? `[GL] ${cleanMessage}`
              : `[ONLINE] ${cleanMessage}`;
            messages.push(messageWithMarker);
          }
        };
  
        bot.on("message", messageHandler);
  
        // Execute both commands
        await botManager.executeCommand(guildConfig.id, "/gl");
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait between commands
        await botManager.executeCommand(guildConfig.id, "/g online");
  
        // Wait for messages to arrive
        setTimeout(() => {
          bot.removeListener("message", messageHandler);
          clearTimeout(timeout);
  
          // Separate messages by command
          const glMessages = messages
            .filter((msg) => msg.startsWith("[GL]"))
            .map((msg) => msg.replace("[GL] ", ""));
          const onlineMessages = messages
            .filter((msg) => msg.startsWith("[ONLINE]"))
            .map((msg) => msg.replace("[ONLINE] ", ""));
  
          // Extract all members from the guild list command
          const allMembers = extractMembersFromMessage(
            glMessages.join("\n"),
            config,
            guildConfig.name
          );
  
          // Extract online members from the online command
          const onlineMembers = extractMembersFromMessage(
            onlineMessages.join("\n"),
            config,
            guildConfig.name
          );
  
          // Calculate offline members (all members - online members)
          const offlineMembers = allMembers.filter(
            (member) =>
              !onlineMembers.some(
                (online) =>
                  online.name.toLowerCase() === member.name.toLowerCase()
              )
          );
  
          console.log(
            "DEBUG: Offline members calculated:",
            offlineMembers.length
          );
          const members = offlineMembers;
  
          resolve({
            success: true,
            members: members,
            total: members.length,
          });
        }, 5000); // Wait 5 seconds for all messages
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  
  /**
   * Handle all members list
   * @param {object} botManager - Bot manager instance
   * @param {object} guildConfig - Guild configuration
   * @param {object} interaction - Discord interaction
   * @param {object} config - Configuration object
   * @returns {object} Result with members list
   */
  async function handleAllList(botManager, guildConfig, interaction, config) {
    return new Promise(async (resolve, reject) => {
      const messages = [];
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for all members"));
      }, 10000);
  
      try {
        // Get the bot connection directly
        const mainBridge = require("../../../../bridgeLocator.js").getInstance();
        const minecraftManager = mainBridge.getMinecraftManager();
        const botManagerInstance = minecraftManager._botManager;
        const connection = botManagerInstance.connections.get(guildConfig.id);
  
        if (!connection || !connection._bot) {
          clearTimeout(timeout);
          reject(new Error("No bot connection found"));
          return;
        }
  
        const bot = connection._bot;
  
        // Listen to all messages for a short period
        const messageHandler = (message) => {
          const messageText = message.toString
            ? message.toString()
            : String(message);
          const cleanMessage = messageText.replace(/§[0-9a-fklmnor]/g, "").trim();
  
          if (cleanMessage && cleanMessage.length > 0) {
            messages.push(cleanMessage);
          }
        };
  
        bot.on("message", messageHandler);
  
        // Execute the command
        await botManager.executeCommand(guildConfig.id, "/gl");
  
        // Wait for messages to arrive
        setTimeout(() => {
          bot.removeListener("message", messageHandler);
          clearTimeout(timeout);
  
          // Combine all messages and extract members
          const allMessages = messages.join("\n");
          const members = extractMembersFromMessage(
            allMessages,
            config,
            guildConfig.name
          );
  
          resolve({ success: true, members, total: members.length });
        }, 3000); // Wait 3 seconds for all messages
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  
  /**
   * Parse online members from command response
   * @param {string} message - Command response message
   * @returns {Array<string>} Array of online member names
   */
  function parseOnlineMembers(message) {
    if (!message) return [];
  
    // Look for patterns like "Online (X): Player1, Player2, Player3"
    const onlineMatch = message.match(/Online\s*\(\d+\):\s*(.+)/i);
    if (onlineMatch) {
      return onlineMatch[1]
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name);
    }
  
    // Fallback: look for any list of names
    const lines = message.split("\n");
    for (const line of lines) {
      if (line.includes("Online") && line.includes(":")) {
        const names = line.split(":")[1];
        if (names) {
          return names
            .split(",")
            .map((name) => name.trim())
            .filter((name) => name);
        }
      }
    }
  
    return [];
  }
  
  /**
   * Parse guild list from command response
   * @param {string} message - Command response message
   * @returns {Array<string>} Array of all member names
   */
  function parseGuildList(message) {
    if (!message) return [];
  
    const members = [];
    const lines = message.split("\n");
  
    for (const line of lines) {
      // Look for lines that contain member information
      // Pattern: "Rank: PlayerName" or "PlayerName (Rank)"
      const memberMatch = line.match(
        /(?:^|\s)([A-Za-z0-9_]{3,16})(?:\s*\([^)]+\))?(?:\s|$)/
      );
      if (memberMatch) {
        const memberName = memberMatch[1];
        if (memberName && !members.includes(memberName)) {
          members.push(memberName);
        }
      }
    }
  
    return members;
  }
  
  /**
   * Send paginated response with navigation buttons
   * @param {object} interaction - Discord interaction
   * @param {string} guildName - Guild name
   * @param {string} listType - Type of list (online/offline/all)
   * @param {object} result - Result object with members
   * @param {string} sortType - Sort type (rank/name/name_desc)
   * @param {object} config - Configuration object
   */
  async function sendPaginatedResponse(
    interaction,
    guildName,
    listType,
    result,
    sortType = "rank",
    config
  ) {
    const members = result.members || [];
    const total = result.total || 0;
  
    if (members.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setTitle("📋 Guild Member List")
        .setDescription(`No ${listType} members found in guild \`${guildName}\``)
        .setColor(0x808080)
        .addFields(
          { name: "🏰 Guild", value: guildName, inline: true },
          { name: "📋 Type", value: listType, inline: true },
          { name: "👥 Total", value: "0", inline: true }
        )
        .setTimestamp();
  
      await interaction.editReply({ embeds: [emptyEmbed], ephemeral: true });
      return;
    }
  
    // Sort members based on the specified sort type
    const sortedMembers = sortMembers(members, sortType, config, guildName);
  
    // Debug: Log first few members to see their guild ranks
    logger.discord(
      `[GUILD-LIST] DEBUG: First 10 members after sorting:`,
      sortedMembers
        .slice(0, 10)
        .map((m) => `${m.name} (${m.guildRank || "Default"})`)
    );
  
    // Debug: Log rank distribution
    const rankCounts = {};
    sortedMembers.forEach((m) => {
      const rank = m.guildRank || "Default";
      rankCounts[rank] = (rankCounts[rank] || 0) + 1;
    });
    logger.discord(`[GUILD-LIST] DEBUG: Rank distribution:`, rankCounts);
  
    // Calculate rank statistics
    const rankStats = calculateRankStatistics(sortedMembers);
  
    // Create pagination data
    const paginationData = createPaginationData(
      sortedMembers,
      guildName,
      listType,
      sortType,
      total,
      rankStats
    );
  
    // Create initial embed and buttons
    const { embed, components } = createPaginatedEmbed(paginationData, 0, config);
  
    // Send initial response
    const response = await interaction.editReply({
      embeds: [embed],
      components: components,
      ephemeral: true,
    });
  
    // Set up button collector
    setupButtonCollector(response, paginationData, interaction.user.id, config);
  }
  
  /**
   * Create pagination data structure
   * @param {Array} members - Sorted members array
   * @param {string} guildName - Guild name
   * @param {string} listType - Type of list
   * @param {string} sortType - Sort type
   * @param {number} total - Total member count
   * @param {Object} rankStats - Rank statistics
   * @returns {Object} Pagination data
   */
  function createPaginationData(
    members,
    guildName,
    listType,
    sortType,
    total,
    rankStats
  ) {
    const membersPerPage = 20; // Members per page
    const pages = [];
  
    // Create simple pages with exactly 20 members per page (or less for the last page)
    // Members are already sorted by the calling function
    for (let i = 0; i < members.length; i += membersPerPage) {
      const pageMembers = members.slice(i, i + membersPerPage);
      pages.push({
        members: pageMembers,
        pageNumber: Math.floor(i / membersPerPage) + 1,
        rank: "All Members",
      });
    }
  
    return {
      guildName,
      listType,
      sortType,
      total,
      rankStats,
      pages,
      totalPages: pages.length,
    };
  }
  
  /**
   * Create paginated embed and components for a specific page
   * @param {Object} paginationData - Pagination data
   * @param {number} pageIndex - Current page index (0-based)
   * @param {object} config - Configuration object
   * @returns {Object} Object with embed and components
   */
  function createPaginatedEmbed(paginationData, pageIndex, config) {
    const { guildName, listType, total, rankStats, pages, totalPages } =
      paginationData;
    const currentPage = pages[pageIndex];
  
    if (!currentPage) {
      throw new Error(`Page ${pageIndex + 1} not found`);
    }
  
    // Ensure currentPage.members exists and is an array
    if (!currentPage.members || !Array.isArray(currentPage.members)) {
      currentPage.members = [];
    }
  
    // Create main embed
    const embed = new EmbedBuilder()
      .setTitle(
        `📋 ${guildName} Members - ${
          listType.charAt(0).toUpperCase() + listType.slice(1)
        }`
      )
      .setDescription(
        `Successfully retrieved ${listType} members from guild \`${guildName}\``
      )
      .setColor(getListTypeColor(listType))
      .addFields(
        { name: "🏰 Guild", value: guildName, inline: true },
        { name: "📋 Type", value: listType, inline: true },
        { name: "👥 Total", value: total.toString(), inline: true },
        { name: "📄 Page", value: `${pageIndex + 1}/${totalPages}`, inline: true }
      )
      .setTimestamp();
  
    // Add rank statistics to first page only
    if (pageIndex === 0 && Object.keys(rankStats).length > 0) {
      const rankStatsText = Object.entries(rankStats)
        .map(([rank, count]) => `**${rank}**: ${count}`)
        .join(" • ");
  
      embed.addFields({
        name: "📊 Rank Distribution",
        value:
          rankStatsText.length > 1024
            ? rankStatsText.substring(0, 1021) + "..."
            : rankStatsText,
        inline: false,
      });
    }
  
    // Add member list - group by rank for better display
    const fieldsToAdd = [];
  
    if (
      currentPage.members &&
      Array.isArray(currentPage.members) &&
      currentPage.members.length > 0
    ) {
      // Group members by guild rank for this page
      const membersByRank = groupMembersByRank(currentPage.members);
  
      for (const [rank, rankMembers] of Object.entries(membersByRank)) {
        if (rankMembers && Array.isArray(rankMembers) && rankMembers.length > 0) {
          const memberList = formatMemberListForPagination(rankMembers, config);
  
          if (
            memberList &&
            memberList.length > 0 &&
            memberList !== "No members"
          ) {
            const fieldName = `🏷️ ${rank} (${rankMembers.length})`;
  
            fieldsToAdd.push({
              name: fieldName,
              value: memberList,
              inline: false,
            });
          }
        }
      }
    }
  
    // Only add fields if we have valid fields to add
    if (fieldsToAdd.length > 0) {
      try {
        embed.addFields(fieldsToAdd);
      } catch (error) {
        logger.logError(
          error,
          `[GUILD-LIST] Error adding fields: ${JSON.stringify(fieldsToAdd)}`
        );
        // Fallback with a simple field
        embed.addFields({
          name: "👥 Members",
          value: "Error displaying members on this page",
          inline: false,
        });
      }
    } else {
      // Fallback: add a message if no members are found
      embed.addFields({
        name: "👥 Members",
        value: "No members found on this page",
        inline: false,
      });
    }
  
    // Create navigation buttons
    const components = [];
    if (totalPages > 1) {
      const row = new ActionRowBuilder();
  
      // Previous button
      const prevButton = new ButtonBuilder()
        .setCustomId(`guild_list_prev_${pageIndex}`)
        .setLabel("Précédent")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(pageIndex === 0);
  
      // Next button
      const nextButton = new ButtonBuilder()
        .setCustomId(`guild_list_next_${pageIndex}`)
        .setLabel("Suivant")
        .setEmoji("➡️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(pageIndex === totalPages - 1);
  
      // Page info button
      const pageButton = new ButtonBuilder()
        .setCustomId(`guild_list_page_${pageIndex}`)
        .setLabel(`${pageIndex + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);
  
      row.addComponents(prevButton, pageButton, nextButton);
      components.push(row);
    }
  
    return { embed, components };
  }
  
  /**
   * Format member list for pagination display
   * @param {Array} members - Array of member objects
   * @param {object} config - Configuration object
   * @returns {string} Formatted member list
   */
  function formatMemberListForPagination(members, config) {
    if (!members || !Array.isArray(members) || members.length === 0) {
      return "No members";
    }
  
    const validMembers = members.filter(
      (m) => m && m.name && typeof m.name === "string"
    );
    if (validMembers.length === 0) {
      return "No members";
    }
  
    const formattedMembers = validMembers.map((member) => {
      const status = getMemberStatusIcon(member);
  
      // Check if this is a bot using config
      const isBot = isBotName(member.name, config);
  
      let rankPrefix = "";
      if (isBot) {
        rankPrefix = "[BOT] ";
      } else if (member.rank && member.rank !== "Default") {
        rankPrefix = `[${member.rank}] `;
      }
  
      return `${status} ${rankPrefix}\`${member.name}\``;
    });
  
    const result = formattedMembers.join("\n");
    return result || "No members";
  }
  
  /**
   * Set up button collector for pagination
   * @param {Message} message - Discord message
   * @param {Object} paginationData - Pagination data
   * @param {string} userId - User ID who can interact with buttons
   * @param {object} config - Configuration object
   */
  function setupButtonCollector(message, paginationData, userId, config) {
    const collector = message.createMessageComponentCollector({
      filter: (interaction) => interaction.user.id === userId,
      time: 300000, // 5 minutes
    });
  
    let currentPageIndex = 0;
  
    collector.on("collect", async (interaction) => {
      if (interaction.customId.startsWith("guild_list_prev_")) {
        currentPageIndex = Math.max(0, currentPageIndex - 1);
      } else if (interaction.customId.startsWith("guild_list_next_")) {
        currentPageIndex = Math.min(
          paginationData.totalPages - 1,
          currentPageIndex + 1
        );
      }
  
      // Validate page index
      if (currentPageIndex < 0 || currentPageIndex >= paginationData.totalPages) {
        await interaction.reply({
          content: "❌ Invalid page number",
          ephemeral: true,
        });
        return;
      }
  
      try {
        const { embed, components } = createPaginatedEmbed(
          paginationData,
          currentPageIndex,
          config
        );
        await interaction.update({
          embeds: [embed],
          components: components,
          ephemeral: true,
        });
      } catch (error) {
        logger.logError(error, "[GUILD-LIST] Error updating pagination");
        await interaction.reply({
          content: "❌ Error updating page",
          ephemeral: true,
        });
      }
    });
  
    collector.on("end", () => {
      // Disable all buttons when collector ends
      const disabledComponents = message.components.map((row) =>
        new ActionRowBuilder().addComponents(
          row.components.map((button) =>
            ButtonBuilder.from(button).setDisabled(true)
          )
        )
      );
  
      message.edit({ components: disabledComponents }).catch(() => {
        // Ignore errors when trying to disable buttons
      });
    });
  }
  
  /**
   * Sort members based on the specified sort type
   * @param {Array} members - Array of member objects
   * @param {string} sortType - Sort type (rank/name/name_desc)
   * @param {object} config - Configuration object
   * @param {string} guildName - Guild name to get ranks for
   * @returns {Array} Sorted array of members
   */
  function sortMembers(members, sortType = "rank", config, guildName) {
    switch (sortType) {
      case "name":
        return [...members].sort((a, b) => a.name.localeCompare(b.name));
  
      case "name_desc":
        return [...members].sort((a, b) => b.name.localeCompare(a.name));
  
      case "rank":
      default:
        return sortMembersByRank(members, config, guildName);
    }
  }
  
  /**
   * Sort members by guild rank priority and then by name
   * @param {Array} members - Array of member objects
   * @param {object} config - Configuration object
   * @param {string} guildName - Guild name to get ranks for
   * @returns {Array} Sorted array of members
   */
  function sortMembersByRank(members, config, guildName) {
    // Get guild configuration to find the ranks
    const guildConfig = findGuildByName(config, guildName);
    const guildRanks = guildConfig ? guildConfig.ranks || [] : [];
  
    // Create dynamic priority based on config ranks
    const guildRankPriority = {
      "Guild Master": 1,
      Staff: 2,
      Default: 999, // Default fallback
    };
  
    // Add ranks from config with decreasing priority (first in array = highest priority)
    guildRanks.forEach((rank, index) => {
      guildRankPriority[rank] = guildRanks.length - index + 2; // Reverse order: first = highest priority
    });
  
    // Create a copy to avoid modifying the original array
    return [...members].sort((a, b) => {
      // Ensure we have valid names for comparison
      const aName = a.name || "";
      const bName = b.name || "";
  
      // Get guild ranks with fallback
      const aGuildRank =
        a.guildRank && typeof a.guildRank === "string" ? a.guildRank : "Default";
      const bGuildRank =
        b.guildRank && typeof b.guildRank === "string" ? b.guildRank : "Default";
  
      // Get priorities
      const aPriority = guildRankPriority[aGuildRank] || 7;
      const bPriority = guildRankPriority[bGuildRank] || 7;
  
      // First sort by guild rank priority
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
  
      // Then sort by name alphabetically
      return aName.localeCompare(bName);
    });
  }
  
  /**
   * Calculate rank statistics
   * @param {Array} members - Array of member objects
   * @returns {Object} Rank statistics
   */
  function calculateRankStatistics(members) {
    const stats = {};
  
    members.forEach((member) => {
      const guildRank = member.guildRank || "Default";
      stats[guildRank] = (stats[guildRank] || 0) + 1;
    });
  
    return stats;
  }
  
  /**
   * Group members by guild rank
   * @param {Array} members - Array of member objects
   * @returns {Object} Members grouped by guild rank
   */
  function groupMembersByRank(members) {
    const grouped = {};
  
    if (!members || !Array.isArray(members)) {
      return grouped;
    }
  
    members.forEach((member) => {
      if (member && typeof member === "object") {
        const guildRank = member.guildRank || "Default";
        if (!grouped[guildRank]) {
          grouped[guildRank] = [];
        }
        grouped[guildRank].push(member);
      }
    });
  
    return grouped;
  }
  
  /**
   * Check if a member name is a bot
   * @param {string} name - Member name
   * @param {object} config - Configuration object
   * @returns {boolean} True if the name appears to be a bot
   */
  function isBotName(name, config) {
    if (!name || typeof name !== "string") return false;
    if (!config) return false;
  
    // Get bot names from settings.json
    const guilds = config.get("guilds") || [];
    const botNames = guilds
      .filter((guild) => guild.enabled && guild.account && guild.account.username)
      .map((guild) => guild.account.username);
  
    // Check if the name matches any of the known bot names
    return botNames.includes(name);
  }
  
  /**
   * Get member status icon
   * @param {Object} member - Member object
   * @returns {string} Status icon
   */
  function getMemberStatusIcon(member) {
    // You can extend this to show online/offline status if available
    return "👤";
  }
  
  /**
   * Get color based on list type
   * @param {string} listType - Type of list
   * @returns {number} Color code
   */
  function getListTypeColor(listType) {
    switch (listType) {
      case "online":
        return 0x00ff00; // Green
      case "offline":
        return 0xff6b6b; // Red
      case "all":
        return 0x4ecdc4; // Teal
      default:
        return 0x00ff00; // Default green
    }
  }
  
  /**
   * Find guild configuration by name
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
   * @param {object} config - Configuration object
   * @returns {string[]} Array of guild names
   */
  function getAvailableGuilds(config) {
    const guilds = config.get("guilds") || [];
    return guilds.filter((guild) => guild.enabled).map((guild) => guild.name);
  }
  
  /**
   * Extract members from raw message
   * @param {string} message - Raw message from Minecraft
   * @param {object} config - Configuration object
   * @param {string} guildName - Guild name to get ranks for
   * @returns {Array} Array of member objects with name, rank (Hypixel), and guildRank
   */
  function extractMembersFromMessage(message, config, guildName) {
    if (!message || typeof message !== "string") {
      return [];
    }
    const members = [];
    let currentGuildRank = "Default";
  
    // Get guild configuration to find the ranks
    const guildConfig = findGuildByName(config, guildName);
    const guildRanks = guildConfig ? guildConfig.ranks || [] : [];
  
    // Split message into lines to process guild rank sections
    const lines = message.split("\n");
    for (const line of lines) {
      const trimmedLine = line.trim();
  
      // Detect guild rank sections dynamically based on config
      let rankDetected = false;
      for (const rank of guildRanks) {
        if (trimmedLine.includes(`-- ${rank} --`)) {
          currentGuildRank = rank;
          rankDetected = true;
          break;
        }
      }
  
      // Also check for common ranks that might not be in config
      if (!rankDetected) {
        if (trimmedLine.includes("-- Guild Master --")) {
          currentGuildRank = "Guild Master";
          rankDetected = true;
        } else if (trimmedLine.includes("-- Staff --")) {
          currentGuildRank = "Staff";
          rankDetected = true;
        }
      }
  
      if (rankDetected) {
        continue;
      }
  
      // Pattern to match players with Hypixel ranks: [MVP+] PlayerName ●
      const rankPattern = /\[([^\]]+)\]\s+([^●\s]+)\s+●/g;
      let match;
  
      while ((match = rankPattern.exec(trimmedLine)) !== null) {
        const hypixelRank = match[1] ? match[1].trim() : "";
        const playerName = match[2] ? match[2].trim() : "";
        console.log(
          "DEBUG: Found player with rank:",
          playerName,
          hypixelRank,
          "in guild rank:",
          currentGuildRank
        );
  
        if (
          playerName &&
          playerName !== "●" &&
          playerName.length > 0 &&
          playerName.length <= 16
        ) {
          members.push({
            name: playerName,
            rank: hypixelRank || "Default", // Hypixel rank
            guildRank: currentGuildRank, // Guild rank
          });
        }
      }
  
      // Pattern to match players without Hypixel ranks: PlayerName ●
      const noRankPattern = /([^\[\]●\s]+)\s+●/g;
      while ((match = noRankPattern.exec(trimmedLine)) !== null) {
        const playerName = match[1] ? match[1].trim() : "";
  
        // Skip if we already found this player with a rank
        if (
          playerName &&
          playerName.length > 0 &&
          playerName.length <= 16 &&
          !members.some((m) => m.name === playerName)
        ) {
          members.push({
            name: playerName,
            rank: "Default", // No Hypixel rank
            guildRank: currentGuildRank, // Guild rank
          });
        }
      }
    }
  
    // Remove duplicates and validate
    const uniqueMembers = [];
    const seenNames = new Set();
  
    for (const member of members) {
      if (member && member.name && !seenNames.has(member.name.toLowerCase())) {
        seenNames.add(member.name.toLowerCase());
        uniqueMembers.push({
          name: member.name,
          rank: member.rank || "Default",
          guildRank: member.guildRank || "Default",
        });
      }
    }
  
    return uniqueMembers;
  }