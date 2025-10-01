/**
 * Guild Command - Minecraft Guild Management System
 * 
 * This slash command provides comprehensive guild management capabilities for Minecraft
 * Hypixel guilds through Discord. It acts as a central hub for all guild-related operations,
 * routing subcommands to specialized handlers and managing permissions. The command uses
 * a modular architecture where each subcommand is loaded from separate files in the guild
 * directory, allowing for easy maintenance and extensibility.
 * 
 * The command provides:
 * - Modular subcommand system with hot-reloading support
 * - Permission-based access control for sensitive operations
 * - Guild name autocomplete for user convenience
 * - Rank autocomplete for promotion/demotion operations
 * - Comprehensive error handling and user feedback
 * - Integration with CommandResponseListener for result tracking
 * 
 * Available Subcommands:
 * - invite: Invite a player to join a guild
 * - kick: Remove a player from a guild with reason
 * - promote: Promote a player to next rank
 * - demote: Demote a player to previous rank
 * - setrank: Set a player to specific rank
 * - mute: Mute guild chat (global or specific player)
 * - unmute: Unmute guild chat (global or specific player)
 * - execute: Execute custom guild command
 * - list: List guild members (online, offline, or all)
 * 
 * Architecture:
 * - GuildCommandManager: Singleton class managing subcommand loading and execution
 * - Subcommand Files: Individual files in ./guild/ directory implementing specific operations
 * - Permission System: Role-based access control integrated with bridge configuration
 * - Autocomplete Support: Dynamic suggestions for guild names and ranks
 * 
 * Permission Levels:
 * - User: Basic operations available to all members
 * - Moderator: Guild management operations requiring mod role
 * - Admin: Sensitive operations requiring admin role
 * 
 * Subcommand Structure:
 * Each subcommand file must export:
 * - execute(interaction, context): Async function handling command logic
 * - permission (optional): Required permission level ('user', 'mod', 'admin')
 * 
 * Context Object:
 * - client: Discord client instance
 * - config: Configuration object
 * - bridgeLocator: BridgeLocator singleton for accessing managers
 * 
 * Usage Examples:
 * - /guild invite FrenchLegacy PlayerName
 * - /guild kick FrenchLegacy PlayerName Inactive
 * - /guild promote FrenchLegacy PlayerName
 * - /guild setrank FrenchLegacy PlayerName Officer
 * - /guild mute FrenchLegacy global 1h
 * - /guild execute FrenchLegacy top
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { SlashCommandBuilder } = require('discord.js');
const { readdirSync } = require('fs');
const { join } = require('path');

// Specific Imports
const logger = require('../../../shared/logger');

/**
 * GuildCommandManager - Manages guild subcommand loading and execution
 * 
 * Singleton class responsible for loading subcommand modules from the guild directory,
 * routing subcommand execution, and enforcing permission requirements. Implements
 * hot-reloading support for development convenience.
 * 
 * @class
 */
class GuildCommandManager {
    /**
     * Create a new GuildCommandManager instance
     * Initializes subcommand storage and loads all available subcommands
     */
    constructor() {
        this.subcommands = new Map();
        this.loadSubcommands();
    }

    /**
     * Load all subcommands from the guild directory
     * 
     * Scans the ./guild/ directory for JavaScript files and loads each as a subcommand module.
     * Implements hot-reloading by clearing require cache before loading. Each subcommand
     * must export an execute function and optionally a permission level.
     * 
     * Subcommand files are expected to be in format: {subcommandName}.js
     * Example: invite.js, kick.js, promote.js
     * 
     * @private
     */
    loadSubcommands() {
        try {
            const guildDir = join(__dirname, 'guild');
            const files = readdirSync(guildDir).filter(file => file.endsWith('.js'));

            for (const file of files) {
                try {
                    const subcommandPath = join(guildDir, file);
                    delete require.cache[require.resolve(subcommandPath)]; // Allow hot reloading
                    
                    const subcommand = require(subcommandPath);
                    const commandName = file.replace('.js', '');
                    
                    this.subcommands.set(commandName, subcommand);
                    logger.debug(`Loaded guild subcommand: ${commandName}`);
                    
                } catch (error) {
                    logger.logError(error, `Failed to load guild subcommand: ${file}`);
                }
            }

            logger.debug(`Loaded ${this.subcommands.size} guild subcommands`);

        } catch (error) {
            logger.logError(error, 'Failed to load guild subcommands directory');
        }
    }

