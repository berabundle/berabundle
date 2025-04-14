/**
 * BeraBundle Backend Services
 * 
 * This is the main entry point for the backend services.
 * It exports all services and provides a unified initialization function.
 */

const apiCore = require('./api/core');
const tokenService = require('./api/TokenService');
const swapService = require('./api/SwapService');
const approvalService = require('./api/ApprovalService');
const rewardsService = require('./api/RewardsService');
const validatorService = require('./api/ValidatorService');
const provider = require('./blockchain/provider');
const contracts = require('./blockchain/contracts');
const config = require('./config');
const env = require('./config/env');

/**
 * Initialize all backend services with a single call
 * 
 * @param {Object} options - Initialization options
 * @param {string} [options.apiKey] - OogaBooga API key for API access
 * @param {Object} [options.provider] - Custom Web3 provider (optional)
 * @param {Object} [options.signer] - Custom signer for transactions (optional)
 * @param {boolean} [options.withCache=true] - Whether to use caching (default true)
 * @returns {Object} Initialization status for each service
 */
function initializeBackend(options = {}) {
  console.log('Initializing BeraBundle backend services...');
  
  // Track initialization status
  const status = {
    api: false,
    provider: false,
    services: {
      token: false,
      swap: false,
      approval: false,
      rewards: false,
      validator: false
    }
  };
  
  try {
    // 1. Initialize API core
    // API key is already loaded from env in apiCore constructor,
    // but can be overridden by options
    if (options.apiKey) {
      apiCore.configure({ apiKey: options.apiKey });
    }
    
    // Check if API is configured with a key (use verbose mode for initial setup)
    status.api = apiCore.isConfigured(true);
    
    if (status.api) {
      console.log('API core initialized with API key');
    } else {
      console.warn('No API key found. Services requiring API access will be limited.');
      console.warn('Set BERABUNDLE_API_KEY environment variable or use CLI to set a key.');
    }
    
    // 2. Initialize blockchain provider
    const providerOptions = {
      customProvider: options.provider,
      customSigner: options.signer
    };
    
    const providerInitialized = provider.initialize(providerOptions);
    status.provider = providerInitialized;
    
    if (providerInitialized) {
      console.log('Blockchain provider initialized');
    } else {
      console.warn('Blockchain provider initialization failed');
    }
    
    // 3. Initialize services
    // Each service will handle its own dependencies internally
    
    // Token Service
    status.services.token = tokenService.initialize(options);
    
    // Approval Service
    status.services.approval = approvalService.initialize(options);
    
    // Swap Service
    status.services.swap = swapService.initialize(options);
    
    // Rewards Service
    status.services.rewards = rewardsService.initialize(options);
    
    // Validator Service
    status.services.validator = validatorService.initialize(options);
    
    console.log('Backend services initialized successfully');
    
    return {
      success: true,
      status
    };
  } catch (error) {
    console.error('Error initializing backend services:', error);
    return {
      success: false,
      error: error.message,
      status
    };
  }
}

/**
 * Check if backend services are initialized
 * @returns {Object} Status of each service
 */
function isInitialized() {
  return {
    api: apiCore.isConfigured(false), // Don't log on status check
    provider: provider.isInitialized(),
    services: {
      token: tokenService.isInitialized(),
      approval: approvalService.isInitialized(),
      swap: swapService.isInitialized(),
      rewards: rewardsService.isInitialized(),
      validator: validatorService.isInitialized()
    }
  };
}

// Export the backend interface
module.exports = {
  // Main initialization function
  initialize: initializeBackend,
  isInitialized,
  
  // Core modules
  config,
  apiCore,
  provider,
  contracts,
  
  // Services
  services: {
    token: tokenService,
    approval: approvalService,
    swap: swapService,
    rewards: rewardsService,
    validator: validatorService
  }
};