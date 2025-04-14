/**
 * BerabundlerService.js - Service for interacting with the Berabundler contract
 * 
 * This service handles bundling multiple transactions together for atomic execution
 * through the Berabundle_SwapBundler contract on Berachain.
 */

import { ethers } from 'ethers';

// ABI for the Berabundle_SwapBundler contract
const BERABUNDLE_ABI = [
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "uint8",
            "name": "operationType",
            "type": "uint8"
          },
          {
            "internalType": "address",
            "name": "target",
            "type": "address"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          },
          {
            "internalType": "uint256",
            "name": "value",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "tokenAddress",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "tokenAmount",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "outputToken",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "minOutputAmount",
            "type": "uint256"
          }
        ],
        "internalType": "struct Berabundle_SwapBundler.Operation[]",
        "name": "operations",
        "type": "tuple[]"
      }
    ],
    "name": "executeBundle",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

// Operation types
const TYPE_APPROVE = 1;
const TYPE_SWAP = 2;

/**
 * Service for interacting with the Berabundle_SwapBundler contract
 */
class BerabundlerService {
  constructor() {
    // Berabundler_SwapBundler contract address on Berachain
    this.contractAddress = '0xF9b3593C58cd1A2e3D1Fc8ff44Da6421B5828c18';
    this.provider = null;
    this.contract = null;
  }

  /**
   * Initialize the service with a provider
   * @param {ethers.providers.Web3Provider} provider - Ethers provider
   */
  initialize(provider, signer) {
    this.provider = provider;
    this.signer = signer;
    this.contract = new ethers.Contract(this.contractAddress, BERABUNDLE_ABI, signer);
    return Boolean(this.contract);
  }

  /**
   * Check if the service is initialized
   */
  isInitialized() {
    return Boolean(this.contract && this.signer);
  }

  /**
   * Create operations for token approvals
   * @param {Array} approvalTxs - Array of approval transactions
   * @returns {Array} Array of Operation objects for approvals
   */
  createApprovalOperations(approvalTxs) {
    return approvalTxs.map(tx => {
      console.log("Creating approval operation:", tx);
      
      // Ensure we have the router address (target) and token address
      if (!tx.to || !tx.token || !tx.token.address) {
        console.error("Invalid approval transaction:", tx);
        return null;
      }
      
      return {
        operationType: TYPE_APPROVE,
        target: tx.to, // The router/spender address
        data: "0x", // We don't need data for approvals as the contract handles it
        value: 0,
        tokenAddress: tx.token.address, // The token contract address
        tokenAmount: ethers.constants.MaxUint256.toString(), // Max approval
        outputToken: ethers.constants.AddressZero, // Not used for approvals
        minOutputAmount: 0 // Not used for approvals
      };
    }).filter(op => op !== null); // Filter out any invalid operations
  }

  /**
   * Create operations for token swaps
   * @param {Array} swapTxs - Array of swap transactions
   * @returns {Array} Array of Operation objects for swaps
   */
  createSwapOperations(swapTxs) {
    return swapTxs.map(tx => {
      console.log("Creating operation for swap:", JSON.stringify(tx, null, 2));
      
      // Check if this is a native token or ERC20 token swap
      const isNativeToken = tx.token.address === 'native' || tx.token.symbol === 'BERA';
      
      // Extract swapParams for the swap
      const swapParams = tx.swapParams || {};
      
      // Ensure token amount is properly normalized
      let tokenAmount = "0";
      if (!isNativeToken && tx.token.amountIn) {
        tokenAmount = tx.token.amountIn.toString();
      }
      
      // Normalize value 
      let value = "0";
      if (tx.value) {
        value = tx.value.toString();
        // Remove 0x prefix if present for consistency
        if (value.startsWith("0x")) {
          value = ethers.BigNumber.from(value).toString();
        }
      }
      
      // Use API's transaction data directly
      return {
        operationType: TYPE_SWAP,
        target: tx.to, // Router address from API
        data: tx.data, // Use exact data from API response
        value: value,
        tokenAddress: isNativeToken ? ethers.constants.AddressZero : tx.token.address,
        tokenAmount: tokenAmount,
        outputToken: swapParams.outputToken || ethers.constants.AddressZero,
        minOutputAmount: swapParams.minOutput || "0"
      };
    });
  }

