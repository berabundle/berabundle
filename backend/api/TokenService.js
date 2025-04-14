/**
 * TokenService.js - Token management service for BeraBundle
 * 
 * This service handles token metadata, balances, and prices.
 * It consolidates functionality from the frontend's MetadataService and TokenBridge.
 */

const { ethers } = require('ethers');
const apiCore = require('./core');
const cache = require('../utils/cache');
const provider = require('../blockchain/provider');
const contracts = require('../blockchain/contracts');
const config = require('../config');
const { handleError } = require('../utils/errors');

// GitHub repositories and files
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const METADATA_REPO = 'berachain/metadata';
const METADATA_BRANCH = 'main';

class TokenService {
  constructor() {
    this.priceCache = {};
    this.initialized = false;
  }
  
  /**
   * Initialize the token service
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
      return handleError(error, 'TokenService.initialize', false);
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
      return handleError(error, 'TokenService.fetchFromGitHub');
    }
  }
  
  /**
   * Fetch common Berachain tokens
   * @returns {Promise<Array>} Array of token objects
   */
  async getCommonTokens() {
    return [
      {
        address: "0x5806E416dA447b267cEA759358cF22Cc41FAE80F",
        symbol: "WBERA",
        name: "Wrapped BERA",
        decimals: 18,
      },
      {
        address: config.networks.berachain.bgtTokenAddress,
        symbol: "BGT",
        name: "Berachain Governance Token",
        decimals: 18,
      },
      {
        address: config.networks.berachain.honeyTokenAddress,
        symbol: "HONEY",
        name: "Honey",
        decimals: 18,
      },
      {
        address: "0x3452e23F9c4cC62c70B7ADAd699B2AF6a2d9D218",
        symbol: "STGUSDC",
        name: "Stargate USDC",
        decimals: 6,
      },
      {
        address: "0x44F07Ce5AfeCbCC406e6beFD40cc2998eEb8c7C6",
        symbol: "BGT Staker",
        name: "BGT Staker",
        decimals: 18,
      }
    ];
  }
  
  /**
   * Fetch tokens from GitHub
   * @param {boolean} [useCache=true] - Whether to use cached data if available
   * @returns {Promise<Object>} Result object with tokens data
   */
  async fetchGitHubTokens(useCache = true) {
    try {
      // Check cache first
      if (useCache) {
        const cachedData = await cache.get('github_tokens', true);
        if (cachedData) {
          return {
            success: true,
            tokens: cachedData,
            count: cachedData.data.length
          };
        }
      }
      
      // Fetch from GitHub
      const tokens = await this.fetchFromGitHub('src/tokens/mainnet.json');
      
      // Create metadata object
      const metadata = {
        data: tokens,
        count: tokens.length,
        timestamp: Date.now(),
        source: "github"
      };
      
      // Store in cache
      await cache.set('github_tokens', metadata, { cacheType: 'tokens', persist: true });
      
      return {
        success: true,
        tokens: metadata,
        count: metadata.count
      };
    } catch (error) {
      return handleError(error, 'TokenService.fetchGitHubTokens', {
        success: false,
        error: error.message || "Failed to fetch token data from GitHub"
      });
    }
  }
  
  /**
   * Fetch tokens from OogaBooga API
   * @param {boolean} [useCache=true] - Whether to use cached data if available
   * @returns {Promise<Object>} Result object with tokens data
   */
  async fetchOogaBoogaTokens(useCache = true) {
    try {
      if (!this.isInitialized()) {
        throw new Error("TokenService not initialized with API key");
      }
      
      // Check cache first
      if (useCache) {
        const cachedData = await cache.get('oogabooga_tokens', true);
        if (cachedData) {
          return {
            success: true,
            tokens: cachedData,
            count: cachedData.data.length
          };
        }
      }
      
      // Fetch tokens from OogaBooga API
      const response = await apiCore.get('/v1/tokens');
      
      if (!response || !Array.isArray(response)) {
        throw new Error("Invalid response from OogaBooga API");
      }
      
      // Transform to object with address as key
      const tokenMap = {};
      
      response.forEach(token => {
        tokenMap[token.address.toLowerCase()] = {
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoURI: token.logoURI
        };
      });
      
      // Add BERA native token if not included
      if (!tokenMap["0x0000000000000000000000000000000000000000"]) {
        tokenMap["0x0000000000000000000000000000000000000000"] = {
          address: "0x0000000000000000000000000000000000000000",
          symbol: "BERA",
          name: "Berachain Token",
          decimals: 18,
          logoURI: "https://res.cloudinary.com/duv0g402y/raw/upload/v1717773645/src/assets/bera.png"
        };
      }
      
      // Create a metadata object
      const metadata = {
        data: tokenMap,
        count: Object.keys(tokenMap).length,
        timestamp: Date.now(),
        source: "oogabooga"
      };
      
      // Store in cache
      await cache.set('oogabooga_tokens', metadata, { cacheType: 'tokens', persist: true });
      
      return {
        success: true,
        tokens: metadata,
        count: metadata.count
      };
    } catch (error) {
      return handleError(error, 'TokenService.fetchOogaBoogaTokens', {
        success: false,
        error: error.message || "Failed to fetch token data from OogaBooga"
      });
    }
  }
  
