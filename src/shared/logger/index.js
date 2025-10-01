/**
 * Logger Module - Singleton Logger API Facade
 * 
 * This module provides the main entry point and API facade for the logging system.
 * It implements a singleton pattern to ensure a single logger instance throughout the
 * application and exports a convenient API for logging operations.
 * 
 * The module provides:
 * - Singleton logger instance management
 * - Automatic configuration loading from ConfigLoader
 * - Direct method exports for simple usage (no need to call getInstance())
 * - Main logging methods (info, warn, error, debug)
 * - Specialized logging methods (minecraft, discord, bridge)
 * - Utility logging methods (logError, logPerformance, etc.)
 * - File logger access methods (getRecentLogs, getLogStats, etc.)
 * - Configuration methods (setLevel, getLevel)
 * - Full logger instance access for advanced usage
 * 
 * Usage patterns:
 * 1. Simple: logger.info('message') - Most common, direct usage
 * 2. Advanced: logger.getInstance().customMethod() - Full instance access
 * 3. Configuration: logger.setLevel('debug') - Runtime configuration
 * 4. Monitoring: logger.getRecentLogs(100) - Log file access
 * 
 * Singleton benefits:
 * - Single configuration source
 * - Consistent logging behavior across application
 * - Efficient resource usage (one FileLogger instance)
 * - Centralized log level management
 * 
 * Module structure:
 * - Singleton factory function (getLogger)
 * - Logger instance creation with config
 * - Method exports (12+ logging methods)
 * - Utility exports (4 file logger methods)
 * - Configuration exports (2 methods)
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

const Logger = require('./logger');
const Config = require('../../config/ConfigLoader.js');

// Singleton instance storage
let loggerInstance = null;

/**
 * Get or create singleton logger instance
 * 
 * Factory function that creates the logger instance on first call and returns
 * the same instance on subsequent calls. Automatically loads configuration from
 * ConfigLoader and initializes the Logger with logging settings.
 * 
 * Singleton pattern ensures:
 * - Only one Logger instance exists
 * - Configuration loaded once
 * - FileLogger created once
 * - Consistent behavior across application
 * 
 * @returns {Logger} Singleton logger instance
 * 
 * @example
 * // First call - creates instance
 * const logger = getLogger();
 * 
 * @example
 * // Subsequent calls - returns same instance
 * const logger1 = getLogger();
 * const logger2 = getLogger();
 * console.log(logger1 === logger2); // true
 */
function getLogger() {
	if (!loggerInstance) {
		let config = new Config();
		const loggingConfig = config.get("features.logging");
		loggerInstance = new Logger(loggingConfig);
	}
	return loggerInstance;
}

// Create singleton instance for direct exports
const logger = getLogger();

/**
 * Logger Module Exports
 * 
 * Exports a comprehensive logging API with direct method access.
 * All methods are bound to the singleton logger instance for convenient usage.
 * 
 * @module logger
 */
