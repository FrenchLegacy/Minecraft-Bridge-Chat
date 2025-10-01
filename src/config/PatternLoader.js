/**
 * Pattern Loader - Message and Event Pattern Configuration Management
 * 
 * This file manages the loading and access to pattern configurations used for parsing
 * Minecraft chat messages and guild events. Patterns are stored in patterns.json and
 * organized by server type (Hypixel, Vanilla, etc.) to support different server formats.
 * 
 * The loader provides:
 * - Pattern loading from JSON configuration
 * - Pattern compilation to RegExp objects
 * - Caching for performance
 * - Server-specific pattern retrieval
 * - Fallback to vanilla patterns for unknown servers
 * - Runtime pattern customization
 * 
 * Pattern categories include:
 * - messages: Guild chat, officer chat, private messages, party chat
 * - events: Join, leave, kick, promote, demote, level up, MOTD changes
 * - system: System messages and notifications
 * - ignore: Patterns for messages to ignore
 * - detection: Quick classification patterns for message routing
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
 * PatternLoader - Load and manage message/event patterns
 * 
 * Singleton class that loads pattern configurations from patterns.json
 * and provides efficient cached access to compiled regex patterns.
 * 
 * @class
 */
class PatternLoader {
    /**
     * Create a new PatternLoader instance
     * Automatically loads patterns from configuration file
     */
    constructor() {
        this.patternsPath = path.join(__dirname, '../../config/patterns.json');
        this.patterns = null;
        this.isLoaded = false;
        this.cache = new Map(); // Pattern cache for performance
        
        // Load patterns immediately
        this.load();
    }

    /**
     * Load patterns from configuration file
     * 
     * Reads patterns.json, parses it, and validates the structure.
     * Throws error if file is missing or invalid.
     * 
     * @throws {Error} If patterns file not found or invalid JSON
     */
    load() {
        try {
            if (!fs.existsSync(this.patternsPath)) {
                throw new Error(`Patterns configuration file not found: ${this.patternsPath}`);
            }

            const rawData = fs.readFileSync(this.patternsPath, 'utf8');
            this.patterns = JSON.parse(rawData);

            this.isLoaded = true;
            this.validatePatterns();
            
            logger.info(`✅ Pattern configuration loaded successfully`);
            
        } catch (error) {
            logger.logError(error, 'Failed to load pattern configuration');
            throw error;
        }
    }

    /**
     * Validate pattern configuration structure
     * 
     * Ensures patterns configuration has required sections and valid structure.
     * Logs the number of configured servers for verification.
     * 
     * @throws {Error} If patterns structure is invalid
     */
    validatePatterns() {
        if (!this.patterns) {
            throw new Error('Patterns not loaded');
        }

        if (!this.patterns.servers || typeof this.patterns.servers !== 'object') {
            throw new Error('Invalid patterns configuration: missing servers section');
        }
    }

