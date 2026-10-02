/**
 * Bot Status Panel - Discord Control Panel for Minecraft Bot Management
 *
 * Provides a persistent, auto-updating Discord embed panel that displays the
 * real-time status of all Minecraft bots with interactive disconnect/reconnect
 * buttons. The panel tracks connection history (last connected, last disconnected,
 * last crash, manual operations) and distinguishes between automatic and manual
 * connection changes.
 *
 * Features:
 * - Persistent panel message (survives bot restarts via stored message ID)
 * - Per-guild status embeds with color-coded connection states
 * - Discord relative/absolute timestamps for all connection events
 * - Disconnect/Reconnect buttons per bot
 * - Manual disconnects block auto-reconnection
 * - Automatic panel refresh on any connection event
 *
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

const BridgeLocator = require('../../bridgeLocator');
const logger = require('../../shared/logger');
const { trackInteraction, setOutcome, reportError } = require('../../shared/audit');

const PANEL_STORAGE_PATH = path.join(__dirname, '../../../data/bot-status-panel.json');

/**
 * BotStatusPanel - Manages the persistent bot control panel in Discord
 *
 * Creates and maintains a single Discord message containing rich embeds and
 * interactive buttons for each configured Minecraft bot. Listens for button
 * interactions to trigger manual disconnect/reconnect operations.
 *
 * @class
 */
