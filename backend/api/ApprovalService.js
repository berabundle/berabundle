/**
 * ApprovalService.js - Token approval service for BeraBundle
 * 
 * This service handles token approvals and allowances for the BeraBundle bundler contract.
 */

const { ethers } = require('ethers');
const provider = require('../blockchain/provider');
const contracts = require('../blockchain/contracts');
const tokenService = require('./TokenService');
const { handleError } = require('../utils/errors');

class ApprovalService {
  constructor() {
    this.initialized = false;
  }
  
  /**
   * Initialize the approval service
   * @param {Object} options - Initialization options
   * @returns {boolean} Whether initialization was successful
   */
  initialize(options = {}) {
    try {
      // Ensure token service is initialized
      if (!tokenService.isInitialized() && options.apiKey) {
        tokenService.initialize(options);
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      return handleError(error, 'ApprovalService.initialize', false);
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
   * Resolve a token address from either an address or symbol
   * @param {string} tokenInput - Token address or symbol
   * @returns {Promise<string>} Resolved token address
   */
  async resolveTokenAddress(tokenInput) {
    // If it's already an address, return it
    if (tokenInput.startsWith('0x')) {
      return tokenInput;
    }
    
    // Otherwise, try to resolve the symbol to an address
    const result = await tokenService.fetchOogaBoogaTokens();
    if (result.success) {
      const tokens = result.tokens.data;
      const token = Object.values(tokens).find(t => 
        t.symbol.toLowerCase() === tokenInput.toLowerCase()
      );
      
      if (token) {
        return token.address;
      }
    }
    
    throw new Error(`Token not found: ${tokenInput}`);
  }
  
  /**
   * Get token details (symbol, decimals) from address
   * @param {string} tokenAddress - Token contract address
   * @returns {Promise<Object>} Token details
   */
  async getTokenDetails(tokenAddress) {
    const result = await tokenService.fetchOogaBoogaTokens();
    if (result.success) {
      const tokens = result.tokens.data;
      const normalizedAddress = tokenAddress.toLowerCase();
      
      const token = tokens[normalizedAddress] || Object.values(tokens).find(t => 
        t.address.toLowerCase() === normalizedAddress
      );
      
      if (token) {
        return token;
      }
    }
    
    // If token details not found, attempt to get minimal details from contract
    try {
      const erc20Contract = contracts.getErc20Contract(tokenAddress);
      const [symbol, decimals] = await Promise.all([
        erc20Contract.symbol(),
        erc20Contract.decimals()
      ]);
      
      return { address: tokenAddress, symbol, decimals };
    } catch (error) {
      console.warn(`Failed to get token details from contract: ${error.message}`);
      // Return default details
      return { address: tokenAddress, symbol: 'UNKNOWN', decimals: 18 };
    }
  }
  
  /**
   * Check if a token is approved for the bundler contract
   * @param {string} tokenAddress - The token contract address
   * @param {string} ownerAddress - The token owner address
   * @param {string|number} amount - The amount to check approval for
   * @returns {Promise<Object>} Result containing approval status and details
   */
  async checkApproval(tokenAddress, ownerAddress, amount) {
    try {
      // Resolve token address if symbol was provided
      const resolvedAddress = await this.resolveTokenAddress(tokenAddress);
      
      // Get token details
      const token = await this.getTokenDetails(resolvedAddress);
      
      return {
        ...await contracts.checkTokenApproval(resolvedAddress, ownerAddress, amount),
        token
      };
    } catch (error) {
      return handleError(error, 'ApprovalService.checkApproval', {
        isApproved: false,
        error: error.message
      });
    }
  }
  
  /**
   * Approve a token for the bundler contract
   * @param {string} tokenAddress - The token contract address
   * @param {string|ethers.BigNumber} amount - The amount to approve (use ethers.constants.MaxUint256 for unlimited)
   * @returns {Promise<Object>} Transaction result
   */
  async approveToken(tokenAddress, amount = ethers.constants.MaxUint256) {
    try {
      // Resolve token address if symbol was provided
      const resolvedAddress = await this.resolveTokenAddress(tokenAddress);
      
      // Get token details
      const token = await this.getTokenDetails(resolvedAddress);
      
      // If amount is a string and not a BigNumber, parse it with proper decimals
      let approvalAmount = amount;
      if (typeof amount === 'string' && amount !== 'max' && !ethers.BigNumber.isBigNumber(amount)) {
        approvalAmount = ethers.utils.parseUnits(amount, token.decimals);
      } else if (amount === 'max') {
        approvalAmount = ethers.constants.MaxUint256;
      }
      
      // Send the approval transaction
      const result = await contracts.approveToken(resolvedAddress, approvalAmount);
      
      return {
        ...result,
        token
      };
    } catch (error) {
      return handleError(error, 'ApprovalService.approveToken', {
        success: false,
        error: error.message
      });
    }
  }
  
  /**
   * Revoke token approval from the bundler contract
   * @param {string} tokenAddress - The token contract address
   * @returns {Promise<Object>} Transaction result
   */
  async revokeToken(tokenAddress) {
    try {
      // Resolve token address if symbol was provided
      const resolvedAddress = await this.resolveTokenAddress(tokenAddress);
      
      // Get token details
      const token = await this.getTokenDetails(resolvedAddress);
      
      // Send the revoke transaction
      const result = await contracts.revokeTokenApproval(resolvedAddress);
      
      return {
        ...result,
        token
      };
    } catch (error) {
      return handleError(error, 'ApprovalService.revokeToken', {
        success: false,
        error: error.message
      });
    }
  }
  
  /**
   * Create approval operations for bundled transactions
   * @param {Array<Object>} tokens - Array of token objects to approve
   * @param {string} owner - Address of token owner
   * @returns {Promise<Array<Object>>} Array of approval transactions
   */
  async createApprovalOperations(tokens, owner) {
    try {
      const approvalOperations = [];
      
      // Process each token for approval
      for (const token of tokens) {
        if (token.address === 'native' || token.symbol === 'BERA') {
          continue; // Skip native token
        }
        
        // Check current approval
        const approvalCheck = await this.checkApproval(
          token.address,
          owner,
          token.amount || '1'
        );
        
        if (!approvalCheck.isApproved) {
          // Create approval transaction
          approvalOperations.push({
            token,
            to: contracts.getSwapBundlerAddress(),
            data: '0x', // Will be filled by bundler
            value: '0x0',
            approval: true
          });
        }
      }
      
      return approvalOperations;
    } catch (error) {
      return handleError(error, 'ApprovalService.createApprovalOperations', []);
    }
  }
}

// Export singleton instance
const approvalService = new ApprovalService();
module.exports = approvalService;