/**
 * Staff Directory - FrenchLegacy Staff Recognition
 *
 * Tells whether the author of a bridged message is a member of the FrenchLegacy
 * staff, so the bridge can prefix their name with a tag (`[STAFF]` by default)
 * on the other side of the bridge.
 *
 * Staff is defined on Discord only, by the roles listed in `bridge.staffTag.roles`.
 * - Discord author: the member's roles are checked directly.
 * - Minecraft author: the player is matched to a staff member through the Discord
 *   server nickname, whose canonical form `[level] MinecraftName <badge>` is set by
 *   FrenchLegacy-Discord on verification. Members without a canonical nickname
 *   (unverified) are never matched, so a random player cannot inherit the tag of a
 *   staff member whose nickname happens to equal their name.
 *
 * The full member list is fetched once when the Discord client is ready; discord.js
 * then keeps it current from gateway events (GuildMembers intent), so role and
 * nickname changes apply without a restart.
 *
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

const logger = require('./logger');

/**
 * Canonical verified nickname, same alphabet bound as FrenchLegacy-Discord
 * (`src/shared/nickname.js`): the capture stops before any game mode badge.
 * @type {RegExp}
 */
const NICKNAME_PATTERN = /^\[\d+\]\s*([A-Za-z0-9_]{1,16})\b/;

/** @type {string} */
const DEFAULT_TAG = '[STAFF]';

let client = null;
let guildId = null;
let settings = { enabled: false, tag: DEFAULT_TAG, roles: [] };

/**
 * Extract the Minecraft username from a verified Discord nickname.
 *
 * @param {string|null|undefined} displayName - Server display name
 * @returns {string|null} Minecraft username, or null if not in canonical form
 */
function extractMinecraftUsername(displayName) {
    const match = typeof displayName === 'string' ? displayName.match(NICKNAME_PATTERN) : null;
    return match ? match[1] : null;
}

/**
 * Get the FrenchLegacy Discord guild from the client cache.
 *
 * @returns {Guild|null} Discord guild, or null if not attached or not cached
 */
function getGuild() {
    return client && guildId ? client.guilds.cache.get(guildId) || null : null;
}

module.exports = {
    /**
     * Attach the Discord client and load the member list.
     * Called once the Discord client is ready.
     *
     * @async
     * @param {Client} discordClient - Ready Discord.js client
     * @param {object} config - Bridge configuration (ConfigLoader)
     */
    async attach(discordClient, config) {
        const staffTag = config.get('bridge.staffTag') || {};

        client = discordClient;
        guildId = config.get('app.serverDiscordId');
        settings = {
            enabled: staffTag.enabled === true,
            tag: staffTag.tag || DEFAULT_TAG,
            roles: Array.isArray(staffTag.roles) ? staffTag.roles : []
        };

        if (!settings.enabled || settings.roles.length === 0) {
            logger.discord('Staff tag disabled');
            return;
        }

        const guild = getGuild();
        if (!guild) {
            logger.warn(`Staff tag: Discord server ${guildId} not found, staff will not be tagged`);
            return;
        }

        try {
            await guild.members.fetch();
            logger.discord(`Staff tag enabled - ${guild.members.cache.size} members loaded`);
        } catch (error) {
            // In-game staff stays untagged until they appear in the cache through an event
            logger.logError(error, 'Staff tag: failed to load the member list');
        }
    },

    /**
     * Get the tag to prefix staff names with.
     *
     * @returns {string} Staff tag
     */
    getTag() {
        return settings.tag;
    },

    /**
     * Check whether a Discord member is staff.
     *
     * @param {GuildMember|null|undefined} member - Discord guild member
     * @returns {boolean} True if the member holds a staff role
     */
    isStaffMember(member) {
        if (!settings.enabled || !member?.roles?.cache) return false;
        return settings.roles.some(roleId => member.roles.cache.has(roleId));
    },

    /**
     * Check whether a Minecraft player is staff, through their verified Discord nickname.
     *
     * @param {string} username - Minecraft username (case-insensitive)
     * @returns {boolean} True if a staff member's nickname names this player
     */
    isStaffMinecraftName(username) {
        if (!settings.enabled || !username) return false;

        const guild = getGuild();
        if (!guild) return false;

        const wanted = username.toLowerCase();

        return settings.roles.some(roleId => {
            const role = guild.roles.cache.get(roleId);
            if (!role) return false;

            return role.members.some(member =>
                extractMinecraftUsername(member.displayName)?.toLowerCase() === wanted
            );
        });
    }
};
