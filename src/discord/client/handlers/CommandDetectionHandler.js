/**
 * Command Detection Handler - Text-Based Command Detection and Execution
 * 
 * This file handles detection and execution of slash commands written as text messages
 * in a designated Discord channel. It provides a bridge between text-based command input
 * and the slash command execution system, enabling remote command execution from external
 * platforms or authorized users who prefer text-based interaction.
 * 
 * The handler provides:
 * - Text message monitoring in designated channel
 * - Command syntax parsing from text format to slash command format
 * - User whitelist security system for authorized access only
 * - Pseudo-interaction creation to mimic Discord slash command interactions
 * - Command registration from SlashCommandHandler
 * - Guild command parsing with subcommand support
 * - Visual feedback through message reactions (✅ success, ❌ error, ❓ unknown)
 * - Error handling and user-friendly error messages
 * 
 * Security Features:
 * - Channel-specific detection (only monitors configured channel)
 * - User whitelist validation (only allowed users can execute)
 * - Bot message filtering (prevents command loops)
 * - Command prefix requirement (commands must start with '/')
 * 
 * Command Parsing:
 * - Supports guild commands with subcommands (promote, demote, invite, kick, mute, unmute, setrank)
 * - Parses command arguments into structured options
 * - Validates required parameters for each command type
 * - Provides helpful error messages for invalid syntax
 * 
 * Pseudo-Interaction System:
 * - Creates interaction-like objects from text messages
 * - Implements reply, editReply, followUp, deferReply methods
 * - Handles options parsing (getString, getInteger, getBoolean, getSubcommand)
 * - Maintains compatibility with existing slash command handlers
 * 
 * Example Usage:
 * Text: "/guild promote FrenchLegacyIII Panda_Sauvage"
 * Parsed: { commandName: "guild", options: { subcommand: "promote", guildname: "FrenchLegacyIII", username: "Panda_Sauvage" } }
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { Events } = require('discord.js');

// Specific Imports
const logger = require('../../../shared/logger');
const BridgeLocator = require('../../../bridgeLocator.js');

/**
 * CommandDetectionHandler - Detects and executes text-based commands
 * 
 * Monitors a designated Discord channel for text messages that match command syntax,
 * parses them into pseudo-interactions, and executes them through the slash command system.
 * 
 * @class
 */
