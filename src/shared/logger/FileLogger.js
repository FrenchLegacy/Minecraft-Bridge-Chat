/**
 * File Logger - Rotating File-Based Logging System
 * 
 * This class provides a robust file-based logging system with automatic rotation,
 * cleanup, and separate error logging. It manages log files with daily rotation,
 * size-based rotation, and automatic cleanup of old files to prevent disk space issues.
 * 
 * The logger provides:
 * - Dual log file system (main logs + error-only logs)
 * - Automatic daily log rotation (new file per day)
 * - Size-based rotation (10MB limit per file)
 * - Automatic cleanup of old files (keeps 5 most recent)
 * - Error log segregation for easy debugging
 * - Recent log retrieval for monitoring
 * - Log statistics for file size tracking
 * - Fail-safe console fallback on write errors
 * 
 * File naming convention:
 * - Main logs: bridge-YYYY-MM-DD.log
 * - Error logs: bridge-YYYY-MM-DD-errors.log
 * - Rotated files: bridge-YYYY-MM-DD-TIMESTAMP.log
 * 
 * Rotation triggers:
 * 1. Daily rotation: New file created at midnight (date change)
 * 2. Size rotation: File exceeds 10MB limit
 * 
 * Directory structure:
 * data/logs/
 * ├── bridge-2025-09-30.log (current day main log)
 * ├── bridge-2025-09-30-errors.log (current day error log)
 * ├── bridge-2025-09-29.log (previous days)
 * └── bridge-2025-09-29-errors.log
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

const fs = require('fs');
const path = require('path');

/**
 * FileLogger - Rotating file-based logging system
 * 
 * Manages log file creation, rotation, cleanup, and retrieval with support for
 * both main logs and separate error logs. Implements automatic rotation based
 * on both date and file size.
 * 
 * @class
 */
class FileLogger {
	/**
	 * Create a new FileLogger instance
	 * 
	 * Initializes the logger with default settings and creates the log directory
	 * if it doesn't exist. Sets up paths for current day's log files.
	 * 
	 * Default configuration:
	 * - Log directory: data/logs/
	 * - Max file size: 10MB (10 * 1024 * 1024 bytes)
	 * - Max files kept: 5 most recent files
	 * - Daily rotation: Enabled (based on date change)
	 * 
	 * @example
	 * const fileLogger = new FileLogger();
	 * fileLogger.write('info', '[INFO] Application started');
	 */
	constructor() {
		this.logDir = path.join(__dirname, '../../../data/logs');
		this.maxFileSize = 10 * 1024 * 1024; // 10MB
		this.maxFiles = 5;
		
		this.ensureLogDirectory();
		this.currentLogFile = this.getLogFileName();
		this.currentErrorLogFile = this.getErrorLogFileName();
	}
	
	/**
	 * Ensure log directory exists
	 * 
	 * Creates the log directory and all parent directories if they don't exist.
	 * Uses recursive creation to handle nested directory structures.
	 * 
	 * @example
	 * // Internal usage during initialization
	 * this.ensureLogDirectory();
	 */
	ensureLogDirectory() {
		if (!fs.existsSync(this.logDir)) {
			fs.mkdirSync(this.logDir, { recursive: true });
		}
	}
	
	/**
	 * Get log file name for current date
	 * 
	 * Generates the main log file path based on current date in ISO format.
	 * File name format: bridge-YYYY-MM-DD.log
	 * 
	 * @returns {string} Full path to current day's main log file
	 * 
	 * @example
	 * const logFile = this.getLogFileName();
	 * // Returns: "/path/to/data/logs/bridge-2025-09-30.log"
	 */
	getLogFileName() {
		const date = new Date();
		const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
		return path.join(this.logDir, `bridge-${dateString}.log`);
	}
	
	/**
	 * Get error log file name for current date
	 * 
	 * Generates the error log file path based on current date in ISO format.
	 * File name format: bridge-YYYY-MM-DD-errors.log
	 * 
	 * @returns {string} Full path to current day's error log file
	 * 
	 * @example
	 * const errorLogFile = this.getErrorLogFileName();
	 * // Returns: "/path/to/data/logs/bridge-2025-09-30-errors.log"
	 */
	getErrorLogFileName() {
		const date = new Date();
		const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
		return path.join(this.logDir, `bridge-${dateString}-errors.log`);
	}
	
