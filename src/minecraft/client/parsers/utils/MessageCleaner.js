/**
 * Message Cleaner - Text Cleaning and Normalization Utility
 * 
 * This file provides comprehensive text cleaning and normalization utilities for
 * Minecraft messages. It handles removal of color codes, control characters, URLs,
 * and other unwanted content while preserving message readability across different
 * platforms (Minecraft, Discord, etc.).
 * 
 * Key responsibilities:
 * - Minecraft color code removal (§ and & formats)
 * - Control character stripping
 * - Special character normalization
 * - URL and IP address filtering
 * - Whitespace normalization
 * - Message length truncation
 * - Platform-specific cleaning (Discord, Minecraft)
 * - Discord markdown handling
 * - Text extraction from complex message objects
 * 
 * Cleaning features:
 * - Color codes: Removes §[0-9a-fklmnor] and &[0-9a-fklmnor] patterns
 * - Formatting codes: Handles bold, italic, obfuscated, reset codes
 * - Control characters: Strips non-printable ASCII characters
 * - URLs: Replaces with [URL], [DISCORD], [IP] placeholders
 * - Whitespace: Normalizes multiple spaces, removes leading/trailing
 * - Characters: Converts smart quotes, dashes, special spaces
 * - Truncation: Intelligent word-boundary breaking with ellipsis
 * 
 * Platform compatibility:
 * - Discord: Removes Minecraft codes, escapes/removes markdown, 2000 char limit
 * - Minecraft: Removes Discord markdown, normalizes text, 256 char limit
 * 
 * Message format support:
 * - Plain strings
 * - Minecraft message objects (toString())
 * - JSON message objects (text, extra array, message, content properties)
 * - Complex chat component structures
 * 
 * Configuration options:
 * - removeColorCodes: Enable/disable color code removal
 * - removeFormatting: Enable/disable formatting code removal
 * - stripUrls: Enable/disable URL filtering
 * - normalizeWhitespace: Enable/disable whitespace normalization
 * - escapeDiscordMarkdown: Enable/disable Discord markdown escaping
 * - maxLength: Maximum message length before truncation
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Specific Imports
const logger = require("../../../../shared/logger")

/**
 * MessageCleaner - Cleans and normalizes Minecraft messages
 * 
 * Provides comprehensive text cleaning utilities for Minecraft messages,
 * handling color codes, control characters, URLs, and platform-specific formatting.
 * 
 * @class
 */
class MessageCleaner {
    /**
     * Initialize the message cleaner with configuration
     * 
     * Sets up cleaning patterns, character mappings, and configuration options.
     * Automatically initializes all cleaning patterns on construction.
     * 
     * @param {object} config - Cleaner configuration
     * @param {boolean} [config.removeColorCodes=true] - Remove Minecraft color codes
     * @param {boolean} [config.removeFormatting=true] - Remove formatting codes
     * @param {boolean} [config.stripUrls=true] - Remove URLs from messages
     * @param {boolean} [config.normalizeWhitespace=true] - Normalize whitespace
     * @param {boolean} [config.escapeDiscordMarkdown=false] - Escape Discord markdown
     * @param {number} [config.maxLength=2000] - Maximum message length
     * 
     * @example
     * const cleaner = new MessageCleaner({
     *   removeColorCodes: true,
     *   stripUrls: true,
     *   maxLength: 256
     * });
     */
    constructor(config) {
        this.config = config;

        this.colorCodePatterns = {};
        this.cleaningPatterns = {};
        this.characterMappings = {};

        this.initializeCleaner();
    }

