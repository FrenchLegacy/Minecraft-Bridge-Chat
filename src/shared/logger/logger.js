/**
 * Logger - Core Logging System with Console and File Output
 * 
 * This class provides the core logging functionality with support for multiple log levels,
 * colored console output, file logging, and specialized logging methods for different
 * subsystems (Minecraft, Discord, Bridge). It manages log filtering, formatting, and
 * routing to appropriate outputs.
 * 
 * The logger provides:
 * - Multi-level logging (debug, info, warn, error, perf)
 * - Colored console output with emojis for visual clarity
 * - Optional file logging with FileLogger integration
 * - Specialized logging methods (minecraft, discord, bridge)
 * - Performance timing utilities
 * - Error logging with context and stack traces
 * - Runtime log level configuration
 * - Message formatting for both console and files
 * 
 * Log levels (with priorities):
 * - debug (0): Detailed debugging information
 * - info (1): General informational messages (default)
 * - perf (1): Performance timing messages
 * - warn (2): Warning messages for potential issues
 * - error (3): Error messages for failures
 * 
 * Color scheme:
 * - debug: Cyan (🔍)
 * - info: Green (ℹ️)
 * - warn: Yellow (⚠️)
 * - error: Red (❌)
 * - minecraft: Magenta (🎮)
 * - discord: Blue (💬)
 * - bridge: Light cyan (🌉)
 * - perf: Electric violet (⚡)
 * 
 * Configuration options:
 * - level: Minimum log level to display (default: 'info')
 * - console: Enable console output (default: true)
 * - file: Enable file logging (default: false)
 * 
 * Output format:
 * [YYYY-MM-DD HH:MM:SS] EMOJI LEVEL Message content
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

const fs = require('fs');
const path = require('path');
const FileLogger = require('./FileLogger');

/**
 * Logger - Core logging system
 * 
 * Main logger class that handles log level filtering, message formatting,
 * console output with colors, and file logging integration.
 * 
 * @class
 */
class Logger {
    /**
     * Create a new Logger instance
     * 
     * Initializes the logger with configuration, sets up log levels, colors, emojis,
     * and optionally creates a FileLogger instance for file output.
     * 
     * Default configuration:
     * - level: 'info' (show info, warn, error)
     * - console: true (console output enabled)
     * - file: false (file output disabled)
     * 
     * @param {object} [config={}] - Logger configuration
     * @param {string} [config.level='info'] - Minimum log level to display
     * @param {boolean} [config.console=true] - Enable console output
     * @param {boolean} [config.file=false] - Enable file logging
     * 
     * @example
     * const logger = new Logger({
     *   level: 'debug',
     *   console: true,
     *   file: true
     * });
     * 
     * @example
     * // Production config
     * const logger = new Logger({
     *   level: 'warn',
     *   console: true,
     *   file: true
     * });
     */
    constructor(config = {}) {
        this.config = {
            level: config.level || 'info',
            console: config.console !== false, // true by default
            file: config.file || false,
            ...config
        };
        
        // Log levels with priorities
        this.levels = {
            debug: 0,
            info: 1,
            perf: 1,
            warn: 2,
            error: 3,
        };
        
        this.currentLevel = (this.config.level in this.levels) ? this.levels[this.config.level] : 1;
        
        // Colors for console
        this.colors = {
            debug: '\x1b[36m',          // Cyan
            info: '\x1b[32m',           // Green
            warn: '\x1b[33m',           // Yellow
            error: '\x1b[31m',          // Red
            minecraft: '\x1b[35m',      // Magenta
            discord: '\x1b[34m',        // Blue
            bridge: '\x1b[96m',         // Light cyan
            perf: '\x1b[95;1m',         // Electric violet (unique)
            reset: '\x1b[0m'
        };
        
        // Emojis for types
        this.emojis = {
            debug: '🔍',
            info: 'ℹ️',
            warn: '⚠️',
            error: '❌',
            minecraft: '🎮',
            discord: '💬',
            bridge: '🌉',
            perf: '⚡'
        };
        
        // Initialize file logger if needed
        this.fileLogger = null;
        if (this.config.file) {
            this.fileLogger = new FileLogger();
        }
    }
    
    // ========== Main Logging Methods ==========
    
