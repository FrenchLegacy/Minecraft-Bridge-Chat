const path = require('path');
const { AuditClient } = require('@frenchlegacy/api-client');

const { getAuditLogger, collectSecrets } = require('@frenchlegacy/logging');
const BridgeLocator = require('../bridgeLocator.js');
const logger = require('./logger');

let transport;

module.exports = function getLogger(client) {
    const bridge = BridgeLocator.getInstance();
    const config = bridge.config;
    const audit = config.get('audit');
    if (!audit) return null;
    client ||= bridge.getDiscordManager?.()?._discordBot?.getClient();
    if (!client) return null;
    if (audit.enabled === true && !transport) {
        const api = config.get('internalApi', {});
        transport = new AuditClient({
            baseUrl: api.baseUrl || process.env.INTERNAL_API_URL || 'http://frenchlegacy-api:10000',
            apiKey: api.apiKey || process.env.API_KEY_BRIDGE || '',
            timeout: api.timeout, logger
        });
    }
    return getAuditLogger(client, {
        source: 'bridge', config: audit, logger,
        dataDir: path.join(__dirname, '../../data'),
        secrets: [...collectSecrets(config), process.env.API_KEY_BRIDGE, process.env.API_KEY].filter(Boolean),
        databaseSender: event => transport.sendEvent(event),
        databaseDeliverySender: (event, delivery) => transport.sendDelivery(event, delivery)
    });
};