    /**
     * Initialize cleaning patterns and mappings
     * 
     * Sets up:
     * - Minecraft color code patterns (§ and & formats)
     * - Text cleaning patterns (whitespace, control chars, URLs)
     * - Special character mappings for normalization
     * 
     * Patterns include:
     * - Color codes: §[0-9a-f] and &[0-9a-f]
     * - Formatting: §[klmnor] (obfuscated, bold, strikethrough, etc.)
     * - Control characters: Non-printable ASCII
     * - URLs: HTTP/HTTPS, Discord invites, IP addresses
     * - Whitespace: Multiple spaces, leading/trailing
     * - Characters: Smart quotes, dashes, special spaces
     * 
     * @returns {Promise<void>}
     * 
     * @example
     * await cleaner.initializeCleaner();
     */
    async initializeCleaner() {
        // Minecraft color code patterns
        this.colorCodePatterns = {
            // Standard color codes (§0-9, §a-f)
            colorCodes: /§[0-9a-f]/g,
            
            // Formatting codes (§k, §l, §m, §n, §o, §r)
            formattingCodes: /§[klmnor]/g,
            
            // All codes combined
            allCodes: /§[0-9a-fklmnor]/g,
            
            // Alternative color code format (&)
            ampersandCodes: /&[0-9a-fklmnor]/g
        };

        // Text cleaning patterns
        this.cleaningPatterns = {
            // Multiple whitespace
            multipleSpaces: /\s+/g,
            
            // Leading/trailing whitespace
            trimWhitespace: /^\s+|\s+$/g,
            
            // Control characters (except newlines and tabs)
            controlChars: /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g,
            
            // URLs
            urls: /https?:\/\/[^\s]+/gi,
            
            // Discord invites
            discordInvites: /discord\.gg\/[^\s]+/gi,
            
            // IP addresses
            ipAddresses: /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g
        };

        // Special character mappings for normalization
        this.characterMappings = {
            // Smart quotes
            '“': '"', // opening double quote
            '”': '"', // closing double quote
            '‘': "'", // opening single quote
            '’': "'", // closing single quote

            // Dashes
            '–': '-', // en-dash
            '—': '-', // em-dash

            // Spaces
            '\u00A0': ' ', // Non-breaking space
            '　': ' ',     // Full-width space
        };
    }

    /**
     * Clean a raw Minecraft message
     * 
     * Main entry point for message cleaning. Applies full cleaning pipeline:
     * 1. Extract text from various message formats
     * 2. Remove Minecraft color codes
     * 3. Remove control characters
     * 4. Normalize special characters
     * 5. Remove URLs (if enabled)
     * 6. Normalize whitespace (if enabled)
     * 7. Truncate to max length
     * 8. Trim result
     * 
     * Handles errors gracefully with fallback to truncated raw string.
     * 
     * @param {string|object} rawMessage - Raw message from Minecraft client
     * @returns {string} Cleaned message text
     * 
     * @example
     * const cleaned = cleaner.cleanMessage("§aGuild > §r§b[MVP+] Player§r: §fHello!");
     * // Returns: "Guild > [MVP+] Player: Hello!"
     * 
     * @example
     * const cleaned = cleaner.cleanMessage(minecraftMessageObject);
     * // Extracts and cleans text from complex message object
     */
    cleanMessage(rawMessage) {
        try {
            // Convert message to string
            let messageText = this.extractMessageText(rawMessage);
            
            // Apply cleaning steps in order
            messageText = this.removeMinecraftColorCodes(messageText);
            messageText = this.removeControlCharacters(messageText);
            messageText = this.normalizeCharacters(messageText);    

            if (this.config.stripUrls) {
                messageText = this.removeUrls(messageText);
            }
            
            if (this.config.normalizeWhitespace) {
                messageText = this.normalizeWhitespace(messageText);
            }
            
            messageText = this.truncateMessage(messageText);
            
            const result = messageText.trim();
            
            return result;
            
        } catch (error) {
            logger.logError(error, 'Error cleaning message');
            // Return a safe fallback
            return String(rawMessage).substring(0, 100);
        }
    }

    /**
     * Clean message content only (for already parsed messages)
     * 
     * Lighter cleaning for message content that has already been extracted.
     * Applies selective cleaning based on configuration:
     * - Color code removal (if enabled)
     * - Formatting removal (if enabled)
     * - Character normalization
     * - URL removal (if enabled)
     * - Whitespace normalization (if enabled)
     * 
     * Used for cleaning extracted message content after parsing.
     * 
     * @param {string} messageContent - Message content to clean
     * @returns {string} Cleaned message content
     * 
     * @example
     * const cleaned = cleaner.cleanMessageContent("§bHello §lworld!");
     * // Returns: "Hello world!" (if removeFormatting enabled)
     */
    cleanMessageContent(messageContent) {
        if (!messageContent || typeof messageContent !== 'string') {
            return '';
        }

        let cleaned = messageContent;
        
        // Remove color codes if enabled
        if (this.config.removeColorCodes) {
            cleaned = this.removeMinecraftColorCodes(cleaned);
        }
        
        // Remove formatting if enabled
        if (this.config.removeFormatting) {
            cleaned = this.removeFormatting(cleaned);
        }
        
        // Normalize characters
        cleaned = this.normalizeCharacters(cleaned);
        
        // Strip URLs if enabled
        if (this.config.stripUrls) {
            cleaned = this.removeUrls(cleaned);
        }
        
        // Normalize whitespace
        if (this.config.normalizeWhitespace) {
            cleaned = this.normalizeWhitespace(cleaned);
        }
        
        return cleaned.trim();
    }

