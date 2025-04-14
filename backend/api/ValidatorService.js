/**
 * ValidatorService.js - Service for managing validators
 * 
 * This service handles validator data, selection, and boost management.
 */

const { ethers } = require('ethers');
const apiCore = require('./core');
const provider = require('../blockchain/provider');
const cache = require('../utils/cache');
const config = require('../config');
const { handleError } = require('../utils/errors');

// GitHub repositories and files
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const METADATA_REPO = 'berachain/metadata';
const METADATA_BRANCH = 'main';

class ValidatorService {
  constructor() {
    this.initialized = false;
    this.validatorMap = {};
    
    // Contract addresses
    this.contractAddresses = {
      bgtToken: '0x656b95e550c07a9ffe548bd4085c72418ceb1dba'
    };
  }
  
  /**
   * Initialize the validators service
   * @param {Object} options - Initialization options
   * @param {string} [options.apiKey] - OogaBooga API key
   * @returns {boolean} Whether initialization was successful
   */
  initialize(options = {}) {
    try {
      if (options.apiKey) {
        apiCore.configure({ apiKey: options.apiKey });
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      return handleError(error, 'ValidatorService.initialize', false);
    }
  }
  
  /**
   * Check if the service is initialized
   * @returns {boolean} Whether the service is initialized
   */
  isInitialized() {
    return this.initialized;
  }
  
  /**
   * Helper function to retry a failed promise with exponential backoff
   * @param {Function} operation - Function that returns a promise to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {Promise<any>} Result of the operation
   */
  async retryPromise(operation, maxRetries = 3, baseDelay = 100) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await operation();
        if (i > 0) {
          console.log(`Operation succeeded after ${i+1} attempts`);
        }
        return result;
      } catch (error) {
        lastError = error;
        
        // Log the retry attempt
        console.warn(`Retry attempt ${i+1}/${maxRetries} failed: ${error.message}`);
        
        // If this is the last attempt, throw the error
        if (i === maxRetries - 1) {
          console.error(`All ${maxRetries} retry attempts failed`);
          throw error;
        }
        
        // Calculate backoff delay with jitter
        const jitter = 0.5 + Math.random();
        const delay = baseDelay * Math.pow(2, i) * jitter;
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
  
  /**
   * Fetch content from a GitHub repository
   * @param {string} path - Path to the file in the repository
   * @returns {Promise<any>} Response data 
   */
  async fetchFromGitHub(path) {
    const url = `${GITHUB_RAW_BASE}/${METADATA_REPO}/${METADATA_BRANCH}/${path}`;
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`GitHub fetch failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      return handleError(error, 'ValidatorService.fetchFromGitHub');
    }
  }
  
  /**
   * Fetch validators from GitHub
   * @param {boolean} [useCache=true] - Whether to use cached data if available
   * @returns {Promise<Array<Object>>} Array of validator objects
   */
  async fetchValidators(useCache = true) {
    try {
      // Check cache first
      if (useCache) {
        const cachedValidators = await cache.get('validators_list', true);
        if (cachedValidators) {
          console.log(`Using cached validators (${cachedValidators.length} validators)`);
          return cachedValidators;
        }
      }
      
      // First try GitHub
      try {
        const validators = await this.fetchFromGitHub('src/validators/mainnet.json');
        
        if (validators && Array.isArray(validators)) {
          console.log(`Successfully fetched ${validators.length} validators from GitHub`);
          
          // Cache the results
          await cache.set('validators_list', validators, { cacheType: 'validators', persist: true });
          
          // Build validator map if not already built
          if (!this.validatorMap || Object.keys(this.validatorMap).length === 0) {
            this.validatorMap = this.buildValidatorMap(validators);
          }
          
          return validators;
        }
      } catch (gitHubError) {
        console.warn("Could not fetch validators from GitHub:", gitHubError);
      }
      
      // If GitHub fails, use hardcoded validators
      console.log("Falling back to hardcoded validators data");
      
      // Simplified hardcoded validators data
      const hardcodedValidators = [
        {
          "id": "0xa3539ca28e0fd74d2a3c4c552740be77d6914cad2d8ec16583492cc57e8cfa358c62e31cc9106b1700cc169962855a6f",
          "name": "L0vd"
        },
        {
          "id": "0x832153bf3e09b9cab14414425a0ebaeb889e21d20872ebb990ed9a6102d7dc7f3017d4689f931a8e96d918bdeb184e1b",
          "name": "BGTScan"
        },
        {
          "id": "0xa232a81b5e834b817db01d85ee13e36552b48413626287de511b6c89b7b8ff4a448e865713fd21c98f1467a58fe6efe5",
          "name": "StakeUs (lowest commission)"
        }
      ];
      
      // Cache hardcoded validators
      await cache.set('validators_list', hardcodedValidators, { cacheType: 'validators', persist: true });
      
      // Build validator map if not already built
      if (!this.validatorMap || Object.keys(this.validatorMap).length === 0) {
        this.validatorMap = this.buildValidatorMap(hardcodedValidators);
      }
      
      return hardcodedValidators;
    } catch (error) {
      return handleError(error, 'ValidatorService.fetchValidators', []);
    }
  }
  
  /**
   * Build validator map for efficient lookups
   * @param {Array<Object>} validators - Array of validator objects
   * @returns {Object} Map of validator pubkeys to validator objects
   */
  buildValidatorMap(validators) {
    const validatorMap = {};
    
    validators.forEach(validator => {
      if (validator.id) {
        // Store with id as key (case-insensitive)
        validatorMap[validator.id.toLowerCase()] = {
          pubkey: validator.id,
          id: validator.id,
          name: validator.name || `Validator ${validator.id.substring(0, 8)}`
        };
      }
    });
    
    return validatorMap;
  }
  
  /**
   * Find validator info by public key
   * @param {string} pubkey - Validator's public key
   * @returns {Promise<Object>} Validator information
   */
  async findValidatorByPubkey(pubkey) {
    if (!pubkey) return { pubkey: "unknown", name: "Unknown Validator" };
    
    // Load validators if map is empty
    if (!this.validatorMap || Object.keys(this.validatorMap).length === 0) {
      const validators = await this.fetchValidators();
      this.validatorMap = this.buildValidatorMap(validators);
    }
    
    // Try to find by lowercase key for case-insensitive matching
    const validator = this.validatorMap[pubkey.toLowerCase()];
    if (validator) {
      return validator;
    }
    
    // If not found, create a generic validator object
    return {
      pubkey: pubkey,
      id: pubkey,
      name: `Validator ${pubkey.substring(0, 8)}`
    };
  }
  
  /**
   * Get all validators
   * @returns {Promise<Array<Object>>} Array of validator objects
   */
  async getValidators() {
    try {
      const validators = await this.fetchValidators();
      return {
        success: true,
        validators,
        count: validators.length,
        timestamp: Date.now()
      };
    } catch (error) {
      return handleError(error, 'ValidatorService.getValidators', {
        success: false,
        error: error.message || "Failed to get validators",
        validators: []
      });
    }
  }
  
  /**
   * Get validator boosts for a user
   * @param {string} address - User wallet address
   * @returns {Promise<Object>} Validator boost information
   */
  async getValidatorBoosts(address) {
    if (!provider.isInitialized()) {
      throw new Error("Provider not initialized");
    }
    
    try {
      console.log(`Checking validator boosts for ${address}...`);
      
      // Validate address
      if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
        console.warn(`Invalid address provided for checking validator boosts: ${address}`);
        return { activeBoosts: [], queuedBoosts: [] };
      }
      
      // Normalize the address
      const normalizedAddress = ethers.utils.getAddress(address.toLowerCase());
      
      // Get contract addresses
      const validatorBoostAddress = ethers.utils.getAddress(this.contractAddresses.bgtToken.toLowerCase());
      
      // Create contract instance for the validator boost contract
      const validatorBoostABI = [
        "function boosts(address account) external view returns (uint256)",
        "function boostees(bytes calldata pubkey) external view returns (uint256)",
        "function boosted(address account, bytes calldata pubkey) external view returns (uint256)",
        "function queuedBoost(address account) external view returns (uint256)",
        "function boostedQueue(address account, bytes calldata pubkey) external view returns (uint256)"
      ];
      
      const validatorBoost = new ethers.Contract(
        validatorBoostAddress,
        validatorBoostABI,
        provider.getProvider()
      );
      
      // Load validators if needed
      await this.fetchValidators();
      
      // Check total boosts
      let totalBoosts, totalQueuedBoost;
      try {
        totalBoosts = await this.retryPromise(() => validatorBoost.boosts(normalizedAddress), 3);
        totalQueuedBoost = await this.retryPromise(() => validatorBoost.queuedBoost(normalizedAddress), 3);
      } catch (err) {
        console.error("Error checking total boosts:", err);
        return { 
          activeBoosts: [], 
          queuedBoosts: [],
          error: "Failed to check validator contract. Please try again later."
        };
      }
      
      // Track active and queued boosts
      const activeBoosts = [];
      const queuedBoosts = [];
      
      // Helper function to convert hex string to bytes calldata format
      const hexToBytes = (hexString) => {
        const hexWithPrefix = hexString.startsWith('0x') ? hexString : '0x' + hexString;
        try {
          return ethers.utils.arrayify(hexWithPrefix);
        } catch (err) {
          console.warn(`Failed to convert hex string to bytes: ${hexString}`, err);
          return null;
        }
      };
      
      // Only check individual validators if user has any boost allocation
      if (!totalBoosts.isZero() || !totalQueuedBoost.isZero()) {
        // Get all validators from the map
        const validatorsToCheck = Object.values(this.validatorMap);
        
        // Check validators in batches
        const BATCH_SIZE = 5;
        const totalValidators = validatorsToCheck.length;
        
        for (let i = 0; i < totalValidators; i += BATCH_SIZE) {
          const batch = validatorsToCheck.slice(i, i + BATCH_SIZE);
          
          // Process batch in parallel
          await Promise.all(batch.map(async (validator) => {
            try {
              const validatorKey = validator.pubkey || validator.id;
              if (!validatorKey) return;
              
              // Convert validator key to bytes
              const validatorBytes = hexToBytes(validatorKey);
              if (!validatorBytes) {
                console.warn(`Skipping validator ${validator.name} - invalid pubkey format`);
                return;
              }
              
              // Check for active and queued boosts in parallel
              const [boostAmount, queuedAmount] = await Promise.all([
                this.retryPromise(() => validatorBoost.boosted(normalizedAddress, validatorBytes), 3),
                this.retryPromise(() => validatorBoost.boostedQueue(normalizedAddress, validatorBytes), 3)
              ]);
              
              // Process active boost if exists
              if (!boostAmount.isZero()) {
                // Get total boost for this validator
                const totalValidatorBoost = await this.retryPromise(() => 
                  validatorBoost.boostees(validatorBytes), 3
                );
                
                // Calculate share percentage
                const userBoostAmountFloat = parseFloat(ethers.utils.formatEther(boostAmount));
                const totalBoostFloat = parseFloat(ethers.utils.formatEther(totalValidatorBoost));
                const sharePercent = totalBoostFloat > 0 
                  ? ((userBoostAmountFloat / totalBoostFloat) * 100).toFixed(2)
                  : "0.00";
                
                activeBoosts.push({
                  pubkey: validatorKey,
                  id: validator.id,
                  name: validator.name,
                  userBoostAmount: ethers.utils.formatEther(boostAmount),
                  totalBoost: ethers.utils.formatEther(totalValidatorBoost),
                  share: sharePercent,
                  status: "active"
                });
              }
              
              // Process queued boost if exists
              if (!queuedAmount.isZero()) {
                queuedBoosts.push({
                  pubkey: validatorKey,
                  id: validator.id,
                  name: validator.name,
                  queuedBoostAmount: ethers.utils.formatEther(queuedAmount),
                  status: "queued"
                });
              }
            } catch (err) {
              console.warn(`Error checking boost for validator ${validator.name}:`, err);
            }
          }));
          
          // Small delay between batches
          if (i + BATCH_SIZE < totalValidators) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
      
      return {
        success: true,
        activeBoosts,
        queuedBoosts,
        totalActiveBoost: ethers.utils.formatEther(totalBoosts),
        totalQueuedBoost: ethers.utils.formatEther(totalQueuedBoost)
      };
    } catch (error) {
      return handleError(error, 'ValidatorService.getValidatorBoosts', { 
        success: false,
        error: error.message,
        activeBoosts: [], 
        queuedBoosts: []
      });
    }
  }
  
  /**
   * Boost a validator with BGT tokens
   * @param {string} validatorId - Validator's public key
   * @param {string} amount - Amount of BGT to boost (in ether units)
   * @returns {Promise<Object>} Transaction result
   */
  async boostValidator(validatorId, amount) {
    if (!provider.isInitialized() || !provider.getSigner()) {
      throw new Error("Provider or signer not initialized");
    }
    
    try {
      console.log(`Boosting validator ${validatorId} with ${amount} BGT...`);
      
      // Validate parameters
      if (!validatorId || typeof validatorId !== 'string') {
        throw new Error("Invalid validator ID");
      }
      
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        throw new Error("Invalid boost amount");
      }
      
      // Get validator info to verify it exists
      const validator = await this.findValidatorByPubkey(validatorId);
      if (!validator || validator.name === "Unknown Validator") {
        throw new Error("Validator not found. Please check the validator ID.");
      }
      
      // Convert validator key to bytes
      const hexToBytes = (hexString) => {
        const hexWithPrefix = hexString.startsWith('0x') ? hexString : '0x' + hexString;
        try {
          return ethers.utils.arrayify(hexWithPrefix);
        } catch (err) {
          console.warn(`Failed to convert hex string to bytes: ${hexString}`, err);
          throw new Error("Invalid validator public key format");
        }
      };
      
      const validatorBytes = hexToBytes(validatorId);
      
      // Get BGT token contract
      const bgtAddress = ethers.utils.getAddress(this.contractAddresses.bgtToken.toLowerCase());
      
      // Create contract instance with signer
      const bgtContract = new ethers.Contract(
        bgtAddress,
        [
          "function boost(bytes calldata pubkey, uint256 amount) external",
          "function balanceOf(address account) external view returns (uint256)"
        ],
        provider.getSigner()
      );
      
      // Check user balance first
      const userAddress = await provider.getSigner().getAddress();
      const userBalance = await bgtContract.balanceOf(userAddress);
      const amountWei = ethers.utils.parseEther(amount);
      
      if (userBalance.lt(amountWei)) {
        throw new Error(`Insufficient BGT balance. You have ${ethers.utils.formatEther(userBalance)} BGT but attempted to boost ${amount} BGT.`);
      }
      
      // Execute boost transaction
      const tx = await bgtContract.boost(validatorBytes, amountWei);
      console.log(`Boost transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        return {
          success: true,
          validatorName: validator.name,
          amount,
          txHash: tx.hash
        };
      } else {
        throw new Error("Boost transaction failed");
      }
    } catch (error) {
      return handleError(error, 'ValidatorService.boostValidator', {
        success: false,
        error: error.message
      });
    }
  }
  
  /**
   * Queue a boost for a validator
   * @param {string} validatorId - Validator's public key
   * @param {string} amount - Amount of BGT to queue (in ether units)
   * @returns {Promise<Object>} Transaction result
   */
  async queueBoostValidator(validatorId, amount) {
    if (!provider.isInitialized() || !provider.getSigner()) {
      throw new Error("Provider or signer not initialized");
    }
    
    try {
      console.log(`Queueing boost for validator ${validatorId} with ${amount} BGT...`);
      
      // Validate parameters
      if (!validatorId || typeof validatorId !== 'string') {
        throw new Error("Invalid validator ID");
      }
      
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        throw new Error("Invalid boost amount");
      }
      
      // Get validator info to verify it exists
      const validator = await this.findValidatorByPubkey(validatorId);
      if (!validator || validator.name === "Unknown Validator") {
        throw new Error("Validator not found. Please check the validator ID.");
      }
      
      // Convert validator key to bytes
      const hexToBytes = (hexString) => {
        const hexWithPrefix = hexString.startsWith('0x') ? hexString : '0x' + hexString;
        try {
          return ethers.utils.arrayify(hexWithPrefix);
        } catch (err) {
          console.warn(`Failed to convert hex string to bytes: ${hexString}`, err);
          throw new Error("Invalid validator public key format");
        }
      };
      
      const validatorBytes = hexToBytes(validatorId);
      
      // Get BGT token contract
      const bgtAddress = ethers.utils.getAddress(this.contractAddresses.bgtToken.toLowerCase());
      
      // Create contract instance with signer
      const bgtContract = new ethers.Contract(
        bgtAddress,
        [
          "function queueBoost(bytes calldata pubkey, uint256 amount) external",
          "function balanceOf(address account) external view returns (uint256)"
        ],
        provider.getSigner()
      );
      
      // Check user balance first
      const userAddress = await provider.getSigner().getAddress();
      const userBalance = await bgtContract.balanceOf(userAddress);
      const amountWei = ethers.utils.parseEther(amount);
      
      if (userBalance.lt(amountWei)) {
        throw new Error(`Insufficient BGT balance. You have ${ethers.utils.formatEther(userBalance)} BGT but attempted to queue ${amount} BGT.`);
      }
      
      // Execute queue boost transaction
      const tx = await bgtContract.queueBoost(validatorBytes, amountWei);
      console.log(`Queue boost transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        return {
          success: true,
          validatorName: validator.name,
          amount,
          txHash: tx.hash
        };
      } else {
        throw new Error("Queue boost transaction failed");
      }
    } catch (error) {
      return handleError(error, 'ValidatorService.queueBoostValidator', {
        success: false,
        error: error.message
      });
    }
  }
}

// Export singleton instance
const validatorService = new ValidatorService();
module.exports = validatorService;