module.exports = {
	// ==================== Main Logging Methods ====================
	
	/**
	 * Log info level message
	 * 
	 * Logs informational messages for general application flow and status updates.
	 * Use for normal operational messages that track application progress.
	 * 
	 * @param {...*} args - Message and optional additional arguments
	 * 
	 * @example
	 * logger.info('Application started successfully');
	 * logger.info('User connected:', username);
	 * logger.info('Processing complete', { items: 42, duration: 1500 });
	 */
	info: (...args) => logger.info(...args),
	
	/**
	 * Log warning level message
	 * 
	 * Logs warning messages for potentially problematic situations that don't prevent
	 * operation but may need attention. Use for deprecations, fallbacks, or recoverable errors.
	 * 
	 * @param {...*} args - Warning message and optional additional arguments
	 * 
	 * @example
	 * logger.warn('Configuration missing, using defaults');
	 * logger.warn('Connection slow, retrying...', { attempt: 2 });
	 * logger.warn('API rate limit approaching:', rateLimitInfo);
	 */
	warn: (...args) => logger.warn(...args),
	
	/**
	 * Log error level message
	 * 
	 * Logs error messages for failures and exceptions. Use for errors that prevent
	 * normal operation or indicate serious problems requiring investigation.
	 * 
	 * @param {...*} args - Error message and optional additional arguments
	 * 
	 * @example
	 * logger.error('Database connection failed');
	 * logger.error('Failed to process request:', error);
	 * logger.error('Critical error in module:', { module: 'auth', error: err });
	 */
	error: (...args) => logger.error(...args),
	
	/**
	 * Log debug level message
	 * 
	 * Logs detailed debugging information. Only output when debug level is enabled.
	 * Use for detailed state information, variable dumps, and flow tracing during development.
	 * 
	 * @param {...*} args - Debug message and optional additional arguments
	 * 
	 * @example
	 * logger.debug('Processing step 1 of 5');
	 * logger.debug('Variable state:', { userId: 123, sessionId: 'abc' });
	 * logger.debug('Function called with args:', functionArgs);
	 */
	debug: (...args) => logger.debug(...args),
	
	// ==================== Specialized Logging Methods ====================
	
	/**
	 * Log Minecraft-specific message
	 * 
	 * Specialized logging for Minecraft-related events and operations.
	 * Uses distinct formatting and color coding for easy identification in logs.
	 * 
	 * @param {...*} args - Minecraft message and optional additional arguments
	 * 
	 * @example
	 * logger.minecraft('Bot connected to Hypixel');
	 * logger.minecraft('[Guild] Player joined:', playerName);
	 * logger.minecraft('Command executed:', { guild: 'TestGuild', cmd: '/g online' });
	 */
	minecraft: (...args) => logger.minecraft(...args),
	
	/**
	 * Log Discord-specific message
	 * 
	 * Specialized logging for Discord-related events and operations.
	 * Uses distinct formatting and color coding for Discord bot activities.
	 * 
	 * @param {...*} args - Discord message and optional additional arguments
	 * 
	 * @example
	 * logger.discord('Discord bot connected');
	 * logger.discord('Slash command received:', commandName);
	 * logger.discord('Message sent to channel:', { channel: 'general', content: '...' });
	 */
	discord: (...args) => logger.discord(...args),
	
	/**
	 * Log bridge operation message
	 * 
	 * Specialized logging for bridge operations between Minecraft and Discord.
	 * Tracks message routing, event bridging, and cross-platform communication.
	 * 
	 * @param {...*} args - Bridge message and optional additional arguments
	 * 
	 * @example
	 * logger.bridge('Message bridged: MC -> Discord');
	 * logger.bridge('[INTER-GUILD] Processing message from Guild1 to Guild2');
	 * logger.bridge('Event broadcasted:', { type: 'promote', guilds: 3 });
	 */
	bridge: (...args) => logger.bridge(...args),
	
	// ==================== Utility Logging Methods ====================
	
	/**
	 * Log error with context
	 * 
	 * Specialized error logging that includes error details and contextual information.
	 * Automatically extracts error stack traces and formats error objects.
	 * 
	 * @param {Error} error - Error object to log
	 * @param {string} context - Contextual description of where/why error occurred
	 * 
	 * @example
	 * try {
	 *   await riskyOperation();
	 * } catch (error) {
	 *   logger.logError(error, 'Failed to process user request');
	 * }
	 * 
	 * @example
	 * logger.logError(new Error('Connection timeout'), 'Database query failed');
	 */
	logError: (error, context) => logger.logError(error, context),
	
	/**
	 * Log performance metrics
	 * 
	 * Logs performance timing information by calculating duration from start time.
	 * Useful for tracking operation performance and identifying bottlenecks.
	 * 
	 * @param {string} label - Description of the operation being timed
	 * @param {number} startTime - Start timestamp from Date.now() or performance.now()
	 * 
	 * @example
	 * const startTime = Date.now();
	 * await processData();
	 * logger.logPerformance('Data processing', startTime);
	 * // Logs: "Data processing completed in 1234ms"
	 * 
	 * @example
	 * const start = Date.now();
	 * await fetchUserData();
	 * logger.logPerformance('User data fetch', start);
	 */
	logPerformance: (label, startTime) => logger.logPerformance(label, startTime),
	
	/**
	 * Log Minecraft connection event
	 * 
	 * Specialized logging for Minecraft bot connection status changes.
	 * Tracks connection, disconnection, and reconnection events with details.
	 * 
	 * @param {string} guildId - Guild ID for the connection
	 * @param {string} username - Bot username
	 * @param {string} status - Connection status ('connected', 'disconnected', 'reconnected')
	 * @param {object} [details] - Additional connection details
	 * 
	 * @example
	 * logger.logMinecraftConnection(
	 *   'guild123',
	 *   'BotAccount',
	 *   'connected',
	 *   { server: 'hypixel.net', attempt: 1 }
	 * );
	 * 
	 * @example
	 * logger.logMinecraftConnection('guild456', 'TestBot', 'disconnected', {
	 *   reason: 'timeout',
	 *   uptime: 3600000
	 * });
	 */
	logMinecraftConnection: (guildId, username, status, details) => logger.logMinecraftConnection(guildId, username, status, details),
	
	/**
	 * Log bridge message transfer
	 * 
	 * Logs detailed information about messages being bridged between platforms.
	 * Tracks source, destination, username, and message content.
	 * 
	 * @param {string} from - Source platform/guild ('Minecraft', 'Discord', guild name)
	 * @param {string} to - Destination platform/guild
	 * @param {string} username - Username of message sender
	 * @param {string} message - Message content being bridged
	 * 
	 * @example
	 * logger.logBridgeMessage('Guild1', 'Guild2', 'Player123', 'Hello world!');
	 * 
	 * @example
	 * logger.logBridgeMessage('Minecraft', 'Discord', 'TestUser', 'Event notification');
	 */
	logBridgeMessage: (from, to, username, message) => logger.logBridgeMessage(from, to, username, message),
	
	/**
	 * Log Discord command execution
	 * 
	 * Logs Discord slash command and message command executions with user
	 * and guild context. Useful for command usage tracking and auditing.
	 * 
	 * @param {string} userId - Discord user ID who executed command
	 * @param {string} command - Command name and arguments
	 * @param {string} [guildId] - Guild ID where command was executed (optional)
	 * 
	 * @example
	 * logger.logDiscordCommand('123456789', '/guild promote TestUser', 'guild_abc');
	 * 
	 * @example
	 * logger.logDiscordCommand('987654321', '!help', 'guild_xyz');
	 */
	logDiscordCommand: (userId, command, guildId) => logger.logDiscordCommand(userId, command, guildId),
	
	// ==================== File Logger Access Methods ====================
	
	/**
	 * Get recent log entries from main log file
	 * 
	 * Retrieves the last N lines from the current main log file via FileLogger.
	 * Returns empty array if FileLogger is not initialized or file doesn't exist.
	 * 
	 * @param {number} [lines] - Number of recent lines to retrieve (default: 100)
	 * @returns {string[]} Array of log lines (most recent last)
	 * 
	 * @example
	 * const recent = logger.getRecentLogs(50);
	 * recent.forEach(line => console.log(line));
	 * 
	 * @example
	 * // Get last 10 logs for quick status check
	 * const lastTen = logger.getRecentLogs(10);
	 */
	getRecentLogs: (lines) => { 
		const fileLogger = logger.fileLogger; 
		return fileLogger ? fileLogger.getRecentLogs(lines) : []; 
	},
	
	/**
	 * Get recent error log entries from error log file
	 * 
	 * Retrieves the last N lines from the current error log file via FileLogger.
	 * Returns empty array if FileLogger is not initialized or file doesn't exist.
	 * 
	 * @param {number} [lines] - Number of recent error lines to retrieve (default: 100)
	 * @returns {string[]} Array of error log lines (most recent last)
	 * 
	 * @example
	 * const errors = logger.getRecentErrorLogs(25);
	 * if (errors.length > 0) {
	 *   console.warn('Recent errors detected:', errors.length);
	 * }
	 * 
	 * @example
	 * // Monitor for critical errors
	 * const recentErrors = logger.getRecentErrorLogs(5);
	 */
	getRecentErrorLogs: (lines) => { 
		const fileLogger = logger.fileLogger; 
		return fileLogger ? fileLogger.getRecentErrorLogs(lines) : []; 
	},
	
	/**
	 * Get current log file paths
	 * 
	 * Returns paths to current main and error log files via FileLogger.
	 * Returns null paths if FileLogger is not initialized.
	 * 
	 * @returns {object} Object containing log file paths
	 * @returns {string|null} return.main - Path to main log file or null
	 * @returns {string|null} return.errors - Path to error log file or null
	 * 
	 * @example
	 * const paths = logger.getCurrentLogFiles();
	 * console.log('Main log:', paths.main);
	 * console.log('Error log:', paths.errors);
	 */
	getCurrentLogFiles: () => { 
		const fileLogger = logger.fileLogger; 
		return fileLogger ? fileLogger.getCurrentLogFiles() : { main: null, errors: null }; 
	},
	
	/**
	 * Get log file statistics
	 * 
	 * Returns statistics about current log files including size and existence via FileLogger.
	 * Returns default stats (non-existent, 0 size) if FileLogger is not initialized.
	 * 
	 * @returns {object} Log statistics object
	 * @returns {object} return.main - Main log file stats
	 * @returns {boolean} return.main.exists - Whether main log exists
	 * @returns {number} return.main.size - Size in bytes
	 * @returns {object} return.errors - Error log file stats
	 * @returns {boolean} return.errors.exists - Whether error log exists
	 * @returns {number} return.errors.size - Size in bytes
	 * 
	 * @example
	 * const stats = logger.getLogStats();
	 * console.log('Main log:', (stats.main.size / 1024 / 1024).toFixed(2), 'MB');
	 * console.log('Error log:', (stats.errors.size / 1024 / 1024).toFixed(2), 'MB');
	 * 
	 * @example
	 * // Check rotation threshold
	 * const stats = logger.getLogStats();
	 * if (stats.main.size > 9 * 1024 * 1024) {
	 *   console.warn('Log rotation imminent (>9MB)');
	 * }
	 */
	getLogStats: () => { 
		const fileLogger = logger.fileLogger; 
		return fileLogger ? fileLogger.getLogStats() : { 
			main: { exists: false, size: 0 }, 
			errors: { exists: false, size: 0 } 
		}; 
	},
	
	// ==================== Instance & Configuration Access ====================
	
	/**
	 * Get full logger instance
	 * 
	 * Returns the singleton Logger instance for advanced usage scenarios where
	 * direct instance access is needed. Most use cases should use the exported
	 * methods instead.
	 * 
	 * @returns {Logger} Full Logger instance
	 * 
	 * @example
	 * const loggerInstance = logger.getInstance();
	 * // Access internal properties or methods
	 * console.log('Current level:', loggerInstance.level);
	 * 
	 * @example
	 * // Advanced: Access FileLogger directly
	 * const instance = logger.getInstance();
	 * if (instance.fileLogger) {
	 *   // Custom file logger operations
	 * }
	 */
	getInstance: () => logger,
	
	/**
	 * Set log level
	 * 
	 * Changes the current logging level to filter messages by severity.
	 * Messages below the set level will not be logged.
	 * 
	 * Log levels (in order of severity):
	 * - 'error': Only errors
	 * - 'warn': Warnings and errors
	 * - 'info': Info, warnings, and errors (default)
	 * - 'debug': All messages including debug
	 * 
	 * @param {string} level - Log level to set ('error', 'warn', 'info', 'debug')
	 * 
	 * @example
	 * // Enable debug logging
	 * logger.setLevel('debug');
	 * logger.debug('This will now be logged');
	 * 
	 * @example
	 * // Production mode: errors only
	 * logger.setLevel('error');
	 * logger.info('This will not be logged');
	 * logger.error('This will be logged');
	 */
	setLevel: (level) => logger.setLevel(level),
	
	/**
	 * Get current log level
	 * 
	 * Returns the current logging level setting.
	 * 
	 * @returns {string} Current log level ('error', 'warn', 'info', 'debug')
	 * 
	 * @example
	 * const currentLevel = logger.getLevel();
	 * console.log('Current log level:', currentLevel);
	 * 
	 * @example
	 * // Check if debug is enabled
	 * if (logger.getLevel() === 'debug') {
	 *   // Perform expensive debug operations
	 * }
	 */
	getLevel: () => logger.getLevel()
};