/**
 * Guild Info Subcommand - Display Guild Information
 * 
 * This subcommand displays comprehensive information about a Hypixel guild,
 * including name, creation date, members, description, guild experience,
 * guild level, and online member count.
 * 
 * Command Features:
 * - Display guild name and tag
 * - Show guild creation date
 * - Display total member count
 * - Show guild description
 * - Display guild experience (EXP)
 * - Show guild level
 * - Display number of currently online members
 * - Beautiful embed formatting
 * - Error handling for API failures
 * 
 * Data Sources:
 * - Hypixel API: For guild metadata (name, created date, description, exp, level, total members)
 * - Minecraft Bot: For online member count via /g online command
 * 
 * Usage: /guild info <guildname>
 * Permission: User (available to all members)
 * Response: Ephemeral (only visible to command executor)
 * 
 * @author Panda_Sauvage
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { EmbedBuilder } = require('discord.js');

// Specific Imports
const logger = require('../../../../shared/logger');

/**
 * Guild Info Subcommand Module
 * 
 * Exports configuration and execution function for the info subcommand.
 * 
 * @module guild/info
 * @type {object}
 * @property {string} permission - Required permission level ('user')
 * @property {Function} execute - Command execution function
 */
module.exports = {
    /**
     * Permission level required to execute this subcommand
     * 
     * Set to 'user' to allow all members to view guild information.
     * 
     * @type {string}
     */
    permission: "user",

    /**
     * Execute the info subcommand
     * 
     * Entry point for the info command. Defers the reply immediately
     * to prevent timeout, then delegates to handleInfoCommand for processing.
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

        return await handleInfoCommand(interaction, context);
    },
};

// ==================== MAIN COMMAND HANDLER ====================

/**
 * Handle the guild info command
 * 
 * Main logic for displaying guild information. Fetches data from Hypixel API
 * and Minecraft bot, then formats and displays the results in a rich embed.
 * 
 * Execution Flow:
 * 1. Extract guild name parameter
 * 2. Validate Minecraft manager availability
 * 3. Find and validate guild configuration
 * 4. Fetch guild data from Hypixel API
 * 5. Get online member count from Minecraft bot
 * 6. Format and send embed response
 * 7. Handle errors appropriately
 * 
 * @async
 * @private
 * @param {ChatInputCommandInteraction} interaction - Discord interaction object
 * @param {object} context - Command execution context
 * @returns {Promise<void>}
 */
async function handleInfoCommand(interaction, context) {
    const guildName = interaction.options.getString("guildname");
    const logMethod = interaction.commandOrigin === 'automatic' ? 'debug' : 'discord';

    try {
        logger[logMethod](`[GUILD-INFO] Processing info command: ${guildName}`);

        // Get Minecraft manager
        const minecraftManager = context.bridgeLocator.getMinecraftManager?.();
        if (!minecraftManager) {
            await interaction.editReply({
                content: "❌ Minecraft manager not available. Please try again later.",
                ephemeral: true,
            });
            return { status: 'failed' };
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
            return { status: 'invalid' };
        }

        // Send initial response
        const initialEmbed = new EmbedBuilder()
            .setTitle("🔄 Chargement des informations...")
            .setDescription(`Récupération des informations de la guilde \`${guildName}\`...`)
            .setColor(0xffa500) // Orange color for "in progress"
            .setTimestamp();

        await interaction.editReply({ embeds: [initialEmbed], ephemeral: true });

        // Get bot manager
        const botManager = minecraftManager._botManager;
        if (!botManager || !botManager.isGuildConnected(guildConfig.id)) {
            await interaction.editReply({
                content: `❌ Guild \`${guildName}\` is not currently connected to Minecraft.`,
                ephemeral: true,
            });
            return { status: 'failed' };
        }

        // Fetch guild info from Minecraft /g info command
        let guildData = null;
        let onlineCount = 0;
        
        try {
            const infoData = await getGuildInfoFromMinecraft(botManager, guildConfig);
            guildData = infoData.guildInfo;
            onlineCount = infoData.onlineCount;
        } catch (error) {
            logger.logError(error, `[GUILD-INFO] Error getting guild info from Minecraft`);
            // Continue with partial data
        }

        // Create and send the info embed
        const embed = createGuildInfoEmbed(guildConfig, guildData, onlineCount);
        await interaction.editReply({ embeds: [embed], ephemeral: true });

        const status = guildData ? 'success' : 'partial';
        logger[logMethod](`[GUILD-INFO] Displayed info for ${guildName} (status: ${status})`);
        return { status };
    } catch (error) {
        logger.logError(error, `[GUILD-INFO] Unexpected error processing info command`);

        const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Erreur")
            .setDescription("Une erreur est survenue lors de la récupération des informations de la guilde.")
            .setColor(0xff0000)
            .addFields({
                name: "🚫 Erreur",
                value: error.message || "Erreur inconnue",
                inline: false,
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
        return { status: 'failed' };
    }
}

// ==================== MINECRAFT GUILD INFO FUNCTIONS ====================

/**
 * Get guild information from Minecraft /g info command
 * 
 * Executes the /g info command via the bot and parses the response to extract
 * all guild information including name, creation date, members, description,
 * experience, and level.
 * 
 * @async
 * @param {object} botManager - Bot manager instance
 * @param {object} guildConfig - Guild configuration
 * @returns {Promise<object>} Object with guildInfo and onlineCount
 */
async function getGuildInfoFromMinecraft(botManager, guildConfig) {
    return new Promise(async (resolve, reject) => {
        const messages = [];
        const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for guild info"));
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

            // Execute /g info command
            await botManager.executeCommand(guildConfig.id, "/g info");

            // Wait for messages to arrive
            setTimeout(async () => {
                bot.removeListener("message", messageHandler);
                clearTimeout(timeout);

                // Combine all messages and parse guild info
                const allMessages = messages.join("\n");
                const guildInfo = parseGuildInfoResponse(allMessages);
                
                // Also get online count
                let onlineCount = 0;
                try {
                    onlineCount = await getOnlineMemberCount(botManager, guildConfig);
                } catch (error) {
                    logger.debug(`[GUILD-INFO] Could not get online count: ${error.message}`);
                }

                resolve({ guildInfo, onlineCount });
            }, 4000); // Wait 4 seconds for all messages
        } catch (error) {
            clearTimeout(timeout);
            reject(error);
        }
    });
}

/**
 * Parse guild info from /g info command response
 * 
 * Parses the raw Minecraft command output to extract guild information.
 * Expected format:
 *   GuildName
 *   Created: YYYY-MM-DD HH:MM EST
 *   Members: X/Y
 *   Description: text
 *   Guild Exp: X,XXX,XXX  (#rank)
 *   Guild Level: X (Y% to Level Z)
 * 
 * @param {string} message - Command response message
 * @returns {object} Parsed guild data object
 */
function parseGuildInfoResponse(message) {
    if (!message) return null;

    const lines = message.split("\n").map(line => line.trim()).filter(line => line.length > 0);
    const data = {};

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Parse Created date (format: "Created: 2019-12-07 18:13 EST")
        const createdMatch = line.match(/Created:\s*(.+?)(?:\s+EST)?$/i);
        if (createdMatch && !data.created) {
            data.created = createdMatch[1].trim();
            continue;
        }

        // Parse Members (format: "Members: 123/125")
        const membersMatch = line.match(/Members:\s*(\d+)\/(\d+)/i);
        if (membersMatch && !data.members) {
            data.members = parseInt(membersMatch[1], 10);
            data.maxMembers = parseInt(membersMatch[2], 10);
            data.memberSize = data.members; // For compatibility
            continue;
        }

        // Parse Description (format: "Description: text")
        const descMatch = line.match(/Description:\s*(.+)$/i);
        if (descMatch && !data.description) {
            data.description = descMatch[1].trim();
            continue;
        }

        // Parse Guild Exp (format: "Guild Exp: 621,691,026  (#205)" or "Guild Exp: ... (#11,922)")
        const expMatch = line.match(/Guild\s+Exp:\s*([\d,]+)(?:\s+\(#([\d,]+)\))?/i);
        if (expMatch && data.exp === undefined) {
            // Remove commas and parse exp
            const expString = expMatch[1].replace(/,/g, "");
            data.exp = parseInt(expString, 10);
            // Parse rank if available
            if (expMatch[2]) {
                const rankString = expMatch[2].replace(/,/g, "");
                data.expRank = parseInt(rankString, 10);
            }
            continue;
        }

        // Parse Guild Level (format: "Guild Level: 214 (56% to Level 215)")
        const levelMatch = line.match(/Guild\s+Level:\s*(\d+)(?:\s*\((\d+(?:\.\d+)?)%\s+to\s+Level\s+\d+\))?/i);
        if (levelMatch && data.level === undefined) {
            data.level = parseInt(levelMatch[1], 10);
            if (levelMatch[2] !== undefined) {
                data.levelProgress = parseFloat(levelMatch[2]);
            }
            continue;
        }

        // Try to extract guild name from first non-empty line that doesn't match patterns
        // Usually the first line is the guild name
        if (!data.name && i === 0 && !line.includes(":") && !line.match(/^\d+/) && line.length > 0) {
            // This might be the guild name (first line usually)
            if (line.length < 50 && !line.toLowerCase().includes("created") && 
                !line.toLowerCase().includes("members") && !line.toLowerCase().includes("description") &&
                !line.toLowerCase().includes("guild")) {
                data.name = line.trim();
            }
        }
    }

    return Object.keys(data).length > 0 ? data : null;
}

// ==================== MINECRAFT FUNCTIONS ====================

/**
 * Get online member count from Minecraft bot
 * 
 * Executes the /g online command via the bot and counts the number
 * of online members from the response.
 * 
 * @async
 * @param {object} botManager - Bot manager instance
 * @param {object} guildConfig - Guild configuration
 * @returns {Promise<number>} Number of online members
 */
async function getOnlineMemberCount(botManager, guildConfig) {
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

            // Execute the command to get online members
            await botManager.executeCommand(guildConfig.id, "/g online");

            // Wait for messages to arrive
            setTimeout(() => {
                bot.removeListener("message", messageHandler);
                clearTimeout(timeout);

                // Parse online members from messages
                const allMessages = messages.join("\n");
                const onlineMembers = parseOnlineMembersCount(allMessages);
                resolve(onlineMembers);
            }, 3000); // Wait 3 seconds for all messages
        } catch (error) {
            clearTimeout(timeout);
            reject(error);
        }
    });
}

/**
 * Parse online member count from command response
 * 
 * Extracts the number of online members from the /g online command response.
 * Looks for patterns like "Online (X):" or counts member names.
 * 
 * @param {string} message - Command response message
 * @returns {number} Number of online members
 */
function parseOnlineMembersCount(message) {
    if (!message) return 0;

    // Look for patterns like "Online (X): Player1, Player2, Player3"
    const onlineMatch = message.match(/Online\s*\((\d+)\):/i);
    if (onlineMatch) {
        return parseInt(onlineMatch[1], 10) || 0;
    }

    // Alternative pattern: "Online Members: X"
    const altMatch = message.match(/Online\s+Members?:\s*(\d+)/i);
    if (altMatch) {
        return parseInt(altMatch[1], 10) || 0;
    }

    // Fallback: try to count player names in the message
    // This is less reliable but may work if the format is different
    const lines = message.split("\n");
    for (const line of lines) {
        if (line.includes("Online") && line.includes(":")) {
            // Try to extract a number near "Online"
            const numberMatch = line.match(/(\d+)/);
            if (numberMatch) {
                const count = parseInt(numberMatch[1], 10);
                if (count > 0 && count < 1000) { // Reasonable range
                    return count;
                }
            }
        }
    }

    return 0;
}

// ==================== EMBED CREATION ====================

/**
 * Create guild info embed
 * 
 * Creates a rich Discord embed displaying all guild information including
 * name, creation date, members, description, experience, level, and online count.
 * 
 * @param {object} guildConfig - Guild configuration from settings
 * @param {object|null} guildData - Guild data from Hypixel API (null if not available)
 * @param {number} onlineCount - Number of currently online members
 * @returns {EmbedBuilder} Formatted Discord embed
 */
function createGuildInfoEmbed(guildConfig, guildData, onlineCount) {
    const embed = new EmbedBuilder()
        .setTitle(`🏰 Informations de la Guilde: ${guildData?.name || guildConfig.name}`)
        .setColor(0x3498db) // Blue color
        .setTimestamp();

    // Guild name and tag
    if (guildData?.name || guildConfig.name) {
        embed.addFields({
            name: "📛 Nom",
            value: guildData?.name || guildConfig.name,
            inline: true,
        });
    }

    // Creation date
        if (guildData?.created) {
            // Try to parse the date string (format: "2019-12-07 18:13 EST")
            let formattedDate = guildData.created;
            try {
                // Parse date string like "2019-12-07 18:13 EST"
                const dateMatch = guildData.created.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
                if (dateMatch) {
                    const datePart = dateMatch[1]; // "2019-12-07"
                    const timePart = dateMatch[2]; // "18:13"
                    // Create date object (treating as EST, but we'll just use the date/time as-is)
                    // EST is UTC-5, but we'll just format the date directly
                    // Parse date components
                    const [year, month, day] = datePart.split('-').map(Number);
                    const [hour, minute] = timePart.split(':').map(Number);
                    
                    // Create date string in French format
                    const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                                  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
                    formattedDate = `${day} ${months[month - 1]} ${year} à ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                }
            } catch (error) {
                // Use original string if parsing fails
                logger.debug(`[GUILD-INFO] Could not parse date: ${guildData.created}`);
            }
            
            embed.addFields({
                name: "📅 Date de création",
                value: formattedDate,
                inline: true,
            });
        }

        // Total members (format: "123/125")
        if (guildData?.members !== undefined && guildData?.maxMembers !== undefined) {
            embed.addFields({
                name: "👥 Membres",
                value: `${guildData.members}/${guildData.maxMembers}`,
                inline: true,
            });
        } else if (guildData?.members !== undefined) {
            embed.addFields({
                name: "👥 Membres",
                value: guildData.members.toString(),
                inline: true,
            });
        }

    // Online members
    embed.addFields({
        name: "🟢 Membres connectés",
        value: onlineCount > 0 ? onlineCount.toString() : "0",
        inline: true,
    });

    // Guild description
    if (guildData?.description) {
        let description = guildData.description.trim();
        // Replace "not set" with French text
        if (description.toLowerCase() === "not set") {
            description = "Aucune description";
        }
        if (description) {
            embed.addFields({
                name: "📝 Description",
                value: description.length > 1024 ? description.substring(0, 1021) + "..." : description,
                inline: false,
            });
        }
    }

    // Guild experience
    if (guildData?.exp !== undefined && guildData.exp !== null) {
        const formattedExp = formatNumber(guildData.exp);
        let expValue = formattedExp;
        
        // Add rank if available
        if (guildData?.expRank !== undefined) {
            const formattedRank = formatNumber(guildData.expRank);
            expValue = `${formattedExp} (#${formattedRank})`;
        }
        
        embed.addFields({
            name: "⭐ Guild Experience",
            value: expValue,
            inline: true,
        });
    }

    // Guild level (use direct level if available, otherwise calculate from exp)
    if (guildData?.level !== undefined) {
        let levelValue = guildData.level.toString();
        if (guildData?.levelProgress !== undefined) {
            levelValue += ` (${guildData.levelProgress}% → Level ${guildData.level + 1})`;
        }
        embed.addFields({
            name: "📊 Guild Level",
            value: levelValue,
            inline: true,
        });
    } else if (guildData?.exp !== undefined && guildData.exp !== null) {
        const guildLevel = calculateGuildLevel(guildData.exp);
        embed.addFields({
            name: "📊 Guild Level",
            value: guildLevel.toString(),
            inline: true,
        });
    }

    // Footer with guild tag
    embed.setFooter({
        text: `Guilde: ${guildConfig.name}${guildConfig.tag ? ` [${guildConfig.tag}]` : ''}`,
    });

    return embed;
}

/**
 * Format number with thousand separators
 * 
 * Formats a number with spaces as thousand separators for better readability.
 * 
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Calculate guild level from experience
 * 
 * Hypixel guild level calculation formula:
 * Level = floor((exp / 100000) + 1)
 * This is a simplified version. The actual formula may be more complex,
 * but this provides a reasonable approximation.
 * 
 * @param {number} exp - Total guild experience
 * @returns {number} Calculated guild level
 */
function calculateGuildLevel(exp) {
    // Simplified formula: each level requires 100,000 EXP
    // Level 1: 0-99,999 EXP
    // Level 2: 100,000-199,999 EXP
    // etc.
    if (exp < 0) return 0;
    return Math.floor(exp / 100000) + 1;
}

// ==================== UTILITY FUNCTIONS ====================

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