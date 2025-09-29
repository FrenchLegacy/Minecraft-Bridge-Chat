/**
 * Configuration Loader
 * 
 * This file handles loading and providing access to the application configuration
 * from settings.json. It provides a centralized interface for accessing configuration
 * values using dot notation paths (e.g., 'bridge.interGuild.enabled').
 * 
 * The configuration includes:
 * - Guild configurations (bot accounts, server details)
 * - Discord bot settings (tokens, channels)
 * - Bridge features (inter-guild relay, rate limiting)
 * - Logging and debugging options
 * - Advanced tuning parameters
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Globals Imports
const fs = require('fs');
const path = require('path');

/**
 * Config - Configuration management class
 * 
 * Loads and provides type-safe access to application configuration.
 * Configuration is loaded once on instantiation and cached in memory.
 * 
 * @class
 */
class Config {
    /**
     * Initialize configuration loader
     * Automatically loads configuration from settings.json
     */
    constructor() {
        this.configPath = path.join(__dirname, '../../config/settings.json');
        this.settings = null;
        this.isLoaded = false;
        
        this.load();
    }

    /**
     * Load configuration from file
     * 
     * Reads and parses the settings.json file.
     * Throws error if file is missing or invalid JSON.
     * 
     * @throws {Error} If configuration file not found or invalid
     */
    load() {
        try {
            if (!fs.existsSync(this.configPath)) {
                throw new Error(`Configuration file not found: ${this.configPath}`);
            }

            const rawData = fs.readFileSync(this.configPath, 'utf8');
            this.settings = JSON.parse(rawData);

            this.isLoaded = true;
            console.log('✅ Configuration loaded successfully');
        
        } catch (error) {
            console.error('❌ Error loading configuration:', error.message);
            throw error;
        }
    }

    /**
     * Get configuration value by path
     * 
     * Retrieves configuration value using dot notation path.
     * Returns defaultValue if path doesn't exist.
     * 
     * Example:
     *   config.get('bridge.interGuild.enabled') // returns boolean
     *   config.get('guilds.0.name') // returns first guild name
     * 
     * @param {string} path - Dot notation path to configuration value
     * @param {*} defaultValue - Value to return if path doesn't exist
     * @returns {*} Configuration value or default value
     * @throws {Error} If configuration not loaded
     */
    get(path, defaultValue = null) {
        if (!this.isLoaded) {
            throw new Error('Configuration not loaded');
        }

        const keys = path.split('.');
        let current = this.settings;

        // Traverse configuration object following path
        for (const key of keys) {
            if (current === null || current === undefined || !(key in current)) {
                return defaultValue;
            }
            current = current[key];
        }

        return current;
    }

    /**
     * Get all guild configurations
     * 
     * Returns array of all guild configurations, both enabled and disabled.
     * 
     * @returns {Array} Array of guild configuration objects
     */
    getAllGuilds() {
        return this.get('guilds', []);
    }

    /**
     * Get only enabled guild configurations
     * 
     * Filters guild configurations to return only those with enabled: true.
     * This is used during startup to determine which guilds to connect to.
     * 
     * @returns {Array} Array of enabled guild configuration objects
     */
    getEnabledGuilds() {
        return this.getAllGuilds().filter(guild => guild.enabled);
    }
}

module.exports = Config;