class BotStatusPanel {
    /**
     * Create a new BotStatusPanel instance
     * Does not initialize Discord resources — call initialize() separately.
     */
    constructor() {
        const mainBridge = BridgeLocator.getInstance();
        this.config = mainBridge.config;

        this.client = null;
        this.channel = null;
        this.panelMessage = null;
        this._refreshInterval = null;

        // Per-guild status history
        // guildId -> { status, lastConnected, lastDisconnected, lastCrash,
        //              lastManualDisconnect, lastManualReconnect,
        //              disconnectReason, reconnectAttempt }
        this.statusData = new Map();
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize the panel with a Discord client and status channel
     *
     * Seeds initial status from current MinecraftManager state, then
     * finds or creates the panel message and registers the button listener.
     *
     * @async
     * @param {Client} client - Discord.js client
     * @param {TextChannel} statusChannel - Channel to post the panel in
     */
    async initialize(client, statusChannel) {
        this.client = client;
        this.channel = statusChannel;

        this._seedInitialStatus();

        await this._findOrCreatePanel();

        this._setupButtonListener();

        this._refreshInterval = setInterval(() => {
            this.updatePanel().catch(err =>
                logger.logError(err, 'BotStatusPanel: Periodic refresh failed')
            );
        }, 5 * 60 * 1000);

        logger.discord('BotStatusPanel initialized');
    }

    /**
     * Seed initial status data from MinecraftManager's current connection state.
     * Called once during initialization so the panel reflects bots that were
     * already connected before Discord finished starting.
     *
     * @private
     */
    _seedInitialStatus() {
        const guilds = this.config.getEnabledGuilds() || [];

        guilds.forEach(guild => {
            this.statusData.set(guild.id, {
                status: 'unknown',
                lastConnected: null,
                lastDisconnected: null,
                lastCrash: null,
                lastManualDisconnect: null,
                lastManualReconnect: null,
                disconnectReason: null,
                reconnectAttempt: 0,
                // { type: 'disconnect'|'reconnect', userId, userTag, timestamp }
                lastAction: null
            });
        });

        // Try to populate from live connection status
        try {
            const minecraftManager = BridgeLocator.getInstance().getMinecraftManager?.();
            if (minecraftManager) {
                const connectionStatus = minecraftManager.getConnectionStatus();
                for (const [guildId, status] of Object.entries(connectionStatus)) {
                    const data = this.statusData.get(guildId);
                    if (!data) continue;

                    if (status.isConnecting) {
                        data.status = 'reconnecting';
                    } else if (status.isConnected) {
                        data.status = 'connected';
                        data.lastConnected = status.lastConnectionTime || Date.now();
                    } else {
                        data.status = 'disconnected';
                    }

                    this.statusData.set(guildId, data);
                }
            }
        } catch (error) {
            logger.debug('BotStatusPanel: Could not seed initial status from MinecraftManager', error);
        }
    }

    /**
     * Find the existing panel message or create a new one.
     * Attempts to load a stored message ID from disk first.
     *
     * @async
     * @private
     */
    async _findOrCreatePanel() {
        const stored = this._loadStoredData();

        if (stored && stored.messageId && stored.channelId === this.channel.id) {
            try {
                this.panelMessage = await this.channel.messages.fetch(stored.messageId);
                await this.updatePanel();
                logger.discord(`BotStatusPanel: Restored existing panel message (${stored.messageId})`);
                return;
            } catch {
                logger.debug('BotStatusPanel: Stored panel message not found, creating new one');
            }
        }

        await this._createPanel();
    }

    /**
     * Create a brand-new panel message in the status channel.
     *
     * @async
     * @private
     */
    async _createPanel() {
        const { embeds, components } = this._buildPanelContent();
        this.panelMessage = await this.channel.send({ embeds, components });
        this._saveStoredData({ messageId: this.panelMessage.id, channelId: this.channel.id });
        logger.discord(`BotStatusPanel: Created panel message (${this.panelMessage.id})`);
    }

    // ==================== PANEL UPDATE ====================

    /**
     * Update the panel message with the latest status data.
     * If the message was deleted, recreates it automatically.
     *
     * @async
     */
    async updatePanel() {
        if (!this.panelMessage) return;

        const { embeds, components } = this._buildPanelContent();

        try {
            await this.panelMessage.edit({ embeds, components });
        } catch (error) {
            logger.debug('BotStatusPanel: Panel message gone, recreating', error.message);
            await this._createPanel();
        }
    }

    // ==================== EMBED/COMPONENT BUILDERS ====================

    /**
     * Build the full panel content: header embed + one embed/row per guild.
     *
     * @private
     * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
     */
    _buildPanelContent() {
        const embeds = [];
        const components = [];

        embeds.push(this._buildHeaderEmbed());

        const guilds = this.config.getEnabledGuilds() || [];
        guilds.forEach(guild => {
            embeds.push(this._buildGuildEmbed(guild));
            components.push(this._buildGuildButtonRow(guild));
        });

        return { embeds, components };
    }

    /**
     * Build the header summary embed.
     *
     * @private
     * @returns {EmbedBuilder}
     */
    _buildHeaderEmbed() {
        const guilds = this.config.getEnabledGuilds() || [];
        const connected = guilds.filter(g => {
            const d = this.statusData.get(g.id);
            return d && d.status === 'connected';
        }).length;

        const nowTs = Math.floor(Date.now() / 1000);

        return new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🤖  Panneau de contrôle des bots')
            .setDescription(
                'Gérez les connexions des bots Minecraft en temps réel.\n' +
                'Les déconnexions **manuelles** bloquent la reconnexion automatique.'
            )
            .addFields(
                {
                    name: '📊 Statut global',
                    value: `\`${connected}/${guilds.length}\` bot(s) connecté(s)`,
                    inline: true
                },
                {
                    name: '🕐 Dernière mise à jour',
                    value: `<t:${nowTs}:R>`,
                    inline: true
                }
            )
            .setTimestamp();
    }

    /**
     * Build the status embed for a single guild bot.
     *
     * @private
     * @param {object} guild - Guild config object
     * @returns {EmbedBuilder}
     */
    _buildGuildEmbed(guild) {
        const data = this.statusData.get(guild.id) || {};

        let color, statusEmoji, statusText;

        switch (data.status) {
            case 'connected':
                color = 0x57F287;   // green
                statusEmoji = '🟢';
                statusText = 'Connecté';
                break;
            case 'reconnecting':
                color = 0xFEE75C;   // yellow
                statusEmoji = '🟡';
                statusText = `Reconnexion en cours${data.reconnectAttempt > 0 ? ` (tentative #${data.reconnectAttempt})` : ''}…`;
                break;
            case 'manual_disconnect':
                color = 0x5865F2;   // blurple — intentional stop
                statusEmoji = '🔵';
                statusText = 'Déconnecté (manuel)';
                break;
            case 'disconnected':
                color = 0xED4245;   // red — crash
                statusEmoji = '🔴';
                statusText = 'Déconnecté (crash)';
                break;
            default:
                color = 0x99AAB5;   // grey
                statusEmoji = '⚫';
                statusText = 'Inconnu';
        }

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${statusEmoji}  ${guild.name}  [${guild.tag}]`)
            .addFields(
                { name: '📟 Statut',   value: statusText,                     inline: true },
                { name: '🖥️ Serveur',  value: guild.server.serverName,        inline: true },
                { name: '👤 Compte',   value: `\`${guild.account.username}\``, inline: true }
            );

        // Timestamps — only shown when available
        if (data.lastConnected) {
            const ts = Math.floor(data.lastConnected / 1000);
            embed.addFields({
                name: '✅ Dernière connexion',
                value: `<t:${ts}:f>\n<t:${ts}:R>`,
                inline: true
            });
        }

        if (data.lastDisconnected) {
            const ts = Math.floor(data.lastDisconnected / 1000);
            embed.addFields({
                name: '❌ Dernière déconnexion',
                value: `<t:${ts}:f>\n<t:${ts}:R>`,
                inline: true
            });
        }

        if (data.lastCrash) {
            const ts = Math.floor(data.lastCrash / 1000);
            embed.addFields({
                name: '💥 Dernier crash',
                value: `<t:${ts}:f>\n<t:${ts}:R>`,
                inline: true
            });
        }

        if (data.lastManualDisconnect) {
            const ts = Math.floor(data.lastManualDisconnect / 1000);
            embed.addFields({
                name: '🔌 Déco. manuelle',
                value: `<t:${ts}:f>\n<t:${ts}:R>`,
                inline: true
            });
        }

        if (data.lastManualReconnect) {
            const ts = Math.floor(data.lastManualReconnect / 1000);
            embed.addFields({
                name: '🔄 Reco. manuelle',
                value: `<t:${ts}:f>\n<t:${ts}:R>`,
                inline: true
            });
        }

        if (data.disconnectReason && data.status !== 'connected') {
            const reason = data.disconnectReason.length > 120
                ? data.disconnectReason.substring(0, 120) + '…'
                : data.disconnectReason;
            embed.addFields({
                name: '📋 Raison',
                value: `\`${reason}\``,
                inline: false
            });
        }

        if (data.lastAction) {
            const ts = Math.floor(data.lastAction.timestamp / 1000);
            const actionEmoji = data.lastAction.type === 'disconnect' ? '🔌' : '🔄';
            const actionLabel = data.lastAction.type === 'disconnect' ? 'Déconnecté' : 'Reconnecté';
            embed.addFields({
                name: '🖱️ Dernière action manuelle',
                value: `${actionEmoji} **${actionLabel}** par <@${data.lastAction.userId}>\n<t:${ts}:f> · <t:${ts}:R>`,
                inline: false
            });
        }

        return embed;
    }

