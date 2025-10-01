/**
 * Slash Command Handler - Discord Slash Command Registration and Execution
 * 
 * This file handles the complete lifecycle of Discord slash commands including loading,
 * registration with Discord's API, permission validation, and command execution.
 * It supports recursive command loading from directories and provides autocomplete
 * functionality for commands that require it.
 * 
 * The handler provides:
 * - Recursive command loading from directories and subdirectories
 * - Global slash command registration with Discord API
 * - Command execution with full context (client, config, bridge)
 * - Permission validation (admin, moderator roles)
 * - Autocomplete handling for dynamic command options
 * - Guild name and rank autocomplete for guild-related commands
 * - Command hot-reloading capabilities
 * - Interaction event handling and routing
 * 
 * Permission System:
 * - Admin: Requires configured admin roles or Administrator permission
 * - Moderator: Requires admin/mod roles or ManageMessages permission
 * - Commands can specify required permission level for access control
 * 
 * Autocomplete Features:
 * - Guild name suggestions based on enabled guilds in configuration
 * - Dynamic rank suggestions based on selected guild's rank structure
 * - Custom autocomplete handlers for individual commands
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { readdirSync, statSync } = require('fs');
const { join } = require('path');
const { REST, Routes, Events } = require('discord.js');
const { EventEmitter } = require('events');

// Specific Imports
const logger = require('../../../shared/logger');
const BridgeLocator = require('../../../bridgeLocator.js');

/**
 * SlashCommandHandler - Manages Discord slash commands
 * 
 * Extends EventEmitter to emit command execution events.
 * Handles command loading, registration, execution, permissions, and autocomplete.
 * 
 * @class
 * @extends EventEmitter
 */
class SlashCommandHandler extends EventEmitter {
    /**
     * Create a new SlashCommandHandler instance
     * Initializes configuration, command storage, and permission settings
     */
    constructor() {
        super();

        const mainBridge = BridgeLocator.getInstance();
        this.config = mainBridge.config;

        this.client = null;
        this.commands = new Map();
        this.commandsData = [];
                
        // Statistics
        this.commandsLoaded = 0;

        
        // Admin and mod roles for permission checking
        this.adminRoles = this.config.get('bridge.adminRoles') || [];
        this.modRoles = this.config.get('bridge.modRoles') || [];

        logger.debug('SlashCommandHandler initialized');
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize the slash command handler
     * 
     * Sets up the handler with a Discord client, loads all commands,
     * registers them with Discord's API, and sets up interaction listeners.
     * 
     * @async
     * @param {Client} client - Discord client instance
     * @throws {Error} If client is not provided
     * @throws {Error} If initialization fails
     */
    async initialize(client) {
        if (!client) {
            throw new Error('Discord client is required for SlashCommandHandler initialization');
        }

        this.client = client;

        try {
            logger.debug('Initializing SlashCommandHandler...');

            // Load all commands
            await this.loadCommands();

            // Register commands with Discord
            await this.registerCommands();

            // Setup event listeners
            this.setupInteractionListener();

            logger.discord(`SlashCommandHandler initialized with ${this.commands.size} commands`);

        } catch (error) {
            logger.logError(error, 'Failed to initialize SlashCommandHandler');
            throw error;
        }
    }

    // ==================== COMMAND LOADING ====================

    /**
     * Load all commands from the commands directory and subdirectories
     * 
     * Scans the commands directory and loads all command files.
     * Creates the directory if it doesn't exist.
     * 
     * @async
     * @private
     */
    async loadCommands() {
        const commandsPath = join(__dirname, '../commands');
        
        try {
            await this.loadCommandsFromDirectory(commandsPath);
            logger.discord(`Loaded ${this.commandsLoaded} slash commands`);

        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn('Commands directory not found, creating it...');
                const fs = require('fs');
                fs.mkdirSync(commandsPath, { recursive: true });
            } else {
                logger.logError(error, 'Failed to load commands directory');
            }
        }
    }

