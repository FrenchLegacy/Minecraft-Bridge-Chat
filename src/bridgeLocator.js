/**
 * Bridge Locator - Singleton Access Pattern
 * 
 * This file implements a simple singleton pattern that provides global access
 * to the main bridge instance throughout the application. This allows subsystems
 * to access the configuration and managers without passing references through
 * multiple layers of constructors.
 * 
 * The pattern avoids circular dependencies and simplifies dependency injection
 * while maintaining a single source of truth for the application state.
 * 
 * @author Fabien83560
 * @version 1.0.0
 * @license ISC
 */

// Module-level singleton instance
let instance = null;

/**
 * Set the main bridge instance
 * 
 * Should be called once during application startup from main.js
 * 
 * @param {MainBridge} mainBridgeInstance - The main bridge instance to store
 */
function setInstance(mainBridgeInstance) {
    instance = mainBridgeInstance;
}

/**
 * Get the main bridge instance
 * 
 * Returns the stored MainBridge instance, providing access to:
 * - Configuration
 * - Minecraft Manager
 * - Discord Manager
 * 
 * @returns {MainBridge|null} The main bridge instance, or null if not set
 */
function getInstance() {
    return instance;
}

/**
 * Reset the singleton instance
 * 
 * Used primarily for testing or reinitialization scenarios
 */
function reset() {
    instance = null;
}

// Export singleton access methods
module.exports = {
    setInstance,
    getInstance,
    reset
};