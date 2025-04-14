/**
 * ApiClient.js - Client for communication with BeraBundle backend API
 * 
 * This service provides a standardized interface for the React UI
 * to communicate with the backend API services.
 */

import axios from 'axios';

class ApiClient {
  constructor() {
    // Default configuration
    this.apiBaseUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
    this.apiKey = null;
    this.initialized = false;
    
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
          config.headers['X-API-Key'] = this.apiKey.trim();
          
          // For logging, mask the API key
          const maskedApiKey = this.apiKey.substring(0, 3) + '...' + 
            this.apiKey.substring(this.apiKey.length - 3);
          
          console.log('[Backend API Request]', {
            url: config.url,
            method: config.method,
            headers: {
              ...config.headers,
              'X-API-Key': `${maskedApiKey}`
            }
          });
        }
        return config;
      },
      (error) => {
        console.error('[Backend API Request Error]', error);
        return Promise.reject(error);
      }
    );
    
    // Response interceptor - normalize responses and handle errors
    this.client.interceptors.response.use(
      (response) => {
        console.log('[Backend API Response]', {
          status: response.status,
          statusText: response.statusText,
          data: response.data
        });
        
        // Return just the data by default
        return response.data;
      },
      (error) => {
        // Log error details
        console.error('[Backend API Response Error]', {
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
   * Initialize the API client
   * @param {Object} options - Initialization options
   * @param {string} [options.apiKey] - OogaBooga API key for the backend
   * @param {string} [options.baseUrl] - API base URL (optional)
   * @returns {boolean} Whether initialization was successful
   */
  initialize(options = {}) {
    try {
      if (options.apiKey) {
        this.apiKey = options.apiKey;
        console.log(`[ApiClient] Initialized with API key: ${options.apiKey.substring(0, 3)}...${options.apiKey.substring(options.apiKey.length - 3)}`);
      } else {
        console.warn(`[ApiClient] No API key provided during initialization!`);
      }
      
      if (options.baseUrl) {
        this.apiBaseUrl = options.baseUrl;
        this.client.defaults.baseURL = options.baseUrl;
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error("Error initializing API client:", error);
      return false;
    }
  }
  
  /**
   * Check if the API client is initialized
   * @returns {boolean} Whether the client is initialized
   */
  isInitialized() {
    return this.initialized && Boolean(this.apiKey);
  }
  
  /**
   * Make a GET request
   * @param {string} endpoint - API endpoint
   * @param {Object} [params] - URL parameters
   * @returns {Promise<any>} Response data
   */
  async get(endpoint, params = {}) {
    if (!this.isInitialized()) {
      throw new Error("API client not initialized. Please set an API key first.");
    }
    
    try {
      const response = await this.client.get(endpoint, { params });
      return response;
    } catch (error) {
      console.error(`[API] GET ${endpoint} failed:`, error);
      throw error;
    }
  }
  
  /**
   * Make a POST request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @returns {Promise<any>} Response data
   */
  async post(endpoint, data = {}) {
    if (!this.isInitialized()) {
      throw new Error("API client not initialized. Please set an API key first.");
    }
    
    try {
      const response = await this.client.post(endpoint, data);
      return response;
    } catch (error) {
      console.error(`[API] POST ${endpoint} failed:`, error);
      throw error;
    }
  }
  
  /**
   * Initialize blockchain provider connection
   * @param {Object} provider - Web3Provider instance
   * @param {Object} signer - Signer instance
   * @returns {Promise<Object>} Connection result
   */
  async connectBlockchain(provider, signer) {
    try {
      // Get current account
      const address = await signer.getAddress();
      
      // Currently we don't actually send the provider/signer to the backend
      // since we're still using the local provider. The backend API has
      // its own provider initialization.
      return {
        success: true,
        address,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error("Error connecting blockchain:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // === TOKEN API METHODS ===
  
  /**
   * Get token list from backend
   * @param {Object} options - Filter options
   * @returns {Promise<Object>} Token list
   */
  async getTokenList(options = {}) {
    return this.get('/tokens/list', options);
  }
  
  /**
   * Get token price
   * @param {string} tokenAddress - Token address
   * @returns {Promise<Object>} Token price
   */
  async getTokenPrice(tokenAddress) {
    return this.get(`/tokens/price/${tokenAddress}`);
  }
  
  /**
   * Get token balance
   * @param {string} address - Wallet address
   * @param {string} tokenAddress - Token address
   * @returns {Promise<Object>} Token balance
   */
  async getTokenBalance(address, tokenAddress) {
    return this.get(`/tokens/balance/${address}/${tokenAddress}`);
  }
  
  /**
   * Get native balance
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} Native balance
   */
  async getNativeBalance(address) {
    return this.get(`/tokens/native-balance/${address}`);
  }
  
  /**
   * Get all token balances for an address
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} All token balances
   */
  async getAllBalances(address) {
    console.log(`[ApiClient] Getting all balances for address: ${address}`);
    try {
      const result = await this.get(`/tokens/all-balances/${address}`);
      console.log(`[ApiClient] Received all balances response:`, result);
      return result;
    } catch (error) {
      console.error(`[ApiClient] Error getting all balances:`, error);
      throw error;
    }
  }
  
  // === REWARDS API METHODS ===
  
  /**
   * Check rewards for an address
   * @param {string} address - Wallet address to check
   * @returns {Promise<Object>} Rewards information
   */
  async checkRewards(address) {
    console.log(`[ApiClient] Checking rewards for address: ${address}`);
    try {
      const result = await this.get(`/rewards/check/${address}`);
      console.log(`[ApiClient] Received rewards response:`, result);
      return result;
    } catch (error) {
      console.error(`[ApiClient] Error checking rewards:`, error);
      throw error;
    }
  }
  
  /**
   * Claim rewards for an address
   * @param {string} address - Wallet address to claim for
   * @param {Array} selectedRewards - Array of selected reward objects
   * @returns {Promise<Object>} Claim result
   */
  async claimRewards(address, selectedRewards) {
    console.log(`[ApiClient] Claiming rewards for address: ${address}`);
    try {
      const result = await this.post('/rewards/claim', {
        address,
        selectedRewards
      });
      console.log(`[ApiClient] Claim rewards response:`, result);
      return result;
    } catch (error) {
      console.error(`[ApiClient] Error claiming rewards:`, error);
      throw error;
    }
  }
  
  /**
   * Get validator boosts for an address
   * @param {string} address - Wallet address to check
   * @returns {Promise<Object>} Validator boost information
   */
  async getValidatorBoosts(address) {
    console.log(`[ApiClient] Getting validator boosts for address: ${address}`);
    try {
      const result = await this.get(`/validators/boosts/${address}`);
      console.log(`[ApiClient] Received validator boosts response:`, result);
      return result;
    } catch (error) {
      console.error(`[ApiClient] Error getting validator boosts:`, error);
      throw error;
    }
  }
  
  /**
   * Get validators list
   * @returns {Promise<Object>} List of validators
   */
  async getValidators() {
    console.log(`[ApiClient] Getting validators list`);
    try {
      const result = await this.get('/validators/list');
      console.log(`[ApiClient] Received validators list:`, result);
      return result;
    } catch (error) {
      console.error(`[ApiClient] Error getting validators:`, error);
      throw error;
    }
  }
  
  /**
   * Boost a validator with BGT tokens
   * @param {string} validatorId - Validator's public key
   * @param {string} amount - Amount of BGT to boost
   * @returns {Promise<Object>} Boost result
   */
  async boostValidator(validatorId, amount) {
    console.log(`[ApiClient] Boosting validator ${validatorId} with ${amount} BGT`);
    try {
      const result = await this.post('/validators/boost', {
        validatorId,
        amount
      });
      console.log(`[ApiClient] Boost validator response:`, result);
      return result;
    } catch (error) {
      console.error(`[ApiClient] Error boosting validator:`, error);
      throw error;
    }
  }
  
  /**
   * Queue a boost for a validator
   * @param {string} validatorId - Validator's public key
   * @param {string} amount - Amount of BGT to queue
   * @returns {Promise<Object>} Queue result
   */
  async queueBoostValidator(validatorId, amount) {
    console.log(`[ApiClient] Queueing boost for validator ${validatorId} with ${amount} BGT`);
    try {
      const result = await this.post('/validators/queue-boost', {
        validatorId,
        amount
      });
      console.log(`[ApiClient] Queue boost response:`, result);
      return result;
    } catch (error) {
      console.error(`[ApiClient] Error queueing boost:`, error);
      throw error;
    }
  }
  
  // === SWAP API METHODS ===
  
  /**
   * Create a swap bundle through the backend
   * @param {string} fromAddress - User's wallet address
   * @param {Array<Object>} tokensToSwap - Array of tokens with amounts to swap
   * @param {Object} options - Additional options like target token
   * @returns {Promise<Object>} Swap bundle with transaction data
   */
  async createSwapBundle(fromAddress, tokensToSwap, options = {}) {
    console.log(`[ApiClient] Creating swap bundle for ${fromAddress} with ${tokensToSwap.length} tokens`);
    try {
      // Create a more detailed log of what's being sent
      console.log(`[ApiClient] Token swap details:`, 
        tokensToSwap.map(t => ({
          symbol: t.symbol,
          address: t.address,
          amount: t.amount,
          decimals: t.decimals || 18
        }))
      );
      
      // Make the API request
      const response = await this.post('/swaps/create-bundle', {
        fromAddress, 
        tokensToSwap, 
        options
      });
      
      // Log the response - the backend returns the bundle directly, not with a success field
      if (response && response.swapTxs) {
        console.log(`[ApiClient] Swap bundle created successfully with ${
          response.swapTxs.length || 0} transactions`);
      } else {
        console.error(`[ApiClient] Swap bundle creation failed with error:`, 
          response?.error || 'Unknown error');
      }
      
      return response;
    } catch (error) {
      console.error(`[ApiClient] Error creating swap bundle:`, error);
      throw error;
    }
  }
  
  /**
   * Execute a swap bundle through the backend
   * @param {Object} bundle - Swap bundle created by createSwapBundle
   * @returns {Promise<Object>} Transaction result
   */
  async executeSwapBundle(bundle) {
    console.log(`[ApiClient] Executing swap bundle for ${bundle.fromAddress}`);
    try {
      const result = await this.post('/swaps/execute-bundle', bundle);
      console.log(`[ApiClient] Swap bundle executed successfully`);
      return result;
    } catch (error) {
      console.error(`[ApiClient] Error executing swap bundle:`, error);
      throw error;
    }
  }
  
  /**
   * Check if a token is approved for the bundler contract
   * @param {string} tokenAddress - Token contract address
   * @param {string} ownerAddress - Address of the token owner
   * @param {string|number} amount - Amount to check approval for
   * @returns {Promise<Object>} Approval status
   */
  async checkApproval(tokenAddress, ownerAddress, amount) {
    console.log(`[ApiClient] Checking approval for ${tokenAddress} owned by ${ownerAddress}`);
    try {
      const result = await this.post('/swaps/check-approval', {
        tokenAddress,
        ownerAddress,
        amount
      });
      console.log(`[ApiClient] Approval check result:`, result);
      return result;
    } catch (error) {
      console.error(`[ApiClient] Error checking approval:`, error);
      throw error;
    }
  }
  
  /**
   * Approve a token for swapping through the bundler contract
   * @param {string} tokenAddress - Token contract address
   * @param {string|number} amount - Amount to approve (defaults to unlimited)
   * @returns {Promise<Object>} Transaction result
   */
  async approveToken(tokenAddress, amount) {
    console.log(`[ApiClient] Approving token ${tokenAddress}`);
    try {
      const result = await this.post('/swaps/approve-token', {
        tokenAddress,
        amount
      });
      console.log(`[ApiClient] Token approval result:`, result);
      return result;
    } catch (error) {
      console.error(`[ApiClient] Error approving token:`, error);
      throw error;
    }
  }
  
  /**
   * Revoke token approval from the bundler contract
   * @param {string} tokenAddress - Token contract address
   * @returns {Promise<Object>} Transaction result
   */
  async revokeToken(tokenAddress) {
    console.log(`[ApiClient] Revoking approval for token ${tokenAddress}`);
    try {
      const result = await this.post('/swaps/revoke-token', {
        tokenAddress
      });
      console.log(`[ApiClient] Token revocation result:`, result);
      return result;
    } catch (error) {
      console.error(`[ApiClient] Error revoking token:`, error);
      throw error;
    }
  }
}

// Export singleton instance
const apiClient = new ApiClient();
export default apiClient;