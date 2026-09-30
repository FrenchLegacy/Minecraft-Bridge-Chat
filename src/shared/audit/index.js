'use strict';

/**
 * Journal d'audit — adaptateur du bridge vers @frenchlegacy/logging.
 *
 * Seul point du bridge qui connaît le paquet commun. Deux modes, choisis par la
 * présence du bloc `audit` dans config/settings.json :
 *
 *   absent  → getAudit() renvoie null : discord.logChannels et les embeds
 *             historiques gardent exactement leur fonctionnement antérieur ;
 *   présent → autoritaire : événements de guilde, résultats des commandes en
 *             jeu et commandes Discord passent par AuditLogger — un format
 *             unique, un post de forum par catégorie, une copie en base via
 *             POST /audit/events. `audit.enabled: false` coupe tout.
 *
 * Bloc attendu :
 *   "audit": {
 *     "enabled": true,
 *     "environment": "production",
 *     "apiKey": "<API_KEY_BRIDGE de FrenchLegacy-API>",
 *     "apiBaseUrl": "http://frenchlegacy-api:10000",   // facultatif
 *     "posts": { "guildes": "<id du post>", "commandes": "<id du post>", ... }
 *   }
 *
 * Le panneau de statut (discord.logChannels.botStatus) et le salon de détection
 * (protocole machine lu par le bot Discord) ne passent PAS par ici.
 *
 * Santé (PLAN_DONNEES §1.5) : startAuditHeartbeat() quand le bot Discord est prêt
 * (POST /audit/heartbeat chaque minute, comptes Minecraft connectés en `extra`),
 * reportError() dans les gestionnaires d'erreur (événement `app.error`).
 *
 * Contrairement au bot Discord, le client discord.js n'existe qu'une fois le
 * bridge connecté : le journal est créé sans lui et le récupère à chaque
 * livraison. Un événement antérieur à la connexion attend dans la file locale.
 */

const path = require('path');
const { randomUUID } = require('crypto');
const { AuditLogger, collectSecrets, createHttpSenders, setOutcome } = require('@frenchlegacy/logging');
const BridgeLocator = require('../../bridgeLocator.js');
const logger = require('../logger');
const { classifyGuildCommandResult } = require('./guildCommand.js');
const { version } = require('../../../package.json');

const DATA_DIR = path.join(__dirname, '../../../data');

// Commandes lues à la chaîne par le bot Discord (GuildInfoMonitor : /guild info
// toutes les 60 s pour 3 guildes, 4 320 fois par jour). Marquées « automatic » :
// le paquet ne les journalise nulle part (LOGS.md §5.4).
const AUTOMATIC_SUBCOMMANDS = ['info', 'list'];

// Protocole du salon de détection (PLAN_DONNEES §2.6) : pied du premier embed
// joint par le bot Discord à sa commande texte. `actor=-` : commande automatique.
const DETECTION_META = /^fl-meta v1 actor=(\d{17,20}|-) corr=([A-Za-z0-9._:-]{1,100})$/;

// Identité d'audit par interaction (réelle ou pseudo-interaction du salon de
// détection) : la commande, son envoi en jeu et la réponse du jeu la partagent.
const identities = new WeakMap();

let instance;

const config = () => BridgeLocator.getInstance()?.config || null;
const discordClient = () => BridgeLocator.getInstance()?.getDiscordManager?.()?.getClient?.() || null;

/**
 * @returns {AuditLogger|null} null si le bloc `audit` est absent : l'appelant
 *          garde alors son chemin historique.
 */
function getAudit() {
    if (instance !== undefined) return instance;
    const cfg = config();
    if (!cfg) return null;                       // trop tôt : pas encore de configuration
    const audit = cfg.get('audit', null);
    if (!audit || typeof audit !== 'object') {
        instance = null;
        return instance;
    }
    const senders = {};
    if (audit.enabled === true) {
        try {
            Object.assign(senders, createHttpSenders({
                baseUrl: audit.apiBaseUrl || process.env.INTERNAL_API_URL || 'http://frenchlegacy-api:10000',
                apiKey: audit.apiKey || process.env.API_KEY_BRIDGE
            }));
        } catch (error) {
            // Sans transport, les événements restent en file pour la base : visible, jamais silencieux.
            logger.error(`[Audit] Transport BDD indisponible : ${error.message}`);
        }
    }
    instance = new AuditLogger({
        source: 'bridge', config: audit, getClient: discordClient, dataDir: DATA_DIR,
        logger, secrets: collectSecrets(cfg), version, ...senders
    });
    return instance;
}

/**
 * Lit l'acteur réel et la corrélation joints à une commande du salon de détection.
 *
 * @param {import('discord.js').Message} message
 * @returns {{actorId: string|null, correlationId: string}|null} null sans pied
 *          conforme : l'appelant garde le comportement historique.
 */
function readDetectionMeta(message) {
    const text = message?.embeds?.[0]?.footer?.text;
    const match = typeof text === 'string' ? DETECTION_META.exec(text) : null;
    return match ? { actorId: match[1] === '-' ? null : match[1], correlationId: match[2] } : null;
}

