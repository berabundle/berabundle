/**
 * MetadataService.js - Service for fetching and managing metadata for BeraBundle React UI
 * 
 * This service handles fetching metadata from the backend API:
 * - GitHub tokens (approved tokens)
 * - OogaBooga tokens (tokens with paths the API can fetch)
 * - Vaults and validators lists
 * 
 * It stores each dataset separately in localStorage with timestamps.
 */

import apiClient from './ApiClient';
import { ethers } from 'ethers';

// Storage keys
const STORAGE_KEYS = {
  GITHUB_TOKENS: 'berabundle_github_tokens',
  OOGABOOGA_TOKENS: 'berabundle_oogabooga_tokens',
  VALIDATORS: 'berabundle_validators',
  VAULTS: 'berabundle_vaults',
  OOGABOOGA_API_KEY: 'oogaboogaApiKey',
  LAST_UPDATE: 'berabundle_metadata_last_update'
};

/**
 * Service for managing metadata retrieval and storage
 */
class MetadataService {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize the metadata service
   * @param {Object} options - Initialization options
   * @param {string} [options.apiKey] - OogaBooga API key
   * @returns {boolean} Whether initialization was successful
   */
  initialize(options = {}) {
    try {
      if (options.apiKey) {
        // Initialize the API client with the API key
        apiClient.initialize({ apiKey: options.apiKey });
      }
      
      this.initialized = true;
      return this.initialized;
    } catch (error) {
      console.error("Error initializing metadata service:", error);
      return false;
    }
  }
  
  /**
   * Check if the service is initialized
   * @returns {boolean} Whether the service is initialized
   */
  isInitialized() {
    return this.initialized && apiClient.isInitialized();
  }

  /**
   * Store data in local storage with timestamp
   * @param {string} key - Local storage key
   * @param {any} data - Data to store
   */
  storeData(key, data) {
    try {
      const dataWithTimestamp = {
        timestamp: Date.now(),
        data: data
      };
      localStorage.setItem(key, JSON.stringify(dataWithTimestamp));
    } catch (error) {
      console.error(`Error storing data for ${key}:`, error);
    }
  }

  /**
   * Get data from local storage
   * @param {string} key - Local storage key
   * @returns {Object|null} Object with data and timestamp, or null if not found
   */
  getData(key) {
    try {
      const storedData = localStorage.getItem(key);
      if (!storedData) return null;
      
      return JSON.parse(storedData);
    } catch (error) {
      console.error(`Error getting data for ${key}:`, error);
      return null;
    }
  }