    /**
     * Recursively load commands from a directory
     * 
     * Scans a directory for JavaScript files and loads them as commands.
     * Skips subdirectories as they contain subcommand modules rather than full commands.
     * 
     * @async
     * @private
     * @param {string} dirPath - Directory path to scan
     * @param {boolean} isSubdirectory - Whether this is a subdirectory (default: false)
     */
    async loadCommandsFromDirectory(dirPath, isSubdirectory = false) {
        try {
            const items = readdirSync(dirPath);

            for (const item of items) {
                const itemPath = join(dirPath, item);
                const itemStats = statSync(itemPath);

                if (itemStats.isDirectory()) {
                    // Skip subdirectories for command loading
                    // Subdirectories contain subcommand modules, not full commands
                    continue;
                } else if (item.endsWith('.js')) {
                    // Only load command files from the main commands directory
                    if (!isSubdirectory) {
                        await this.loadCommandFile(itemPath, item);
                    }
                }
            }
        } catch (error) {
            logger.logError(error, `Failed to load commands from directory: ${dirPath}`);
        }
    }

    /**
     * Load a single command file
     * 
     * Loads a command file, validates its structure, and adds it to the command map.
     * Clears the require cache to enable hot reloading.
     * 
     * @async
     * @private
     * @param {string} filePath - Path to the command file
     * @param {string} fileName - Name of the file
     */
    async loadCommandFile(filePath, fileName) {
        try {
            // Clear require cache to allow hot reloading
            delete require.cache[require.resolve(filePath)];
            
            const command = require(filePath);
            
            // Validate command structure
            if (!command.data || !command.execute) {
                logger.debug(`Skipping ${fileName} - not a complete slash command (likely a subcommand module)`);
                return;
            }

            // Store command
            this.commands.set(command.data.name, command);
            this.commandsData.push(command.data.toJSON());
            
            this.commandsLoaded++;
            logger.discord(`Loaded slash command: ${command.data.name} from ${fileName}`);
            
        } catch (error) {
            logger.logError(error, `Failed to load command file: ${fileName}`);
        }
    }

    // ==================== COMMAND REGISTRATION ====================

    /**
     * Register slash commands with Discord API
     * 
     * Registers all loaded commands globally with Discord's API.
     * Commands will be available across all guilds where the bot is installed.
     * 
     * @async
     * @private
     * @throws {Error} If client ID is not configured
     * @throws {Error} If registration with Discord fails
     */
    async registerCommands() {
        if (this.commandsData.length === 0) {
            logger.warn('No slash commands to register');
            return;
        }

        try {
            const rest = new REST().setToken(this.config.get('app.token'));
            const clientId = this.config.get('app.clientId');

            if (!clientId) {
                throw new Error('Discord client ID not found in configuration');
            }

            logger.debug('Started refreshing application (/) commands...');

            // Register commands globally
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: this.commandsData }
            );