    /**
     * Execute a subcommand
     * 
     * Routes the interaction to the appropriate subcommand handler, enforcing
     * permission requirements before execution. Validates subcommand existence
     * and executability before proceeding.
     * 
     * @async
     * @param {string} subcommandName - Name of the subcommand to execute
     * @param {ChatInputCommandInteraction} interaction - Discord interaction object
     * @param {object} context - Command execution context
     * @param {Client} context.client - Discord client instance
     * @param {object} context.config - Configuration object
     * @param {object} context.bridgeLocator - BridgeLocator instance
     * @throws {Error} If subcommand not found or not executable
     */
    async executeSubcommand(subcommandName, interaction, context) {
        const subcommand = this.subcommands.get(subcommandName);
        
        if (!subcommand || !subcommand.execute) {
            throw new Error(`Subcommand '${subcommandName}' not found or not executable`);
        }

        // Check permissions if the subcommand specifies them
        if (subcommand.permission) {
            const hasPermission = this.checkPermission(interaction.member, subcommand.permission, context);
            if (!hasPermission) {
                await interaction.reply({
                    content: `You do not have permission to use the \`${subcommandName}\` command.`,
                    ephemeral: true
                });
                return;
            }
        }

        await subcommand.execute(interaction, context);
    }

    /**
     * Check if member has required permission
     * 
     * Validates if a guild member has the required permission level to execute
     * a subcommand. Checks against configured admin and moderator roles, as well
     * as Discord's built-in permission system.
     * 
     * Permission Hierarchy:
     * - Admin: Requires admin role or Administrator permission
     * - Moderator: Requires admin/mod role or Administrator/ManageMessages permission
     * - User: No requirements (always returns true)
     * 
     * @param {GuildMember} member - Discord guild member
     * @param {string} requiredPermission - Required permission level ('admin', 'mod', 'user')
     * @param {object} context - Command execution context
     * @param {object} context.config - Configuration with role definitions
     * @returns {boolean} True if member has required permission
     */
    checkPermission(member, requiredPermission, context) {
        if (!member || !requiredPermission) return true;

        const adminRoles = context.config.get('discord.permissions.adminRoles') || [];
        const modRoles = context.config.get('discord.permissions.moderatorRoles') || [];

        switch (requiredPermission.toLowerCase()) {
            case 'admin':
                return member.roles.cache.some(role => 
                    adminRoles.includes(role.id) || adminRoles.includes(role.name)
                ) || member.permissions.has('Administrator');
                
            case 'mod':
            case 'moderator':
                return member.roles.cache.some(role => 
                    adminRoles.includes(role.id) || adminRoles.includes(role.name) ||
                    modRoles.includes(role.id) || modRoles.includes(role.name)
                ) || member.permissions.has('Administrator') || member.permissions.has('ManageMessages');
                
            default:
                return true;
        }
    }
}

// Create singleton instance
const guildCommandManager = new GuildCommandManager();

/**
 * Guild Command Module
 * 
 * Main command export with complete subcommand definitions and execution routing.
 * Each subcommand is defined with required options and autocomplete support where applicable.
 * 
 * @module guild
 * @type {object}
 * @property {SlashCommandBuilder} data - Complete slash command definition with all subcommands
 * @property {string} permission - Base permission level (subcommands can override)
 * @property {Function} execute - Main command execution function
 */