    /**
     * Extract text from various message formats
     * 
     * Handles multiple message formats from Minecraft client:
     * 1. Plain strings (returned as-is)
     * 2. Objects with toString() method (Minecraft message objects)
     * 3. JSON objects with text property
     * 4. JSON objects with extra array (complex messages)
     * 5. Objects with message or content properties
     * 6. JSON stringified format (fallback)
     * 
     * Extraction priority:
     * 1. toString() method (if meaningful result)
     * 2. text property
     * 3. extra array concatenation
     * 4. message property
     * 5. content property
     * 6. JSON string extraction
     * 7. String conversion (final fallback)
     * 
     * @param {string|object} rawMessage - Raw message in any format
     * @returns {string} Extracted text string
     * 
     * @example
     * const text = cleaner.extractMessageText("Simple string");
     * // Returns: "Simple string"
     * 
     * @example
     * const text = cleaner.extractMessageText({
     *   text: "Hello",
     *   extra: [{ text: " world" }]
     * });
     * // Returns: "Hello world"
     */
    extractMessageText(rawMessage) {
        // If already a string, return as-is
        if (typeof rawMessage === 'string') {
            return rawMessage;
        }
        
        // Handle JSON message objects from Minecraft client
        if (rawMessage && typeof rawMessage === 'object') {
            try {
                // FIRST: Try toString() method - this often works for Minecraft message objects
                const stringified = rawMessage.toString();
                
                if (stringified && stringified !== '[object Object]' && stringified.length > 4) {
                    return stringified;
                }
                
                // Try to extract from 'text' property
                if (rawMessage.text) {
                    return rawMessage.text;
                }
                
                // Try to extract from 'extra' array (complex messages)
                if (rawMessage.extra && Array.isArray(rawMessage.extra)) {
                    let fullText = rawMessage.text || '';
                    
                    for (const part of rawMessage.extra) {
                        if (part.text) {
                            fullText += part.text;
                        }
                    }
                    
                    if (fullText.length > 0) {
                        return fullText;
                    }
                }
                
                // Try other common message properties
                if (rawMessage.message) {
                    return rawMessage.message;
                }
                
                if (rawMessage.content) {
                    return rawMessage.content;
                }
                
                // Try JSON.stringify as fallback - but clean it up
                const jsonString = JSON.stringify(rawMessage);
                
                if (jsonString && jsonString !== '{}') {
                    // Try to extract readable text from JSON
                    const textMatch = jsonString.match(/"text":"([^"]+)"/);
                    if (textMatch) {
                        return textMatch[1];
                    }
                    return jsonString;
                }
            } catch (error) {
                logger.debug('Error extracting text from message object:', error.message);
            }
        }
        