/**
 * Acteur, origine et corrélation d'une interaction, calculés une fois.
 *
 * - `interaction.auditMeta` (posé par CommandDetectionHandler depuis le pied
 *   fl-meta) avec un acteur : l'humain à l'origine, `origin: 'human'` ;
 * - sinon l'utilisateur de l'interaction, comme le fait le paquet.
 *
 * La corrélation vient du pied fl-meta, sinon de l'identifiant de l'interaction,
 * sinon elle est tirée ici : une commande détectée sans pied garde ainsi le même
 * identifiant de sa réception jusqu'à la réponse du jeu.
 *
 * @returns {object} champs de premier niveau d'un événement (jamais de clé indéfinie)
 */
function auditIdentity(interaction) {
    if (!interaction || typeof interaction !== 'object') return {};
    const known = identities.get(interaction);
    if (known) return known;
    const meta = interaction.auditMeta || null;
    const user = interaction.user;
    const identity = meta?.actorId
        ? { actorId: meta.actorId, origin: 'human', actorUsername: meta.actorUsername, actorIsBot: meta.actorIsBot }
        : {
            actorId: user?.id, origin: interaction.commandOrigin || (user?.bot ? 'bot' : 'human'),
            actorUsername: user?.username, actorIsBot: user?.bot
        };
    identity.correlationId = meta?.correlationId || interaction.id || randomUUID();
    for (const key of Object.keys(identity)) {
        if (identity[key] === undefined || identity[key] === null) delete identity[key];
    }
    identities.set(interaction, identity);
    return identity;
}

/**
 * Journal dont chaque événement porte l'identité de l'interaction. Le suivi du
 * paquet (AuditLogger.track) ne connaît que `interaction.user` et
 * `interaction.id` ; il publie par `this.publish`, redéfini ici : acteur réel,
 * corrélation et pseudo Discord (T13) s'appliquent à la réception comme au
 * résultat, sans modifier l'interaction que les commandes continuent d'utiliser.
 *
 * @private
 */
function withIdentity(audit, interaction) {
    const identity = auditIdentity(interaction);
    return Object.create(audit, {
        publish: { value: input => audit.publish({ ...input, ...identity }) }
    });
}

/** Commande slash ou commande détectée, sous suivi (réception + résultat). */
async function trackCommand(interaction, execute) {
    const audit = getAudit();
    if (!audit) return execute();
    return audit.trackCommand.call(withIdentity(audit, interaction), interaction, execute);
}

/** Bouton du panneau de statut, sous suivi. */
async function trackInteraction(interaction, name, execute) {
    const audit = getAudit();
    if (!audit) return execute();
    return audit.trackInteraction.call(withIdentity(audit, interaction), interaction, execute, { name, kind: 'button' });
}

/**
 * Origine d'une commande détectée dans le salon de détection : toujours un bot ;
 * « automatic » pour la consultation périodique, qui n'est journalisée nulle part.
 */
function detectedOrigin(subcommand) {
    return AUTOMATIC_SUBCOMMANDS.includes(subcommand) ? 'automatic' : 'bot';
}

/**
 * Santé du bridge (T9) : à appeler quand le bot Discord est prêt. Le premier
 * appel émet aussi `bot.started`. Mesures : comptes Minecraft connectés et
 * configurés (guildes activées), lues à chaque battement.
 */
function startAuditHeartbeat() {
    const audit = getAudit();
    if (!audit) return;
    audit.startHeartbeat({
        metrics: () => {
            const bridge = BridgeLocator.getInstance();
            return {
                connectedAccounts: bridge?.getMinecraftManager?.()?.getConnectedGuilds?.().length ?? 0,
                configuredAccounts: bridge?.config?.getEnabledGuilds?.().length ?? 0
            };
        }
    }).catch(error => logger.logError(error, 'Audit heartbeat failed to start'));
}

/**
 * Erreur applicative (T10) → `app.error` dans le journal. Ne lève jamais et ne
 * remplace pas logger.logError : à appeler en plus, dans les gestionnaires
 * d'erreur. Les erreurs identiques sont regroupées par le paquet (une par minute).
 *
 * @param {*} error
 * @param {string} where emplacement lisible (« unhandledRejection », « minecraft.connection »…)
 * @param {object} [context] clés de CONTEXT_SCHEMA seulement
 */
function reportError(error, where, context) {
    try {
        const audit = getAudit();
        if (audit) audit.error(error, { where, context }).catch(() => {});
    } catch (failure) {
        logger.error(`[Audit] Erreur non journalisée (${where}) : ${failure.message}`);
    }
}

/** Vide la file autant que possible et arrête le travailleur (arrêt du bridge). */
async function closeAudit() {
    if (instance) await instance.close();
}

module.exports = {
    getAudit, trackCommand, trackInteraction, detectedOrigin, closeAudit, setOutcome,
    readDetectionMeta, auditIdentity, classifyGuildCommandResult, startAuditHeartbeat, reportError
};
