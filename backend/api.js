/**
 * BeraBundle Public API Interface
 * 
 * This module provides a clean public API for the frontend to interact with the backend services.
 * It simplifies the interface and handles error formatting to make frontend integration easier.
 */

const backend = require('./index');
const { ethers } = require('ethers');

/**
 * Format errors consistently for frontend consumption
 * @param {Error} error - The error object
 * @param {string} context - The context where the error occurred
 * @returns {Object} Formatted error response
 */
function formatError(error, context) {
  return {
    success: false,
    error: error.message || 'Unknown error',
    context,
    timestamp: Date.now()
  };
}

/**
 * Initialize the BeraBundle backend
 * @param {Object} options - Initialization options
 * @param {string} [options.apiKey] - OogaBooga API key
 * @param {Object} [options.provider] - Custom provider for blockchain interactions
 * @param {Object} [options.signer] - Signer for blockchain transactions
 * @returns {Object} Initialization result
 */
async function initialize(options = {}) {
  try {
    return await backend.initialize(options);
  } catch (error) {
    return formatError(error, 'initialize');
  }
}

/**
 * Get backend initialization status
 * @returns {Object} Status of each component
 */
function getStatus() {
  try {
    return {
      success: true,
      status: backend.isInitialized()
    };
  } catch (error) {
    return formatError(error, 'getStatus');
  }
}

/**
 * Token API
 */
const tokens = {
  /**
   * Get a list of available tokens
   * @param {Object} options - Options for filtering tokens
   * @returns {Promise<Object>} Token list
   */
  getList: async (options = {}) => {
    try {
      return await backend.services.token.getTokenList(options);
    } catch (error) {
      return formatError(error, 'tokens.getList');
    }
  },
  
  /**
   * Get token price in USD
   * @param {string} tokenAddress - Token address
   * @returns {Promise<Object>} Token price
   */
  getPrice: async (tokenAddress) => {
    try {
      const price = await backend.services.token.getTokenPrice(tokenAddress);
      return {
        success: true,
        price,
        address: tokenAddress,
        timestamp: Date.now()
      };
    } catch (error) {
      return formatError(error, 'tokens.getPrice');
    }
  },
  
  /**
   * Get token balance for an address
   * @param {string} address - Wallet address
   * @param {string} tokenAddress - Token address
   * @returns {Promise<Object>} Token balance
   */
  getBalance: async (address, tokenAddress) => {
    try {
      const balance = await backend.services.token.getTokenBalance(address, tokenAddress);
      return {
        success: true,
        balance,
        address,
        tokenAddress,
        timestamp: Date.now()
      };
    } catch (error) {
      return formatError(error, 'tokens.getBalance');
    }
  },
  
  /**
   * Get native (BERA) balance for an address
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} Native balance
   */
  getNativeBalance: async (address) => {
    try {
      const balance = await backend.services.token.getNativeBalance(address);
      return {
        success: true,
        balance,
        address,
        timestamp: Date.now()
      };
    } catch (error) {
      return formatError(error, 'tokens.getNativeBalance');
    }
  },
};

/**
 * Swaps API
 */
const swaps = {
  /**
   * Check bundler approval
   * @param {string} tokenAddress - Token address
   * @param {string} ownerAddress - Owner address
   * @param {string} amount - Amount to check (in token units)
   * @returns {Promise<Object>} Approval result
   */
  checkApproval: async (tokenAddress, ownerAddress, amount) => {
    try {
      const result = await backend.services.swap.checkBundlerApproval(
        tokenAddress, ownerAddress, amount
      );
      return {
        success: true,
        approved: result,
        tokenAddress,
        ownerAddress,
        amount,
        timestamp: Date.now()
      };
    } catch (error) {
      return formatError(error, 'swaps.checkApproval');
    }
  },
  
  /**
   * Create swap bundle
   * @param {string} fromAddress - From address
   * @param {Array} tokensToSwap - Tokens to swap
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Bundle result
   */
  createBundle: async (fromAddress, tokensToSwap, options = {}) => {
    try {
      return await backend.services.swap.createSwapBundle(
        fromAddress, tokensToSwap, options
      );
    } catch (error) {
      return formatError(error, 'swaps.createBundle');
    }
  },
  
  /**
   * Execute swap bundle
   * @param {Object} bundle - Bundle to execute
   * @returns {Promise<Object>} Execution result
   */
  executeBundle: async (bundle) => {
    try {
      return await backend.services.swap.executeSwapBundle(bundle);
    } catch (error) {
      return formatError(error, 'swaps.executeBundle');
    }
  }
};

/**
 * Rewards API
 */