        // Final fallback - convert to string
        const fallback = String(rawMessage || '');
        return fallback;
    }

    /**
     * Remove Minecraft color codes from text
     * 
     * Removes all Minecraft color formatting:
     * - Standard format: §[0-9a-fklmnor]
     * - Alternative format: &[0-9a-fklmnor]
     * 
     * Color codes (§0-§f):
     * - §0-§9: Colors 0-9
     * - §a-§f: Colors 10-15
     * 
     * Formatting codes:
     * - §k: Obfuscated
     * - §l: Bold
     * - §m: Strikethrough
     * - §n: Underline
     * - §o: Italic
     * - §r: Reset
     * 
     * @param {string} text - Text with color codes
     * @returns {string} Text without color codes
     * 
     * @example
     * const cleaned = cleaner.removeMinecraftColorCodes("§aGreen §lbold §rtext");
     * // Returns: "Green bold text"
     */
    removeMinecraftColorCodes(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        // Remove standard Minecraft color codes (§)
        text = text.replace(this.colorCodePatterns.allCodes, '');
        
        // Remove alternative color codes (&) if present
        text = text.replace(this.colorCodePatterns.ampersandCodes, '');
        
        return text;
    }

    /**
     * Remove formatting codes specifically
     * 
     * Removes only formatting codes, preserving color codes:
     * - §k: Obfuscated
     * - §l: Bold
     * - §m: Strikethrough
     * - §n: Underline
     * - §o: Italic
     * - §r: Reset
     * 
     * Useful when you want to remove formatting but keep colors.
     * 
     * @param {string} text - Text with formatting codes
     * @returns {string} Text without formatting codes
     * 
     * @example
     * const cleaned = cleaner.removeFormatting("§a§lBold green");
     * // Returns: "§agreen" (color preserved, bold removed)
     */
    removeFormatting(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        return text.replace(this.colorCodePatterns.formattingCodes, '');
    }

    /**
     * Remove control characters from text
     * 
     * Removes non-printable ASCII control characters while preserving:
     * - Newlines (\n)
     * - Tabs (\t)
     * - Carriage returns (\r)
     * 
     * Removes characters in ranges:
     * - \x00-\x08: NULL through BACKSPACE
     * - \x0B-\x0C: Vertical tab, form feed
     * - \x0E-\x1F: Other control characters
     * - \x7F: DELETE
     * 
     * @param {string} text - Text with control characters
     * @returns {string} Text without control characters
     * 
     * @example
     * const cleaned = cleaner.removeControlCharacters("Hello\x00\x01World");
     * // Returns: "HelloWorld"
     */
    removeControlCharacters(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        return text.replace(this.cleaningPatterns.controlChars, '');
    }

    /**
     * Normalize special characters
     * 
     * Converts special Unicode characters to standard ASCII equivalents:
     * - Smart quotes → Standard quotes
     * - En/em dashes → Standard hyphens
     * - Special spaces → Regular spaces
     * 
     * Character mappings:
     * - " " (U+201C, U+201D) → " (ASCII quote)
     * - ' ' (U+2018, U+2019) → ' (ASCII apostrophe)
     * - – — (en-dash, em-dash) → - (ASCII hyphen)
     * - \u00A0 　 (non-breaking, full-width) → (ASCII space)
     * 
     * @param {string} text - Text to normalize
     * @returns {string} Normalized text with ASCII characters
     * 
     * @example
     * const normalized = cleaner.normalizeCharacters("Hello "world"");
     * // Returns: 'Hello "world"'
     */
    normalizeCharacters(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        let normalized = text;
        
        // Apply character mappings
        for (const [from, to] of Object.entries(this.characterMappings)) {
            normalized = normalized.replace(new RegExp(from, 'g'), to);
        }
        
        return normalized;
    }

    /**
     * Remove URLs from text
     * 
     * Replaces URLs and sensitive addresses with placeholders:
     * - HTTP/HTTPS URLs → [URL]
     * - Discord invites → [DISCORD]
     * - IP addresses → [IP]
     * 
     * Patterns matched:
     * - https?://[^\s]+ (HTTP/HTTPS URLs)
     * - discord.gg/[^\s]+ (Discord invites)
     * - \d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:port)? (IP addresses)
     * 
     * @param {string} text - Text with URLs
     * @returns {string} Text with URL placeholders
     * 
     * @example
     * const cleaned = cleaner.removeUrls("Visit https://example.com");
     * // Returns: "Visit [URL]"
     * 
     * @example
     * const cleaned = cleaner.removeUrls("Join discord.gg/abc123");
     * // Returns: "Join [DISCORD]"
     */
    removeUrls(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        // Remove HTTP/HTTPS URLs
        text = text.replace(this.cleaningPatterns.urls, '[URL]');
        
        // Remove Discord invites
        text = text.replace(this.cleaningPatterns.discordInvites, '[DISCORD]');
        
        // Remove IP addresses if configured
        text = text.replace(this.cleaningPatterns.ipAddresses, '[IP]');
        
        return text;
    }

    /**
     * Normalize whitespace in text
     * 
     * Normalizes all whitespace:
     * - Replaces multiple spaces with single space
     * - Removes leading whitespace
     * - Removes trailing whitespace
     * - Preserves single spaces between words
     * 
     * @param {string} text - Text to normalize
     * @returns {string} Text with normalized whitespace
     * 
     * @example
     * const normalized = cleaner.normalizeWhitespace("  Hello    world  ");
     * // Returns: "Hello world"
     */
    normalizeWhitespace(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        // Replace multiple spaces with single space
        text = text.replace(this.cleaningPatterns.multipleSpaces, ' ');
        
        // Remove leading and trailing whitespace
        text = text.replace(this.cleaningPatterns.trimWhitespace, '');
        
        return text;
    }

    /**
     * Truncate message to maximum length
     * 
     * Intelligently truncates long messages:
     * 1. Returns as-is if within limit
     * 2. Truncates to maxLength - 3 for ellipsis
     * 3. Attempts word-boundary break (last space in final 20%)
     * 4. Adds "..." ellipsis
     * 
     * Word boundary logic:
     * - Finds last space in final 20% of truncated text
     * - Breaks at word boundary if space found
     * - Otherwise breaks at character limit
     * 
     * @param {string} text - Text to truncate
     * @returns {string} Truncated text with ellipsis if needed
     * 
     * @example
     * const truncated = cleaner.truncateMessage("Very long message...", { maxLength: 20 });
     * // Returns: "Very long mes..." (breaks at word if possible)
     */
    truncateMessage(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        if (text.length <= this.config.maxLength) {
            return text;
        }

        // Truncate and add ellipsis
        const truncated = text.substring(0, this.config.maxLength - 3);
        
        // Try to break at word boundary
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > this.config.maxLength * 0.8) {
            return truncated.substring(0, lastSpace) + '...';
        }
        
        return truncated + '...';
    }

    /**
     * Check if text contains color codes
     * 
     * Tests for presence of Minecraft color codes in either format:
     * - Standard format: §[0-9a-fklmnor]
     * - Alternative format: &[0-9a-fklmnor]
     * 
     * @param {string} text - Text to check
     * @returns {boolean} Whether text contains color codes
     * 
     * @example
     * cleaner.hasColorCodes("§aGreen text");  // true
     * cleaner.hasColorCodes("Plain text");     // false
     */
    hasColorCodes(text) {
        if (!text || typeof text !== 'string') {
            return false;
        }

        return this.colorCodePatterns.allCodes.test(text) || 
               this.colorCodePatterns.ampersandCodes.test(text);
    }

    /**
     * Extract color codes from text
     * 
     * Finds and returns all standard format color codes (§ format).
     * Does not include alternative & format codes.
     * 
     * @param {string} text - Text to extract codes from
     * @returns {Array<string>} Array of found color codes
     * 
     * @example
     * const codes = cleaner.extractColorCodes("§aGreen §bblue §lbold");
     * // Returns: ["§a", "§b", "§l"]
     */
    extractColorCodes(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const codes = [];
        
        // Find standard color codes
        let match;
        const regex = /§[0-9a-fklmnor]/g;
        while ((match = regex.exec(text)) !== null) {
            codes.push(match[0]);
        }
        
        return codes;
    }

    /**
     * Get text length without color codes
     * 
     * Calculates the visible length of text by removing color codes
     * before measuring. Useful for length validation and display.
     * 
     * @param {string} text - Text to measure
     * @returns {number} Length without color codes
     * 
     * @example
     * const length = cleaner.getCleanLength("§aGreen §btext");
     * // Returns: 10 (not 16)
     */
    getCleanLength(text) {
        if (!text || typeof text !== 'string') {
            return 0;
        }

        const cleaned = this.removeMinecraftColorCodes(text);
        return cleaned.length;
    }

    /**
     * Clean text for Discord compatibility
     * 
     * Prepares text for Discord by:
     * 1. Removing Minecraft color codes
     * 2. Escaping Discord markdown (if enabled)
     * 3. Normalizing whitespace
     * 4. Truncating to 2000 characters (Discord limit)
     * 
     * Discord character limit: 2000 characters
     * 
     * @param {string} text - Text to clean for Discord
     * @returns {string} Discord-compatible text
     * 
     * @example
     * const discordText = cleaner.cleanForDiscord("§aGreen **bold** text");
     * // Returns: "Green **bold** text" (or escaped if configured)
     */
    cleanForDiscord(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        let cleaned = text;
        
        // Remove Minecraft color codes
        cleaned = this.removeMinecraftColorCodes(cleaned);
        
        // Escape Discord markdown if needed
        if (this.config.escapeDiscordMarkdown) {
            cleaned = this.escapeDiscordMarkdown(cleaned);
        }
        
        // Normalize whitespace
        cleaned = this.normalizeWhitespace(cleaned);
        
        // Discord has a 2000 character limit
        const discordLimit = Math.min(this.config.maxLength, 2000);
        if (cleaned.length > discordLimit) {
            cleaned = cleaned.substring(0, discordLimit - 3) + '...';
        }
        
        return cleaned;
    }

    /**
     * Clean text for Minecraft compatibility
     * 
     * Prepares text for Minecraft by:
     * 1. Removing Discord markdown
     * 2. Normalizing whitespace
     * 3. Truncating to 256 characters (Minecraft limit)
     * 
     * Minecraft chat limit: 256 characters (typical)
     * 
     * @param {string} text - Text to clean for Minecraft
     * @returns {string} Minecraft-compatible text
     * 
     * @example
     * const mcText = cleaner.cleanForMinecraft("**Bold** text from Discord");
     * // Returns: "Bold text from Discord"
     */
    cleanForMinecraft(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        let cleaned = text;
        
        // Remove Discord markdown
        cleaned = this.removeDiscordMarkdown(cleaned);
        
        // Normalize whitespace
        cleaned = this.normalizeWhitespace(cleaned);
        
        // Minecraft typically has a 256 character limit
        const minecraftLimit = Math.min(this.config.maxLength, 256);
        if (cleaned.length > minecraftLimit) {
            cleaned = cleaned.substring(0, minecraftLimit - 3) + '...';
        }
        
        return cleaned;
    }

    /**
     * Escape Discord markdown characters
     * 
     * Escapes special Discord markdown characters to prevent formatting:
     * - * (italic/bold)
     * - _ (italic/underline)
     * - ` (inline code)
     * - ~ (strikethrough)
     * - | (spoiler)
     * - \ (escape character)
     * 
     * @param {string} text - Text to escape
     * @returns {string} Text with escaped markdown
     * 
     * @example
     * const escaped = cleaner.escapeDiscordMarkdown("*test* _text_");
     * // Returns: "\\*test\\* \\_text\\_"
     */
    escapeDiscordMarkdown(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        // Escape Discord markdown characters
        return text.replace(/([*_`~|\\])/g, '\\$1');
    }

    /**
     * Remove Discord markdown formatting
     * 
     * Strips Discord markdown, preserving the text content:
     * - **text** → text (bold)
     * - *text* → text (italic)
     * - __text__ → text (underline)
     * - ~~text~~ → text (strikethrough)
     * - `text` → text (inline code)
     * - ```text``` → (removed) (code blocks)
     * - ||text|| → text (spoilers)
     * 
     * @param {string} text - Text with Discord markdown
     * @returns {string} Text without markdown formatting
     * 
     * @example
     * const plain = cleaner.removeDiscordMarkdown("**Bold** and *italic*");
     * // Returns: "Bold and italic"
     */
    removeDiscordMarkdown(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        // Remove Discord markdown patterns
        return text
            .replace(/\*\*(.*?)\*\*/g, '$1')  // Bold
            .replace(/\*(.*?)\*/g, '$1')      // Italic  
            .replace(/__(.*?)__/g, '$1')      // Underline
            .replace(/~~(.*?)~~/g, '$1')      // Strikethrough
            .replace(/`(.*?)`/g, '$1')        // Inline code
            .replace(/```[\s\S]*?```/g, '')   // Code blocks
            .replace(/\|\|(.*?)\|\|/g, '$1'); // Spoilers
    }

    /**
     * Update configuration at runtime
     * 
     * Merges new configuration options with existing configuration.
     * Useful for dynamic configuration changes without recreating cleaner.
     * 
     * @param {object} newConfig - New configuration options to merge
     * 
     * @example
     * cleaner.updateConfig({ maxLength: 500, stripUrls: false });
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.debug('MessageCleaner configuration updated');
    }

    /**
     * Get current configuration
     * 
     * Returns a copy of the current configuration to prevent external modification.
     * 
     * @returns {object} Copy of current configuration
     * 
     * @example
     * const config = cleaner.getConfig();
     * console.log(config.maxLength);
     */
    getConfig() {
        return { ...this.config };
    }
}

module.exports = MessageCleaner;