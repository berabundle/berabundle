/**
 * TokenBridge.js - Bridge between React UI and the backend TokenService
 * 
 * This adapter now communicates with the TokenService in the backend
 * via the ApiClient instead of making direct API calls to OogaBooga.
 */

import { ethers } from 'ethers';
import berabundlerService from './BerabundlerService';
import apiClient from './ApiClient';

/**
 * Service for fetching token balances and prices in the React UI
 */
class TokenBridge {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.bundlerContract = '0xF9b3593C58cd1A2e3D1Fc8ff44Da6421B5828c18'; // Berabundle_SwapBundler address
  }
  
  /**
   * Initialize the bridge with a provider and signer
   * @param {ethers.providers.Web3Provider} provider - Ethers provider
   * @param {string} apiKey - OogaBooga API key
   * @param {ethers.Signer} signer - Ethers signer
   */
  initialize(provider, apiKey, signer) {
    this.provider = provider;
    this.signer = signer;
    
    // Initialize the ApiClient with the API key
    apiClient.initialize({ apiKey });
    
    // Initialize the BerabundlerService
    if (provider && signer) {
      berabundlerService.initialize(provider, signer);
    }
    
    return Boolean(provider && apiClient.isInitialized() && signer);
  }
  
  /**
   * Check if the bridge is initialized
   */
  isInitialized() {
    return Boolean(this.provider && apiClient.isInitialized() && this.signer);
  }
  
  /**
   * Makes an authenticated API call to the backend API
   * 
   * @param {string} endpoint - API endpoint path
   * @param {Object} params - Query parameters to include in the request
   * @returns {Promise<Object>} API response data
   * @throws {Error} If API client is not initialized or API call fails
   */
  async apiCallWithAuth(endpoint, params = {}) {
    if (!apiClient.isInitialized()) {
      throw new Error("API client not initialized. Please set API key in settings.");
    }
    
    try {
      // Use the API client to make the request
      const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      return await apiClient.get(url, params);
    } catch (error) {
      console.error('[DEBUG] API call failed:', error);
      throw error;
    }
  }
  
  /**
   * Retrieves the current USD price for a token
   * 
   * @param {string} tokenAddress - Token contract address or 'BERA'/'native' for native token
   * @returns {Promise<number|null>} Current price in USD or null if unavailable
   */
  async getTokenPrice(tokenAddress) {
    try {
      if (!apiClient.isInitialized()) {
        throw new Error("API client not initialized.");
      }
      
      // Format token address correctly for API
      const normalizedAddress = tokenAddress === 'BERA' || tokenAddress === 'native' 
        ? '0x0000000000000000000000000000000000000000' 
        : tokenAddress;
      
      // Get token price from backend API
      const result = await apiClient.getTokenPrice(normalizedAddress);
      
      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to get token price from backend");
      }
      
      return parseFloat(result.price);
    } catch (error) {
      console.error(`Error fetching token price for ${tokenAddress}:`, error);
      throw error; // Propagate the error to handle it in calling code
    }
  }
  
  /**
   * Gets native BERA balance for an address
   * 
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} Balance information
   */
  async getNativeBalance(address) {
    try {
      if (!apiClient.isInitialized()) {
        throw new Error("API client not initialized.");
      }
      
      const result = await apiClient.getNativeBalance(address);
      
      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to get native balance from backend");
      }
      
      return result.balance;
    } catch (error) {
      console.error(`Error fetching native balance for ${address}:`, error);
      throw error; // Propagate the error to handle it in calling code
    }
  }
  
  /**
   * Gets token balance for a specific ERC20 token
   * 
   * @param {string} address - Wallet address
   * @param {Object} token - Token data (address, symbol, name, decimals)
   * @returns {Promise<Object|null>} Token with balance data or null if error/zero balance
   */
  async getTokenBalance(address, token) {
    try {
      if (!apiClient.isInitialized()) {
        throw new Error("API client not initialized.");
      }
      
      // Skip tokens without an address
      if (!token.address || token.address === 'native') {
        return null;
      }
      
      const result = await apiClient.getTokenBalance(address, token.address);
      
      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to get token balance from backend");
      }
      
      // Combine the token metadata with the balance data
      return {
        ...token,
        ...result.balance
      };
    } catch (error) {
      console.error(`Error fetching balance for ${token.symbol || token.address}:`, error);
      throw error; // Propagate the error to handle it in calling code
    }
  }
  
  /**
   * Fetches common token list from the backend
   * 
   * @returns {Promise<Array>} Array of token objects
   */
  async getCommonTokens() {
    try {
      if (!apiClient.isInitialized()) {
        throw new Error("API client not initialized.");
      }
      
      const result = await apiClient.getTokenList({ common: true });
      
      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to get common tokens from backend");
      }
      
      return result.tokens;
    } catch (error) {
      console.error("Error fetching common tokens:", error);
      throw error; // Propagate the error to handle it in calling code
    }
  }
  
  /**
   * Gets all token balances for a wallet address
   * 
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} Object with balances categorized by token type
   */
  async getAllBalances(address) {
    try {
      if (!apiClient.isInitialized()) {
        throw new Error("API client not initialized.");
      }
      
      console.log(`[TokenBridge] Fetching all balances for address: ${address}`);
      const result = await apiClient.getAllBalances(address);
      console.log(`[TokenBridge] Received balance result:`, result);
      
      if (!result || !result.success) {
        console.error(`[TokenBridge] Failed to get balances:`, result);
        throw new Error(result?.error || "Failed to get all balances from backend");
      }
      
      // Check if tokens array is present and properly structured
      if (!result.tokens || !Array.isArray(result.tokens)) {
        console.error('[TokenBridge] Tokens array is missing or not an array:', result.tokens);
        result.tokens = []; // Provide a default empty array
      }
      
      // Check if native token is properly structured
      if (!result.native) {
        console.error('[TokenBridge] Native token data is missing');
        // Create a minimal native token object to prevent UI errors
        result.native = {
          name: 'BERA',
          symbol: 'BERA',
          address: 'native',
          decimals: 18,
          balance: '0',
          formattedBalance: '0',
          priceUsd: 0,
          valueUsd: 0,
          formattedValueUsd: '$0.00',
          isNative: true
        };
      }
      
      return result;
    } catch (error) {
      console.error(`[TokenBridge] Error fetching all balances for ${address}:`, error);
      throw error; // Propagate the error to handle it in calling code
    }
  }