    /**
     * Get patterns for a specific server and category
     * 
     * Retrieves patterns from cache if available, otherwise loads from
     * configuration and compiles regex patterns. Falls back to Vanilla
     * patterns if server is not recognized.
     * 
     * Pattern structure:
     * - pattern: RegExp pattern string
     * - groups: Array of capture group names
     * - flags: RegExp flags (e.g., 'i' for case-insensitive)
     * - description: Human-readable description
     * 
     * @param {string} serverName - Server name (e.g., 'Hypixel', 'Vanilla')
     * @param {string} category - Pattern category (e.g., 'events', 'messages', 'system', 'ignore')
     * @param {string} [subCategory=null] - Sub-category (e.g., 'join', 'guild', etc.)
     * @returns {Array} Array of compiled pattern objects
     * @throws {Error} If patterns not loaded
     * 
     * @example
     * // Get all guild join event patterns for Hypixel
     * const joinPatterns = loader.getPatterns('Hypixel', 'events', 'join');
     * 
     * @example
     * // Get all message patterns for Vanilla
     * const messagePatterns = loader.getPatterns('Vanilla', 'messages');
     */
    getPatterns(serverName, category, subCategory = null) {
        if (!this.isLoaded) {
            throw new Error('Patterns not loaded');
        }

        // Check cache first for performance
        const cacheKey = `${serverName}-${category}-${subCategory || 'all'}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        let result = [];

        // Get server-specific patterns
        if (this.patterns.servers[serverName]) {
            const serverPatterns = this.patterns.servers[serverName];
            
            if (serverPatterns[category]) {
                if (subCategory && serverPatterns[category][subCategory]) {
                    // Get specific sub-category patterns
                    result = [...serverPatterns[category][subCategory]];
                } else if (!subCategory) {
                    // Get all patterns in category
                    result = serverPatterns[category];
                }
            }
        }

        // Fallback to Vanilla patterns if server not recognized and no patterns found
        if (result.length === 0 && !this.patterns.servers[serverName]) {
            logger.warn(`Unknown server '${serverName}', falling back to vanilla patterns`);
            
            if (this.patterns.servers.Vanilla && this.patterns.servers.Vanilla[category]) {
                if (subCategory && this.patterns.servers.Vanilla[category][subCategory]) {
                    result = [...this.patterns.servers.Vanilla[category][subCategory]];
                } else if (!subCategory) {
                    result = this.patterns.servers.Vanilla[category];
                }
            }
        }

        // Convert pattern strings to compiled RegExp objects
        if (Array.isArray(result)) {
            result = result.map(patternObj => this.createPatternObject(patternObj));
        }

        // Cache the compiled patterns for performance
        this.cache.set(cacheKey, result);
        
        return result;
    }

    /**
     * Create a pattern object with compiled RegExp
     * 
     * Converts pattern configuration object to usable pattern with compiled regex.
     * Handles flag normalization (converts "none" to empty string).
     * 
     * @param {Object} patternObj - Pattern object from configuration
     * @param {string} patternObj.pattern - RegExp pattern string
     * @param {string} [patternObj.flags] - RegExp flags
     * @param {Array} [patternObj.groups] - Capture group names
     * @param {string} [patternObj.description] - Pattern description
     * @returns {Object|null} Compiled pattern object or null if compilation fails
     * @private
     */
    createPatternObject(patternObj) {
        if (!patternObj.pattern) {
            logger.warn('Pattern object missing pattern property:', patternObj);
            return null;
        }

        try {
            // Handle flag normalization
            let flags = patternObj.flags || '';
            if (flags === 'none') {
                flags = ''; // Convert "none" to empty string
            }
            
            // Compile the regex pattern
            const regex = new RegExp(patternObj.pattern, flags);
            
            return {
                pattern: regex,
                originalPattern: patternObj.pattern,
                groups: patternObj.groups || [],
                flags: flags,
                description: patternObj.description || 'No description',
                direction: patternObj.direction || null,
                custom: false
            };
        } catch (error) {
            logger.logError(error, `Failed to compile pattern: ${patternObj.pattern}`);
            return null;
        }
    }

    /**
     * Get detection patterns for quick message classification
     * 
     * Detection patterns are used for fast message routing before detailed parsing.
     * They help quickly identify message types (guild chat, officer chat, events, etc.)
     * without full pattern matching overhead.
     * 
     * @param {string} serverName - Server name
     * @param {string} type - Detection type ('guildChat', 'officerChat', 'guildEvent', 'guildSystem')
     * @returns {Array} Array of compiled detection pattern objects
     * @throws {Error} If patterns not loaded
     */
    getDetectionPatterns(serverName, type) {
        if (!this.isLoaded) {
            throw new Error('Patterns not loaded');
        }

        const cacheKey = `detection-${serverName}-${type}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        let result = [];

        if (this.patterns.servers[serverName] && this.patterns.servers[serverName].detection) {
            const detectionPatterns = this.patterns.servers[serverName].detection[type];
            if (detectionPatterns && Array.isArray(detectionPatterns)) {
                // Compile patterns and filter out any that failed
                result = detectionPatterns
                    .map(patternObj => this.createPatternObject(patternObj))
                    .filter(p => p !== null);
            }
        }

        this.cache.set(cacheKey, result);
        return result;
    }

