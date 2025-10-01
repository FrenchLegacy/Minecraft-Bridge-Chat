/**
 * Help Command - Dynamic Command Catalog with Pagination
 * 
 * This slash command lists all available application commands dynamically
 * by reading the registered commands at runtime. It renders a two-page
 * embed with button-based pagination and returns an ephemeral message so
 * only the invoker sees the help.
 * 
 * Command Features:
 * - Auto-discovers registered slash commands (no manual updates required)
 * - Two-page embed navigation using buttons (ephemeral to the invoker)
 * - Page 1: Concise usages for all guild subcommands
 * - Page 2: Overview of all non-guild commands with parameters
 * - Clean UI with disabled page indicator (e.g., "1/2")
 * - Permissions: User-level (accessible to everyone)
 * 
 * Pagination Behavior:
 * - Uses Previous/Next buttons with emojis ⬅️ ➡️ and a disabled page badge
 * - Interaction collector limited to the command author for 60s
 * - Components are cleared at the end of the collector window
 * 
 * Usage: /help
 * Permission: User (available to all server members)
 * Response: Ephemeral (visible only to the invoker)
 * 
 * @author Panda_Sauvage
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const { SlashCommandBuilder, EmbedBuilder, bold, inlineCode, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Help Command Module
 * 
 * Exports the slash command definition and execution logic.
 * The execution builds paginated embeds listing commands and parameters.
 * 
 * @module help
 * @type {object}
 * @property {SlashCommandBuilder} data - Slash command definition
 * @property {string} permission - Permission level required ('user', 'mod', 'admin')
 * @property {Function} execute - Command execution handler
 */
