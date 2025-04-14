/**
 * core.js - Core API functionality for BeraBundle
 * 
 * This module provides centralized API access with authentication, 
 * request/response handling, and error management.
 */

const axios = require('axios');
const env = require('../config/env');

class ApiCore {
  constructor() {
    // Default configuration
    this.apiBaseUrl = env.getConfig('api_url', 'https://mainnet.api.oogabooga.io');
    this.apiKey = env.getConfig('api_key');
    
    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.apiBaseUrl,
      timeout: 30000, // 30 seconds
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    // Configure response interceptors
    this.setupInterceptors();
  }
  
  /**
   * Setup request and response interceptors
   */
  setupInterceptors() {
    // Request interceptor - adds auth header if API key is available
    this.client.interceptors.request.use(
      (config) => {
        // Add authentication if API key is set
        if (this.apiKey) {
          config.headers['Authorization'] = `Bearer ${this.apiKey.trim()}`;
          
          // For logging, mask the API key
          const maskedApiKey = this.apiKey.substring(0, 3) + '...' + 
            this.apiKey.substring(this.apiKey.length - 3);
          
          // Only log in development
          if (process.env.NODE_ENV !== 'production') {
            console.log('[API Request]', {
              url: config.url,
              method: config.method,
              headers: {
                ...config.headers,
                'Authorization': `Bearer ${maskedApiKey}`
              }
            });
          }
        }
        return config;
      },
      (error) => {
        console.error('[API Request Error]', error);
        return Promise.reject(error);
      }
    );
    
    // Response interceptor - normalize responses and handle errors
    this.client.interceptors.response.use(
      (response) => {
        // Only log in development
        if (process.env.NODE_ENV !== 'production') {
          console.log('[API Response]', {
            status: response.status,
            statusText: response.statusText,
            data: response.data
          });
        }
        
        // Return just the data by default
        return response.data;
      },
      (error) => {
        // Log error details
        console.error('[API Response Error]', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        
        // Create normalized error object
        const normalizedError = {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
          isApiError: true
        };
        
        return Promise.reject(normalizedError);
      }
    );
  }
  
  /**
   * Configure API client with new settings
   * @param {Object} config - Configuration options
   * @param {string} [config.apiKey] - OogaBooga API key
   * @param {string} [config.baseUrl] - API base URL (optional, defaults to OogaBooga)
   */
  configure({ apiKey, baseUrl }) {
    if (apiKey) {
      this.apiKey = apiKey;
    }
    
    if (baseUrl) {
      this.apiBaseUrl = baseUrl;
      this.client.defaults.baseURL = baseUrl;
    }
  }
  
  /**
   * Check if the API client is configured with a valid API key
   * @param {boolean} [verbose=false] - Whether to log configuration status
   * @returns {boolean} - Whether API key is set
   */
  isConfigured(verbose = false) {
    const hasApiKey = Boolean(this.apiKey);
    if (verbose) {
      console.log(`[ApiCore] API key configured: ${hasApiKey}`);
      if (!hasApiKey) {
        console.error(`[ApiCore] WARNING: No API key configured!`);
      }
    }
    return hasApiKey;
  }
  
  /**
   * Make an authenticated API call
   * @param {string} endpoint - API endpoint (path or full URL)
   * @param {Object} options - Request options
   * @param {string} [options.method='GET'] - HTTP method
   * @param {Object} [options.params] - URL parameters
   * @param {Object} [options.data] - Request body for POST/PUT requests
   * @param {Object} [options.headers] - Additional headers
   * @returns {Promise<any>} - Response data
   * @throws {Error} - If API key is not configured or request fails
   */
  async call(endpoint, options = {}) {
    if (!this.apiKey) {
      console.error(`[ApiCore] API call rejected: No API key configured for call to ${endpoint}`);
      throw new Error("API key not configured. Please set an API key before making requests.");
    }
    
    // Determine if endpoint is a full URL or a path
    const url = endpoint.startsWith('http') ? endpoint : endpoint;
    
    // Only log in development or debug mode
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_API === 'true') {
      console.log(`[ApiCore] Making request to ${url}`, {
        method: options.method || 'GET',
        hasParams: !!options.params,
        hasData: !!options.data,
        hasHeaders: !!options.headers
      });
    }
    
    try {
      // Make request
      const response = await this.client({
        url,
        method: options.method || 'GET',
        params: options.params,
        data: options.data,
        headers: options.headers
      });
      
      // Only log successful requests in development or if debugging
      if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_API === 'true') {
        console.log(`[ApiCore] Request successful for ${url}`);
      }
      return response;
    } catch (error) {
      // Always log errors
      console.error(`[ApiCore] Request failed for ${url}:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      // Let the response interceptor handle error normalization
      throw error;
    }
  }
  
  /**
   * Make a GET request
   * @param {string} endpoint - API endpoint
   * @param {Object} [params] - URL parameters
   * @param {Object} [options] - Additional options
   * @returns {Promise<any>} - Response data
   */
  async get(endpoint, params = {}, options = {}) {
    // Only log in development or debug mode
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_API === 'true') {
      console.log(`[ApiCore] GET request to ${endpoint}`, { params });
    }
    
    try {
      const response = await this.call(endpoint, { 
        ...options, 
        method: 'GET', 
        params 
      });
      
      // Only log successful responses in development or debug mode
      if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_API === 'true') {
        console.log(`[ApiCore] GET response success for ${endpoint}`);
      }
      return response;
    } catch (error) {
      // Always log errors
      console.error(`[ApiCore] GET failed for ${endpoint}:`, error);
      throw error;
    }
  }
  
  /**
   * Make a POST request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @param {Object} [options] - Additional options
   * @returns {Promise<any>} - Response data
   */
  async post(endpoint, data = {}, options = {}) {
    return this.call(endpoint, { 
      ...options, 
      method: 'POST', 
      data 
    });
  }
  
  /**
   * Handle errors consistently
   * @param {Error} error - The error object
   * @param {string} context - Context where the error occurred
   * @param {Function} fallback - Optional fallback to return on error
   * @returns {any} - Either throws the error or returns fallback value
   */
  handleError(error, context, fallback) {
    // Log with context
    console.error(`[${context}] API Error:`, error);
    
    // If fallback provided, return it instead of throwing
    if (fallback !== undefined) {
      return fallback;
    }
    
    // Otherwise throw with improved message
    if (error.isApiError) {
      throw new Error(
        `API Error (${error.status || 'unknown'}): ${error.message} ${error.data ? JSON.stringify(error.data) : ''}`
      );
    } else {
      throw error;
    }
  }
}

// Export singleton instance
const apiCore = new ApiCore();
module.exports = apiCore;