  /**
   * Execute a bundle of transactions through the Berabundle_SwapBundler contract
   * @param {Object} bundle - Bundle containing approvals and swap transactions
   * @returns {Promise<Object>} Transaction response
   */
  async executeBundle(bundle) {
    if (!this.isInitialized()) {
      throw new Error("BerabundlerService not initialized");
    }

    try {
      console.log("Executing bundle through Berabundle_SwapBundler...");
      
      // Extract transactions from the bundle
      const approvalTxs = bundle.approvalTxs || [];
      const bundlerApprovalTxs = bundle.bundlerApprovalTxs || [];
      const swapTxs = bundle.swapTxs || [];
      
      console.log("Swap transactions:", JSON.stringify(swapTxs, null, 2));
      
      // Combine approvalTxs and bundlerApprovalTxs since they're both approvals
      const allApprovalTxs = [...approvalTxs, ...bundlerApprovalTxs];
      
      // Create operations for the bundle
      const operations = [
        ...this.createApprovalOperations(allApprovalTxs),
        ...this.createSwapOperations(swapTxs)
      ];
      
      console.log(`Created ${operations.length} operations for SwapBundler`);
      console.log("Operations:", JSON.stringify(operations, null, 2));
      
      // Calculate total value needed for BERA transfers
      let totalValue = ethers.BigNumber.from(0);
      
      operations.forEach(op => {
        if (op.value && op.value !== "0") {
          const opValue = typeof op.value === 'string' ? 
            ethers.BigNumber.from(op.value) : 
            op.value;
          
          totalValue = totalValue.add(opValue);
        }
      });
      
      console.log(`Total value needed: ${ethers.utils.formatEther(totalValue)} BERA`);

      // Gas limit
      const gasLimit = 5000000; // 5 million gas
      console.log(`Setting gas limit to ${gasLimit}`);

      // Execute the bundle
      const tx = await this.contract.executeBundle(
        operations,
        { 
          value: totalValue,
          gasLimit: gasLimit
        }
      );
      
      console.log(`Transaction sent: ${tx.hash}`);
      
      // Wait for the transaction to be mined
      const receipt = await tx.wait();
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
      
      return {
        success: true,
        hash: tx.hash,
        receipt
      };
    } catch (error) {
      console.error("Error executing bundle:", error);
      
      if (error.error && error.error.message) {
        console.error("Detailed error:", error.error.message);
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Execute a direct swap using the Berabundle_SwapBundler contract
   * @param {Object} swapTx - Swap transaction details from the OogaBooga API
   * @returns {Promise<Object>} Transaction response
   */
  async executeDirectSwap(swapTx) {
    if (!this.isInitialized()) {
      throw new Error("BerabundlerService not initialized");
    }

    try {
      console.log("[DEBUG] ======= EXECUTING DIRECT SWAP =======");
      console.log("[DEBUG] Executing direct swap through SwapBundler...");
      console.log("[DEBUG] Swap transaction from API:", JSON.stringify(swapTx, null, 2));
      
      const swapParams = swapTx.swapParams || {};
      
      // Create a single operation for the swap
      const isNativeToken = swapTx.token.address === 'native' || swapTx.token.symbol === 'BERA';
      
      // Ensure token amount is properly normalized
      let tokenAmount = "0";
      if (!isNativeToken && swapTx.token.amountIn) {
        tokenAmount = swapTx.token.amountIn.toString();
      }
      
      // Normalize value 
      let value = "0";
      if (swapTx.value) {
        value = swapTx.value.toString();
        // Remove 0x prefix if present for consistency
        if (value.startsWith("0x")) {
          value = ethers.BigNumber.from(value).toString();
        }
      }
      
      // Create an operation structure that matches the Berabundle_SwapBundler contract
      const operation = {
        operationType: TYPE_SWAP,
        target: swapTx.to, // Router address from API
        data: swapTx.data, // Use exact data from API response
        value: value,
        tokenAddress: isNativeToken ? ethers.constants.AddressZero : swapTx.token.address,
        tokenAmount: tokenAmount,
        outputToken: swapParams.outputToken || ethers.constants.AddressZero,
        minOutputAmount: swapParams.minOutput || "0"
      };
      
      console.log("[DEBUG] Operation for direct swap:", JSON.stringify(operation, null, 2));
      
      const gasLimit = 2000000;
      console.log(`[DEBUG] Setting gas limit to ${gasLimit}`);
      
      // Execute as a single-operation bundle
      const tx = await this.contract.executeBundle(
        [operation],
        { 
          value: isNativeToken ? (swapTx.value || 0) : 0,
          gasLimit: gasLimit
        }
      );
      
      console.log(`[DEBUG] Transaction sent: ${tx.hash}`);
      console.log("[DEBUG] Transaction details:", {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        data: tx.data,
        value: tx.value.toString(),
        gasLimit: tx.gasLimit.toString(),
        gasPrice: tx.gasPrice ? tx.gasPrice.toString() : null,
        nonce: tx.nonce
      });
      
      console.log("[DEBUG] Waiting for transaction confirmation...");
      const receipt = await tx.wait();
      console.log(`[DEBUG] Transaction confirmed in block ${receipt.blockNumber}`);
      console.log("[DEBUG] ======= DIRECT SWAP COMPLETE =======");
      
      return { success: true, hash: tx.hash, receipt };
    } catch (error) {
      console.error("[DEBUG] ======= DIRECT SWAP FAILED =======");
      console.error("[DEBUG] Error executing direct swap:", error);
      if (error.error && error.error.message) {
        console.error("[DEBUG] Detailed error:", error.error.message);
      }
      
      return { success: false, error: error.message };
    }
  }
  /**
   * Execute multiple token swaps in a single bundle transaction
   * @param {Array} swapTxs - Array of swap transactions
   * @returns {Promise<Object>} Transaction response
   */
  async executeBundledSwaps(swapTxs) {
    if (!this.isInitialized()) {
        throw new Error("BerabundlerService not initialized");
    }

    try {
        console.log(`Executing bundled swaps for ${swapTxs.length} tokens...`);
        
        // Create operations for each swap
        const operations = swapTxs.map(tx => {
            const swapParams = tx.swapParams || {};
            if (!swapParams) {
                throw new Error(`Missing swapParams for token ${tx.token.symbol}`);
            }
            
            const isNativeToken = tx.token.address === 'native' || tx.token.symbol === 'BERA';
            const inputToken = isNativeToken ? ethers.constants.AddressZero : tx.token.address;
            
            // Ensure consistent type for input amount
            let inputAmount = "0";
            if (tx.token.amountIn) {
                inputAmount = tx.token.amountIn.toString();
            }
            
            // Normalize value for native token transfers
            let value = "0";
            if (isNativeToken && inputAmount !== "0") {
                value = inputAmount;
            } else if (tx.value) {
                value = tx.value.toString();
                // Convert hex string if needed
                if (value.startsWith("0x")) {
                    value = ethers.BigNumber.from(value).toString();
                }
            }
            
            return {
                operationType: TYPE_SWAP,
                target: tx.to, // Router address
                data: tx.data, // Original router call data
                value: value,
                tokenAddress: inputToken,
                tokenAmount: isNativeToken ? "0" : inputAmount,
                outputToken: swapParams.outputToken || ethers.constants.AddressZero,
                minOutputAmount: swapParams.minOutput || "0"
            };
        });
        
        // Calculate total value for native token transfers
        let totalValue = ethers.BigNumber.from(0);
        operations.forEach(op => {
            if (op.value && op.value !== "0") {
                const opValue = typeof op.value === 'string' ? 
                    ethers.BigNumber.from(op.value) : 
                    op.value;
                
                totalValue = totalValue.add(opValue);
            }
        });
        
        console.log(`Total value needed: ${ethers.utils.formatEther(totalValue)} BERA`);
        console.log(`Created ${operations.length} operations for swaps`);
        
        // Higher gas limit for the bundle
        const gasLimit = 5000000;
        console.log(`Setting gas limit to ${gasLimit}`);
        
        // Execute the bundle 
        const tx = await this.contract.executeBundle(
            operations,
            { 
                value: totalValue,
                gasLimit: gasLimit
            }
        );
        
        console.log(`Transaction sent: ${tx.hash}`);
        
        // Wait for the transaction to be mined
        const receipt = await tx.wait();
        console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
        
        return {
            success: true,
            hash: tx.hash,
            receipt
        };
    } catch (error) {
        console.error("Error executing bundled swaps:", error);
        
        if (error.error && error.error.message) {
            console.error("Detailed error:", error.error.message);
        }
        
        return {
            success: false,
            error: error.message
        };
    }
  }
}

// Export singleton instance
const berabundlerService = new BerabundlerService();
export default berabundlerService;