  /**
   * Retrieves the current USD prices for multiple tokens with caching
   * @param {string[]} tokenAddresses - Array of token addresses to fetch prices for
   * @returns {Promise<Object>} Map of token address to price
   */
  async getTokenPrices(tokenAddresses = []) {
    try {
      if (!this.isInitialized()) {
        throw new Error("TokenService not initialized with API key");
      }
      
      // Normalize addresses
      const normalizedAddresses = tokenAddresses.map(addr => {
        if (addr === 'BERA' || addr === 'native') {
          return '0x0000000000000000000000000000000000000000';
        }
        return addr.toLowerCase();
      });
      
      // Check cache first for all addresses
      const priceMap = {};
      const uncachedAddresses = [];
      
      // Try to get from cache first
      for (const addr of normalizedAddresses) {
        const cacheKey = `price_${addr}`;
        const cachedPrice = await cache.get(cacheKey);
        
        if (cachedPrice !== null) {
          priceMap[addr] = cachedPrice;
        } else {
          uncachedAddresses.push(addr);
        }
      }
      
      // If all prices were in cache, return early
      if (uncachedAddresses.length === 0) {
        return priceMap;
      }
      
      // Format query parameters - if oogabooga API supports specific token queries
      // Note: Not all APIs support this, check the API docs
      const queryParams = { currency: 'USD' };
      
      // If the API supports specific token list fetching, add them here
      if (uncachedAddresses.length > 0) {
        // Some APIs support: queryParams.addresses = uncachedAddresses.join(',');
        // But for now, we'll fetch all and filter
      }
      
      // Fetch prices from API
      const response = await apiCore.get('/v1/prices', queryParams);
      
      // Response is an array of {address, price} objects
      if (response && Array.isArray(response)) {
        // Extract and cache prices for requested tokens
        for (const tokenData of response) {
          if (tokenData && tokenData.address) {
            const addr = tokenData.address.toLowerCase();
            // Only process and cache tokens we actually requested
            if (uncachedAddresses.includes(addr)) {
              const price = parseFloat(tokenData.price);
              
              // Store in our result map
              priceMap[addr] = price;
              
              // Update cache
              const cacheKey = `price_${addr}`;
              await cache.set(cacheKey, price, { 
                cacheType: 'prices', 
                persist: false,
                ttl: 5 * 60 // 5 minute cache for prices
              });
            }
          }
        }
      }
      
      return priceMap;
    } catch (error) {
      return handleError(error, 'TokenService.getTokenPrices', {});
    }
  }
  
  /**
   * Retrieves the current USD price for a token with caching
   * @param {string} tokenAddress - Token contract address or 'BERA'/'native' for native token
   * @returns {Promise<number|null>} Current price in USD or null if unavailable
   */
  async getTokenPrice(tokenAddress) {
    try {
      if (!this.isInitialized()) {
        throw new Error("TokenService not initialized with API key");
      }
      
      // Check cache first
      const normalizedAddress = tokenAddress === 'BERA' || tokenAddress === 'native' 
        ? '0x0000000000000000000000000000000000000000' 
        : tokenAddress.toLowerCase();
      
      const cacheKey = `price_${normalizedAddress}`;
      const cachedPrice = await cache.get(cacheKey);
      if (cachedPrice !== null) {
        return cachedPrice;
      }
      
      // Use the batch method for a single token
      const priceMap = await this.getTokenPrices([normalizedAddress]);
      return priceMap[normalizedAddress] || null;
    } catch (error) {
      return handleError(error, 'TokenService.getTokenPrice', null);
    }
  }
  