module.exports = {
    /**
     * Slash command definition with all subcommands
     * 
     * Defines the complete guild command structure with nine subcommands:
     * 
     * 1. invite - Invite player to guild
     *    Required: guildname (autocomplete), username
     * 
     * 2. kick - Kick player from guild
     *    Required: guildname (autocomplete), username, reason
     * 
     * 3. promote - Promote player to next rank
     *    Required: guildname (autocomplete), username
     * 
     * 4. demote - Demote player to previous rank
     *    Required: guildname (autocomplete), username
     * 
     * 5. setrank - Set player to specific rank
     *    Required: guildname (autocomplete), username, rank (autocomplete)
     * 
     * 6. mute - Mute guild chat
     *    Required: guildname (autocomplete), scope (global/player), time
     *    Optional: username (required if scope is player)
     * 
     * 7. unmute - Unmute guild chat
     *    Required: guildname (autocomplete), scope (global/player)
     *    Optional: username (required if scope is player)
     * 
     * 8. execute - Execute custom guild command
     *    Required: guildname (autocomplete), command_to_execute
     * 
     * 9. list - List guild members
     *    Required: guildname (autocomplete), type (online/offline/all)
     * 
     * @type {SlashCommandBuilder}
     */
    data: new SlashCommandBuilder()
    .setName("guild")
    .setDescription("Guild management commands")
    .addSubcommand((subcommand) =>
        subcommand
            .setName("invite")
            .setDescription("Invite a player to a guild")
            .addStringOption((option) =>
            option
                .setName("guildname")
                .setDescription("Name of the guild to invite to")
                .setAutocomplete(true)
                .setRequired(true)
            )
            .addStringOption((option) =>
            option
                .setName("username")
                .setDescription("Username of the player to invite")
                .setRequired(true)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("kick")
            .setDescription("Kick a player from a guild")
            .addStringOption((option) =>
            option
                .setName("guildname")
                .setDescription("Name of the guild to kick from")
                .setAutocomplete(true)
                .setRequired(true)
            )
            .addStringOption((option) =>
            option
                .setName("username")
                .setDescription("Username of the player to kick")
                .setRequired(true)
            )
            .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("Reason for kicking the player")
                .setRequired(true)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("promote")
            .setDescription("Promote a player in a guild")
            .addStringOption((option) =>
            option
                .setName("guildname")
                .setDescription("Name of the guild")
                .setAutocomplete(true)
                .setRequired(true)
            )
            .addStringOption((option) =>
            option
                .setName("username")
                .setDescription("Username of the player to promote")
                .setRequired(true)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("demote")
            .setDescription("Demote a player in a guild")
            .addStringOption((option) =>
            option
                .setName("guildname")
                .setDescription("Name of the guild")
                .setAutocomplete(true)
                .setRequired(true)
            )
            .addStringOption((option) =>
            option
                .setName("username")
                .setDescription("Username of the player to demote")
                .setRequired(true)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("setrank")
            .setDescription("Set a player rank in the guild")
            .addStringOption((option) =>
            option
                .setName("guildname")
                .setDescription("Name of the guild")
                .setAutocomplete(true)
                .setRequired(true)
            )
            .addStringOption((option) =>
            option
                .setName("username")
                .setDescription("Username of the player")
                .setRequired(true)
            )
            .addStringOption((option) =>
            option
                .setName("rank")
                .setDescription("Rank to set (case-insensitive)")
                .setAutocomplete(true)
                .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('mute')
            .setDescription('Mute a guild globally or a specific player')
            .addStringOption(option =>
                option.setName('guildname')
                    .setDescription('Name of the guild')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(option =>
                option.setName('scope')
                    .setDescription('Mute scope (global or player)')
                    .setRequired(true)
                    .addChoices(
                        { name: 'global', value: 'global' },
                        { name: 'player', value: 'player' }
                    )
            )
            .addStringOption(option =>
                option.setName('time')
                    .setDescription('Mute duration (e.g. 1h, 30m, 2d)')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('username')
                    .setDescription('Username to mute (required only if scope is player)')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('unmute')
            .setDescription('Unmute a guild globally or a specific player')
            .addStringOption(option =>
                option.setName('guildname')
                    .setDescription('Name of the guild')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(option =>
                option.setName('scope')
                    .setDescription('Unmute scope (global or player)')
                    .setRequired(true)
                    .addChoices(
                        { name: 'global', value: 'global' },
                        { name: 'player', value: 'player' }
                    )
            )
            .addStringOption(option =>
                option.setName('username')
                    .setDescription('Username to unmute (only if scope is player)')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('execute')
            .setDescription('Execute a custom guild command')
            .addStringOption(option =>
                option.setName('guildname')
                    .setDescription('Name of the guild')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addStringOption(option =>
                option.setName('command_to_execute')
                    .setDescription('Command to execute (DO NOT include /g or /guild prefix)')
                    .setRequired(true)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
          .setName("list")
          .setDescription("List guild members (online, offline, or all)")
          .addStringOption((option) =>
            option
              .setName("guildname")
              .setDescription("Name of the guild")
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addStringOption((option) =>
            option
              .setName("type")
              .setDescription("Type of members to list")
              .setRequired(true)
              .addChoices(
                { name: "Online members", value: "online" },
                { name: "Offline members", value: "offline" },
                { name: "All members", value: "all" }
              )
          )
    ),
    
    /**
     * Base permission level for guild command
     * 
     * Individual subcommands can override this with stricter permissions.
     * Default 'user' allows all members to access the command, but subcommands
     * may require 'mod' or 'admin' permissions.
     * 
     * @type {string}
     */
    permission: 'user', // Base permission, subcommands can override
    
    /**
     * Execute the guild command
     * 
     * Routes the interaction to the appropriate subcommand handler through
     * GuildCommandManager. Extracts the subcommand name from interaction options
     * and delegates execution with error handling.
     * 
     * Execution Flow:
     * 1. Extract subcommand name from interaction
     * 2. Route to GuildCommandManager for execution
     * 3. Subcommand handler performs operation
     * 4. Handle any errors with user-friendly messages
     * 
     * Error Handling:
     * - Catches and logs all execution errors
     * - Provides user feedback through ephemeral messages
     * - Handles both replied and deferred interactions
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
        const subcommandName = interaction.options.getSubcommand();
        
        try {
            await guildCommandManager.executeSubcommand(subcommandName, interaction, context);
            
        } catch (error) {
            logger.logError(error, `Error executing guild subcommand: ${subcommandName}`);
            
            const errorMessage = `An error occurred while executing the \`${subcommandName}\` command.`;
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },
};