module.exports = {
    /**
     * Slash command definition
     * 
     * Defines the command name and description for Discord's slash command system.
     * 
     * @type {SlashCommandBuilder}
     */
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available commands of the bot'),

    /**
     * Permission level required to execute this command
     * 
     * - 'user': Available to all server members (default)
     * - 'mod': Requires moderator role
     * - 'admin': Requires administrator role
     * 
     * @type {string}
     */
    permission: 'user',

    /**
     * Execute the help command
     * 
     * Builds two embeds:
     * - Page 1: Concise guild subcommand usages (e.g., `/guild invite {guild} {playerName}`)
     * - Page 2: Other commands with parameters and any subcommands summary
     * 
     * Adds button components for pagination (Previous/Next with page badge),
     * restricted to the invoker, and clears components after 60 seconds.
     * 
     * @async
     * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction object
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        try {
            // Non-ephemeral so we can add reactions for pagination
            const formatOption = (opt) => {
                const typeNames = {
                    1: 'SUB_COMMAND',
                    2: 'SUB_COMMAND_GROUP',
                    3: 'STRING',
                    4: 'INTEGER',
                    5: 'BOOLEAN',
                    6: 'USER',
                    7: 'CHANNEL',
                    8: 'ROLE',
                    9: 'MENTIONABLE',
                    10: 'NUMBER',
                    11: 'ATTACHMENT',
                };
                const req = opt.required ? 'required' : 'optional';
                const desc = opt.description ? ` - ${opt.description}` : '';
                return `${inlineCode(opt.name)} (${typeNames[opt.type] || 'UNKNOWN'}, ${req})${desc}`;
            };

            const applicationCommands = await interaction.client.application.commands.fetch();

            // Separate guild command from others
            const guildCmd = [...applicationCommands.values()].find(c => c.name === 'guild');
            const otherCmds = [...applicationCommands.values()]
                .filter(c => c.name !== 'guild')
                .sort((a, b) => a.name.localeCompare(b.name));

            // Helper to normalize parameter placeholder names
            const normalizeParamName = (name) => {
                const map = {
                    guildname: 'guild',
                    guild: 'guild',
                    username: 'playerName',
                    player: 'playerName',
                    playername: 'playerName',
                };
                return map[name?.toLowerCase?.()] || name;
            };

            // Page 1: Guild commands with concise usage lines
            const guildFields = [];
            if (guildCmd) {
                const options = Array.isArray(guildCmd.options) ? guildCmd.options : [];

                // Flatten subcommands and groups to concise usage strings
                for (const opt of options) {
                    if (opt.type === 1) { // SUB_COMMAND
                        const params = Array.isArray(opt.options)
                            ? opt.options.filter(p => p.type !== 1 && p.type !== 2).map(p => `{${normalizeParamName(p.name)}}`).join(' ')
                            : '';
                        const usage = `/guild ${opt.name}${params ? ' ' + params : ''}`;
                        guildFields.push({ name: `/guild ${opt.name}`, value: inlineCode(usage) });
                    } else if (opt.type === 2) { // SUB_COMMAND_GROUP
                        const groupName = opt.name;
                        const subList = Array.isArray(opt.options) ? opt.options : [];
                        for (const sub of subList) {
                            if (sub.type === 1) {
                                const params = Array.isArray(sub.options)
                                    ? sub.options.filter(p => p.type !== 1 && p.type !== 2).map(p => `{${normalizeParamName(p.name)}}`).join(' ')
                                    : '';
                                const usage = `/guild ${groupName} ${sub.name}${params ? ' ' + params : ''}`;
                                guildFields.push({ name: `/guild ${groupName} ${sub.name}`, value: inlineCode(usage) });
                            }
                        }
                    }
                }
            }

            const guildEmbed = new EmbedBuilder()
                .setTitle('📖 Guild commands')
                .setDescription('Concise usage for guild subcommands.')
                .setColor(0x5865F2)
                .addFields(guildFields.length > 0 ? guildFields : [{ name: 'No guild command found', value: '—' }])
                .setTimestamp();

            // Page 2: Other commands overview
            const otherFields = otherCmds.map(cmd => {
                const description = cmd.description || 'No description';
                const options = Array.isArray(cmd.options) ? cmd.options : [];
                const params = options.filter(o => o.type !== 1 && o.type !== 2).map(formatOption).join('\n');
                const subcommands = options.filter(o => o.type === 1 || o.type === 2);

                let extra = '';
                if (subcommands.length > 0) {
                    const names = [];
                    for (const sc of subcommands) {
                        if (sc.type === 1) names.push(sc.name);
                        if (sc.type === 2 && Array.isArray(sc.options)) {
                            for (const s of sc.options.filter(x => x.type === 1)) names.push(`${sc.name} ${s.name}`);
                        }
                    }
                    if (names.length > 0) extra += `\n${bold('Subcommands:')} ${names.map(n => inlineCode(n)).join(', ')}`;
                }
                if (params) extra += `\n${bold('Parameters:')}\n${params}`;

                return {
                    name: `/${cmd.name}`,
                    value: `${description}${extra}`.slice(0, 1024) || '\u200b'
                };
            });

            const otherEmbed = new EmbedBuilder()
                .setTitle('📖 Other commands')
                .setDescription('List of non-guild commands.')
                .setColor(0x5865F2)
                .addFields(otherFields.length > 0 ? otherFields : [{ name: 'No other commands found', value: '—' }])
                .setFooter({ text: 'Page 2/2  ◀️ ▶️' })
                .setTimestamp();

            // Build button components similar to guild list
            const buildComponents = (totalPages, pageIndex) => {
                const components = [];
                if (totalPages > 1) {
                    const row = new ActionRowBuilder();

                    const prevButton = new ButtonBuilder()
                        .setCustomId(`help_prev_${pageIndex}`)
                        .setLabel('Précédent')
                        .setEmoji('⬅️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(pageIndex === 0);

                    const nextButton = new ButtonBuilder()
                        .setCustomId(`help_next_${pageIndex}`)
                        .setLabel('Suivant')
                        .setEmoji('➡️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(pageIndex === totalPages - 1);

                    const pageButton = new ButtonBuilder()
                        .setCustomId(`help_page_${pageIndex}`)
                        .setLabel(`${pageIndex + 1}/2`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true);

                    row.addComponents(prevButton, pageButton, nextButton);
                    components.push(row);
                }
                return components;
            };

            const totalPages = 2;
            let pageIndex = 0; // 0 = guild, 1 = others

            const reply = await interaction.reply({
                embeds: [guildEmbed],
                components: buildComponents(totalPages, pageIndex),
                ephemeral: true,
                fetchReply: true,
            });

            const componentFilter = (i) => {
                if (i.user.id !== interaction.user.id) return false;
                return i.customId.startsWith('help_prev_') || i.customId.startsWith('help_next_');
            };

            const collector = reply.createMessageComponentCollector({ filter: componentFilter, time: 60_000 });

            collector.on('collect', async (i) => {
                try {
                    if (i.customId.startsWith('help_next_')) {
                        pageIndex = Math.min(totalPages - 1, pageIndex + 1);
                    } else if (i.customId.startsWith('help_prev_')) {
                        pageIndex = Math.max(0, pageIndex - 1);
                    }

                    const newEmbed = pageIndex === 0 ? guildEmbed : otherEmbed;
                    await i.update({ embeds: [newEmbed], components: buildComponents(totalPages, pageIndex) });
                } catch (_) {
                    try { await i.deferUpdate(); } catch (__) {}
                }
            });

            collector.on('end', async () => {
                try {
                    await reply.edit({
                        components: [],
                        embeds: [pageIndex === 0 ? guildEmbed.setFooter({ text: 'Page 1/2' }) : otherEmbed.setFooter({ text: 'Page 2/2' })],
                    });
                } catch (_) {}
            });

        } catch (error) {
            try {
                await interaction.editReply({ content: 'An error occurred while generating the help.' });
            } catch (_) {
                // ignore secondary error
            }
            throw error;
        }
    },
};