  /**
   * Gets native BERA balance for an address
   * @param {string} address - Wallet address
   * @returns {Promise<Object|null>} Balance information or null if error
   */
  async getNativeBalance(address) {
    try {
      if (!provider.isInitialized()) {
        throw new Error("Provider not initialized");
      }
      
      const beraBalance = await provider.getBalance(address);
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
        name: 'BERA',
        symbol: 'BERA',
        address: 'native',
        decimals: 18,
        balance: formattedBeraBalance,
        formattedBalance: formattedBeraBalance,
        priceUsd: beraPrice,
        valueUsd: roundedValueUsd,
        formattedValueUsd: roundedValueUsd.toLocaleString(undefined, {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }),
        isNative: true
      };
    } catch (error) {
      return handleError(error, 'TokenService.getNativeBalance', null);
    }
  }
  
  /**
   * Gets token balance for a specific ERC20 token
   * @param {string} address - Wallet address
   * @param {Object} token - Token data (address, symbol, name, decimals)
   * @returns {Promise<Object|null>} Token with balance data or null if error/zero balance
   */
  async getTokenBalance(address, token) {
    try {
      if (!provider.isInitialized()) {
        throw new Error("Provider not initialized");
      }
      
      // Skip tokens without an address
      if (!token.address || token.address === 'native') return null;
      
      const tokenContract = contracts.getErc20Contract(token.address);
      
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
        ...token,
        name: token.name,
        symbol: token.symbol,
        balance: formattedBalance,
        formattedBalance: formattedBalance,
        priceUsd: tokenPrice,
        valueUsd: roundedValueUsd,
        formattedValueUsd: roundedValueUsd.toLocaleString(undefined, {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
      };
    } catch (error) {
      return handleError(error, 'TokenService.getTokenBalance', null);
    }
  }
  
  /**
   * Get token list based on options
   * @param {Object} options - Options for filtering tokens
   * @param {boolean} [options.common] - Whether to return only common tokens
   * @returns {Promise<Object>} Filtered token list
   */
  async getTokenList(options = {}) {
    try {
      console.log(`[TokenService] Getting token list with options:`, options);
      
      // If common tokens requested, return predefined list
      if (options.common) {
        const commonTokens = await this.getCommonTokens();
        return {
          success: true,
          tokens: commonTokens,
          count: commonTokens.length,
          source: "common"
        };
      }
      
      // Get OogaBooga tokens
      const result = await this.fetchOogaBoogaTokens();
      
      if (!result.success || !result.tokens || !result.tokens.data) {
        throw new Error("Failed to fetch OogaBooga token list");
      }
      
      // Convert from object to array if needed
      let tokenArray = [];
      if (typeof result.tokens.data === 'object' && !Array.isArray(result.tokens.data)) {
        tokenArray = Object.values(result.tokens.data);
      } else if (Array.isArray(result.tokens.data)) {
        tokenArray = result.tokens.data;
      }
      
      console.log(`[TokenService] Returning ${tokenArray.length} tokens from OogaBooga`);
      
      return {
        success: true,
        tokens: tokenArray,
        count: tokenArray.length,
        source: 'oogabooga'
      };
    } catch (error) {
      return handleError(error, 'TokenService.getTokenList', {
        success: false,
        error: error.message || "Failed to get token list",
        tokens: [],
        count: 0
      });
    }
  }
  
  /**
   * Gets all token balances for a wallet address
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} Object with balances categorized by token type
   */
  async getAllBalances(address) {
    try {
      if (!provider.isInitialized()) {
        throw new Error("Provider not initialized");
      }
      
      // Get tokens list
      const tokenListResult = await this.getTokenList();
      
      if (!tokenListResult.success || !tokenListResult.tokens) {
        throw new Error("Failed to fetch token list");
      }
      
      // Get native balance
      const nativeBalance = await this.getNativeBalance(address);
      
      // Get token balances in parallel (in batches to avoid too many concurrent requests)
      const batchSize = 10;
      const allTokens = tokenListResult.tokens;
      let tokenBalances = [];
      
      console.log(`[TokenService] Getting balances for ${allTokens.length} tokens in batches of ${batchSize}`);
      
      // First, get all token balances without prices
      const tokensWithBalances = [];
      const tokenAddressesWithBalances = [];
      
      for (let i = 0; i < allTokens.length; i += batchSize) {
        const batch = allTokens.slice(i, i + batchSize);
        console.log(`[TokenService] Processing balance batch ${Math.floor(i/batchSize) + 1} with ${batch.length} tokens`);
        
        const batchPromises = batch.map(async (token) => {
          try {
            if (!token || !token.address || token.address === 'native') return null;
            
            // Get balance but don't fetch prices yet
            if (!provider.isInitialized()) {
              throw new Error("Provider not initialized");
            }
            
            const tokenContract = contracts.getErc20Contract(token.address);
            const rawBalance = await tokenContract.balanceOf(address);
            const balanceFloat = parseFloat(ethers.utils.formatUnits(rawBalance, token.decimals || 18));
            
            // Skip tokens with zero balance
            if (balanceFloat <= 0) return null;
            
            // Round to 2 decimal places
            const formattedBalance = balanceFloat.toFixed(2);
            
            // Return token with balance but no price yet
            return {
              ...token,
              name: token.name,
              symbol: token.symbol,
              balance: formattedBalance,
              formattedBalance: formattedBalance,
              balanceFloat: balanceFloat, // Keep for price calculation
              priceUsd: null, // Will fill in next step
              valueUsd: 0,    // Will fill in next step
              formattedValueUsd: '$0.00'
            };
          } catch (err) {
            console.error(`[TokenService] Error getting balance for ${token.symbol || token.address}:`, err.message);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter(b => b !== null);
        
        // Add to our token list with balances
        tokensWithBalances.push(...validResults);
        
        // Collect addresses for price fetching
        for (const token of validResults) {
          tokenAddressesWithBalances.push(token.address.toLowerCase());
        }
      }
      
      // Now fetch prices for all tokens with balances in one batch request
      console.log(`[TokenService] Fetching prices for ${tokenAddressesWithBalances.length} tokens with balances`);
      
      if (tokenAddressesWithBalances.length > 0) {
        // Add native token address if we have a native balance
        if (nativeBalance) {
          tokenAddressesWithBalances.push('0x0000000000000000000000000000000000000000');
        }
        
        // Fetch all prices in one batch
        const priceMap = await this.getTokenPrices(tokenAddressesWithBalances);
        
        // Apply prices to tokens
        tokenBalances = tokensWithBalances.map(token => {
          const tokenAddress = token.address.toLowerCase();
          const price = priceMap[tokenAddress] || null;
          
          // Calculate USD value if price is available
          const valueUsd = price ? token.balanceFloat * price : 0;
          const roundedValueUsd = parseFloat(valueUsd.toFixed(2));
          
          return {
            ...token,
            priceUsd: price,
            valueUsd: roundedValueUsd,
            formattedValueUsd: roundedValueUsd.toLocaleString(undefined, {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })
          };
        });
        
        // Also update native token price if available
        if (nativeBalance && priceMap['0x0000000000000000000000000000000000000000']) {
          const nativePrice = priceMap['0x0000000000000000000000000000000000000000'];
          const valueUsd = nativeBalance.balanceFloat * nativePrice;
          nativeBalance.priceUsd = nativePrice;
          nativeBalance.valueUsd = valueUsd;
          nativeBalance.formattedValueUsd = valueUsd.toLocaleString(undefined, {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
        }
      }
      
      console.log(`[TokenService] Found ${tokenBalances.length} tokens with non-zero balances`);
      
      // Sort by USD value (highest first)
      tokenBalances.sort((a, b) => b.valueUsd - a.valueUsd);
      
      // Calculate total portfolio value
      const totalValueUsd = tokenBalances.reduce(
        (sum, token) => sum + token.valueUsd, 
        (nativeBalance ? nativeBalance.valueUsd : 0)
      );
      
      return {
        success: true,
        native: nativeBalance,
        tokens: tokenBalances,
        totalValueUsd,
        formattedTotalValueUsd: totalValueUsd.toLocaleString(undefined, {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
      };
    } catch (error) {
      return handleError(error, 'TokenService.getAllBalances', {
        success: false,
        error: error.message,
        native: null,
        tokens: [],
        totalValueUsd: 0,
        formattedTotalValueUsd: '$0.00'
      });
    }
  }
}

// Export singleton instance
const tokenService = new TokenService();
module.exports = tokenService;