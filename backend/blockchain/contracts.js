/**
 * contracts.js - Smart contract interaction module for BeraBundle
 * 
 * This module provides contract instances and methods for interacting
 * with the BeraBundle smart contracts and other relevant contracts.
 */

const { ethers } = require('ethers');
const config = require('../config');
const provider = require('./provider');
const { handleError } = require('../utils/errors');

class ContractManager {
  constructor() {
    this.contracts = {};
    this.network = config.currentNetwork;
    this.swapBundlerAddress = this.network.swapBundlerAddress;
  }
  
  /**
   * Get the swap bundler contract instance
   * @param {boolean} [withSigner=true] - Whether to connect with signer
   * @returns {ethers.Contract} SwapBundler contract
   */
  getSwapBundlerContract(withSigner = true) {
    if (!provider.isInitialized()) {
      throw new Error('Provider not initialized');
    }
    
    // Check if we already have the contract instance
    if (this.contracts.swapBundler) {
      if (withSigner && provider.getSigner()) {
        return this.contracts.swapBundler.connect(provider.getSigner());
      }
      return this.contracts.swapBundler;
    }
    
    // Create new contract instance
    this.contracts.swapBundler = provider.getContract(
      this.swapBundlerAddress,
      config.contractAbis.swapBundler,
      withSigner
    );
    
    return this.contracts.swapBundler;
  }
  
  /**
   * Get an ERC20 token contract instance
   * @param {string} tokenAddress - Token contract address
   * @param {boolean} [withSigner=false] - Whether to connect with signer
   * @returns {ethers.Contract} ERC20 contract
   */
  getErc20Contract(tokenAddress, withSigner = false) {
    if (!provider.isInitialized()) {
      throw new Error('Provider not initialized');
    }
    
    // Create unique key for this token contract
    const key = `erc20:${tokenAddress}`;
    
    // Check if we already have the contract instance
    if (this.contracts[key]) {
      if (withSigner && provider.getSigner()) {
        return this.contracts[key].connect(provider.getSigner());
      }
      return this.contracts[key];
    }
    
    // Create new contract instance
    this.contracts[key] = provider.getContract(
      tokenAddress,
      config.contractAbis.erc20,
      withSigner
    );
    
    return this.contracts[key];
  }
  
  /**
   * Check if a token is approved for the bundler contract
   * @param {string} tokenAddress - Token contract address
   * @param {string} ownerAddress - Token owner address
   * @param {string|ethers.BigNumber} amount - Amount to check approval for
   * @returns {Promise<Object>} Approval status and details
   */
  async checkTokenApproval(tokenAddress, ownerAddress, amount) {
    try {
      const tokenContract = this.getErc20Contract(tokenAddress);
      
      // Get token decimals
      let decimals = 18;
      try {
        decimals = await tokenContract.decimals();
      } catch (e) {
        console.warn(`Could not get decimals for ${tokenAddress}, using default of 18`);
      }
      
      // Convert amount to BigNumber if needed
      let amountBN;
      if (ethers.BigNumber.isBigNumber(amount)) {
        amountBN = amount;
      } else {
        try {
          amountBN = ethers.utils.parseUnits(amount.toString(), decimals);
        } catch (e) {
          return handleError(e, 'ContractManager.checkTokenApproval', {
            isApproved: false,
            error: `Invalid amount: ${e.message}`
          });
        }
      }
      
      // Check allowance
      const allowance = await tokenContract.allowance(ownerAddress, this.swapBundlerAddress);
      const isApproved = allowance.gte(amountBN);
      
      // Format for easier use
      const formattedAllowance = ethers.utils.formatUnits(allowance, decimals);
      const formattedAmount = ethers.utils.formatUnits(amountBN, decimals);
      
      return {
        isApproved,
        allowance,
        formattedAllowance,
        requiredAmount: amountBN,
        formattedRequiredAmount: formattedAmount,
        decimals
      };
    } catch (error) {
      return handleError(error, 'ContractManager.checkTokenApproval', {
        isApproved: false,
        error: error.message
      });
    }
  }
  