    /**
     * Log info level message
     * 
     * Logs informational messages for general application flow and status.
     * Displayed when log level is 'info' or 'debug'.
     * 
     * @param {...*} args - Message and optional additional arguments
     * 
     * @example
     * logger.info('Application started');
     * logger.info('User connected:', username);
     * logger.info('Status:', { connected: true, users: 5 });
     */
    info(...args) {
        this.log('info', ...args);
    }
    
    /**
     * Log warning level message
     * 
     * Logs warning messages for potentially problematic situations.
     * Displayed when log level is 'warn', 'info', or 'debug'.
     * 
     * @param {...*} args - Warning message and optional additional arguments
     * 
     * @example
     * logger.warn('Connection slow, retrying...');
     * logger.warn('Rate limit approaching:', { current: 95, max: 100 });
     */
    warn(...args) {
        this.log('warn', ...args);
    }
    
    /**
     * Log error level message
     * 
     * Logs error messages for failures and exceptions.
     * Always displayed regardless of log level.
     * 
     * @param {...*} args - Error message and optional additional arguments
     * 
     * @example
     * logger.error('Connection failed');
     * logger.error('Database error:', error);
     */
    error(...args) {
        this.log('error', ...args);
    }
    
    /**
     * Log debug level message
     * 
     * Logs detailed debugging information for development.
     * Only displayed when log level is 'debug'.
     * 
     * @param {...*} args - Debug message and optional additional arguments
     * 
     * @example
     * logger.debug('Processing step 1');
     * logger.debug('Variable state:', { x: 10, y: 20 });
     */
    debug(...args) {
        this.log('debug', ...args);
    }
    
    // ========== Specialized Logging Methods ==========
    
    /**
     * Log Minecraft-specific message
     * 
     * Specialized logging for Minecraft events and operations.
     * Uses magenta color and game controller emoji (🎮).
     * Displayed at info level priority.
     * 
     * @param {...*} args - Minecraft message and optional additional arguments
     * 
     * @example
     * logger.minecraft('Bot connected to server');
     * logger.minecraft('[Guild] Message received:', message);
     */
    minecraft(...args) {
        this.log('minecraft', ...args);
    }
    
    /**
     * Log Discord-specific message
     * 
     * Specialized logging for Discord events and operations.
     * Uses blue color and speech bubble emoji (💬).
     * Displayed at info level priority.
     * 
     * @param {...*} args - Discord message and optional additional arguments
     * 
     * @example
     * logger.discord('Bot ready');
     * logger.discord('Command received:', commandName);
     */
    discord(...args) {
        this.log('discord', ...args);
    }
    
    /**
     * Log bridge operation message
     * 
     * Specialized logging for bridge operations between platforms.
     * Uses light cyan color and bridge emoji (🌉).
     * Displayed at info level priority.
     * 
     * @param {...*} args - Bridge message and optional additional arguments
     * 
     * @example
     * logger.bridge('Message bridged: MC -> Discord');
     * logger.bridge('[INTER-GUILD] Broadcasting to 3 guilds');
     */
    bridge(...args) {
        this.log('bridge', ...args);
    }
    
    // ========== Core Logging Method ==========
    
    /**
     * Main logging method
     * 
     * Core method that handles all logging operations. Performs level filtering,
     * message formatting, and routing to console and file outputs.
     * 
     * Process flow:
     * 1. Check if message level meets current level threshold
     * 2. Generate timestamp
     * 3. Format message with colors and emojis
     * 4. Format plain message for file (no colors)
     * 5. Output to console if enabled
     * 6. Output to file if enabled
     * 
     * @param {string} level - Log level ('debug', 'info', 'warn', 'error', 'minecraft', 'discord', 'bridge', 'perf')
     * @param {...*} args - Message and optional additional arguments
     * 
     * @example
     * // Internal usage by other methods
     * this.log('info', 'Application started');
     * 
     * @example
     * // Direct usage with custom level
     * logger.log('minecraft', 'Custom Minecraft message');
     */
    log(level, ...args) {
        // Check if level should be displayed
        const levelPriority = this.levels[level] !== undefined ? this.levels[level] : 1;
        if (levelPriority < this.currentLevel) {
            return;
        }
        
        const timestamp = this.getTimestamp();
        const levelString = level.toUpperCase().padEnd(13);
        const emoji = this.emojis[level] || '';
        
        // Build message
        let message = this.formatMessage(timestamp, levelString, emoji, ...args);
        let plainMessage = this.formatMessage(timestamp, levelString, '', ...args); // No colors for file
        
        // Console log
        if (this.config.console) {
            this.logToConsole(level, message);
        }
        
        // File log
        if (this.config.file && this.fileLogger) {
            this.fileLogger.write(level, plainMessage);
        }
    }
    
