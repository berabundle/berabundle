/**
 * provider.js - Ethereum provider module for BeraBundle
 * 
 * This module manages the connection to the blockchain and provides
 * methods for interacting with the Ethereum network.
 */

const { ethers } = require('ethers');
const config = require('../config');
const { handleError } = require('../utils/errors');

class BlockchainProvider {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.network = config.currentNetwork;
    this.initialized = false;
  }
  
  /**
   * Initialize the provider with connection details
   * @param {Object} options - Initialization options
   * @param {string} [options.rpcUrl] - Custom RPC URL (overrides config)
   * @param {Object} [options.signer] - Ethers.js signer to use
   * @param {string} [options.privateKey] - Private key for signing (alternative to signer)
   * @returns {boolean} Success of initialization
   */
  initialize(options = {}) {
    try {
      const rpcUrl = options.rpcUrl || this.network.rpcUrl;
      
      // Create provider
      this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      
      // Set up signer if provided
      if (options.signer) {
        this.signer = options.signer;
      } else if (options.privateKey) {
        this.signer = new ethers.Wallet(options.privateKey, this.provider);
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      return handleError(error, 'BlockchainProvider.initialize', false);
    }
  }
  
  /**
   * Check if provider is initialized
   * @returns {boolean} Whether provider is initialized
   */
  isInitialized() {
    return this.initialized && this.provider !== null;
  }
  
  /**
   * Get the current provider instance
   * @returns {ethers.providers.Provider} Ethers provider
   * @throws {Error} If provider is not initialized
   */
  getProvider() {
    if (!this.isInitialized()) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
    return this.provider;
  }
  
  /**
   * Get the current signer instance
   * @returns {ethers.Signer|null} Ethers signer or null if not available
   * @throws {Error} If provider is not initialized
   */
  getSigner() {
    if (!this.isInitialized()) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
    return this.signer;
  }
  
  /**
   * Set a new signer
   * @param {ethers.Signer|string} signer - Ethers signer object or private key
   * @returns {ethers.Signer} The configured signer
   */
  setSigner(signer) {
    if (!this.isInitialized()) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
    
    if (typeof signer === 'string') {
      // Assume string is a private key
      this.signer = new ethers.Wallet(signer, this.provider);
    } else {
      this.signer = signer;
    }
    
    return this.signer;
  }
  
  /**
   * Get network information
   * @returns {Promise<Object>} Network details
   */
  async getNetwork() {
    if (!this.isInitialized()) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
    
    try {
      return await this.provider.getNetwork();
    } catch (error) {
      return handleError(error, 'BlockchainProvider.getNetwork');
    }
  }
  
  /**
   * Get native token (BERA) balance for an address
   * @param {string} address - Ethereum address
   * @returns {Promise<ethers.BigNumber>} Balance in wei
   */
  async getBalance(address) {
    if (!this.isInitialized()) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
    
    try {
      return await this.provider.getBalance(address);
    } catch (error) {
      return handleError(error, 'BlockchainProvider.getBalance');
    }
  }
  
  /**
   * Get contract instance
   * @param {string} address - Contract address
   * @param {Array|string} abi - Contract ABI
   * @param {boolean} [withSigner=false] - Whether to connect with signer
   * @returns {ethers.Contract} Contract instance
   */
  getContract(address, abi, withSigner = false) {
    if (!this.isInitialized()) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
    
    try {
      const contract = new ethers.Contract(
        address,
        abi,
        this.provider
      );
      
      if (withSigner && this.signer) {
        return contract.connect(this.signer);
      }
      
      return contract;
    } catch (error) {
      return handleError(error, 'BlockchainProvider.getContract');
    }
  }
  
  /**
   * Get gas price information
   * @returns {Promise<Object>} Gas price data
   */
  async getGasPrice() {
    if (!this.isInitialized()) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
    
    try {
      const gasPrice = await this.provider.getGasPrice();
      
      return {
        gasPrice,
        gasPriceGwei: ethers.utils.formatUnits(gasPrice, 'gwei'),
        gasPriceHex: gasPrice.toHexString()
      };
    } catch (error) {
      return handleError(error, 'BlockchainProvider.getGasPrice');
    }
  }
  
  /**
   * Estimate gas for a transaction
   * @param {Object} txParams - Transaction parameters
   * @returns {Promise<ethers.BigNumber>} Estimated gas limit
   */
  async estimateGas(txParams) {
    if (!this.isInitialized()) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
    
    try {
      return await this.provider.estimateGas(txParams);
    } catch (error) {
      return handleError(error, 'BlockchainProvider.estimateGas');
    }
  }
  
  /**
   * Wait for a transaction to be mined
   * @param {string} txHash - Transaction hash
   * @param {number} [confirmations=1] - Number of confirmations to wait for
   * @returns {Promise<ethers.providers.TransactionReceipt>} Transaction receipt
   */
  async waitForTransaction(txHash, confirmations = 1) {
    if (!this.isInitialized()) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
    
    try {
      return await this.provider.waitForTransaction(txHash, confirmations);
    } catch (error) {
      return handleError(error, 'BlockchainProvider.waitForTransaction');
    }
  }
}

// Export singleton instance
const blockchainProvider = new BlockchainProvider();
module.exports = blockchainProvider;