  /**
   * Approve token for the swap bundler contract
   * @param {string} tokenAddress - Token contract address
   * @param {string|ethers.BigNumber} [amount] - Amount to approve (defaults to unlimited)
   * @returns {Promise<Object>} Transaction result
   */
  async approveToken(tokenAddress, amount = ethers.constants.MaxUint256) {
    try {
      if (!provider.getSigner()) {
        throw new Error('Signer not available');
      }
      
      const tokenContract = this.getErc20Contract(tokenAddress, true);
      
      // Send the approval transaction
      const tx = await tokenContract.approve(this.swapBundlerAddress, amount);
      console.log(`Approval transaction sent: ${tx.hash}`);
      
      // Wait for the transaction to be confirmed
      const receipt = await tx.wait();
      
      return {
        success: true,
        hash: tx.hash,
        receipt
      };
    } catch (error) {
      return handleError(error, 'ContractManager.approveToken', {
        success: false,
        error: error.message
      });
    }
  }
  
  /**
   * Revoke token approval from the swap bundler contract
   * @param {string} tokenAddress - Token contract address
   * @returns {Promise<Object>} Transaction result
   */
  async revokeTokenApproval(tokenAddress) {
    try {
      if (!provider.getSigner()) {
        throw new Error('Signer not available');
      }
      
      const tokenContract = this.getErc20Contract(tokenAddress, true);
      
      // Send approval transaction with zero amount to revoke
      const tx = await tokenContract.approve(this.swapBundlerAddress, 0);
      console.log(`Revoke transaction sent: ${tx.hash}`);
      
      // Wait for the transaction to be confirmed
      const receipt = await tx.wait();
      
      return {
        success: true,
        hash: tx.hash,
        receipt
      };
    } catch (error) {
      return handleError(error, 'ContractManager.revokeTokenApproval', {
        success: false,
        error: error.message
      });
    }
  }
  
  /**
   * Create operations for token approvals
   * @param {Array} approvalTxs - Array of approval transactions
   * @returns {Array} Array of operations for the bundler contract
   */
  createApprovalOperations(approvalTxs) {
    return approvalTxs.map(tx => {
      // Ensure we have the router address (target) and token address
      if (!tx.to || !tx.token || !tx.token.address) {
        console.error("Invalid approval transaction:", tx);
        return null;
      }
      
      return {
        operationType: config.constants.OPERATION_TYPE_APPROVE,
        target: tx.to, // The router/spender address
        data: "0x", // We don't need data for approvals as the contract handles it
        value: 0,
        tokenAddress: tx.token.address, // The token contract address
        tokenAmount: ethers.constants.MaxUint256.toString(), // Max approval
        outputToken: config.constants.ZERO_ADDRESS, // Not used for approvals
        minOutputAmount: 0 // Not used for approvals
      };
    }).filter(op => op !== null); // Filter out any invalid operations
  }
  
  /**
   * Create operations for token swaps
   * @param {Array} swapTxs - Array of swap transactions
   * @returns {Array} Array of operations for the bundler contract
   */
  createSwapOperations(swapTxs) {
    return swapTxs.map(tx => {
      // Check if this is a native token or ERC20 token swap
      const isNativeToken = tx.token.address === 'native' || tx.token.symbol === 'BERA' || 
                            tx.token.address === '0x0000000000000000000000000000000000000000';
      
      // Extract swapParams for the swap
      const swapParams = tx.swapParams || {};
      
      console.log(`[Contracts] Creating swap operation for ${tx.token.symbol} (${tx.token.address})`, {
        isNative: isNativeToken,
        value: tx.value,
        amount: tx.token.amount,
        amountIn: tx.token.amountIn
      });
      
      // Use API's transaction data directly
      return {
        operationType: config.constants.OPERATION_TYPE_SWAP,
        target: tx.to, // Router address from API
        data: tx.data, // Use exact data from API response
        value: isNativeToken ? tx.token.amountIn : (tx.value || "0"), // Use amountIn as value for native token swaps
        tokenAddress: isNativeToken ? config.constants.ZERO_ADDRESS : tx.token.address,
        tokenAmount: isNativeToken ? 0 : tx.token.amountIn,
        outputToken: swapParams.outputToken || config.constants.ZERO_ADDRESS,
        minOutputAmount: swapParams.minOutput || 0
      };
    });
  }
  
