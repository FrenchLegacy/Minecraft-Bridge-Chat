/**
 * Log Target Resolver - Channel and Forum Thread Resolution
 *
 * A Discord forum post is a thread: it owns its own snowflake ID and can be used
 * exactly like a channel ID. This helper therefore resolves a configured log
 * target whether it points to a classic text channel or to a forum topic.
 *
 * Threads auto-archive after a period of inactivity. An archived (but unlocked)
 * thread is re-opened before sending so no log entry is silently dropped.
 *
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

const logger = require("../../shared/logger");

/**
 * Resolve a log target and make it ready to receive a message
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {string} channelId - Channel or forum thread ID (accepts the <#id> format)
 * @returns {Promise<import('discord.js').TextBasedChannel|null>} Usable target or null
 *
 * @example
 * const target = await resolveLogTarget(client, logChannels.default);
 * if (target) await target.send({ embeds: [embed] });
 */
async function resolveLogTarget(client, channelId) {
    if (!channelId) {
        return null;
    }

    // Clean the ID (strip <# and > if present)
    const cleanId = String(channelId).replace(/[<#>]/g, '').trim();

    if (!cleanId) {
        return null;
    }

    const channel = await client.channels.fetch(cleanId).catch(() => null);

    if (!channel) {
        logger.warn(`Could not find Discord log target: ${cleanId}`);
        return null;
    }

    if (typeof channel.isTextBased === 'function' && !channel.isTextBased()) {
        logger.warn(`Discord log target is not text based: ${cleanId} (type: ${channel.type})`);
        return null;
    }

    // Forum topic / thread archived: re-open it before writing into it
    if (typeof channel.isThread === 'function' && channel.isThread() && channel.archived) {
        if (channel.locked) {
            logger.warn(`Discord log topic is locked, cannot send: ${cleanId}`);
            return null;
        }

        try {
            await channel.setArchived(false);
            logger.debug(`Discord log topic unarchived: ${cleanId}`);
        } catch (error) {
            logger.warn(`Failed to unarchive log topic ${cleanId}: ${error.message}`);
        }
    }

    return channel;
}

module.exports = resolveLogTarget;
