/**
 * cache.js - Caching utility for BeraBundle
 * 
 * This module provides in-memory and persistent caching capabilities
 * for API responses and other data.
 */

const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

class Cache {
  constructor() {
    // In-memory cache storage
    this.memoryCache = new Map();
    
    // Default expiry times
    this.defaultExpiry = {
      tokens: config.api.cacheDuration.tokens,
      prices: config.api.cacheDuration.prices,
      validators: config.api.cacheDuration.validators,
      rewards: config.api.cacheDuration.rewards,
      // Default for other types
      default: 5 * 60 * 1000 // 5 minutes
    };
    
    // Cache directory
    this.cacheDir = config.paths.backend.cache;
    
    // Ensure cache directory exists
    this.initCacheDir();
  }
  
  /**
   * Initialize the cache directory
   */
  async initCacheDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create cache directory:', error);
    }
  }
  
  /**
   * Get expiry time for a specific cache type
   * @param {string} cacheType - The type of data being cached
   * @returns {number} - Expiry time in milliseconds
   */
  getExpiryTime(cacheType) {
    return this.defaultExpiry[cacheType] || this.defaultExpiry.default;
  }
  
  /**
   * Check if a cache entry is still valid
   * @param {Object} cacheEntry - The cache entry to check
   * @returns {boolean} - Whether the entry is still valid
   */
  isValid(cacheEntry) {
    return cacheEntry && 
           cacheEntry.timestamp && 
           (Date.now() - cacheEntry.timestamp < cacheEntry.expiresIn);
  }
  
  /**
   * Get data from the memory cache
   * @param {string} key - Cache key
   * @returns {any|null} - Cached data or null if not found or expired
   */
  getFromMemory(key) {
    const cacheEntry = this.memoryCache.get(key);
    
    if (this.isValid(cacheEntry)) {
      return cacheEntry.data;
    }
    
    // Clean up expired entry
    if (cacheEntry) {
      this.memoryCache.delete(key);
    }
    
    return null;
  }
  
  /**
   * Save data to the memory cache
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {string} cacheType - Type of data for determining expiry
   * @returns {void}
   */
  saveToMemory(key, data, cacheType) {
    const expiresIn = this.getExpiryTime(cacheType);
    
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      expiresIn
    });
  }
  
  /**
   * Get data from the file cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} - Cached data or null if not found or expired
   */
  async getFromFile(key) {
    try {
      const filePath = path.join(this.cacheDir, `${key}.json`);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const cacheEntry = JSON.parse(fileContent);
      
      if (this.isValid(cacheEntry)) {
        return cacheEntry.data;
      }
      
      // Clean up expired file
      await fs.unlink(filePath);
      return null;
    } catch (error) {
      // File doesn't exist or other error
      return null;
    }
  }
  
  /**
   * Save data to the file cache
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {string} cacheType - Type of data for determining expiry
   * @returns {Promise<void>}
   */
  async saveToFile(key, data, cacheType) {
    try {
      const expiresIn = this.getExpiryTime(cacheType);
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        expiresIn
      };
      
      const filePath = path.join(this.cacheDir, `${key}.json`);
      await fs.writeFile(filePath, JSON.stringify(cacheEntry), 'utf8');
    } catch (error) {
      console.error(`Failed to save cache file ${key}:`, error);
    }
  }
  
  /**
   * Get data from cache, checking memory first, then file
   * @param {string} key - Cache key
   * @param {boolean} [checkFileCache=true] - Whether to check file cache if not in memory
   * @returns {Promise<any|null>} - Cached data or null if not found or expired
   */
  async get(key, checkFileCache = true) {
    // Check memory cache first
    const memoryData = this.getFromMemory(key);
    if (memoryData !== null) {
      return memoryData;
    }
    
    // If not in memory and file checking is enabled, try file cache
    if (checkFileCache) {
      const fileData = await this.getFromFile(key);
      if (fileData !== null) {
        // Add to memory cache for faster access next time
        this.saveToMemory(key, fileData, 'default');
        return fileData;
      }
    }
    
    return null;
  }
  
  /**
   * Save data to cache (both memory and file)
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {Object} options - Cache options
   * @param {string} [options.cacheType='default'] - Type of data for determining expiry
   * @param {boolean} [options.persist=true] - Whether to persist to file cache
   * @returns {Promise<void>}
   */
  async set(key, data, options = {}) {
    const { cacheType = 'default', persist = true } = options;
    
    // Save to memory
    this.saveToMemory(key, data, cacheType);
    
    // Optionally save to file
    if (persist) {
      await this.saveToFile(key, data, cacheType);
    }
  }
  
  /**
   * Remove an item from both memory and file cache
   * @param {string} key - Cache key to remove
   * @returns {Promise<void>}
   */
  async remove(key) {
    // Remove from memory
    this.memoryCache.delete(key);
    
    // Remove from file if exists
    try {
      const filePath = path.join(this.cacheDir, `${key}.json`);
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore file not found errors
      if (error.code !== 'ENOENT') {
        console.error(`Failed to remove cache file ${key}:`, error);
      }
    }
  }
  
  /**
   * Clear all cached data (memory and file)
   * @returns {Promise<void>}
   */
  async clear() {
    // Clear memory cache
    this.memoryCache.clear();
    
    // Clear file cache
    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.cacheDir, file)))
      );
    } catch (error) {
      console.error('Failed to clear cache directory:', error);
    }
  }
}

// Export singleton instance
const cache = new Cache();
module.exports = cache;