/**
 * Template Loader - Message Template Configuration Management
 * 
 * This file manages the loading and access to message templates used for formatting
 * chat messages and events when bridging between Minecraft and Discord. Templates are
 * stored in templates.json and organized by platform (Discord/Minecraft) and server type.
 * 
 * The loader provides:
 * - Template loading from JSON configuration
 * - Platform-specific template retrieval (messagesToMinecraft, messagesToDiscord)
 * - Template selection based on tag configuration (basic, withTag, withSourceTag, withBothTags)
 * - Caching for performance
 * - Fallback template handling
 * - Runtime template customization
 * 
 * Template categories include:
 * - guild: Regular guild chat messages
 * - officer: Officer chat messages
 * - events: Guild events (join, leave, kick, promote, demote, level, motd)
 * - system: System messages and notifications
 * 
 * Templates support variable substitution using placeholders like:
 * {username}, {message}, {guildTag}, {sourceGuildTag}, {rank}, {toRank}, etc.
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const fs = require('fs');
const path = require('path');
const logger = require('../shared/logger');

/**
 * TemplateLoader - Load and manage message templates
 * 
 * Singleton class that loads template configurations from templates.json
 * and provides efficient cached access to formatted message templates.
 * 
 * @class
 */
class TemplateLoader {
    /**
     * Create a new TemplateLoader instance
     * Automatically loads templates from configuration file
     */
    constructor() {
        this.templatesPath = path.join(__dirname, '../../config/templates.json');
        this.templates = null;
        this.isLoaded = false;
        this.cache = new Map(); // Template cache for performance
        
        // Load templates immediately
        this.load();
    }

    /**
     * Load templates from configuration file
     * 
     * Reads templates.json, parses it, and validates the structure.
     * Throws error if file is missing or invalid.
     * 
     * @throws {Error} If templates file not found or invalid JSON
     */
    load() {
        try {
            if (!fs.existsSync(this.templatesPath)) {
                throw new Error(`Templates configuration file not found: ${this.templatesPath}`);
            }

            const rawData = fs.readFileSync(this.templatesPath, 'utf8');
            this.templates = JSON.parse(rawData);

            this.isLoaded = true;
            this.validateTemplates();
            
            logger.info(`✅ Template configuration loaded successfully`);
            
        } catch (error) {
            logger.logError(error, 'Failed to load template configuration');
            throw error;
        }
    }

    /**
     * Validate template configuration structure
     * 
     * Ensures templates configuration has required sections and valid structure.
     * Logs the available platforms for verification.
     * 
     * @throws {Error} If templates structure is invalid
     */
    validateTemplates() {
        if (!this.templates) {
            throw new Error('Templates not loaded');
        }

        if (!this.templates.servers || typeof this.templates.servers !== 'object') {
            throw new Error('Invalid templates configuration: missing servers section');
        }

        const platforms = Object.keys(this.templates.servers);
    }

