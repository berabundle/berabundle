/**
 * SwapService.js - Token swap service for BeraBundle
 * 
 * This service handles token swaps and bundle execution.
 * It consolidates functionality from the frontend's TokenBridge and BerabundlerService.
 */

const { ethers } = require('ethers');
const apiCore = require('./core');
const tokenService = require('./TokenService');
const approvalService = require('./ApprovalService');
const provider = require('../blockchain/provider');
const contracts = require('../blockchain/contracts');
const config = require('../config');
const { handleError } = require('../utils/errors');

class SwapService {
  constructor() {
    this.initialized = false;
  }
  
  /**
   * Initialize the swap service
   * @param {Object} options - Initialization options
   * @param {string} [options.apiKey] - OogaBooga API key
   * @returns {boolean} Whether initialization was successful
   */
  initialize(options = {}) {
    try {
      if (options.apiKey) {
        apiCore.configure({ apiKey: options.apiKey });
      }
      
      // Initialize dependent services if not already initialized
      if (!tokenService.isInitialized() && options.apiKey) {
        tokenService.initialize(options);
      }
      
      if (!approvalService.isInitialized()) {
        approvalService.initialize(options);
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      return handleError(error, 'SwapService.initialize', false);
    }
  }
  
  /**
   * Check if the service is initialized
   * @returns {boolean} Whether the service is initialized
   */
  isInitialized() {
    return this.initialized && apiCore.isConfigured(false); // Pass false to avoid unnecessary logging
  }
  
  /**
   * Check if a token is approved for the bundler contract
   * @param {string} tokenAddress - The token contract address or symbol
   * @param {string} ownerAddress - The token owner address
   * @param {string|number} amount - The amount to check approval for
   * @returns {Promise<Object>} Result containing approval status and details
   * @deprecated Use ApprovalService.checkApproval instead
   */
  async checkBundlerApproval(tokenAddress, ownerAddress, amount) {
    return approvalService.checkApproval(tokenAddress, ownerAddress, amount);
  }
  
  /**
   * Approve a token for the bundler contract
   * @param {string} tokenAddress - The token contract address or symbol
   * @param {string|ethers.BigNumber} amount - The amount to approve (use ethers.constants.MaxUint256 for unlimited)
   * @returns {Promise<Object>} Transaction result
   * @deprecated Use ApprovalService.approveToken instead
   */
  async approveTokenToBundler(tokenAddress, amount = ethers.constants.MaxUint256) {
    return approvalService.approveToken(tokenAddress, amount);
  }
  
  /**
   * Revoke token approval from the bundler contract
   * @param {string} tokenAddress - The token contract address or symbol
   * @returns {Promise<Object>} Transaction result
   * @deprecated Use ApprovalService.revokeToken instead
   */
  async revokeTokenFromBundler(tokenAddress) {
    return approvalService.revokeToken(tokenAddress);
  }
  
  /**
   * Creates a swap bundle for the BeraBundle contract
   * @param {string} fromAddress - Wallet address initiating the swaps
   * @param {Array<Object>} tokensToSwap - Array of token objects with amount to swap
   * @param {Object} options - Additional options for bundle creation
   * @param {Object} options.targetToken - The token to swap to (defaults to BERA)
   * @returns {Promise<Object>} Bundle containing transaction data and expected output
   */
  async createSwapBundle(fromAddress, tokensToSwap, options = {}) {
    try {
      if (!this.isInitialized()) {
        throw new Error("SwapService not initialized with API key");
      }
      
      const targetToken = options.targetToken || { 
        address: '0x0000000000000000000000000000000000000000', 
        symbol: 'BERA', 
        decimals: 18 
      };
      
      console.log(`Creating swap bundle for ${fromAddress} with ${tokensToSwap.length} tokens, target: ${targetToken.symbol}`);
      
      // Dump incoming token data for debugging
      console.log('[SwapService] Input tokens:', tokensToSwap.map(token => ({
        symbol: token.symbol,
        address: token.address,
        amount: token.amount,
        decimals: token.decimals
      })));
      
      // Process all tokens including BERA when appropriate
      const tokensToProcess = [];
      
      // Check if target is native BERA (to avoid swapping BERA to BERA)
      const targetIsBera = targetToken.address === '0x0000000000000000000000000000000000000000' || 
                          targetToken.symbol === 'BERA';
      
      // Process each token individually
      for (const token of tokensToSwap) {
        // Skip tokens without an address
        if (!token.address) {
          console.warn(`[SwapService] Skipping token with no address: ${token.symbol}`);
          continue;
        }
        
        // Check if this is a native BERA token
        const isNativeBera = token.address === 'native' || token.symbol === 'BERA';
        
        // Normalize token address for comparison
        const normalizedTokenAddress = isNativeBera 
          ? '0x0000000000000000000000000000000000000000'
          : token.address.toLowerCase();
          
        // Normalize target address for comparison
        const normalizedTargetAddress = targetToken.address.toLowerCase();
        
        // Skip if trying to swap a token to itself
        if (normalizedTokenAddress === normalizedTargetAddress || 
            (token.symbol === targetToken.symbol && token.symbol !== 'Unknown')) {
          console.warn(`[SwapService] Skipping ${token.symbol} to ${targetToken.symbol} swap (same token)`);
          continue;
        }
        
        // For native BERA tokens, use the zero address format
        if (isNativeBera) {
          console.log(`[SwapService] Including native BERA for swapping to ${targetToken.symbol}`);
          tokensToProcess.push({
            ...token,
            address: '0x0000000000000000000000000000000000000000' // Use zero address for native BERA
          });
        } else {
          // For regular ERC20 tokens
          tokensToProcess.push(token);
        }
      }
      
      console.log(`[SwapService] Processing ${tokensToProcess.length} tokens:`, 
        tokensToProcess.map(t => `${t.symbol} (${t.address})`));
      
      // Create array of API call promises
      const apiCallPromises = tokensToProcess.map(async (token) => {
        // Verify we have an amount
        if (!token.amount) {
          console.error(`[SwapService] Token ${token.symbol} (${token.address}) has no amount specified!`);
          throw new Error(`No amount specified for token ${token.symbol}`);
        }
        
        let amountIn;
        
        // Convert the token amount to wei
        try {
          amountIn = ethers.utils.parseUnits(
            token.amount.toString(),
            token.decimals || 18
          );
        } catch (error) {
          console.error(`[SwapService] Error parsing amount for ${token.symbol}:`, error);
          throw new Error(`Invalid amount format for ${token.symbol}: ${token.amount}`);
        }
        
        // Create API endpoint for swap quote
        const bundlerContract = config.networks.berachain.swapBundlerAddress;
        const targetTokenAddress = targetToken.address;
        
        // When swapping BERA, special handling needed
        const isNativeSwap = token.symbol === 'BERA' || token.address === '0x0000000000000000000000000000000000000000';
        
        console.log(`[SwapService] Swap details:`, {
          token: token.symbol,
          address: token.address,
          isNative: isNativeSwap,
          targetToken: targetToken.symbol,
          targetAddress: targetTokenAddress,
          amount: amountIn.toString()
        });
        
        // Build the endpoint
        const endpoint = `/v1/swap?tokenIn=${token.address}&tokenOut=${targetTokenAddress}&amount=${amountIn.toString()}&slippage=0.05&to=${bundlerContract}`;
        
        console.log(`[SwapService] Creating swap for ${token.symbol} (${token.address}), amount: ${token.amount}`);
        console.log(`[SwapService] Endpoint: ${endpoint}`);
        
        // Return an object with all the necessary information
        try {
          console.log(`[SwapService] Fetching quote from OogaBooga for ${token.symbol} (${token.address})`);
          console.log(`[SwapService] API request details:`, {
            endpoint,
            tokenIn: token.address,
            tokenOut: targetTokenAddress,
            amount: amountIn.toString(),
            isNative: isNativeSwap
          });
          
          // Add a retry mechanism
          let retries = 2;
          let quoteResponse = null;
          
          while (retries >= 0) {
            try {
              quoteResponse = await apiCore.get(endpoint);
              console.log(`[SwapService] Quote response received for ${token.symbol}:`, 
                quoteResponse ? 'success' : 'empty response');
              break; // Break out of retry loop if successful
            } catch (apiError) {
              console.error(`[SwapService] API error for ${token.symbol}, retries left: ${retries}`, apiError);
              if (retries === 0) throw apiError; // Rethrow if out of retries
              retries--;
              // Wait a bit before retrying
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
          
          if (!quoteResponse || !quoteResponse.tx) {
            console.error(`[SwapService] Swap response missing tx data for ${token.symbol}`, quoteResponse);
            throw new Error(`Swap response doesn't contain transaction data for ${token.symbol}`);
          }
          
          return {
            token,
            amountIn,
            quoteResponse
          };
        } catch (error) {
          console.error(`Error getting quote for ${token.symbol}:`, error);
          return {
            token,
            amountIn,
            error
          };
        }
      });
      
      // Wait for all API calls to complete in parallel
      const results = await Promise.all(apiCallPromises);
      
      // Process the results to build the swap transactions
      const swapTransactions = [];
      const routerApprovalTxs = []; // Keep for compatibility
      
      // Process API results and build transactions
      for (const result of results) {
        // Skip null results or those with errors
        if (!result || result.error) {
          if (result && result.error) {
            console.error(`Error for ${result.token.symbol}:`, result.error);
          }
          continue;
        }
        
        const { token, amountIn, quoteResponse } = result;
        const { tx } = quoteResponse;
        
        // Ensure the router address is valid
        if (!tx.to) {
          console.error(`Invalid router address in swap response for ${token.symbol}`);
          continue;
        }
        
        // Normalize value
        let valueHex = tx.value || '0x0';
        if (typeof valueHex === 'number') {
          valueHex = '0x' + valueHex.toString(16);
        } else if (typeof valueHex === 'string' && !valueHex.startsWith('0x')) {
          valueHex = '0x' + parseInt(valueHex).toString(16);
        }
        
        // Extract data from the API response
        const routerAddr = quoteResponse.routerAddr || tx.to;
        const outputToken = quoteResponse.routerParams?.swapTokenInfo?.outputToken || targetToken.address;
        const outputQuote = quoteResponse.routerParams?.swapTokenInfo?.outputQuote || 
                           quoteResponse.assumedAmountOut || 
                           quoteResponse.expectedAmountOut;
        const outputMin = quoteResponse.routerParams?.swapTokenInfo?.outputMin || 
                         quoteResponse.minAmountOut;
        const pathDefinition = quoteResponse.routerParams?.pathDefinition;
        const executor = quoteResponse.routerParams?.executor;
        const referralCode = quoteResponse.routerParams?.referralCode || 0;
        
        // Verify we have all required data
        if (!pathDefinition) {
          console.error(`Missing path information in API response for ${token.symbol}`);
          continue;
        }
        
        if (!executor) {
          console.error(`Missing executor in API response for ${token.symbol}`);
          continue;
        }
        
        // Build a swapParams object with all required parameters
        const swapParams = {
          router: routerAddr,
          inputToken: token.address,
          inputAmount: amountIn.toString(),
          outputToken: outputToken,
          outputQuote: outputQuote,
          minOutput: outputMin,
          pathDefinition: pathDefinition,
          executor: executor,
          referralCode: referralCode
        };
        
        swapTransactions.push({
          swapParams,
          to: tx.to,
          data: tx.data,
          value: valueHex,
          gasLimit: tx.gasLimit || '0x55555',
          token: {
            symbol: token.symbol,
            address: token.address,
            amount: token.amount,
            amountIn: amountIn.toString(),
            decimals: token.decimals || 18
          },
          quote: {
            expectedAmountOut: swapParams.outputQuote,
            formattedAmountOut: ethers.utils.formatEther(swapParams.outputQuote),
            minAmountOut: swapParams.minOutput,
            priceImpact: quoteResponse.priceImpact
          }
        });
      }
      
      // Check if tokens need approval and add to bundlerApprovalTxs if needed
      let bundlerApprovalTxs = [];
      try {
        // Only check approvals if we have a signer
        if (provider.getSigner()) {
          const signerAddress = await provider.getSigner().getAddress();
          
          // If the fromAddress matches our signer, we can check approvals
          if (signerAddress.toLowerCase() === fromAddress.toLowerCase()) {
            // Use the approval service to create approval operations
            bundlerApprovalTxs = await approvalService.createApprovalOperations(
              tokensToProcess,
              fromAddress
            );
            
            if (bundlerApprovalTxs.length > 0) {
              console.log(`Added ${bundlerApprovalTxs.length} approval operations to the bundle`);
            }
          }
        }
      } catch (error) {
        console.warn("Could not check token approvals:", error.message);
        bundlerApprovalTxs = []; // Empty array as fallback
      }
      
      // Calculate total expected BERA output
      const totalExpectedBera = swapTransactions.reduce(
        (sum, tx) => sum + parseFloat(tx.quote.formattedAmountOut || '0'),
        0
      );
      
      return {
        fromAddress,
        swapTxs: swapTransactions,
        approvalTxs: routerApprovalTxs, // Keep for compatibility
        bundlerApprovalTxs, // New field for bundler approvals
        totalExpectedBera,
        formattedTotalExpectedBera: totalExpectedBera.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6
        }) + ' BERA'
      };
    } catch (error) {
      return handleError(error, 'SwapService.createSwapBundle', {
        error: error.message,
        fromAddress,
        swapTxs: [],
        approvalTxs: [],
        bundlerApprovalTxs: []
      });
    }
  }
  
  /**
   * Execute a swap bundle through the SwapBundler contract
   * @param {Object} bundle - Bundle containing approval and swap transactions
   * @returns {Promise<Object>} Execution result
   */
  async executeSwapBundle(bundle) {
    try {
      if (!provider.isInitialized()) {
        throw new Error("Provider not initialized");
      }
      
      // Get signer address
      const signerAddress = await provider.getSigner().getAddress();
      
      // Check if we have approval for all tokens
      let needsApproval = false;
      
      // Extract all tokens that need to be checked for approval
      const tokensToCheck = bundle.swapTxs
        .filter(tx => !(tx.token.address === 'native' || tx.token.symbol === 'BERA'))
        .map(tx => tx.token);
      
      if (tokensToCheck.length > 0) {
        console.log("Checking token approvals before executing swap...");
        
        for (const token of tokensToCheck) {
          if (!token.address) continue; // Skip invalid tokens
          
          const approvalCheck = await approvalService.checkApproval(
            token.address,
            signerAddress,
            token.amountIn || token.amount
          );
          
          if (!approvalCheck.isApproved) {
            console.log(`Token ${token.symbol} is not approved for the required amount`);
            needsApproval = true;
            
            // Ask if we should approve automatically
            if (bundle.autoApprove) {
              console.log(`Auto-approving token ${token.symbol}...`);
              const approval = await approvalService.approveToken(token.address);
              
              if (!approval.success) {
                throw new Error(`Failed to approve token ${token.symbol}: ${approval.error}`);
              }
              
              console.log(`Token ${token.symbol} approved successfully!`);
            } else {
              throw new Error(`Token ${token.symbol} requires approval. Use 'approve-token' command first or set autoApprove:true`);
            }
          }
        }
      }
      
      console.log("All tokens are approved, executing swap...");
      
      // Check if we're dealing with a single swap or multiple swaps
      if (bundle.swapTxs.length === 1) {
        // For single swap, use the direct swap method
        console.log("Using direct swap method for a single swap transaction...");
        return await contracts.executeDirectSwap(bundle.swapTxs[0]);
      } else if (bundle.swapTxs.length > 1) {
        // For multiple swaps, use the bundle method
        console.log("Using bundle method for multiple tokens in one transaction...");
        return await contracts.executeBundle(bundle);
      } else {
        throw new Error("No swap transactions provided");
      }
    } catch (error) {
      return handleError(error, 'SwapService.executeSwapBundle', {
        success: false,
        error: error.message
      });
    }
  }
}

// Export singleton instance
const swapService = new SwapService();
module.exports = swapService;