    /**
     * Build the button row for a single guild bot.
     * Disconnect is enabled when connected/reconnecting.
     * Reconnect is enabled when disconnected (manual or crash).
     *
     * @private
     * @param {object} guild - Guild config object
     * @returns {ActionRowBuilder}
     */
    _buildGuildButtonRow(guild) {
        const data = this.statusData.get(guild.id) || {};
        const isConnected    = data.status === 'connected';
        const isReconnecting = data.status === 'reconnecting';
        const isDisconnected = ['disconnected', 'manual_disconnect', 'unknown'].includes(data.status);

        // Truncate guild name to keep labels within Discord's 80-char limit
        const displayName = guild.name.length > 22
            ? guild.name.substring(0, 20) + '…'
            : guild.name;

        const disconnectBtn = new ButtonBuilder()
            .setCustomId(`bsp_disconnect_${guild.id}`)
            .setLabel(`${displayName} — Déconnecter`)
            .setEmoji('🔌')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!isConnected && !isReconnecting);

        const reconnectBtn = new ButtonBuilder()
            .setCustomId(`bsp_reconnect_${guild.id}`)
            .setLabel(`${displayName} — Reconnecter`)
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!isDisconnected);

        return new ActionRowBuilder().addComponents(disconnectBtn, reconnectBtn);
    }

    // ==================== BUTTON INTERACTION ====================

    /**
     * Register a Discord interaction listener to handle panel button clicks.
     * Only processes interactions with custom IDs starting with `bsp_`.
     *
     * @private
     */
    _setupButtonListener() {
        this.client.on(Events.InteractionCreate, async (interaction) => {
            if (!interaction.isButton()) return;
            if (!interaction.customId.startsWith('bsp_')) return;
            // Journal d'audit : clic suivi en base sous un nom stable (bsp_disconnect…)
            const name = 'bsp_' + (interaction.customId.slice('bsp_'.length).split('_')[0] || 'action');
            await trackInteraction(interaction, name, () => this._handleButton(interaction));
        });
    }

    /**
     * Corps historique du gestionnaire de boutons du panneau.
     *
     * @private
     */
    async _handleButton(interaction) {
        if (!this._hasControlPermission(interaction.member)) {
            setOutcome(interaction, 'denied');
            await interaction.reply({
                content: '❌ Vous n’avez pas la permission de contrôler les bots Minecraft.',
                ephemeral: true
            });
            return;
        }

        // customId format: bsp_<action>_<guildId>
        // guildId may itself contain underscores, so split only on first two
        const withoutPrefix = interaction.customId.slice('bsp_'.length);
        const separatorIdx = withoutPrefix.indexOf('_');
        if (separatorIdx === -1) return;

        const action  = withoutPrefix.slice(0, separatorIdx);
        const guildId = withoutPrefix.slice(separatorIdx + 1);

        const guild = (this.config.getEnabledGuilds() || []).find(g => g.id === guildId);
        if (!guild) return;

        try {
            await interaction.deferReply({ ephemeral: true });

            const minecraftManager = BridgeLocator.getInstance().getMinecraftManager?.();

            if (!minecraftManager) {
                await interaction.editReply({ content: '❌ Minecraft manager non disponible.' });
                return;
            }

            // Record who clicked before executing the action
            const actionRecord = {
                type: action,
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                timestamp: Date.now()
            };
            const currentData = this.statusData.get(guildId) || {};
            currentData.lastAction = actionRecord;
            this.statusData.set(guildId, currentData);

            if (action === 'disconnect') {
                await interaction.editReply({
                    content: `🔌 Déconnexion du bot **${guild.name}** en cours…`
                });
                await minecraftManager.manualStop(guildId);
                await interaction.editReply({
                    content: `✅ Bot **${guild.name}** déconnecté.\nLa reconnexion automatique est suspendue jusqu'à une reconnexion manuelle.`
                });
                logger.discord(`BotStatusPanel: Manual disconnect for ${guild.name} by ${interaction.user.tag}`);

            } else if (action === 'reconnect') {
                await interaction.editReply({
                    content: `🔄 Reconnexion du bot **${guild.name}** en cours…`
                });
                await minecraftManager.manualStart(guildId);
                logger.discord(`BotStatusPanel: Manual reconnect for ${guild.name} by ${interaction.user.tag}`);

            } else {
                await interaction.editReply({ content: '❌ Action inconnue.' });
            }

        } catch (error) {
            logger.logError(error, `BotStatusPanel: Button handler error for ${interaction.customId}`);
            // L'erreur est absorbée ici : sans cela, le clic resterait « unknown ».
            setOutcome(interaction, 'failed');
            reportError(error, 'botStatusPanel.button');
            try {
                await interaction.editReply({ content: `❌ Erreur : ${error.message}` });
            } catch {
                // interaction already replied or timed out
            }
        }
    }

    _hasControlPermission(member) {
        if (!member) return false;

        const adminRoles = this.config.get('discord.permissions.adminRoles') || [];
        const moderatorRoles = this.config.get('discord.permissions.moderatorRoles') || [];
        const hasConfiguredRole = member.roles.cache.some(role =>
            adminRoles.includes(role.id) || adminRoles.includes(role.name) ||
            moderatorRoles.includes(role.id) || moderatorRoles.includes(role.name)
        );

        return hasConfiguredRole ||
            member.permissions.has('Administrator') ||
            member.permissions.has('ManageMessages');
    }

    // ==================== CONNECTION EVENT HANDLER ====================

    /**
     * Process a connection event and update the panel.
     *
     * Called by MessageSender whenever a connection status is sent to Discord.
     *
     * Status types:
     * - `connected`         — bot successfully connected (auto or first connect)
     * - `disconnected`      — unexpected disconnect / crash
     * - `reconnected`       — bot auto-reconnected after a crash
     * - `reconnecting`      — auto-reconnection in progress
     * - `manual_disconnect` — user clicked "Déconnecter"
     * - `manual_reconnect`  — user clicked "Reconnecter" and bot connected
     * - `error`             — connection error occurred
     *
     * @param {string} guildId  - Guild ID that changed state
     * @param {string} type     - Event type (see above)
     * @param {object} details  - Optional extra info (reason, attempt, error, …)
     */
    onConnectionEvent(guildId, type, details = {}) {
        const data = this.statusData.get(guildId) || {
            status: 'unknown',
            lastConnected: null,
            lastDisconnected: null,
            lastCrash: null,
            lastManualDisconnect: null,
            lastManualReconnect: null,
            disconnectReason: null,
            reconnectAttempt: 0,
            lastAction: null
        };

        const now = Date.now();

        switch (type) {
            case 'connected':
                data.status = 'connected';
                data.lastConnected = now;
                data.disconnectReason = null;
                data.reconnectAttempt = 0;
                break;

            case 'disconnected':
                data.status = 'disconnected';
                data.lastDisconnected = now;
                data.lastCrash = now;
                data.disconnectReason = details.reason || 'Connexion perdue';
                break;

            case 'reconnected':
                data.status = 'connected';
                data.lastConnected = now;
                data.disconnectReason = null;
                data.reconnectAttempt = 0;
                break;

            case 'reconnecting':
                data.status = 'reconnecting';
                data.reconnectAttempt = (data.reconnectAttempt || 0) + 1;
                break;

            case 'manual_disconnect':
                data.status = 'manual_disconnect';
                data.lastManualDisconnect = now;
                data.lastDisconnected = now;
                data.disconnectReason = 'Déconnexion manuelle';
                break;

            case 'manual_reconnect':
                data.status = 'connected';
                data.lastConnected = now;
                data.lastManualReconnect = now;
                data.disconnectReason = null;
                data.reconnectAttempt = 0;
                break;

            case 'error':
                // Keep previous status, just record a reason if we had none
                if (details.error && !data.disconnectReason) {
                    data.disconnectReason = details.error;
                }
                break;

            default:
                break;
        }

        this.statusData.set(guildId, data);

        this.updatePanel().catch(err =>
            logger.logError(err, 'BotStatusPanel: Failed to update panel after connection event')
        );
    }

    // ==================== PERSISTENCE ====================

    /**
     * Load stored panel data (message ID + channel ID) from disk.
     *
     * @private
     * @returns {object|null}
     */
    _loadStoredData() {
        try {
            if (fs.existsSync(PANEL_STORAGE_PATH)) {
                return JSON.parse(fs.readFileSync(PANEL_STORAGE_PATH, 'utf8'));
            }
        } catch {
            // file missing or malformed — will recreate
        }
        return null;
    }

    /**
     * Persist panel data (message ID + channel ID) to disk.
     *
     * @private
     * @param {object} data
     */
    _saveStoredData(data) {
        try {
            const dir = path.dirname(PANEL_STORAGE_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(PANEL_STORAGE_PATH, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            logger.logError(error, 'BotStatusPanel: Failed to save panel message ID');
        }
    }

    // ==================== CLEANUP ====================

    /**
     * Cleanup resources (nullify references).
     */
    cleanup() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
        this.client = null;
        this.channel = null;
        this.panelMessage = null;
        logger.debug('BotStatusPanel cleaned up');
    }
}

module.exports = BotStatusPanel;