    /**
     * Get commands response patterns for a specific server
     * 
     * Command response patterns are used to detect and parse responses from
     * Minecraft server commands (like /g online, /g list, /g kick, etc.)
     * These are used by CommandResponseListener to validate command execution.
     * 
     * @param {string} serverName - Server name (e.g., 'Hypixel')
     * @returns {Object|null} Commands response patterns object or null if not found
     * @throws {Error} If patterns not loaded
     */
    getCommandsResponsePatterns(serverName) {
        if (!this.isLoaded) {
            throw new Error('Patterns not loaded');
        }

        const cacheKey = `commandsResponse-${serverName}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        let result = null;

        try {
            const serverData = this.patterns?.servers?.[serverName];
            if (!serverData) {
                this.cache.set(cacheKey, null);
                return null;
            }

            const commandsResponse = serverData.detection?.commandsResponse;
            if (!commandsResponse) {
                this.cache.set(cacheKey, null);
                return null;
            }

            result = commandsResponse;
            this.cache.set(cacheKey, result);
            
            return result;

        } catch (error) {
            logger.logError(error, `Failed to get commands response patterns for ${serverName}`);
            this.cache.set(cacheKey, null);
            return null;
        }
    }

    /**
     * Get all event types supported by a server
     * 
     * Returns list of event types that have patterns configured,
     * useful for iterating over available event parsers.
     * 
     * @param {string} serverName - Server name
     * @returns {Array<string>} Array of event type names (e.g., ['join', 'leave', 'kick'])
     */
    getEventTypes(serverName) {
        if (!this.patterns.servers[serverName] || !this.patterns.servers[serverName].events) {
            return [];
        }

        return Object.keys(this.patterns.servers[serverName].events);
    }

    /**
     * Get all message types supported by a server
     * 
     * Returns list of message types that have patterns configured,
     * useful for iterating over available message parsers.
     * 
     * @param {string} serverName - Server name
     * @returns {Array<string>} Array of message type names (e.g., ['guild', 'officer', 'party'])
     */
    getMessageTypes(serverName) {
        if (!this.patterns.servers[serverName] || !this.patterns.servers[serverName].messages) {
            return [];
        }

        return Object.keys(this.patterns.servers[serverName].messages);
    }

    /**
     * Add custom pattern at runtime
     * 
     * Allows dynamic addition of patterns without reloading configuration.
     * Useful for testing or adding server-specific customizations.
     * Clears cache for affected pattern set to ensure new pattern is used.
     * 
     * @param {string} serverName - Server name
     * @param {string} category - Pattern category
     * @param {string} subCategory - Sub-category
     * @param {Object} patternObj - Pattern object to add
     * @param {string} patternObj.pattern - RegExp pattern string
     * @param {Array} [patternObj.groups] - Capture group names
     * @param {string} [patternObj.description] - Pattern description
     */
    addCustomPattern(serverName, category, subCategory, patternObj) {
        // Create server structure if it doesn't exist
        if (!this.patterns.servers[serverName]) {
            this.patterns.servers[serverName] = {};
        }

        if (!this.patterns.servers[serverName][category]) {
            this.patterns.servers[serverName][category] = {};
        }

        if (!this.patterns.servers[serverName][category][subCategory]) {
            this.patterns.servers[serverName][category][subCategory] = [];
        }

        // Mark as custom pattern for tracking
        patternObj.custom = true;
        this.patterns.servers[serverName][category][subCategory].push(patternObj);

        // Clear cache for this pattern set to ensure new pattern is loaded
        const cacheKey = `${serverName}-${category}-${subCategory}`;
        this.cache.delete(cacheKey);
    }

    /**
     * Get supported servers list
     * 
     * Returns all server names that have pattern configurations.
     * 
     * @returns {Array<string>} Array of supported server names
     */
    getSupportedServers() {
        if (!this.isLoaded) {
            return [];
        }

        return Object.keys(this.patterns.servers);
    }

    /**
     * Check if server is supported
     * 
     * Determines if patterns are available for the specified server.
     * 
     * @param {string} serverName - Server name to check
     * @returns {boolean} True if server has pattern configurations
     */
    isServerSupported(serverName) {
        return this.getSupportedServers().includes(serverName);
    }

    /**
     * Get default values
     * 
     * Retrieves default values like color codes, rank names, etc.
     * Used for consistent formatting across the application.
     * 
     * @param {string} category - Default category to get (e.g., 'colors', 'ranks')
     * @returns {Object} Default values for the category
     */
    getDefaults(category) {
        if (!this.patterns.defaults || !this.patterns.defaults[category]) {
            return {};
        }

        return this.patterns.defaults[category];
    }

    /**
     * Get pattern metadata
     * 
     * Returns metadata about pattern configuration including version,
     * author, last updated, etc. if available in patterns.json.
     * 
     * @returns {Object} Pattern metadata
     */
    getMetadata() {
        return this.patterns.metadata || {};
    }

    /**
     * Clear pattern cache
     * 
     * Clears the internal pattern cache, forcing patterns to be
     * recompiled on next access. Useful after configuration changes.
     */
    clearCache() {
        this.cache.clear();
    }
}

// ==================== SINGLETON PATTERN ====================

// Module-level singleton instance
let patternLoaderInstance = null;

/**
 * Get singleton instance of PatternLoader
 * 
 * Ensures only one PatternLoader instance exists across the application,
 * preventing multiple file reads and providing shared cache.
 * 
 * @returns {PatternLoader} PatternLoader singleton instance
 */
function getPatternLoader() {
    if (!patternLoaderInstance) {
        patternLoaderInstance = new PatternLoader();
    }
    return patternLoaderInstance;
}

// Export both class and singleton getter
module.exports = {
    PatternLoader,
    getPatternLoader
};