    // ========== Formatting Methods ==========
    
    /**
     * Format log message
     * 
     * Formats a log message with timestamp, level, emoji, and content.
     * Automatically converts objects to JSON for readable output.
     * 
     * Format: [YYYY-MM-DD HH:MM:SS] EMOJI LEVEL Message content
     * 
     * @param {string} timestamp - ISO timestamp string
     * @param {string} level - Padded level string (e.g., 'INFO         ')
     * @param {string} emoji - Emoji character for log type
     * @param {...*} args - Message arguments to format
     * @returns {string} Formatted log message
     * 
     * @example
     * const msg = formatMessage('2025-09-30 14:30:00', 'INFO         ', 'ℹ️', 'Test');
     * // Returns: "[2025-09-30 14:30:00] ℹ️  INFO          Test"
     */
    formatMessage(timestamp, level, emoji, ...args) {
        // Process arguments
        const formattedArgs = args.map(arg => {
            if (typeof arg === 'object') {
                return JSON.stringify(arg, null, 2);
            }
            return String(arg);
        }).join(' ');
        
        return `[${timestamp}] ${emoji}  ${level} ${formattedArgs}`;
    }
    
    /**
     * Log message to console with colors
     * 
     * Outputs formatted message to console with ANSI color codes.
     * Routes errors and warnings to console.error(), others to console.log().
     * 
     * @param {string} level - Log level for color selection
     * @param {string} message - Formatted message to log
     * 
     * @example
     * // Internal usage
     * this.logToConsole('error', '[2025-09-30] ❌ ERROR Failed');
     */
    logToConsole(level, message) {
        const color = this.colors[level] || this.colors.info;
        const coloredMessage = `${color}${message}${this.colors.reset}`;
        
        // Use console.error for errors and warnings
        if (level === 'error' || level === 'warn') {
            console.error(coloredMessage);
        } else {
            console.log(coloredMessage);
        }
    }
    
    /**
     * Get current timestamp
     * 
     * Generates an ISO 8601 timestamp formatted for logging.
     * Format: YYYY-MM-DD HH:MM:SS
     * 
     * @returns {string} Formatted timestamp string
     * 
     * @example
     * const timestamp = this.getTimestamp();
     * // Returns: "2025-09-30 14:30:00"
     */
    getTimestamp() {
        const now = new Date();
        return now.toISOString().replace('T', ' ').substring(0, 19);
    }
    
    // ========== Level Management Methods ==========
    
    /**
     * Set log level
     * 
     * Changes the current logging level to filter messages by severity.
     * Invalid levels are rejected with a warning message.
     * 
     * Valid levels: 'debug', 'info', 'perf', 'warn', 'error'
     * 
     * @param {string} level - New log level to set
     * 
     * @example
     * logger.setLevel('debug'); // Show all messages
     * logger.setLevel('error'); // Show only errors
     */
    setLevel(level) {
        if (this.levels[level] !== undefined) {
            this.config.level = level;
            this.currentLevel = this.levels[level];
            this.info('Log level changed to:', level);
        } else {
            this.warn('Invalid log level:', level);
        }
    }
    
    /**
     * Get current log level
     * 
     * Returns the current logging level setting.
     * 
     * @returns {string} Current log level ('debug', 'info', 'warn', 'error')
     * 
     * @example
     * const level = logger.getLevel();
     * console.log('Current level:', level); // "info"
     */
    getLevel() {
        return this.config.level;
    }
    
    // ========== Utility Methods ==========
    
    /**
     * Log error with context and stack trace
     * 
     * Specialized error logging that extracts error message, stack trace,
     * and contextual information. Formats everything as a JSON object for
     * clear error reporting.
     * 
     * @param {Error} error - Error object to log
     * @param {string} [context=''] - Contextual description of where/why error occurred
     * 
     * @example
     * try {
     *   await riskyOperation();
     * } catch (error) {
     *   logger.logError(error, 'Failed during data processing');
     * }
     * 
     * @example
     * logger.logError(new Error('Timeout'), 'Database connection failed');
     */
    logError(error, context = '') {
        const errorInfo = {
            message: error.message,
            stack: error.stack,
            context: context
        };
        
        this.error('Error occurred:', errorInfo);
    }
    