    /**
     * Get template for a specific platform, server and category
     * 
     * Retrieves templates from cache if available, otherwise loads from
     * configuration. Can return either a single template string or an object
     * containing multiple template variations (basic, withTag, etc.).
     * 
     * Template variations:
     * - basic: Simple message without tags
     * - withTag: Message with user's guild tag
     * - withSourceTag: Message with source guild tag
     * - withBothTags: Message with both user and source guild tags
     * 
     * @param {string} platform - Platform name ('messagesToMinecraft' or 'messagesToDiscord')
     * @param {string} serverName - Server name (e.g., 'Hypixel', 'Vanilla')
     * @param {string} category - Template category (e.g., 'guild', 'officer', 'events')
     * @param {string} [subCategory=null] - Sub-category (e.g., specific event type)
     * @returns {Object|string|null} Template object, string, or null if not found
     * @throws {Error} If templates not loaded
     * 
     * @example
     * // Get guild chat templates for Minecraft
     * const guildTemplates = loader.getTemplate('messagesToMinecraft', 'Hypixel', 'guild');
     * // Returns: { basic: "...", withTag: "...", withSourceTag: "...", withBothTags: "..." }
     * 
     * @example
     * // Get specific event template
     * const joinTemplate = loader.getTemplate('messagesToDiscord', 'Hypixel', 'events', 'join');
     */
    getTemplate(platform, serverName, category, subCategory = null) {
        if (!this.isLoaded) {
            throw new Error('Templates not loaded');
        }

        // Check cache first for performance
        const cacheKey = `${platform}-${serverName}-${category}-${subCategory || 'all'}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        let result = null;

        try {
            if (this.templates.servers[platform] && 
                this.templates.servers[platform][serverName] && 
                this.templates.servers[platform][serverName][category]) {
                
                const categoryTemplates = this.templates.servers[platform][serverName][category];
                
                if (subCategory && categoryTemplates[subCategory]) {
                    // Get specific sub-category template
                    result = categoryTemplates[subCategory];
                } else if (!subCategory) {
                    // Get all templates in category
                    result = categoryTemplates;
                }
            }

            // Cache the result for performance
            this.cache.set(cacheKey, result);
            
        } catch (error) {
            logger.logError(error, `Error getting template: ${platform}/${serverName}/${category}/${subCategory}`);
            result = null;
        }

        return result;
    }

    /**
     * Get the best template based on configuration and availability
     * 
     * Selects the most appropriate template variation based on tag settings.
     * Falls back to simpler templates if configured variations aren't available.
     * 
     * Selection priority:
     * 1. withBothTags (if both showTags and showSourceTag enabled)
     * 2. withSourceTag (if showSourceTag enabled)
     * 3. withTag (if showTags enabled)
     * 4. basic (fallback)
     * 5. First available (if basic not found)
     * 
     * @param {string} platform - Platform name
     * @param {string} serverName - Server name
     * @param {string} category - Template category
     * @param {Object} [config={}] - Configuration object with tag settings
     * @param {boolean} [config.showTags] - Whether to show user guild tags
     * @param {boolean} [config.showSourceTag] - Whether to show source guild tags
     * @param {boolean} [config.enableDebugLogging] - Enable debug logging
     * @returns {string|null} Best matching template string or null
     * 
     * @example
     * const template = loader.getBestTemplate('messagesToMinecraft', 'Hypixel', 'guild', {
     *   showTags: true,
     *   showSourceTag: true
     * });
     * // Returns withBothTags template if available
     */
    getBestTemplate(platform, serverName, category, config = {}) {
        const templates = this.getTemplate(platform, serverName, category);
        if (!templates || typeof templates !== 'object') {
            return templates; // Return as-is if it's a string or null
        }

        // Determine template priority based on configuration
        const hasTagEnabled = config.showTags === true;
        const hasSourceTag = config.showSourceTag === true;
        
        let templateKey = 'basic';
        
        // Select best template based on enabled features
        if (hasTagEnabled && hasSourceTag && templates.withBothTags) {
            templateKey = 'withBothTags';
        } else if (hasSourceTag && templates.withSourceTag) {
            templateKey = 'withSourceTag';
        } else if (hasTagEnabled && templates.withTag) {
            templateKey = 'withTag';
        } else if (templates.basic) {
            templateKey = 'basic';
        } else {
            // Get first available template as last resort
            const availableKeys = Object.keys(templates);
            if (availableKeys.length > 0) {
                templateKey = availableKeys[0];
            }
        }

        const selectedTemplate = templates[templateKey];
        
        if (config.enableDebugLogging) {
            logger.debug(`Selected template '${templateKey}' for ${platform}/${serverName}/${category}:`, selectedTemplate);
        }

        return selectedTemplate || null;
    }

    /**
     * Get event template specifically
     * 
     * Convenience method for retrieving event templates with automatic
     * best template selection based on configuration.
     * 
     * @param {string} platform - Platform name
     * @param {string} serverName - Server name
     * @param {string} eventType - Event type (join, leave, kick, promote, demote, level, motd)
     * @param {Object} [config={}] - Configuration object
     * @returns {string|null} Event template string or null
     * 
     * @example
     * const joinTemplate = loader.getEventTemplate('messagesToDiscord', 'Hypixel', 'join', {
     *   showTags: true
     * });
     */
    getEventTemplate(platform, serverName, eventType, config = {}) {
        const eventTemplates = this.getTemplate(platform, serverName, 'events', eventType);
        
        if (!eventTemplates || typeof eventTemplates !== 'object') {
            return eventTemplates;
        }

        return this.getBestTemplate(platform, serverName, `events.${eventType}`, config) ||
               this.getBestTemplateFromObject(eventTemplates, config);
    }

    /**
     * Get best template from a template object
     * 
     * Helper method to select best template from a template variations object.
     * Used internally for complex template selection scenarios.
     * 
     * @param {Object} templates - Template object with variations
     * @param {Object} [config={}] - Configuration object
     * @returns {string|null} Best template string or null
     * @private
     */
    getBestTemplateFromObject(templates, config = {}) {
        if (!templates || typeof templates !== 'object') {
            return templates;
        }

        const hasTagEnabled = config.showTags === true;
        const hasSourceTag = config.showSourceTag === true;
        
        // Selection priority logic
        if (hasTagEnabled && hasSourceTag && templates.withBothTags) {
            return templates.withBothTags;
        } else if (hasSourceTag && templates.withSourceTag) {
            return templates.withSourceTag;
        } else if (hasTagEnabled && templates.withTag) {
            return templates.withTag;
        } else if (templates.basic) {
            return templates.basic;
        }

        // Return first available template as fallback
        const keys = Object.keys(templates);
        return keys.length > 0 ? templates[keys[0]] : null;
    }

    /**
     * Get supported servers for a platform
     * 
     * Returns list of server names that have templates configured
     * for the specified platform.
     * 
     * @param {string} platform - Platform name ('messagesToMinecraft' or 'messagesToDiscord')
     * @returns {Array<string>} Array of supported server names
     */
    getSupportedServers(platform) {
        if (!this.isLoaded || !this.templates.servers[platform]) {
            return [];
        }

        return Object.keys(this.templates.servers[platform]);
    }

    /**
     * Get supported platforms
     * 
     * Returns list of all configured platforms (usually messagesToMinecraft
     * and messagesToDiscord).
     * 
     * @returns {Array<string>} Array of supported platform names
     */
    getSupportedPlatforms() {
        if (!this.isLoaded) {
            return [];
        }

        return Object.keys(this.templates.servers);
    }

    /**
     * Check if a platform/server combination is supported
     * 
     * Determines if templates are available for the specified
     * platform and server combination.
     * 
     * @param {string} platform - Platform name
     * @param {string} serverName - Server name
     * @returns {boolean} True if combination has templates
     */
    isSupported(platform, serverName) {
        return this.getSupportedServers(platform).includes(serverName);
    }

    /**
     * Get default values
     * 
     * Retrieves default values like placeholders, colors, emojis, etc.
     * Used for consistent formatting across the application.
     * 
     * @param {string} category - Default category to get (e.g., 'placeholders', 'colors', 'emojis')
     * @returns {Object} Default values for the category
     */
    getDefaults(category) {
        if (!this.templates.defaults || !this.templates.defaults[category]) {
            return {};
        }

        return this.templates.defaults[category];
    }

    /**
     * Get template metadata
     * 
     * Returns metadata about template configuration including version,
     * author, last updated, etc. if available in templates.json.
     * 
     * @returns {Object} Template metadata
     */
    getMetadata() {
        return this.templates.metadata || {};
    }

    /**
     * Add custom template at runtime
     * 
     * Allows dynamic addition of templates without reloading configuration.
     * Useful for testing or adding server-specific customizations.
     * Clears cache for affected template to ensure new template is used.
     * 
     * @param {string} platform - Platform name
     * @param {string} serverName - Server name
     * @param {string} category - Template category
     * @param {string} subCategory - Sub-category
     * @param {string} template - Template string with placeholders
     */
    addCustomTemplate(platform, serverName, category, subCategory, template) {
        // Create platform structure if it doesn't exist
        if (!this.templates.servers[platform]) {
            this.templates.servers[platform] = {};
        }

        if (!this.templates.servers[platform][serverName]) {
            this.templates.servers[platform][serverName] = {};
        }

        if (!this.templates.servers[platform][serverName][category]) {
            this.templates.servers[platform][serverName][category] = {};
        }

        this.templates.servers[platform][serverName][category][subCategory] = template;

        // Clear cache for this template to ensure new template is loaded
        const cacheKey = `${platform}-${serverName}-${category}-${subCategory}`;
        this.cache.delete(cacheKey);
    }

    /**
     * Clear template cache
     * 
     * Clears the internal template cache, forcing templates to be
     * retrieved from configuration on next access. Useful after
     * configuration changes or runtime template additions.
     */
    clearCache() {
        this.cache.clear();
    }
}

// ==================== SINGLETON PATTERN ====================

// Module-level singleton instance
let templateLoaderInstance = null;

/**
 * Get singleton instance of TemplateLoader
 * 
 * Ensures only one TemplateLoader instance exists across the application,
 * preventing multiple file reads and providing shared cache.
 * 
 * @returns {TemplateLoader} TemplateLoader singleton instance
 */
function getTemplateLoader() {
    if (!templateLoaderInstance) {
        templateLoaderInstance = new TemplateLoader();
    }
    return templateLoaderInstance;
}

// Export both class and singleton getter
module.exports = {
    TemplateLoader,
    getTemplateLoader
};