  /**
   * Execute operations through the swap bundler contract
   * @param {Array} operations - Operations to execute
   * @param {Object} [options] - Execution options
   * @param {ethers.BigNumber|string} [options.value] - ETH value to send
   * @param {ethers.BigNumber|number} [options.gasLimit] - Gas limit for transaction
   * @returns {Promise<Object>} Transaction result
   */
  async executeOperations(operations, options = {}) {
    try {
      if (!provider.getSigner()) {
        throw new Error('Signer not available');
      }
      
      const swapBundler = this.getSwapBundlerContract(true);
      
      // Calculate total value needed for ETH transfers
      let totalValue = ethers.BigNumber.from(0);
      if (options.value) {
        totalValue = ethers.BigNumber.isBigNumber(options.value) 
          ? options.value 
          : ethers.BigNumber.from(options.value);
      } else {
        operations.forEach(op => {
          if (op.value && op.value !== "0") {
            const opValue = typeof op.value === 'string' 
              ? ethers.BigNumber.from(op.value) 
              : op.value;
            
            totalValue = totalValue.add(opValue);
          }
        });
      }
      
      // Default gas limit
      const gasLimit = options.gasLimit || 5000000;
      
      // Execute the bundle
      const tx = await swapBundler.executeBundle(
        operations,
        { 
          value: totalValue,
          gasLimit
        }
      );
      
      console.log(`Transaction sent: ${tx.hash}`);
      
      // Wait for the transaction to be mined
      const receipt = await tx.wait();
      
      return {
        success: true,
        hash: tx.hash,
        receipt
      };
    } catch (error) {
      return handleError(error, 'ContractManager.executeOperations', {
        success: false,
        error: error.message
      });
    }
  }
  
  /**
   * Execute a bundled swap
   * @param {Object} bundle - Bundle containing approval and swap transactions
   * @returns {Promise<Object>} Transaction result
   */
  async executeBundle(bundle) {
    try {
      console.log("Executing bundle through Berabundle_SwapBundler...");
      
      // Extract transactions from the bundle
      const approvalTxs = bundle.approvalTxs || [];
      const bundlerApprovalTxs = bundle.bundlerApprovalTxs || [];
      const swapTxs = bundle.swapTxs || [];
      
      // Combine approvalTxs and bundlerApprovalTxs since they're both approvals
      const allApprovalTxs = [...approvalTxs, ...bundlerApprovalTxs];
      
      // Create operations for the bundle
      const operations = [
        ...this.createApprovalOperations(allApprovalTxs),
        ...this.createSwapOperations(swapTxs)
      ];
      
      console.log(`Created ${operations.length} operations for SwapBundler`);
      
      // Execute the operations
      return await this.executeOperations(operations);
    } catch (error) {
      return handleError(error, 'ContractManager.executeBundle', {
        success: false,
        error: error.message
      });
    }
  }
  
  /**
   * Execute a direct swap (single swap transaction)
   * @param {Object} swapTx - Swap transaction details
   * @returns {Promise<Object>} Transaction result
   */
  async executeDirectSwap(swapTx) {
    try {
      console.log("Executing direct swap through SwapBundler...");
      
      const swapParams = swapTx.swapParams || {};
      
      // Check if this is a native token swap (check both address and symbol)
      const isNativeToken = swapTx.token.address === 'native' || 
                           swapTx.token.symbol === 'BERA' || 
                           swapTx.token.address === '0x0000000000000000000000000000000000000000';
      
      console.log(`[Contracts] Executing direct swap with ${swapTx.token.symbol} (${swapTx.token.address})`, {
        isNative: isNativeToken,
        amount: swapTx.token.amount,
        amountIn: swapTx.token.amountIn,
        value: swapTx.value
      });
      
      // Create a single operation for the swap
      const operation = {
        operationType: config.constants.OPERATION_TYPE_SWAP,
        target: swapTx.to, // Router address from API
        data: swapTx.data, // Use exact data from API response
        value: isNativeToken ? swapTx.token.amountIn : (swapTx.value || "0"), // Use amountIn for native token value
        tokenAddress: isNativeToken ? config.constants.ZERO_ADDRESS : swapTx.token.address,
        tokenAmount: isNativeToken ? 0 : swapTx.token.amountIn,
        outputToken: swapParams.outputToken || config.constants.ZERO_ADDRESS,
        minOutputAmount: swapParams.minOutput || 0
      };
      
      // Execute as a single-operation bundle
      return await this.executeOperations(
        [operation],
        { 
          value: isNativeToken ? (swapTx.value || 0) : 0,
          gasLimit: 2000000
        }
      );
    } catch (error) {
      return handleError(error, 'ContractManager.executeDirectSwap', {
        success: false,
        error: error.message
      });
    }
  }
}

// Export singleton instance
const contractManager = new ContractManager();
module.exports = contractManager;