const rewards = {
  /**
   * Check all rewards for an address
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} Rewards information
   */
  getAll: async (address) => {
    try {
      return await backend.services.rewards.checkRewards(address);
    } catch (error) {
      return formatError(error, 'rewards.getAll');
    }
  },
  
  /**
   * Check BGT Staker rewards
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} BGT Staker rewards
   */
  getBGTStakerRewards: async (address) => {
    try {
      const result = await backend.services.rewards.checkBGTStakerRewards(address);
      return {
        success: true,
        reward: result,
        address,
        timestamp: Date.now()
      };
    } catch (error) {
      return formatError(error, 'rewards.getBGTStakerRewards');
    }
  },
  
  /**
   * Check vault rewards
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} Vault rewards
   */
  getVaultRewards: async (address) => {
    try {
      const rewards = await backend.services.rewards.checkVaultRewards(address);
      return {
        success: true,
        rewards,
        count: rewards.length,
        address,
        timestamp: Date.now()
      };
    } catch (error) {
      return formatError(error, 'rewards.getVaultRewards');
    }
  },
  
  /**
   * Claim rewards
   * @param {string} address - Wallet address
   * @param {Array} selectedRewards - Selected rewards to claim
   * @returns {Promise<Object>} Claim result
   */
  claim: async (address, selectedRewards) => {
    try {
      return await backend.services.rewards.claimRewards(address, selectedRewards);
    } catch (error) {
      return formatError(error, 'rewards.claim');
    }
  }
};

/**
 * Validators API
 */
const validators = {
  /**
   * Get validators list
   * @param {boolean} [useCache=true] - Whether to use cache
   * @returns {Promise<Object>} Validators list
   */
  getList: async (useCache = true) => {
    try {
      return await backend.services.validator.getValidators(useCache);
    } catch (error) {
      return formatError(error, 'validators.getList');
    }
  },
  
  /**
   * Get validator boosts for an address
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} Validator boosts
   */
  getBoosts: async (address) => {
    try {
      return await backend.services.validator.getValidatorBoosts(address);
    } catch (error) {
      return formatError(error, 'validators.getBoosts');
    }
  },
  
  /**
   * Boost a validator
   * @param {string} validatorId - Validator ID
   * @param {string} amount - Amount to boost
   * @returns {Promise<Object>} Boost result
   */
  boost: async (validatorId, amount) => {
    try {
      return await backend.services.validator.boostValidator(validatorId, amount);
    } catch (error) {
      return formatError(error, 'validators.boost');
    }
  },
  
  /**
   * Queue a boost for a validator
   * @param {string} validatorId - Validator ID
   * @param {string} amount - Amount to queue
   * @returns {Promise<Object>} Queue result
   */
  queueBoost: async (validatorId, amount) => {
    try {
      return await backend.services.validator.queueBoostValidator(validatorId, amount);
    } catch (error) {
      return formatError(error, 'validators.queueBoost');
    }
  }
};

/**
 * Blockchain connection API
 */
const blockchain = {
  /**
   * Connect to blockchain with a provider and optional signer
   * @param {Object} options - Connection options
   * @param {Object} [options.provider] - Custom provider
   * @param {Object} [options.signer] - Custom signer
   * @returns {Promise<Object>} Connection result
   */
  connect: async (options = {}) => {
    try {
      const result = await backend.provider.initialize(options);
      return {
        success: result,
        connected: backend.provider.isInitialized(),
        timestamp: Date.now()
      };
    } catch (error) {
      return formatError(error, 'blockchain.connect');
    }
  },
  
  /**
   * Connect with browser provider (e.g., MetaMask)
   * @returns {Promise<Object>} Connection result
   */
  connectBrowser: async () => {
    try {
      // Only works in browser environment
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('Browser provider not available');
      }
      
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();
      
      const result = await backend.provider.initialize({
        customProvider: provider,
        customSigner: signer
      });
      
      return {
        success: result,
        connected: backend.provider.isInitialized(),
        address: await signer.getAddress(),
        timestamp: Date.now()
      };
    } catch (error) {
      return formatError(error, 'blockchain.connectBrowser');
    }
  },
  
  /**
   * Get current connection status
   * @returns {Object} Connection status
   */
  getStatus: () => {
    try {
      const provider = backend.provider;
      return {
        success: true,
        connected: provider.isInitialized(),
        network: provider.getNetwork(),
        hasProvider: provider.hasProvider(),
        hasSigner: provider.hasSigner(),
        timestamp: Date.now()
      };
    } catch (error) {
      return formatError(error, 'blockchain.getStatus');
    }
  }
};

// Export the public API
module.exports = {
  initialize,
  getStatus,
  tokens,
  swaps,
  rewards,
  validators,
  blockchain
};