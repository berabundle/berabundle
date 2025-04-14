/**
 * Environment configuration handler
 * Provides a secure way to get configuration values from environment or local files
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  console.log(`Loading environment variables from ${envPath}`);
  dotenv.config({ path: envPath });
}

// Default config file path
const CONFIG_PATH = path.join(__dirname, '..', '..', '.berabundle.json');

// Load local config file if it exists
function loadLocalConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
    return {};
  } catch (error) {
    console.error(`Error loading local config: ${error.message}`);
    return {};
  }
}

// Save to local config file (CLI usage only)
function saveLocalConfig(data) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error saving local config: ${error.message}`);
    return false;
  }
}

// Get environment variable or fallback to local config
function getConfig(key, defaultValue = null) {
  // First check environment variables (highest priority)
  const envKey = `BERABUNDLE_${key.toUpperCase()}`;
  if (process.env[envKey] !== undefined) {
    return process.env[envKey];
  }
  
  // Then check local config file
  const localConfig = loadLocalConfig();
  if (localConfig[key] !== undefined) {
    return localConfig[key];
  }
  
  // Fall back to default value
  return defaultValue;
}

// Determine if we're in a server environment (not CLI)
function isServerEnvironment() {
  return process.env.NODE_ENV === 'production' || process.env.BERABUNDLE_SERVER === 'true';
}

module.exports = {
  getConfig,
  saveLocalConfig,
  loadLocalConfig,
  isServerEnvironment
};