	/**
	 * Write log entry to file
	 * 
	 * Main logging method that writes messages to appropriate log files. Handles
	 * daily rotation, size-based rotation, and dual-file logging for errors.
	 * Falls back to console logging if file write fails.
	 * 
	 * Process flow:
	 * 1. Check for date change and update file paths if needed
	 * 2. Check file sizes and rotate if needed (>10MB)
	 * 3. Append message to main log file
	 * 4. If error level, also append to error log file
	 * 5. On failure, log to console as fallback
	 * 
	 * @param {string} level - Log level ('info', 'warn', 'error', 'debug', etc.)
	 * @param {string} message - Formatted log message to write
	 * 
	 * @example
	 * fileLogger.write('info', '[2025-09-30 14:30:00] [INFO] Application started');
	 * fileLogger.write('error', '[2025-09-30 14:30:01] [ERROR] Connection failed');
	 */
	write(level, message) {
		try {
			// Check if we need a new file (new day)
			const currentFileName = this.getLogFileName();
			const currentErrorFileName = this.getErrorLogFileName();
			
			if (currentFileName !== this.currentLogFile) {
				this.currentLogFile = currentFileName;
			}
			
			if (currentErrorFileName !== this.currentErrorLogFile) {
				this.currentErrorLogFile = currentErrorFileName;
			}
			
			// Check file size and rotate if needed
			this.rotateIfNeeded();
			
			// Write message to main log file
			const logEntry = `${message}\n`;
			fs.appendFileSync(this.currentLogFile, logEntry, 'utf8');
			
			// If it's an error, also write to error log file
			if (level === 'error') {
				fs.appendFileSync(this.currentErrorLogFile, logEntry, 'utf8');
			}
			
		} catch (error) {
			// In case of write error, log to console only
			console.error('Failed to write to log file:', error.message);
		}
	}
	
	/**
	 * Check if rotation is needed and rotate if necessary
	 * 
	 * Checks both main and error log files against the maximum file size limit.
	 * Triggers rotation for any file that exceeds the 10MB limit. This method
	 * is called before every write operation to ensure files don't grow too large.
	 * 
	 * @example
	 * // Internal usage before each write
	 * this.rotateIfNeeded();
	 */
	rotateIfNeeded() {
		try {
			// Check and rotate main log file
			if (fs.existsSync(this.currentLogFile)) {
				const stats = fs.statSync(this.currentLogFile);
				if (stats.size > this.maxFileSize) {
					this.rotateLogFile(this.currentLogFile, false);
				}
			}
			
			// Check and rotate error log file
			if (fs.existsSync(this.currentErrorLogFile)) {
				const errorStats = fs.statSync(this.currentErrorLogFile);
				if (errorStats.size > this.maxFileSize) {
					this.rotateLogFile(this.currentErrorLogFile, true);
				}
			}
		} catch (error) {
			console.error('Error checking log file size:', error.message);
		}
	}
	