            logger.discord(`Successfully registered ${this.commandsData.length} slash commands globally`);

        } catch (error) {
            logger.logError(error, 'Failed to register slash commands');
            throw error;
        }
    }

    // ==================== EVENT HANDLING ====================

    /**
     * Setup interaction listener for slash commands and autocomplete
     * 
     * Registers event listeners for Discord interactions including
     * slash command execution and autocomplete requests. Handles errors
     * gracefully with appropriate user feedback.
     * 
     * @private
     */
    setupInteractionListener() {
        this.client.on(Events.InteractionCreate, async (interaction) => {
            // Handle autocomplete interactions
            if (interaction.isAutocomplete()) {
                await this.handleAutocomplete(interaction);
                return;
            }

            // Handle slash command interactions
            if (!interaction.isChatInputCommand())
                return;

            const command = this.commands.get(interaction.commandName);

            if (!command) {
                logger.warn(`No command matching ${interaction.commandName} was found`);
                return;
            }

            try {
                // Check permissions if required
                if (command.permission && !this.hasPermission(interaction.member, command.permission)) {
                    await interaction.reply({
                        content: 'You do not have permission to use this command.',
                        ephemeral: true
                    });
                    return;
                }

                // Execute command with full context
                await command.execute(interaction, {
                    client: this.client,
                    config: this.config,
                    bridgeLocator: BridgeLocator.getInstance()
                });
                
                logger.discord(`Executed slash command: ${interaction.commandName} by ${interaction.user.displayName}`);

            } catch (error) {
                logger.logError(error, `Error executing slash command: ${interaction.commandName}`);

                const errorMessage = 'There was an error while executing this command!';
                
                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ content: errorMessage, ephemeral: true });
                    } else {
                        await interaction.reply({ content: errorMessage, ephemeral: true });
                    }
                } catch (replyError) {
                    logger.logError(replyError, 'Failed to send error message to user');
                }
            }
        });
    }

    // ==================== AUTOCOMPLETE SYSTEM ====================

    /**
     * Handle autocomplete interactions
     * 
     * Routes autocomplete requests to the appropriate handler based on the option name.
     * Supports guild name and rank autocomplete, as well as custom command autocomplete.
     * Provides safe fallback with empty response on errors.
     * 
     * @async
     * @private
     * @param {AutocompleteInteraction} interaction - Discord autocomplete interaction
     */
    async handleAutocomplete(interaction) {
        try {
            const command = this.commands.get(interaction.commandName);
            if (!command) {
                logger.warn(`No command matching ${interaction.commandName} found for autocomplete`);
                return;
            }

            const focusedOption = interaction.options.getFocused(true);

            // Handle guild name autocomplete
            if (focusedOption.name === 'guildname') {
                await this.handleGuildNameAutocomplete(interaction, focusedOption.value);
                return;
            }
            // Handle guild rank autocomplete
            if (focusedOption.name === 'rank' && interaction.commandName === 'guild') {
                await this.handleRankAutocomplete(interaction, focusedOption.value);
                return;
            }

            // If command has custom autocomplete handler
            if (command.autocomplete) {
                await command.autocomplete(interaction);
                return;
            }

            // Default empty response if no handler found
            await interaction.respond([]);

        } catch (error) {
            logger.logError(error, `Error handling autocomplete for ${interaction.commandName}`);
            
            try {
                await interaction.respond([]);
            } catch (respondError) {
                logger.logError(respondError, 'Failed to respond to autocomplete interaction');
            }
        }
    }

    /**
     * Handle guild name autocomplete
     * 
     * Provides autocomplete suggestions for guild names based on enabled guilds
     * in the configuration. Filters results based on user input and limits to
     * Discord's maximum of 25 choices.
     * 
     * @async
     * @private
     * @param {AutocompleteInteraction} interaction - Discord autocomplete interaction
     * @param {string} query - Current input value
     */
    async handleGuildNameAutocomplete(interaction, query) {
        try {
            const enabledGuilds = this.config.getEnabledGuilds() || [];
            
            if (enabledGuilds.length === 0) {
                await interaction.respond([{
                    name: 'No guilds available',
                    value: 'none'
                }]);
                return;
            }

            // Filter guilds based on query (case insensitive)
            const filteredGuilds = enabledGuilds.filter(guild => 
                guild.name && guild.name.toLowerCase().includes(query.toLowerCase())
            );

            // Create choices array (Discord limit: 25 choices max)
            const choices = filteredGuilds
                .slice(0, 25)
                .map(guild => ({
                    name: `${guild.name}`,
                    value: guild.name
                }));

            // If no matches and query is not empty, suggest closest matches
            if (choices.length === 0 && query.length > 0) {
                const allGuildChoices = enabledGuilds
                    .slice(0, 25)
                    .map(guild => ({
                        name: `${guild.name} (available)`,
                        value: guild.name
                    }));
                
                await interaction.respond(allGuildChoices);
                return;
            }

            await interaction.respond(choices);

        } catch (error) {
            logger.logError(error, 'Error generating guild name autocomplete');
            await interaction.respond([]);
        }
    }

    /**
     * Handle rank autocomplete for setrank command
     * 
     * Provides autocomplete suggestions for guild ranks based on the selected guild's
     * rank structure. Requires a guild to be selected first. Filters results based
     * on user input and returns ranks in reverse order (highest to lowest).
     * 
     * @async
     * @private
     * @param {AutocompleteInteraction} interaction - Discord autocomplete interaction
     * @param {string} query - Current input value
     */
    async handleRankAutocomplete(interaction, query) {
        try {
            // Get the currently selected guild name
            const guildName = interaction.options.getString('guildname');
            
            if (!guildName) {
                await interaction.respond([{
                    name: 'Please select a guild first',
                    value: 'no_guild'
                }]);
                return;
            }

            // Get valid ranks for the selected guild
            const validRanks = this.getValidRanksForGuild(guildName);
            
            if (validRanks.length === 0) {
                await interaction.respond([{
                    name: 'No ranks available for this guild',
                    value: 'no_ranks'
                }]);
                return;
            }

            // Filter ranks based on query (case insensitive)
            const filteredRanks = validRanks.filter(rank => 
                rank.toLowerCase().includes(query.toLowerCase())
            );

            // Create choices array (Discord limit: 25 choices max)
            const choices = filteredRanks
                .slice(0, 25)
                .map(rank => ({
                    name: rank,
                    value: rank
                }));

            // If no matches and query is not empty, show all available ranks
            if (choices.length === 0 && query.length > 0) {
                const allRankChoices = validRanks
                    .slice(0, 25)
                    .map(rank => ({
                        name: `${rank} (available)`,
                        value: rank
                    }));
                
                await interaction.respond(allRankChoices);
                return;
            }

            await interaction.respond(choices);

        } catch (error) {
            logger.logError(error, 'Error generating rank autocomplete');
            await interaction.respond([]);
        }
    }

    /**
     * Get valid ranks for a guild dynamically from configuration
     * 
     * Retrieves the rank structure for a specific guild from the configuration.
     * Returns ranks in reverse order (highest to lowest) for intuitive selection.
     * Only returns ranks for enabled guilds.
     * 
     * @private
     * @param {string} guildName - Name of the guild
     * @returns {Array<string>} Array of valid ranks (reversed order)
     */
    getValidRanksForGuild(guildName) {
        try {
            // Get guilds configuration
            const guilds = this.config.get("guilds") || [];
            
            // Find the guild by name (case insensitive)
            const guild = guilds.find(g => 
                g.name.toLowerCase() === guildName.toLowerCase() && g.enabled
            );
            
            if (!guild) {
                logger.warn(`Guild '${guildName}' not found in configuration`);
                return [];
            }
            
            // Return the ranks for this guild in reverse order
            return (guild.ranks || []).slice().reverse();
            
        } catch (error) {
            logger.logError(error, `Error getting ranks for guild '${guildName}'`);
            return [];
        }
    }

    // ==================== PERMISSION SYSTEM ====================

    /**
     * Check if member has required permission
     * 
     * Validates if a guild member has the required permission level.
     * Supports 'admin' and 'moderator' permission levels.
     * 
     * Admin level checks:
     * - Member has a role in configured adminRoles (by ID or name)
     * - Member has Administrator permission
     * 
     * Moderator level checks:
     * - Member has admin permissions (inherits from admin)
     * - Member has a role in configured modRoles (by ID or name)
     * - Member has ManageMessages permission
     * 
     * @param {GuildMember} member - Discord guild member
     * @param {string} requiredPermission - Required permission level ('admin', 'mod', 'moderator')
     * @returns {boolean} Has permission
     */
    hasPermission(member, requiredPermission) {
        if (!member || !requiredPermission) return true;

        switch (requiredPermission.toLowerCase()) {
            case 'admin':
                return member.roles.cache.some(role => 
                    this.adminRoles.includes(role.id) || this.adminRoles.includes(role.name)
                ) || member.permissions.has('Administrator');
                
            case 'mod':
            case 'moderator':
                return member.roles.cache.some(role => 
                    this.adminRoles.includes(role.id) || this.adminRoles.includes(role.name) ||
                    this.modRoles.includes(role.id) || this.modRoles.includes(role.name)
                ) || member.permissions.has('Administrator') || member.permissions.has('ManageMessages');
                
            default:
                return true;
        }
    }

    // ==================== COMMAND MANAGEMENT ====================

    /**
     * Reload all commands
     * 
     * Clears the current command cache and reloads all commands from disk.
     * Re-registers commands with Discord's API after reload.
     * Useful for applying command changes without restarting the bot.
     * 
     * @async
     * @returns {Promise<object>} Result object with success status and command count
     */
    async reloadCommands() {
        try {
            this.commands.clear();
            this.commandsData = [];
            this.commandsLoaded = 0;

            await this.loadCommands();
            await this.registerCommands();

            logger.discord('Slash commands reloaded successfully');
            return { success: true, count: this.commands.size };

        } catch (error) {
            logger.logError(error, 'Failed to reload slash commands');
            return { success: false, error: error.message };
        }
    }

    // ==================== CLEANUP ====================

    /**
     * Cleanup resources
     * 
     * Clears all command data and removes event listeners.
     * Should be called before disposing of the handler instance.
     */
    cleanup() {
        this.commands.clear();
        this.commandsData = [];
        this.client = null;
        
        // Remove all listeners
        this.removeAllListeners();

        logger.debug('SlashCommandHandler cleaned up');
    }
}

module.exports = SlashCommandHandler;