/**
 * Creates a swap bundle for the Berabundler contract
 * @param {string} fromAddress - Wallet address initiating the swaps
 * @param {Array<Object>} tokensToSwap - Array of token objects with amount to swap
 * @param {Object} options - Additional options for bundle creation
 * @param {Object} options.targetToken - The token to swap to (defaults to BERA)
 * @returns {Promise<Object>} Bundle containing transaction data and expected output
 */
async createSwapBundle(fromAddress, tokensToSwap, options = {}) {
  try {
    if (!apiClient.isInitialized()) {
      throw new Error("API client not initialized.");
    }
    
    const targetToken = options.targetToken || { address: '0x0000000000000000000000000000000000000000', symbol: 'BERA', decimals: 18 };
    console.log(`Creating swap bundle for ${fromAddress} with ${tokensToSwap.length} tokens, target: ${targetToken.symbol}`);
    
    console.log("[DEBUG] Sending to backend:", {
      fromAddress, 
      tokensCount: tokensToSwap.length,
      tokensInfo: tokensToSwap.map(t => `${t.symbol}: ${t.amount}`)
    });
    
    // Use backend API to create the swap bundle
    const result = await apiClient.createSwapBundle(fromAddress, tokensToSwap, {
      targetToken: targetToken,
      regenerateOnExecute: true // Ensure fresh quotes when executing
    });
    
    console.log("[DEBUG] Backend response:", result);
    
    // The backend returns a bundle object directly, not with a success field
    // We check if the response has swapTxs to determine success
    if (!result || !result.swapTxs || result.swapTxs.length === 0) {
      const errorMsg = result?.error || "Failed to create swap bundle";
      console.error("[DEBUG] Bundle creation error:", errorMsg);
      throw new Error(errorMsg);
    }
    
    return result;
  } catch (error) {
    console.error("Error creating swap bundle:", error);
    return {
      success: false,
      error: error.message,
      fromAddress,
      swapTxs: [],
      approvalTxs: [],
      bundlerApprovalTxs: []
    };
  }
}
  
  /**
   * Check if a token is approved for the bundler contract
   * @param {string} tokenAddress - The token contract address
   * @param {string} ownerAddress - The token owner address
   * @param {string|number} amount - The amount to check approval for
   * @returns {Promise<Object>} Result containing approval status and details
   */
  async checkBundlerApproval(tokenAddress, ownerAddress, amount) {
    try {
      if (!apiClient.isInitialized()) {
        throw new Error("API client not initialized.");
      }
      
      console.log(`Checking approval for token ${tokenAddress}, amount: ${amount}`);
      
      // Use the backend API to check the approval
      const result = await apiClient.checkApproval(tokenAddress, ownerAddress, amount);
      
      console.log(`Approval check result for ${tokenAddress}:`, result);
      
      // If there's no token info but we have amount data, calculate USD values if possible
      if (result && result.token && this.provider) {
        try {
          // Get token price to calculate USD values
          const tokenPrice = result.token.priceUsd ? 
            parseFloat(result.token.priceUsd) : 
            await this.getTokenPrice(tokenAddress);
            
          if (tokenPrice && result.formattedAllowance) {
            const amountValue = parseFloat(amount);
            const allowanceValue = parseFloat(result.formattedAllowance);
            
            result.tokenPrice = tokenPrice;
            result.allowanceUsd = (allowanceValue * tokenPrice).toFixed(2);
            result.requiredUsd = (amountValue * tokenPrice).toFixed(2);
          }
        } catch (e) {
          console.warn("Could not calculate USD values:", e);
        }
      }
      
      return result;
    } catch (error) {
      console.error(`Error checking bundler approval for ${tokenAddress}:`, error);
      return {
        isApproved: false,
        error: error.message
      };
    }
  }

  /**
   * Approve a token for the bundler contract using browser wallet
   * @param {string} tokenAddress - The token contract address
   * @param {string|ethers.BigNumber} amount - The amount to approve (use ethers.constants.MaxUint256 for unlimited)
   * @returns {Promise<Object>} Transaction result
   */
  async approveTokenToBundler(tokenAddress, amount = ethers.constants.MaxUint256) {
    try {
      if (!this.provider || !this.signer) {
        throw new Error("Provider or signer not initialized. Please connect wallet.");
      }
      
      console.log(`Approving token ${tokenAddress} using browser wallet`);
      
      // Create a contract instance for the token
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ["function approve(address spender, uint256 amount) returns (bool)"],
        this.signer
      );
      
      // Send the approval transaction to the bundler contract
      const tx = await tokenContract.approve(this.bundlerContract, amount);
      console.log(`Approval transaction sent: ${tx.hash}`);
      
      // Wait for the approval to be confirmed
      const receipt = await tx.wait();
      console.log(`Approval confirmed in block ${receipt.blockNumber}`);
      
      return {
        success: true,
        hash: tx.hash,
        receipt: receipt
      };
    } catch (error) {
      console.error(`Error approving token to bundler:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Revoke token approval from the bundler contract using browser wallet
   * @param {string} tokenAddress - The token contract address
   * @returns {Promise<Object>} Transaction result
   */
  async revokeTokenFromBundler(tokenAddress) {
    try {
      if (!this.provider || !this.signer) {
        throw new Error("Provider or signer not initialized. Please connect wallet.");
      }
      
      console.log(`Revoking approval for token ${tokenAddress} using browser wallet`);
      
      // Create a contract instance for the token
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ["function approve(address spender, uint256 amount) returns (bool)"],
        this.signer
      );
      
      // Send the approval transaction with 0 amount to revoke
      const tx = await tokenContract.approve(this.bundlerContract, 0);
      console.log(`Revoke transaction sent: ${tx.hash}`);
      
      // Wait for the transaction to be confirmed
      const receipt = await tx.wait();
      console.log(`Revoke confirmed in block ${receipt.blockNumber}`);
      
      return {
        success: true,
        hash: tx.hash,
        receipt: receipt
      };
    } catch (error) {
      console.error(`Error revoking token from bundler:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Directly approve tokens to the router
   * @param {string} tokenAddress - The token contract address
   * @param {string} routerAddress - The router address to approve
   * @param {string} amount - The amount to approve (use ethers.constants.MaxUint256 for unlimited)
   * @returns {Promise<Object>} Transaction result
   */
  async approveTokenToRouter(tokenAddress, routerAddress, amount = ethers.constants.MaxUint256) {
    if (!this.provider || !this.signer) {
      throw new Error("Provider or signer not initialized");
    }
    
    try {
      console.log(`Directly approving ${tokenAddress} to router ${routerAddress}`);
      
      // Create a contract instance for the token
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ["function approve(address spender, uint256 amount) returns (bool)"],
        this.signer
      );
      
      // Send the approval transaction
      const tx = await tokenContract.approve(routerAddress, amount);
      console.log(`Approval transaction sent: ${tx.hash}`);
      
      // Wait for the approval to be confirmed
      const receipt = await tx.wait();
      console.log(`Approval confirmed in block ${receipt.blockNumber}`);
      
      return {
        success: true,
        hash: tx.hash,
        receipt: receipt
      };
    } catch (error) {
      console.error("Error approving token:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Execute a swap bundle using the browser wallet
   * @param {Object} bundle - Bundle containing approval and swap transactions
   * @returns {Promise<Object>} Execution result
   */
  async executeSwapBundle(bundle) {
    try {
      if (!this.provider || !this.signer) {
        throw new Error("Provider or signer not initialized. Please connect wallet.");
      }
      
      console.log(`Executing swap bundle with ${bundle.swapTxs?.length || 0} transactions via browser wallet`);
      console.log(`Bundle details:`, {
        fromAddress: bundle.fromAddress,
        swapTxCount: bundle.swapTxs?.length || 0,
        tokens: bundle.swapTxs?.map(tx => tx.token.symbol) || []
      });
      
      // Create contract instance for the SwapBundler
      const swapBundlerAbi = [
        "function executeBundle(tuple(uint8 operationType, address target, bytes data, uint256 value, address tokenAddress, uint256 tokenAmount, address outputToken, uint256 minOutputAmount)[] operations) payable returns (bytes[] results)"
      ];
      
      const swapBundler = new ethers.Contract(
        this.bundlerContract,
        swapBundlerAbi,
        this.signer
      );
      
      // Extract transactions from the bundle
      const approvalTxs = bundle.approvalTxs || [];
      const bundlerApprovalTxs = bundle.bundlerApprovalTxs || [];
      const swapTxs = bundle.swapTxs || [];
      
      // Log the swap transactions for debugging
      if (swapTxs.length === 0) {
        console.error("No swap transactions in bundle!");
        throw new Error("Bundle contains no swap transactions");
      }
      
      console.log(`Swap transactions:`, swapTxs.map(tx => ({
        symbol: tx.token.symbol,
        amount: tx.token.amount
      })));
      
      // Combine all approval operations
      const allApprovalTxs = [...approvalTxs, ...bundlerApprovalTxs];
      
      // Create operations for the bundle - prepare the format the contract expects
      const operations = [
        ...this.createApprovalOperations(allApprovalTxs),
        ...this.createSwapOperations(swapTxs)
      ];
      
      // Debug log operations
      console.log("[DEBUG] Final operations for contract:", JSON.stringify(operations, null, 2));
      
      console.log(`Created ${operations.length} operations for SwapBundler`);
      
      // Calculate total value needed for ETH transfers
      let totalValue = ethers.BigNumber.from(0);
      operations.forEach(op => {
        if (op.value && op.value !== "0") {
          const opValue = typeof op.value === 'string' 
            ? ethers.BigNumber.from(op.value) 
            : op.value;
          
          totalValue = totalValue.add(opValue);
        }
      });
      
      // Set gas limit
      const gasLimit = 5000000;
      
      console.log(`Executing bundle with ${operations.length} operations, total value: ${ethers.utils.formatEther(totalValue)} BERA`);
      
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
      console.log(`Swap executed successfully in block ${receipt.blockNumber}`);
      
      return {
        success: true,
        hash: tx.hash,
        receipt
      };
    } catch (error) {
      console.error("Error executing swap bundle:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Create operations for token approvals
   * @param {Array} approvalTxs - Array of approval transactions
   * @returns {Array} Array of operations for the bundler contract
   */
  createApprovalOperations(approvalTxs) {
    // Constants matching the smart contract
    const TYPE_APPROVE = 1;  // Matches the contract's TYPE_APPROVE value
    const TYPE_SWAP = 2;     // Matches the contract's TYPE_SWAP value
    
    return approvalTxs.map(tx => {
      // Ensure we have the router address (target) and token address
      if (!tx.to || !tx.token || !tx.token.address) {
        console.error("Invalid approval transaction:", tx);
        return null;
      }
      
      return {
        operationType: TYPE_APPROVE, // OPERATION_TYPE_APPROVE
        target: tx.to, // The router/spender address
        data: "0x", // We don't need data for approvals as the contract handles it
        value: "0", // Consistent string format
        tokenAddress: tx.token.address, // The token contract address
        tokenAmount: ethers.constants.MaxUint256.toString(), // Max approval
        outputToken: "0x0000000000000000000000000000000000000000", // Not used for approvals
        minOutputAmount: "0" // Not used for approvals, consistent string format
      };
    }).filter(op => op !== null); // Filter out any invalid operations
  }
  
  /**
   * Create operations for token swaps
   * @param {Array} swapTxs - Array of swap transactions
   * @returns {Array} Array of operations for the bundler contract
   */
  createSwapOperations(swapTxs) {
    // Constants matching the smart contract
    const TYPE_APPROVE = 1;  // Matches the contract's TYPE_APPROVE value
    const TYPE_SWAP = 2;     // Matches the contract's TYPE_SWAP value
    
    return swapTxs.map(tx => {
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
        operationType: TYPE_SWAP, // OPERATION_TYPE_SWAP
        target: tx.to, // Router address from API
        data: tx.data, // Use exact data from API response
        value: value,
        tokenAddress: isNativeToken ? "0x0000000000000000000000000000000000000000" : tx.token.address,
        tokenAmount: tokenAmount,
        outputToken: swapParams.outputToken || "0x0000000000000000000000000000000000000000",
        minOutputAmount: swapParams.minOutput || "0"
      };
    });
  }
}

// Export singleton instance
const tokenBridge = new TokenBridge();
export default tokenBridge;