    /**
     * Log performance timing
     * 
     * Logs performance metrics by calculating duration from start time.
     * Uses special 'perf' level with electric violet color and lightning emoji.
     * Useful for identifying bottlenecks and tracking operation performance.
     * 
     * @param {string} label - Description of the operation being timed
     * @param {number} startTime - Start timestamp from Date.now()
     * 
     * @example
     * const startTime = Date.now();
     * await processData();
     * logger.logPerformance('Data processing', startTime);
     * // Logs: "⚡ PERF Data processing: 1234ms"
     * 
     * @example
     * const start = Date.now();
     * for (let i = 0; i < 1000; i++) {
     *   // processing
     * }
     * logger.logPerformance('Loop iteration', start);
     */
    logPerformance(label, startTime) {
        const duration = Date.now() - startTime;
        const message = `${label}: ${duration}ms`;

        // Direct call to main log with 'perf' type
        this.log('perf', message);
    }

    /**
     * Log Minecraft connection event
     * 
     * Specialized logging for Minecraft bot connection status changes.
     * Automatically selects appropriate emoji based on status:
     * - ✅ for connected/success
     * - ❌ for disconnected/error/failed
     * - 🔄 for other statuses (connecting, reconnecting)
     * 
     * @param {string} guildId - Guild ID for the connection
     * @param {string} username - Bot username
     * @param {string} status - Connection status ('connected', 'disconnected', 'error', etc.)
     * @param {object} [details={}] - Additional connection details
     * 
     * @example
     * logger.logMinecraftConnection(
     *   'guild123',
     *   'BotAccount',
     *   'connected',
     *   { server: 'hypixel.net', attempt: 1 }
     * );
     * // Logs: "🎮 MINECRAFT ✅ [guild123] BotAccount - connected { server: 'hypixel.net', attempt: 1 }"
     * 
     * @example
     * logger.logMinecraftConnection('guild456', 'TestBot', 'disconnected', {
     *   reason: 'timeout'
     * });
     * // Logs: "🎮 MINECRAFT ❌ [guild456] TestBot - disconnected { reason: 'timeout' }"
     */
    logMinecraftConnection(guildId, username, status, details = {}) {
        const message = `[${guildId}] ${username} - ${status}`;
        
        if (status.includes('connected') || status.includes('success')) {
            this.minecraft('✅', message, details);
        } else if (status.includes('disconnected') || status.includes('error') || status.includes('failed')) {
            this.minecraft('❌', message, details);
        } else {
            this.minecraft('🔄', message, details);
        }
    }
    
    /**
     * Log bridge message transfer
     * 
     * Logs detailed information about messages being bridged between platforms.
     * Uses arrow notation to show message flow direction clearly.
     * 
     * @param {string} from - Source platform/guild ('Minecraft', 'Discord', guild name)
     * @param {string} to - Destination platform/guild
     * @param {string} username - Username of message sender
     * @param {string} message - Message content being bridged
     * 
     * @example
     * logger.logBridgeMessage('Guild1', 'Guild2', 'Player123', 'Hello world!');
     * // Logs: "🌉 BRIDGE Guild1 → Guild2 : Player123 : Hello world!"
     * 
     * @example
     * logger.logBridgeMessage('Minecraft', 'Discord', 'TestUser', 'Test message');
     * // Logs: "🌉 BRIDGE Minecraft → Discord : TestUser : Test message"
     */
    logBridgeMessage(from, to, username, message) {
        this.bridge(`${from} → ${to} : `, `${username} : `, message);
    }
    
    /**
     * Log Discord command execution
     * 
     * Logs Discord slash command and message command executions with user
     * and optional guild context. Useful for command usage tracking and auditing.
     * 
     * @param {string} userId - Discord user ID who executed command
     * @param {string} command - Command name and arguments
     * @param {string} [guildId=null] - Guild ID where command was executed (optional)
     * 
     * @example
     * logger.logDiscordCommand('123456789', '/guild promote Player', 'guild_abc');
     * // Logs: "💬 DISCORD Command executed: /guild promote Player by 123456789 [Guild: guild_abc]"
     * 
     * @example
     * logger.logDiscordCommand('987654321', '!help');
     * // Logs: "💬 DISCORD Command executed: !help by 987654321"
     */
    logDiscordCommand(userId, command, guildId = null) {
        const context = guildId ? `[Guild: ${guildId}]` : '';
        this.discord('Command executed:', `${command} by ${userId}`, context);
    }
}

module.exports = Logger;