	/**
	 * Rotate log file by renaming with timestamp
	 * 
	 * Performs file rotation by renaming the current log file with an ISO timestamp.
	 * Creates a snapshot of the current file before it grows too large or the day changes.
	 * After rotation, triggers cleanup to maintain the maximum file count limit.
	 * 
	 * Rotation process:
	 * 1. Generate timestamp in ISO format with special characters replaced
	 * 2. Create rotated file name: original-TIMESTAMP.log
	 * 3. Rename current file to rotated name
	 * 4. Trigger cleanup of old files
	 * 
	 * @param {string} filePath - Full path to file to rotate
	 * @param {boolean} [isErrorFile=false] - Whether this is an error log file
	 * 
	 * @example
	 * // Internal usage when file exceeds size limit
	 * this.rotateLogFile('/path/to/bridge-2025-09-30.log', false);
	 * // Creates: bridge-2025-09-30-2025-09-30T14-30-00-123Z.log
	 */
	rotateLogFile(filePath, isErrorFile = false) {
		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const rotatedFileName = filePath.replace('.log', `-${timestamp}.log`);
			
			// Rename current file
			fs.renameSync(filePath, rotatedFileName);
			
			// Clean old files (both regular and error files)
			this.cleanOldLogFiles();
			
		} catch (error) {
			console.error('Error rotating log file:', error.message);
		}
	}
	
	/**
	 * Clean old log files for both types
	 * 
	 * Triggers cleanup for both regular and error log files. Delegates actual
	 * cleanup to cleanOldLogFilesByPattern() for each file type.
	 * 
	 * Cleanup targets:
	 * - Regular logs: bridge-*.log
	 * - Error logs: bridge-*-errors.log
	 * 
	 * @example
	 * // Internal usage after file rotation
	 * this.cleanOldLogFiles();
	 */
	cleanOldLogFiles() {
		try {
			// Clean regular log files
			this.cleanOldLogFilesByPattern('bridge-', '.log');
			
			// Clean error log files
			this.cleanOldLogFilesByPattern('bridge-', '-errors.log');
			
		} catch (error) {
			console.error('Error cleaning old log files:', error.message);
		}
	}
	
	/**
	 * Clean old log files by pattern
	 * 
	 * Removes old log files that exceed the maximum file count limit (5 files).
	 * Files are sorted by modification time (newest first), and only the 5 most
	 * recent files are kept. Older files are permanently deleted.
	 * 
	 * Algorithm:
	 * 1. List all files matching prefix and suffix
	 * 2. Get modification time for each file
	 * 3. Sort by modification time (newest first)
	 * 4. Keep maxFiles (5) most recent
	 * 5. Delete all older files
	 * 
	 * @param {string} prefix - File name prefix to match (e.g., 'bridge-')
	 * @param {string} suffix - File name suffix to match (e.g., '.log', '-errors.log')
	 * 
	 * @example
	 * // Clean regular log files
	 * this.cleanOldLogFilesByPattern('bridge-', '.log');
	 * // Keeps 5 newest, deletes older
	 * 
	 * @example
	 * // Clean error log files
	 * this.cleanOldLogFilesByPattern('bridge-', '-errors.log');
	 */
	cleanOldLogFilesByPattern(prefix, suffix) {
		try {
			const files = fs.readdirSync(this.logDir)
				.filter(file => file.startsWith(prefix) && file.endsWith(suffix))
				.map(file => ({
					name: file,
					path: path.join(this.logDir, file),
					mtime: fs.statSync(path.join(this.logDir, file)).mtime
				}))
				.sort((a, b) => b.mtime - a.mtime);
			
			// Delete excess files
			if (files.length > this.maxFiles) {
				const filesToDelete = files.slice(this.maxFiles);
				filesToDelete.forEach(file => {
					try {
						fs.unlinkSync(file.path);
					} catch (deleteError) {
						console.error('Error deleting old log file:', deleteError.message);
					}
				});
			}
		} catch (error) {
			console.error(`Error cleaning old log files with pattern ${prefix}*${suffix}:`, error.message);
		}
	}
	
	/**
	 * Get recent logs from main log file
	 * 
	 * Retrieves the last N lines from the current main log file for monitoring
	 * or debugging purposes. Returns empty array if file doesn't exist or on error.
	 * 
	 * @param {number} [lines=100] - Number of most recent lines to retrieve
	 * @returns {string[]} Array of log lines (most recent last)
	 * 
	 * @example
	 * const recentLogs = fileLogger.getRecentLogs(50);
	 * recentLogs.forEach(line => console.log(line));
	 * 
	 * @example
	 * // Get last 10 lines
	 * const lastTen = fileLogger.getRecentLogs(10);
	 * console.log('Most recent log:', lastTen[lastTen.length - 1]);
	 */
	getRecentLogs(lines = 100) {
		try {
			if (!fs.existsSync(this.currentLogFile)) {
				return [];
			}
			
			const content = fs.readFileSync(this.currentLogFile, 'utf8');
			const allLines = content.split('\n').filter(line => line.trim());
			
			return allLines.slice(-lines);
		} catch (error) {
			console.error('Error reading log file:', error.message);
			return [];
		}
	}
	
	/**
	 * Get recent error logs from error log file
	 * 
	 * Retrieves the last N lines from the current error log file for quick error
	 * analysis. Returns empty array if file doesn't exist or on error.
	 * 
	 * @param {number} [lines=100] - Number of most recent error lines to retrieve
	 * @returns {string[]} Array of error log lines (most recent last)
	 * 
	 * @example
	 * const recentErrors = fileLogger.getRecentErrorLogs(25);
	 * if (recentErrors.length > 0) {
	 *   console.log('Latest errors:', recentErrors);
	 * }
	 * 
	 * @example
	 * // Check for recent errors
	 * const errors = fileLogger.getRecentErrorLogs(5);
	 * if (errors.length > 0) {
	 *   console.warn(`Found ${errors.length} recent errors`);
	 * }
	 */
	getRecentErrorLogs(lines = 100) {
		try {
			if (!fs.existsSync(this.currentErrorLogFile)) {
				return [];
			}
			
			const content = fs.readFileSync(this.currentErrorLogFile, 'utf8');
			const allLines = content.split('\n').filter(line => line.trim());
			
			return allLines.slice(-lines);
		} catch (error) {
			console.error('Error reading error log file:', error.message);
			return [];
		}
	}
	
	/**
	 * Get current log file paths
	 * 
	 * Returns paths to current main and error log files. Useful for external
	 * monitoring tools or debugging utilities that need direct file access.
	 * 
	 * @returns {object} Object containing log file paths
	 * @returns {string} return.main - Path to current main log file
	 * @returns {string} return.errors - Path to current error log file
	 * 
	 * @example
	 * const paths = fileLogger.getCurrentLogFiles();
	 * console.log('Main log:', paths.main);
	 * console.log('Error log:', paths.errors);
	 * // Main log: /path/to/data/logs/bridge-2025-09-30.log
	 * // Error log: /path/to/data/logs/bridge-2025-09-30-errors.log
	 */
	getCurrentLogFiles() {
		return {
			main: this.currentLogFile,
			errors: this.currentErrorLogFile
		};
	}
	
	/**
	 * Get log statistics
	 * 
	 * Retrieves statistics about current log files including existence and size.
	 * Useful for monitoring disk usage and determining when rotation will occur.
	 * 
	 * Statistics include:
	 * - File existence status
	 * - Current file size in bytes
	 * - Applies to both main and error log files
	 * 
	 * @returns {object} Log statistics object
	 * @returns {object} return.main - Main log file statistics
	 * @returns {boolean} return.main.exists - Whether main log file exists
	 * @returns {number} return.main.size - Size of main log file in bytes
	 * @returns {object} return.errors - Error log file statistics
	 * @returns {boolean} return.errors.exists - Whether error log file exists
	 * @returns {number} return.errors.size - Size of error log file in bytes
	 * 
	 * @example
	 * const stats = fileLogger.getLogStats();
	 * console.log('Main log size:', (stats.main.size / 1024 / 1024).toFixed(2), 'MB');
	 * console.log('Error log size:', (stats.errors.size / 1024 / 1024).toFixed(2), 'MB');
	 * 
	 * @example
	 * // Check if rotation is approaching
	 * const stats = fileLogger.getLogStats();
	 * const maxSize = 10 * 1024 * 1024; // 10MB
	 * if (stats.main.size > maxSize * 0.9) {
	 *   console.warn('Main log file is 90% full, rotation soon');
	 * }
	 */
	getLogStats() {
		const stats = {
			main: { exists: false, size: 0 },
			errors: { exists: false, size: 0 }
		};
		
		try {
			if (fs.existsSync(this.currentLogFile)) {
				stats.main.exists = true;
				stats.main.size = fs.statSync(this.currentLogFile).size;
			}
			
			if (fs.existsSync(this.currentErrorLogFile)) {
				stats.errors.exists = true;
				stats.errors.size = fs.statSync(this.currentErrorLogFile).size;
			}
		} catch (error) {
			console.error('Error getting log stats:', error.message);
		}
		
		return stats;
	}
}

module.exports = FileLogger;