class CommandDetectionHandler {
    /**
     * Create a new CommandDetectionHandler instance
     * Initializes configuration and sets up command detection parameters
     */
    constructor() {
        const mainBridge = BridgeLocator.getInstance();
        this.config = mainBridge.config;

        this.client = null;
        this.commands = new Map(); // Store available commands
        this.detectionChannelId = null;
        this.allowedUserIds = null;
        this.commandPrefix = '/'; // Prefix for detected commands
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize the handler with Discord client
     * 
     * Sets up the handler with Discord client, loads configuration for
     * detection channel and allowed users, and establishes message listener.
     * 
     * @async
     * @param {Client} client - Discord client instance
     */
    async initialize(client) {
        this.client = client;
        this.detectionChannelId = this.config.get('features.detection.channelId'); // Channel to monitor
        this.allowedUserIds = this.config.get('features.detection.allowedUsers') || []; // Whitelist of user IDs

        this.setupMessageListener();
        logger.debug('Command Detection Handler initialized');
    }

    /**
     * Register available commands from slash command handler
     * 
     * Stores references to registered slash commands so they can be
     * executed when detected in text messages.
     * 
     * @param {Map} slashCommands - Map of slash commands from SlashCommandHandler
     */
    registerCommands(slashCommands) {
        this.commands = new Map(slashCommands);
        logger.debug(`Registered ${this.commands.size} commands for detection`);
    }

    // ==================== MESSAGE MONITORING ====================

    /**
     * Setup message listener for command detection
     * 
     * Registers event listener for Discord MessageCreate events.
     * Processes messages through handleMessage with error handling.
     * 
     * @private
     */
    setupMessageListener() {
        this.client.on(Events.MessageCreate, async (message) => {
            try {
                await this.handleMessage(message);
            } catch (error) {
                logger.logError(error, 'Error in command detection handler');
            }
        });
    }

    /**
     * Handle incoming messages and detect commands
     * 
     * Filters messages through multiple security checks:
     * - Must be in configured detection channel
     * - Must not be from the bot itself
     * - Must be from an allowed user
     * - Must start with command prefix
     * 
     * @async
     * @private
     * @param {Message} message - Discord message object
     */
    async handleMessage(message) {
        // Skip if not in detection channel
        if (message.channel.id !== this.detectionChannelId) {
            return;
        }

        // Skip if message is from this user (prevent loops)
        if (message.author.id === this.client.user.id) {
            return;
        }

        // Check if message is from an allowed user
        if (!this.allowedUserIds.includes(message.author.id)) {
            logger.warn(`Unauthorized user attempted command: ${message.author.tag} (${message.author.id})`);
            return;
        }

        // Check if message looks like a command
        if (!message.content.startsWith(this.commandPrefix)) {
            return;
        }

        await this.processDetectedCommand(message);
    }

    // ==================== COMMAND PROCESSING ====================

    /**
     * Process detected command from message
     * 
     * Parses the command text, validates command existence, creates a
     * pseudo-interaction object, and executes the command through the
     * slash command system. Provides visual feedback through reactions.
     * 
     * @async
     * @private
     * @param {Message} message - Discord message containing the command
     */
    async processDetectedCommand(message) {
        try {
            const parsedCommand = this.parseCommand(message.content);
            
            if (!parsedCommand) {
                logger.warn(`Failed to parse command: ${message.content}`);
                await message.react('❌');
                return;
            }

            const { commandName, options } = parsedCommand;
            
            // Check if command exists
            const command = this.commands.get(commandName);
            if (!command) {
                logger.warn(`Unknown command detected: ${commandName}`);
                await message.react('❓');
                return;
            }

            // Create pseudo-interaction object
            const pseudoInteraction = this.createPseudoInteraction(message, commandName, options);
            
            // Execute the command
            logger.discord(`Executing detected command: ${commandName} from user ${message.author.tag}`);
            
            // This calls the same command.execute() function as slash commands
            await command.execute(pseudoInteraction, {
                client: this.client,
                config: this.config,
                bridgeLocator: BridgeLocator.getInstance()
            });

            // React with success
            await message.react('✅');

        } catch (error) {
            logger.logError(error, `Error executing detected command: ${message.content}`);
            await message.react('⚠️');
            
            // Send error message
            await message.reply({
                content: `Error executing command: ${error.message}`,
                allowedMentions: { repliedUser: false }
            });
        }
    }

    // ==================== COMMAND PARSING ====================

    /**
     * Parse command string into command name and options
     * 
     * Parses text command into structured format compatible with slash commands.
     * Handles different command structures and validates parameter counts.
     * 
     * Examples:
     * - "/guild promote FrenchLegacyIII Panda_Sauvage" 
     *   → { commandName: "guild", options: { subcommand: "promote", guildname: "FrenchLegacyIII", username: "Panda_Sauvage" } }
     * - "/ping"
     *   → { commandName: "ping", options: {} }
     * 
     * @param {string} content - Message content to parse
     * @returns {object|null} Parsed command with commandName and options, or object with error property
     */
    parseCommand(content) {
        const parts = content.trim().split(/\s+/);
        
        if (parts.length < 2) {
            return { error: '❌ Command too short. Please provide at least a command and one parameter.' };
        }

        const commandName = parts[0].substring(1); // Remove the '/' prefix
        const args = parts.slice(1);

        // Handle different command structures
        if (commandName === 'guild') {
            const result = this.parseGuildCommand(commandName, args);
            // If parsing returned error, pass it through
            if (result.error) {
                return result;
            }
            // Ensure we have valid options
            if (!result.options || typeof result.options !== 'object') {
                return { error: '❌ Failed to parse guild command options.' };
            }
            return result;
        } else if (commandName === 'ping') {
            return { commandName, options: {} };
        }
        
        // Add more command parsers as needed
        return { commandName, options: this.parseGenericCommand(args) };
    }

    /**
     * Parse guild-specific commands
     * 
     * Handles complex guild command syntax with subcommands and variable parameters.
     * Validates required parameters for each subcommand type and provides helpful
     * error messages for invalid syntax.
     * 
     * Supported subcommands:
     * - promote/demote/invite/kick: /guild <action> <guildname> <username> [rank]
     * - mute/unmute: /guild <action> <guildname> <scope> [username] [time]
     * - setrank: /guild setrank <guildname> <username> <rank>
     * 
     * @private
     * @param {string} commandName - Command name ("guild")
     * @param {Array<string>} args - Command arguments
     * @returns {object} Parsed command object or error object
     */
    parseGuildCommand(commandName, args) {
        if (args.length < 2) {
            return {
                commandName,
                error: 'Guild command requires at least: /guild <action> <guildname>'
            };
        }

        const subcommand = args[0].toLowerCase(); // promote, demote, invite, execute, etc.
        const guildname = args[1];
        
        // Different subcommands have different parameter structures
        const options = {
            subcommand,
            guildname
        };

        switch (subcommand) {
            case 'promote':
            case 'demote':
            case 'invite':
            case 'kick':
                // These require username: /guild <action> <guildname> <username>
                if (args.length < 3) {
                    return {
                        commandName,
                        error: `Guild ${subcommand} requires: /guild ${subcommand} <guildname> <username>`
                    };
                }
                options.username = args[2];
                if (args[3]) options.rank = args[3]; // Optional rank for some commands
                break;
                
            case 'mute':
            case 'unmute':
                // Mute/unmute: /guild <action> <guildname> <scope> [username] [time]
                if (args.length < 3) {
                    return {
                        commandName,
                        error: `Guild ${subcommand} requires: /guild ${subcommand} <guildname> <scope>`
                    };
                }
                options.scope = args[2]; // 'global' or 'player'
                if (args[3]) options.username = args[3];
                if (args[4]) options.time = args[4];
                break;
            
            case 'setrank':
                // These commands have their specific parsing but are allowed
                if (subcommand === 'setrank' && args.length < 4) {
                    return {
                        commandName,
                        error: 'Guild setrank requires: /guild setrank <guildname> <username> <rank>'
                    };
                }
                if (args.length >= 3) options.username = args[2];
                if (args.length >= 4) options.rank = args[3];
                break;
                
            default:
                return {
                    commandName,
                    error: `❌ Subcommand '${subcommand}' is not authorized for remote execution.\n**Allowed commands:** promote, demote, invite, kick, execute, mute, unmute, info, list, online, setrank.`
                };
        }

        return {
            commandName,
            options
        };
    }

    /**
     * Parse generic commands (fallback)
     * 
     * Provides simple key-value parsing for commands that don't have
     * specialized parsers. Treats arguments as alternating keys and values.
     * 
     * @private
     * @param {Array<string>} args - Command arguments
     * @returns {object} Parsed options object
     */
    parseGenericCommand(args) {
        const options = {};
        
        // Simple key-value parsing for other commands
        for (let i = 0; i < args.length; i += 2) {
            if (i + 1 < args.length) {
                options[args[i]] = args[i + 1];
            }
        }
        
        return options;
    }

    // ==================== PSEUDO-INTERACTION SYSTEM ====================

    /**
     * Create pseudo-interaction object that mimics Discord.js ChatInputCommandInteraction
     * 
     * Creates an object that mimics the Discord.js interaction API, allowing text-based
     * commands to be executed through the same handlers as slash commands. Implements
     * all necessary interaction methods and properties for compatibility.
     * 
     * The pseudo-interaction includes:
     * - Basic properties (commandName, user, member, channel, guild, timestamps)
     * - State tracking (replied, deferred, ephemeral)
     * - Options getters (getString, getInteger, getBoolean, getSubcommand)
     * - Response methods (reply, editReply, followUp, deferReply, fetchReply)
     * 
     * @private
     * @param {Message} message - Original Discord message
     * @param {string} commandName - Parsed command name
     * @param {object} options - Parsed command options
     * @returns {object} Pseudo-interaction object compatible with slash command handlers
     */
    createPseudoInteraction(message, commandName, options) {
        // Ensure options is never undefined
        if (!options || typeof options !== 'object') {
            options = {};
        }

        const pseudoInteraction = {
            // Basic properties
            commandName,
            user: message.author,
            member: message.member,
            channel: message.channel,
            guild: message.guild,
            createdTimestamp: message.createdTimestamp,
            
            // State tracking
            replied: false,
            deferred: false,
            ephemeral: false,
            
            // Options handling with null safety - return empty string instead of null
            options: {
                /**
                 * Get string option value
                 * @param {string} name - Option name
                 * @returns {string} Option value or empty string
                 */
                getString: (name) => {
                    // Extra safety check
                    if (!options || typeof options !== 'object') return '';
                    const value = options[name];
                    // Return empty string instead of null to prevent startsWith errors
                    if (value === null || value === undefined) return '';
                    return String(value);
                },
                
                /**
                 * Get integer option value
                 * @param {string} name - Option name
                 * @returns {number|null} Parsed integer or null
                 */
                getInteger: (name) => {
                    if (!options || typeof options !== 'object') return null;
                    const value = options[name];
                    if (value === null || value === undefined) return null;
                    const parsed = parseInt(value);
                    return isNaN(parsed) ? null : parsed;
                },
                
                /**
                 * Get boolean option value
                 * @param {string} name - Option name
                 * @returns {boolean|null} Boolean value or null
                 */
                getBoolean: (name) => {
                    if (!options || typeof options !== 'object') return null;
                    const value = options[name];
                    if (value === null || value === undefined) return null;
                    if (value === 'true' || value === true) return true;
                    if (value === 'false' || value === false) return false;
                    return null;
                },
                
                /**
                 * Get subcommand name
                 * @returns {string} Subcommand name or empty string
                 */
                getSubcommand: () => {
                    if (!options || typeof options !== 'object') return '';
                    return options.subcommand || '';
                }
            },
            
            // Response methods
            
            /**
             * Reply to the command
             * @param {string|object} responseData - Response content or object
             * @returns {Promise<Message>} Sent message
             */
            reply: async (responseData) => {
                pseudoInteraction.replied = true;
                
                const replyContent = typeof responseData === 'string' ? 
                    responseData : responseData.content;
                
                const embedData = responseData.embeds ? { embeds: responseData.embeds } : {};
                
                pseudoInteraction.lastReply = await message.reply({
                    content: replyContent,
                    ...embedData,
                    allowedMentions: { repliedUser: false }
                });
                
                return pseudoInteraction.lastReply;
            },
            
            /**
             * Edit the reply
             * @param {string|object} responseData - New content
             * @returns {Promise<Message>} Edited message
             */
            editReply: async (responseData) => {
                if (!pseudoInteraction.lastReply) {
                    throw new Error('No reply to edit');
                }
                
                const editContent = typeof responseData === 'string' ? 
                    responseData : responseData.content;
                
                const embedData = responseData.embeds ? { embeds: responseData.embeds } : {};
                
                return await pseudoInteraction.lastReply.edit({
                    content: editContent,
                    ...embedData
                });
            },
            
            /**
             * Send a follow-up message
             * @param {string|object} responseData - Follow-up content
             * @returns {Promise<Message>} Sent message
             */
            followUp: async (responseData) => {
                const followUpContent = typeof responseData === 'string' ? 
                    responseData : responseData.content;
                
                const embedData = responseData.embeds ? { embeds: responseData.embeds } : {};
                
                return await message.channel.send({
                    content: followUpContent,
                    ...embedData
                });
            },
            
            /**
             * Defer the reply (show "thinking" state)
             * @param {object} options - Defer options
             * @returns {Promise<Message>} Temporary message
             */
            deferReply: async (options = {}) => {
                pseudoInteraction.deferred = true;
                pseudoInteraction.ephemeral = options.ephemeral || false;
                
                // Send a temporary "thinking" message
                pseudoInteraction.lastReply = await message.reply({
                    content: '⏳ Processing command...',
                    allowedMentions: { repliedUser: false }
                });
            },
            
            /**
             * Fetch the reply message
             * @returns {Promise<Message>} Reply message
             */
            fetchReply: async () => {
                return pseudoInteraction.lastReply;
            }
        };

        return pseudoInteraction;
    }

    // ==================== USER MANAGEMENT ====================

    /**
     * Set allowed users for security
     * 
     * Replaces the entire whitelist of users allowed to execute commands.
     * 
     * @param {Array<string>} userIds - Array of Discord user IDs
     */
    setAllowedUsers(userIds) {
        this.allowedUserIds = userIds;
        logger.debug(`Updated allowed users: ${userIds.join(', ')}`);
    }

    /**
     * Add a single allowed user
     * 
     * Adds a user to the whitelist if not already present.
     * 
     * @param {string} userId - Discord user ID to add
     */
    addAllowedUser(userId) {
        if (!this.allowedUserIds.includes(userId)) {
            this.allowedUserIds.push(userId);
            logger.debug(`Added allowed user: ${userId}`);
        }
    }

    /**
     * Remove an allowed user
     * 
     * Removes a user from the whitelist.
     * 
     * @param {string} userId - Discord user ID to remove
     */
    removeAllowedUser(userId) {
        this.allowedUserIds = this.allowedUserIds.filter(id => id !== userId);
        logger.debug(`Removed allowed user: ${userId}`);
    }
}

module.exports = CommandDetectionHandler;