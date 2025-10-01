/**
 * Ping Command - Bot Latency Testing and Health Check
 * 
 * This slash command provides a simple way to test the bot's responsiveness and measure
 * connection latency. It calculates both the round-trip latency (time from command to response)
 * and the WebSocket API latency (Discord gateway ping). This is useful for diagnosing
 * connection issues and verifying the bot is functioning properly.
 * 
 * Command Features:
 * - Quick bot responsiveness test
 * - Dual latency measurement (bot and API)
 * - Ephemeral response (only visible to command user)
 * - Real-time latency calculation
 * - Simple, lightweight execution
 * 
 * Latency Metrics:
 * - Bot Latency: Round-trip time from command invocation to response
 *   Measures the time taken to process the command and send initial reply
 *   Typical range: 50-200ms (depends on Discord API and bot processing)
 * 
 * - API Latency: WebSocket heartbeat ping to Discord gateway
 *   Measures the connection quality between bot and Discord servers
 *   Typical range: 20-100ms (depends on network and Discord datacenter location)
 * 
 * Usage: /ping
 * Permission: User (available to all server members)
 * Response: Ephemeral (only visible to command executor)
 * 
 * Use Cases:
 * - Verify bot is online and responsive
 * - Diagnose connection issues or slowness
 * - Compare latency across different times/regions
 * - Quick health check before executing complex commands
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { SlashCommandBuilder } = require('discord.js');

/**
 * Ping Command Module
 * 
 * Exports a command object with slash command definition and execution logic.
 * Provides bot responsiveness testing through latency measurement.
 * 
 * @module ping
 * @type {object}
 * @property {SlashCommandBuilder} data - Slash command definition
 * @property {string} permission - Permission level required ('user', 'mod', 'admin')
 * @property {Function} execute - Command execution function
 */
module.exports = {
    /**
     * Slash command definition
     * 
     * Defines the command name and description for Discord's slash command system.
     * Simple ping command with no options or parameters required.
     * 
     * @type {SlashCommandBuilder}
     */
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong! and shows bot latency'),
    
    /**
     * Permission level required to execute this command
     * 
     * Determines who can use this command based on configured permission roles.
     * Set to 'user' to allow all server members to check bot latency.
     * 
     * Permission Levels:
     * - 'user': Available to all server members (default)
     * - 'mod': Requires moderator role
     * - 'admin': Requires administrator role
     * 
     * @type {string}
     */
    permission: 'user', // 'user', 'mod', 'admin'
    
    /**
     * Execute the ping command
     * 
     * Measures and displays bot latency metrics in two steps:
     * 1. Sends initial "Pinging..." message and captures timestamp
     * 2. Calculates round-trip latency and WebSocket API latency
     * 3. Updates the message with latency information
     * 
     * Latency Calculations:
     * - Bot Latency: Difference between reply creation time and command creation time
     *   Formula: reply.createdTimestamp - interaction.createdTimestamp
     *   Includes: Discord API processing + bot processing + network round-trip
     * 
     * - API Latency: WebSocket heartbeat ping maintained by Discord.js
     *   Source: interaction.client.ws.ping
     *   Represents: Average ping to Discord gateway over recent heartbeats
     * 
     * Response Format:
     * ```
     * 🏓 Pong!
     * **Bot Latency:** {latency}ms
     * **API Latency:** {apiLatency}ms
     * ```
     * 
     * @async
     * @param {ChatInputCommandInteraction} interaction - Discord interaction object
     * @param {object} context - Command execution context (optional)
     * @param {Client} context.client - Discord client instance
     * @param {object} context.config - Configuration object
     * @param {object} context.bridgeLocator - Bridge locator instance
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        // Get the timestamp when the command was sent
        // Send initial reply with fetchReply to get the message object
        const sent = await interaction.reply({ 
            content: 'Pinging...',
            ephemeral: true,
            fetchReply: true 
        });
        
        // Calculate round-trip latency
        // This measures the time from command invocation to reply creation
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        
        // Get WebSocket API latency
        // This is the heartbeat ping maintained by Discord.js
        const apiLatency = Math.round(interaction.client.ws.ping);
        
        // Update the reply with latency information
        await interaction.editReply({
            content: `🏓 Pong!\n` +
                    `**Bot Latency:** ${latency}ms\n` +
                    `**API Latency:** ${apiLatency}ms`,
            ephemeral: true,
            fetchReply: true 
        });
    },
};