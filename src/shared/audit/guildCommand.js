'use strict';

/**
 * Résultat d'une commande de guilde exécutée en jeu → statut du journal d'audit.
 *
 * CommandResponseListener ne connaît que « succès » ou « erreur ». Le journal
 * distingue en plus (PLAN_DONNEES §4, GUI-7 et GUI-8) :
 *
 *   denied   le jeu refuse : permission insuffisante, rang trop bas ;
 *   invalid  la demande ne peut pas aboutir telle quelle : joueur introuvable,
 *            déjà membre, saisie invalide… ;
 *   failed   tout autre échec (guilde pleine, bot déconnecté, erreur inconnue) ;
 *   timeout  aucune réponse du jeu dans le délai.
 *
 * Le classement lit la réponse du jeu déjà reconnue par un motif de
 * `commandsResponse` (config/patterns.json) : aucune nouvelle détection ici.
 */

// Ordre significatif : le premier motif reconnu l'emporte.
const GAME_RESPONSES = [
    [/do(?: not|n't) have permission/i, 'denied', 'NO_PERMISSION'],
    [/must be the Guild Master/i, 'denied', 'NOT_GUILD_MASTER'],
    [/only promote up to your own rank/i, 'denied', 'RANK_TOO_LOW'],
    [/with a higher guild rank/i, 'denied', 'RANK_TOO_LOW'],
    [/Can't find a player by the name/i, 'invalid', 'PLAYER_NOT_FOUND'],
    [/is already in your guild/i, 'invalid', 'ALREADY_IN_GUILD'],
    [/is already in another guild/i, 'invalid', 'IN_ANOTHER_GUILD'],
    [/already invited/i, 'invalid', 'ALREADY_INVITED'],
    [/is not in your guild/i, 'invalid', 'NOT_IN_GUILD'],
    [/Invalid usage/i, 'invalid', 'INVALID_USAGE'],
    [/couldn't find a rank/i, 'invalid', 'RANK_NOT_FOUND'],
    [/already the (?:highest|lowest) rank/i, 'invalid', 'RANK_LIMIT'],
    [/already have that rank/i, 'invalid', 'ALREADY_HAS_RANK'],
    [/already muted/i, 'invalid', 'ALREADY_MUTED'],
    [/is not muted/i, 'invalid', 'NOT_MUTED'],
    [/cannot mute someone for (?:less|more) than/i, 'invalid', 'INVALID_DURATION'],
    [/already on your block list/i, 'invalid', 'ALREADY_BLOCKED'],
    [/cannot block yourself/i, 'invalid', 'INVALID_TARGET'],
    [/Your guild is full/i, 'failed', 'GUILD_FULL']
];

// Échecs qui ne viennent pas du jeu (result.type posé par CommandResponseListener).
const LOCAL_FAILURES = {
    timeout: ['timeout', 'TIMEOUT'],
    system_error: ['failed', 'BOT_UNAVAILABLE'],
    cancelled: ['failed', 'CANCELLED'],
    not_found: ['failed', 'LISTENER_LOST']
};

/**
 * Réponse du jeu admise en base (M19) : seulement si le message reçu est, à lui
 * seul, la phrase système reconnue. Les motifs d'erreur ne sont pas ancrés : un
 * message de chat qui citerait une de ces phrases (« Guild > Foo: Your guild is
 * full! ») résout aussi l'écoute. Dans ce cas, on ne garde que le libellé du
 * motif (config/patterns.json), jamais le texte reçu.
 *
 * @param {object} result résultat de CommandResponseListener
 * @returns {string|undefined}
 */
function gameReason(result) {
    const matched = typeof result?.extractedData?.fullMatch === 'string' ? result.extractedData.fullMatch.trim() : '';
    if (!matched) return undefined;
    // Hypixel encadre ses réponses de lignes de tirets dans le même message.
    const lines = String(result.error ?? '').split('\n').map(line => line.trim())
        .filter(line => line && !/^[-=_▬\s]+$/.test(line));
    if (lines.length === 1 && lines[0] === matched) return matched;
    const label = result.extractedData.patternDescription;
    return typeof label === 'string' && label && label !== 'No description' ? label : undefined;
}

/**
 * @param {object} result résultat de CommandResponseListener
 *        ({ success, error, message, type, extractedData })
 * @returns {{status: string, errorCode?: string, reason?: string}}
 */
function classifyGuildCommandResult(result) {
    if (result?.success) return { status: 'success' };
    if (LOCAL_FAILURES[result?.type]) {
        const [status, errorCode] = LOCAL_FAILURES[result.type];
        return { status, errorCode };
    }
    // La phrase reconnue d'abord : le reste du message peut contenir autre chose.
    const text = String(result?.extractedData?.fullMatch || result?.error || '');
    const reason = gameReason(result);
    for (const [pattern, status, errorCode] of GAME_RESPONSES) {
        if (pattern.test(text)) return { status, errorCode, ...(reason ? { reason } : {}) };
    }
    return { status: 'failed', errorCode: 'GAME_ERROR', ...(reason ? { reason } : {}) };
}

module.exports = { classifyGuildCommandResult };
