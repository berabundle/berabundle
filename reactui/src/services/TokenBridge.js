/**
 * TokenBridge.js - Bridge between React UI and the core TokenService
 * 
 * This adapter allows the React UI to communicate with the TokenService
 * from the BeraBundle core codebase using browser-compatible methods.
 * It includes minimal implementations needed for the UI.
 */

import { ethers } from 'ethers';
import berabundlerService from './BerabundlerService';

/**
 * Service for fetching token balances and prices in the React UI
 */
class TokenBridge {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.priceCache = {};
    this.priceExpiry = 5 * 60 * 1000; // 5 minutes
    this.apiKey = null; // Will need to be set by the user
    this.apiBaseUrl = 'https://mainnet.api.oogabooga.io';
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
    this.apiKey = apiKey;
    this.signer = signer;
    
    // Initialize the BerabundlerService
    if (provider && signer) {
      berabundlerService.initialize(provider, signer);
    }
    
    return Boolean(provider && apiKey && signer);
  }
  
  /**
   * Check if the bridge is initialized
   */
  isInitialized() {
    return Boolean(this.provider && this.apiKey && this.signer);
  }
  
  /**
   * Makes an authenticated API call to the OogaBooga API
   * 
   * @param {string} endpoint - API endpoint path
   * @param {Object} params - Query parameters to include in the request
   * @returns {Promise<Object>} API response data
   * @throws {Error} If API key is missing or API call fails
   */
  async apiCallWithAuth(endpoint, params = {}) {
    if (!this.apiKey) {
      throw new Error("OogaBooga API key not set. Please set it in settings.");
    }
    
    const url = endpoint.startsWith('http') ? endpoint : `${this.apiBaseUrl}${endpoint}`;
    console.log("[DEBUG] Making API request to:", url);
    
    try {
      // Log API request
      const requestConfig = {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${this.apiKey.trim()}`,
          'Accept': 'application/json'
        }
      };
      
      // Don't log the actual API key in production
      console.log('[DEBUG] API request config:', {
        ...requestConfig,
        headers: {
          ...requestConfig.headers,
          'Authorization': `Bearer ${this.apiKey.substring(0, 3)}...${this.apiKey.substring(this.apiKey.length - 3)}`
        }
      });
      
      const response = await fetch(url, requestConfig);
      
      // Log response status
      console.log(`[DEBUG] API response status: ${response.status} ${response.statusText}`);
      console.log('[DEBUG] API response headers:', Object.fromEntries([...response.headers.entries()]));
      
      if (response.ok) {
        const responseData = await response.json();
        return responseData;
      } else {
        // For error responses, try to extract any available error details
        let errorDetails = '';
        try {
          const errorResponse = await response.text();
          console.log('[DEBUG] API error response:', errorResponse);
          errorDetails = errorResponse;
        } catch (e) {
          console.log('[DEBUG] Could not parse error response:', e);
        }
        
        throw new Error(`API error: ${response.status} ${response.statusText}${errorDetails ? ` - ${errorDetails}` : ''}`);
      }
    } catch (error) {
      console.error('[DEBUG] API call failed:', error);
      throw error;
    }
  }
  
  /**
   * Retrieves the current USD price for a token with caching
   * 
   * @param {string} tokenAddress - Token contract address or 'BERA'/'native' for native token
   * @returns {Promise<number|null>} Current price in USD or null if unavailable
   */
  async getTokenPrice(tokenAddress) {
    try {
      // Check cache first
      if (this.priceCache[tokenAddress] && 
          Date.now() - this.priceCache[tokenAddress].timestamp < this.priceExpiry) {
        return this.priceCache[tokenAddress].price;
      }
      
      // Format token address correctly
      const tokenParam = tokenAddress === 'BERA' || tokenAddress === 'native' 
        ? '0x0000000000000000000000000000000000000000' 
        : tokenAddress;
          
      // Fetch prices from API
      const response = await this.apiCallWithAuth('/v1/prices?currency=USD');
      
      // Response is an array of {address, price} objects
      if (response && Array.isArray(response)) {
        // Find the token in the price list
        const tokenPrice = response.find(item => 
          item.address.toLowerCase() === tokenParam.toLowerCase()
        );
        
        if (tokenPrice && tokenPrice.price) {
          const price = parseFloat(tokenPrice.price);
          
          // Update cache
          this.priceCache[tokenAddress] = {
            price,
            timestamp: Date.now()
          };
          
          return price;
        }
      }
      
      // If we reach here, price wasn't found
      return null;
      
    } catch (error) {
      console.error("Error fetching token price:", error);
      return null;
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
      if (!this.provider) throw new Error("Provider not initialized");
      
      const beraBalance = await this.provider.getBalance(address);
      const balanceFloat = parseFloat(ethers.utils.formatEther(beraBalance));
      // Round to 2 decimal places
      const formattedBeraBalance = balanceFloat.toFixed(2);
      
      // Get BERA price
      let beraPrice = null;
      try {
        beraPrice = await this.getTokenPrice('BERA');
      } catch (err) {
        console.error("Error fetching BERA price:", err);
      }
      
      // Calculate value and round to 2 decimal places
      const valueUsd = beraPrice ? balanceFloat * beraPrice : 0;
      const roundedValueUsd = parseFloat(valueUsd.toFixed(2));
      
      return {
        name: 'BERA', // No symbol in name
        symbol: 'BERA', // Keep symbol separate
        address: 'native',
        decimals: 18,
        balance: formattedBeraBalance, // Already rounded to 2 decimals
        formattedBalance: formattedBeraBalance, // 2 decimal places, no symbol
        priceUsd: beraPrice,
        valueUsd: roundedValueUsd, // Rounded to 2 decimal places
        formattedValueUsd: roundedValueUsd.toLocaleString(undefined, {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }),
        isNative: true
      };
    } catch (error) {
      console.error("Error fetching native balance:", error);
      return null;
    }
  }
  
  /**
   * Gets token balances for a specific ERC20 token
   * 
   * @param {string} address - Wallet address
   * @param {Object} token - Token data (address, symbol, name, decimals)
   * @returns {Promise<Object|null>} Token with balance data or null if error/zero balance
   */
  async getTokenBalance(address, token) {
    try {
      if (!this.provider) throw new Error("Provider not initialized");
      
      // Skip tokens without an address
      if (!token.address || token.address === 'native') return null;
      
      const tokenContract = new ethers.Contract(
        token.address,
        ["function balanceOf(address) view returns (uint256)"],
        this.provider
      );
      
      const rawBalance = await tokenContract.balanceOf(address);
      const balanceFloat = parseFloat(ethers.utils.formatUnits(rawBalance, token.decimals || 18));
      
      // Skip tokens with zero balance
      if (balanceFloat <= 0) return null;
      
      // Round to 2 decimal places
      const formattedBalance = balanceFloat.toFixed(2);
      
      // Get token price
      let tokenPrice = null;
      try {
        tokenPrice = await this.getTokenPrice(token.address);
      } catch (err) {
        console.error(`Error fetching price for ${token.symbol}:`, err);
      }
      
      // Calculate value and round to 2 decimal places
      const valueUsd = tokenPrice ? balanceFloat * tokenPrice : 0;
      const roundedValueUsd = parseFloat(valueUsd.toFixed(2));
      
      return {
        ...token, // Keep original token data (symbol, address, etc.)
        name: token.name, // No symbol in name
        symbol: token.symbol, // Keep symbol separate
        balance: formattedBalance, // Already rounded to 2 decimal places
        formattedBalance: formattedBalance, // 2 decimal places, no symbol
        priceUsd: tokenPrice,
        valueUsd: roundedValueUsd, // Rounded to 2 decimal places
        formattedValueUsd: roundedValueUsd.toLocaleString(undefined, {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
      };
    } catch (error) {
      console.error(`Error fetching balance for ${token.symbol}:`, error);
      return null;
    }
  }
  
  /**
   * Fetches common token list for Berachain
   * 
   * @returns {Promise<Array>} Array of token objects
   */
  async getCommonTokens() {
    return [
      {
        address: "0x5806E416dA447b267cEA759358cF22Cc41FAE80F",
        symbol: "WBERA",
        name: "Wrapped BERA", // No symbol in name
        decimals: 18,
      },
      {
        // BGT token address from config
        address: "0x656b95E550C07a9ffe548bd4085c72418Ceb1dba",
        symbol: "BGT",
        name: "Berachain Governance Token", // No symbol in name
        decimals: 18,
      },
      {
        // HONEY token address from config
        address: "0x7EeCA4205fF31f947EdBd49195a7A88E6A91161B",
        symbol: "HONEY",
        name: "Honey", // No symbol in name
        decimals: 18,
      },
      {
        address: "0x3452e23F9c4cC62c70B7ADAd699B2AF6a2d9D218",
        symbol: "STGUSDC",
        name: "Stargate USDC", // No symbol in name
        decimals: 6,
      },
      {
        // BGT Staker address from config
        address: "0x44F07Ce5AfeCbCC406e6beFD40cc2998eEb8c7C6",
        symbol: "BGT Staker",
        name: "BGT Staker", // No symbol in name
        decimals: 18,
      }
    ];
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
    const targetToken = options.targetToken || { address: '0x0000000000000000000000000000000000000000', symbol: 'BERA', decimals: 18 };
    console.log(`Creating swap bundle for ${fromAddress} with ${tokensToSwap.length} tokens, target: ${targetToken.symbol}`);
    console.log("Token data:", tokensToSwap);
    console.log("Target token:", targetToken);
    
    // Filter out native BERA tokens first
    const tokensToProcess = tokensToSwap.filter(token => {
      return !(token.address === 'native' || token.symbol === 'BERA') && token.address;
    });
    
    console.log(`Processing ${tokensToProcess.length} non-native tokens in parallel`);
    
    // Create array of API call promises
    const apiCallPromises = tokensToProcess.map(async (token) => {
      console.log(`Setting up API call for ${token.symbol} (${token.address})`);
      
      // Convert the token amount to wei
      const amountIn = ethers.utils.parseUnits(
        token.amount.toString(),
        token.decimals || 18
      );
      
      console.log(`Amount: ${token.amount}, Decimals: ${token.decimals}, Parsed: ${amountIn.toString()}`);
      
      // Create API endpoint for swap quote
      const targetTokenAddress = targetToken.address;
      const endpoint = `/v1/swap?tokenIn=${token.address}&tokenOut=${targetTokenAddress}&amount=${amountIn.toString()}&slippage=0.05&to=${this.bundlerContract}`;
      console.log("[DEBUG] API endpoint:", endpoint);
      
      // Return an object with all the necessary information
      try {
        const startTime = performance.now();
        const quoteResponse = await this.apiCallWithAuth(endpoint);
        const endTime = performance.now();
        
        console.log(`[DEBUG] API response for ${token.symbol} received in ${(endTime - startTime).toFixed(2)}ms`);
        
        if (!quoteResponse || !quoteResponse.tx) {
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
    console.log(`Waiting for ${apiCallPromises.length} API calls to complete in parallel`);
    const results = await Promise.all(apiCallPromises);
    console.log(`All API calls completed, processing results`);
    
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
      
      // Extract data from the API response - make sure to access the correct paths
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
      
      // Log the full swapParams for debugging
      console.log(`[DEBUG] Generated swapParams for ${token.symbol}:`, JSON.stringify(swapParams, null, 2));
      
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
    
    // We don't need to do independent approval checks here
    // as the UI already handles this and only sends pre-approved tokens
    console.log(`Found ${swapTransactions.length} valid swap transactions, skipping redundant approval checks`);
    console.log(`UI is responsible for ensuring all tokens are already approved before creating bundle`);
    
    // Initialize empty array for approval transactions (for compatibility)
    const bundlerApprovalTxs = [];
    
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
    console.error("Error creating swap bundle:", error);
    return {
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
   * This now compares the swap amount to the token allowance, not the USD limit
   * @param {string} tokenAddress - The token contract address
   * @param {string} ownerAddress - The token owner address
   * @param {string|number} amount - The amount to check approval for (this is max $ value in USD)
   * @returns {Promise<Object>} Result containing approval status and details
   */
  async checkBundlerApproval(tokenAddress, ownerAddress, amount) {
    if (!this.provider) {
      throw new Error("Provider not initialized");
    }
    
    try {
      // Create a contract instance for the token
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ["function allowance(address owner, address spender) view returns (uint256)"],
        this.provider
      );
      
      console.log(`Checking approval for token ${tokenAddress}, amount: ${amount}`);
      
      // Convert the requested amount to BigNumber
      let decimals = 18; // Default
      
      // Try to get the token's actual decimals
      try {
        const tokenWithDecimals = new ethers.Contract(
          tokenAddress,
          ["function decimals() view returns (uint8)"],
          this.provider
        );
        decimals = await tokenWithDecimals.decimals();
        console.log(`Got decimals for ${tokenAddress}: ${decimals}`);
      } catch (e) {
        console.log(`Could not get decimals for ${tokenAddress}, using default of 18`);
      }
      
      // Get the token price to properly compare USD values
      let tokenPriceUsd = null;
      try {
        tokenPriceUsd = await this.getTokenPrice(tokenAddress);
        console.log(`Got price for ${tokenAddress}: $${tokenPriceUsd}`);
      } catch (e) {
        console.log(`Could not get price for ${tokenAddress}, USD-based comparison will be skipped`);
      }
      
      // Handle amount conversion safely
      let amountBN;
      let amountUsd = 0;
      
      try {
        // Parse the USD amount value first if available
        if (typeof amount === 'string' && amount.trim() !== '') {
          amountUsd = parseFloat(amount);
        } else if (typeof amount === 'number') {
          amountUsd = amount;
        }
        
        // If valid USD amount and token price available, convert USD to token amount
        if (!isNaN(amountUsd) && amountUsd > 0 && tokenPriceUsd > 0) {
          const tokenAmount = amountUsd / tokenPriceUsd;
          // Format to string with appropriate precision
          const tokenAmountStr = tokenAmount.toFixed(decimals > 6 ? 6 : decimals);
          amountBN = ethers.utils.parseUnits(tokenAmountStr, decimals);
        } 
        // If we can't do USD-based calculation, fall back to token amount
        else if (ethers.BigNumber.isBigNumber(amount)) {
          amountBN = amount;
        } else {
          // Convert string amount to BigNumber with proper decimals
          const amountStr = typeof amount === 'string' ? amount : amount.toString();
          
          // Trim to maximum decimal places to avoid overflow
          const parts = amountStr.split('.');
          if (parts.length === 2 && parts[1].length > decimals) {
            // Truncate fractional part to match token decimals
            const trimmedAmount = `${parts[0]}.${parts[1].substring(0, decimals)}`;
            amountBN = ethers.utils.parseUnits(trimmedAmount, decimals);
          } else {
            amountBN = ethers.utils.parseUnits(amountStr, decimals);
          }
        }
      } catch (e) {
        console.error(`Error parsing amount for ${tokenAddress}: ${e.message}`);
        // Fallback to 0 in case of error
        amountBN = ethers.BigNumber.from(0);
      }
      
      // Check allowance for the bundler contract
      const allowance = await tokenContract.allowance(ownerAddress, this.bundlerContract);
      console.log(`Token ${tokenAddress} allowance to bundler: ${allowance.toString()}`);
      console.log(`Required amount: ${amountBN.toString()}`);
      
      // Get formatted values for display
      const formattedAllowance = ethers.utils.formatUnits(allowance, decimals);
      const formattedAmount = ethers.utils.formatUnits(amountBN, decimals);
      
      // Calculate USD values for better comparison
      const allowanceUsd = tokenPriceUsd ? parseFloat(formattedAllowance) * tokenPriceUsd : 0;
      const amountTokenUsd = tokenPriceUsd ? parseFloat(formattedAmount) * tokenPriceUsd : 0;
      
      console.log(`Comparing allowance: ${formattedAllowance} ($${allowanceUsd.toFixed(2)}) vs needed: ${formattedAmount} ($${amountTokenUsd.toFixed(2)})`);
      
      // Compare both token amounts and USD values for better approval decision
      const isApproved = allowance.gte(amountBN);
      
      // Return detailed info
      return {
        isApproved,
        allowance,
        formattedAllowance,
        requiredAmount: amountBN,
        formattedRequiredAmount: formattedAmount,
        allowanceUsd: allowanceUsd.toFixed(2),
        requiredUsd: amountTokenUsd.toFixed(2),
        decimals
      };
    } catch (error) {
      console.error(`Error checking bundler approval for ${tokenAddress}:`, error);
      return {
        isApproved: false,
        error: error.message
      };
    }
  }

  /**
   * Approve a token for the bundler contract
   * @param {string} tokenAddress - The token contract address
   * @param {string|ethers.BigNumber} amount - The amount to approve (use ethers.constants.MaxUint256 for unlimited)
   * @returns {Promise<Object>} Transaction result
   */
  async approveTokenToBundler(tokenAddress, amount = ethers.constants.MaxUint256) {
    if (!this.provider || !this.signer) {
      throw new Error("Provider or signer not initialized");
    }
    
    try {
      // Log the approval details
      if (ethers.BigNumber.isBigNumber(amount) && amount.eq(ethers.constants.MaxUint256)) {
        console.log(`Approving UNLIMITED ${tokenAddress} to bundler ${this.bundlerContract}`);
      } else {
        const formattedAmount = ethers.BigNumber.isBigNumber(amount) 
          ? ethers.utils.formatUnits(amount, 18) 
          : amount.toString();
        console.log(`Approving LIMITED amount of ${formattedAmount} tokens (${tokenAddress}) to bundler ${this.bundlerContract}`);
      }
      
      // Create a contract instance for the token
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ["function approve(address spender, uint256 amount) returns (bool)"],
        this.signer
      );
      
      // Send the approval transaction
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
   * Revoke token approval from the bundler contract
   * @param {string} tokenAddress - The token contract address
   * @returns {Promise<Object>} Transaction result
   */
  async revokeTokenFromBundler(tokenAddress) {
    if (!this.provider || !this.signer) {
      throw new Error("Provider or signer not initialized");
    }
    
    try {
      console.log(`Revoking approval for token ${tokenAddress} from bundler ${this.bundlerContract}`);
      
      // Create a contract instance for the token
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ["function approve(address spender, uint256 amount) returns (bool)"],
        this.signer
      );
      
      // Send approval transaction with zero amount to revoke
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
 * Execute multiple swaps in a single transaction using the SwapBundler contract
 * @param {Array} swapTxs - Array of swap transactions
 * @returns {Promise<Object>} Transaction result
 */
async executeMultiSwap(swapTxs) {
  if (!berabundlerService.isInitialized()) {
    throw new Error("BerabundlerService not initialized");
  }
  
  try {
    console.log(`Creating bundled swap operations for ${swapTxs.length} tokens...`);
    
    // Create an operation for each swap
    const operations = swapTxs.map(tx => {
      if (!tx.swapParams) {
        console.error("Missing swapParams in transaction:", JSON.stringify(tx, null, 2));
        throw new Error(`Missing swap parameters for ${tx.token?.symbol || "unknown token"}`);
      }
      
      // Check if this is a native token operation
      const isNative = tx.token.address === 'native' || tx.token.symbol === 'BERA';
      
      console.log(`[DEBUG] Creating operation for ${tx.token.symbol}`);
      
      return {
        operationType: 2, // TYPE_SWAP
        target: tx.to, // Router address from API
        data: tx.data, // Use exact data from API response
        value: tx.value || "0", 
        tokenAddress: isNative ? ethers.constants.AddressZero : tx.token.address,
        tokenAmount: isNative ? 0 : tx.token.amountIn,
        outputToken: tx.swapParams.outputToken || ethers.constants.AddressZero,
        minOutputAmount: tx.swapParams.minOutput || 0
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
    
    console.log(`[DEBUG] Created ${operations.length} operations for ${swapTxs.length} tokens`);
    console.log(`[DEBUG] Total value needed: ${ethers.utils.formatEther(totalValue)} BERA`);
    
    // Execute the bundle with all swap operations
    const tx = await berabundlerService.contract.executeBundle(
      operations,
      { 
        value: totalValue,
        gasLimit: 5000000 // Adjust gas limit based on the number of tokens
      }
    );
    
    console.log(`[DEBUG] Transaction sent: ${tx.hash}`);
    
    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log(`[DEBUG] Transaction confirmed in block ${receipt.blockNumber}`);
    
    return {
      success: true,
      hash: tx.hash,
      receipt
    };
  } catch (error) {
    console.error("[DEBUG] Error executing multi-swap:", error);
    
    if (error.error && error.error.message) {
      console.error("[DEBUG] Detailed error:", error.error.message);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

  /**
   * Execute a swap bundle through the SwapBundler contract
   * @param {Object} bundle - Bundle containing approval and swap transactions
   * @returns {Promise<Object>} Execution result
   */
  async executeSwapBundle(bundle) {
    if (!this.provider || !this.signer) {
      throw new Error("Provider or signer not initialized");
    }
    
    try {
      // Skip approval checks - we trust that the UI has already ensured all tokens are approved
      console.log("Executing swap with pre-approved tokens (skipping approval checks)");
      
      // Check if we're dealing with a single swap or multiple swaps
      if (bundle.swapTxs.length === 1) {
        // For single swap, use the direct swap method
        console.log("Using direct swap method for a single swap transaction...");
        return await berabundlerService.executeDirectSwap(bundle.swapTxs[0]);
      } else if (bundle.swapTxs.length > 1) {
        // For multiple swaps, use the multi-swap method that bundles them in one tx
        console.log("Using multi-swap method for multiple tokens in one transaction...");
        return await this.executeMultiSwap(bundle.swapTxs);
      } else {
        throw new Error("No swap transactions provided");
      }
    } catch (error) {
      console.error("Error in executeSwapBundle:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
const tokenBridge = new TokenBridge();
export default tokenBridge;