  /**
   * Fetch GitHub tokens list (approved tokens) from backend
   * @returns {Promise<Object>} Result object with tokens data
   */
  async fetchGitHubTokens() {
    try {
      if (!this.isInitialized()) {
        throw new Error("MetadataService not initialized with API key");
      }
      
      // Get GitHub tokens (approved tokens) from backend
      console.log("Fetching GitHub tokens from backend API");
      const result = await apiClient.getTokenList({ source: 'github' });
      
      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to fetch GitHub tokens from backend");
      }
      
      // Format the response
      const metadata = {
        data: result.tokens,
        count: result.count,
        timestamp: Date.now(),
        source: "github"
      };
      
      // Store in localStorage
      this.storeData(STORAGE_KEYS.GITHUB_TOKENS, metadata);
      
      return {
        success: true,
        tokens: metadata,
        count: metadata.count
      };
    } catch (error) {
      console.error("Error fetching GitHub tokens:", error);
      return {
        success: false,
        error: error.message || "Failed to fetch GitHub token data"
      };
    }
  }

  /**
   * Fetch vaults list from backend
   * @returns {Promise<Object>} Result object with vaults data
   */
  async fetchVaults() {
    try {
      if (!this.isInitialized()) {
        throw new Error("MetadataService not initialized with API key");
      }
      
      // Get vaults from backend
      console.log("Fetching vaults from backend API");
      const result = await apiClient.get('/vaults/list');
      
      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to fetch vaults from backend");
      }
      
      // Format the response
      const metadata = {
        data: result.vaults,
        count: result.count,
        timestamp: Date.now(),
        source: "backend"
      };
      
      // Store in localStorage
      this.storeData(STORAGE_KEYS.VAULTS, metadata);
      
      return {
        success: true,
        vaults: metadata,
        count: metadata.count
      };
    } catch (error) {
      console.error("Error fetching vaults:", error);
      return {
        success: false,
        error: error.message || "Failed to fetch vault data"
      };
    }
  }

  /**
   * Fetch validators list from backend
   * @returns {Promise<Object>} Result object with validators data
   */
  async fetchValidators() {
    try {
      if (!this.isInitialized()) {
        throw new Error("MetadataService not initialized with API key");
      }
      
      // Get validators from backend
      console.log("Fetching validators from backend API");
      const result = await apiClient.get('/validators/list');
      
      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to fetch validators from backend");
      }
      
      // Format the response
      const metadata = {
        data: result.validators,
        count: result.count,
        timestamp: Date.now(),
        source: "backend"
      };
      
      // Store in localStorage
      this.storeData(STORAGE_KEYS.VALIDATORS, metadata);
      
      return {
        success: true,
        validators: metadata,
        count: metadata.count
      };
    } catch (error) {
      console.error("Error fetching validators:", error);
      return {
        success: false,
        error: error.message || "Failed to fetch validator data"
      };
    }
  }

  /**
   * Fetch tokens from OogaBooga API via backend
   * @returns {Promise<Object>} Result object with tokens data
   */
  async fetchOogaBoogaTokens() {
    try {
      const apiKey = localStorage.getItem(STORAGE_KEYS.OOGABOOGA_API_KEY);
      
      if (!apiKey) {
        return {
          success: false,
          error: "OogaBooga API key not set"
        };
      }
      
      // Initialize API client if not already initialized
      if (!apiClient.isInitialized()) {
        apiClient.initialize({ apiKey });
      }
      
      // Call backend API to get token list from OogaBooga
      console.log("Fetching OogaBooga tokens from backend API");
      const response = await apiClient.getTokenList({ source: 'oogabooga' });
      
      if (!response || !response.success) {
        throw new Error(response?.error || "Invalid response from backend API");
      }
      
      // Create a metadata object from the backend response
      const metadata = {
        timestamp: Date.now(),
        count: response.count,
        source: "oogabooga",
        data: response.tokens
      };
      
      // Store in localStorage
      this.storeData(STORAGE_KEYS.OOGABOOGA_TOKENS, metadata);
      
      return {
        success: true,
        tokens: metadata,
        count: metadata.count
      };
    } catch (error) {
      console.error("Error fetching OogaBooga tokens from backend:", error);
      return {
        success: false,
        error: error.message || "Failed to fetch OogaBooga token data from backend"
      };
    }
  }

  /**
   * Get GitHub tokens from localStorage or fetch if not available
   * @param {boolean} forceRefresh - Force refresh from backend
   * @returns {Promise<Object>} Result object with tokens data
   */
  async getGitHubTokens(forceRefresh = false) {
    // Try to get from localStorage first
    const storedData = this.getData(STORAGE_KEYS.GITHUB_TOKENS);
    
    if (!forceRefresh && storedData) {
      return {
        success: true,
        tokens: storedData.data,
        count: Object.keys(storedData.data).length,
        timestamp: storedData.timestamp
      };
    }
    
    // Fetch from backend
    return await this.fetchGitHubTokens();
  }

  /**
   * Get OogaBooga tokens from localStorage or fetch if not available
   * @param {boolean} forceRefresh - Force refresh from backend
   * @returns {Promise<Object>} Result object with tokens data
   */
  async getOogaBoogaTokens(forceRefresh = false) {
    // Try to get from localStorage first
    const storedData = this.getData(STORAGE_KEYS.OOGABOOGA_TOKENS);
    
    if (!forceRefresh && storedData) {
      return {
        success: true,
        tokens: storedData.data,
        count: Object.keys(storedData.data).length,
        timestamp: storedData.timestamp
      };
    }
    
    // Fetch from backend API
    return await this.fetchOogaBoogaTokens();
  }

  /**
   * Get vaults from localStorage or fetch if not available
   * @param {boolean} forceRefresh - Force refresh from backend
   * @returns {Promise<Object>} Result object with vaults data
   */
  async getVaults(forceRefresh = false) {
    // Try to get from localStorage first
    const storedData = this.getData(STORAGE_KEYS.VAULTS);
    
    if (!forceRefresh && storedData) {
      return {
        success: true,
        vaults: storedData.data,
        count: storedData.data.length,
        timestamp: storedData.timestamp
      };
    }
    
    // Fetch from backend
    return await this.fetchVaults();
  }

  /**
   * Get validators from localStorage or fetch if not available
   * @param {boolean} forceRefresh - Force refresh from backend
   * @returns {Promise<Object>} Result object with validators data
   */
  async getValidators(forceRefresh = false) {
    // Try to get from localStorage first
    const storedData = this.getData(STORAGE_KEYS.VALIDATORS);
    
    if (!forceRefresh && storedData) {
      return {
        success: true,
        validators: storedData.data,
        count: storedData.data.length,
        timestamp: storedData.timestamp
      };
    }
    
    // Fetch from backend
    return await this.fetchValidators();
  }

  /**
   * Update all metadata from backend sources
   * @returns {Promise<Object>} Result object with status for all metadata types
   */
  async updateAllMetadata() {
    try {
      if (!this.isInitialized()) {
        throw new Error("MetadataService not initialized with API key");
      }
      
      // Fetch all metadata types in parallel
      const [
        githubTokensResult,
        oogaBoogaTokensResult, 
        vaultsResult, 
        validatorsResult
      ] = await Promise.all([
        this.fetchGitHubTokens(),
        this.fetchOogaBoogaTokens(), 
        this.fetchVaults(), 
        this.fetchValidators()
      ]);
      
      // Store the last update timestamp
      localStorage.setItem(STORAGE_KEYS.LAST_UPDATE, Date.now().toString());
      
      return {
        success: githubTokensResult.success || oogaBoogaTokensResult.success || vaultsResult.success || validatorsResult.success,
        githubTokens: githubTokensResult,
        oogaBoogaTokens: oogaBoogaTokensResult,
        vaults: vaultsResult,
        validators: validatorsResult,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error("Error updating all metadata:", error);
      return {
        success: false,
        error: error.message || "Failed to update metadata",
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get the last update timestamp
   * @returns {number} Timestamp of last metadata update
   */
  getLastUpdateTimestamp() {
    const timestamp = localStorage.getItem(STORAGE_KEYS.LAST_UPDATE);
    return timestamp ? parseInt(timestamp) : null;
  }

  /**
   * Get all metadata from localStorage (without fetching)
   * @returns {Object} All metadata status
   */
  getAllMetadataStatus() {
    return {
      githubTokens: this.getData(STORAGE_KEYS.GITHUB_TOKENS),
      oogaBoogaTokens: this.getData(STORAGE_KEYS.OOGABOOGA_TOKENS),
      vaults: this.getData(STORAGE_KEYS.VAULTS),
      validators: this.getData(STORAGE_KEYS.VALIDATORS),
      lastUpdate: this.getLastUpdateTimestamp()
    };
  }
}

// Export singleton instance
const metadataService = new MetadataService();
export default metadataService;