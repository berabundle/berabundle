/**
 * RewardsService.js - Service for checking and claiming rewards in the React UI
 * 
 * This adapter manages communication with the BeraBundle rewards system
 * using the backend API for all blockchain interactions
 */

import { ethers } from 'ethers';
import apiClient from './ApiClient';

/**
 * Service for checking and claiming rewards in the React UI
 */
class RewardsService {
  constructor() {
    this.provider = null;
    this.checkedRewards = [];
    this.initialized = false;
    this.apiKey = null;
    
    // Contract addresses kept for reference, actual logic moved to backend
    this.contractAddresses = {
      bgtStaker: '0x44f07ce5afecbcc406e6befd40cc2998eeb8c7c6',
      honeyToken: '0x7eeca4205ff31f947edbd49195a7a88e6a91161b',
      bgtToken: '0x656b95e550c07a9ffe548bd4085c72418ceb1dba',
      rewardVaultFactory: '0x94ad6ac84f6c6fba8b8ccbd71d9f4f101def52a8'
    };
  }
  
  /**
   * Initialize the service with a provider
   * @param {ethers.providers.Web3Provider} provider - Ethers provider
   * @param {string} apiKey - OogaBooga API key
   */
  initialize(provider, apiKey) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.initialized = Boolean(provider && apiKey);
    
    // Initialize API client with the same API key
    apiClient.initialize({ apiKey });
    
    return this.initialized;
  }
  
  /**
   * Check if the service is initialized
   */
  isInitialized() {
    return this.initialized && Boolean(this.provider && this.apiKey);
  }
  
  /**
   * Check all rewards for a user using the backend API
   * @param {string} address - Wallet address to check
   * @returns {Promise<Object>} Rewards information
   */
  async checkRewards(address) {
    if (!this.isInitialized()) throw new Error("RewardsService not initialized");
    
    try {
      // Validate address
      if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
        throw new Error(`Invalid address provided: ${address}`);
      }
      
      // Normalize user address
      const normalizedAddress = ethers.utils.getAddress(address.toLowerCase());
      console.log(`Checking all rewards for ${normalizedAddress}...`);
      
      // Use the API client to check rewards
      const result = await apiClient.checkRewards(normalizedAddress);
      
      // Handle API response
      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to check rewards");
      }
      
      // Log results
      if (result.rewards) {
        console.log(`Found ${result.rewards.length} rewards`);
      }
      
      // Save rewards for later (for claiming)
      this.checkedRewards = result.rewards || [];
      
      return result;
    } catch (error) {
      console.error("Error checking rewards:", error);
      
      return {
        success: false,
        error: error.message || "Failed to check rewards",
        rewards: []
      };
    }
  }
  
  /**
   * Check BGT Staker for rewards
   * @param {string} address - User wallet address
   * @returns {Promise<Object|null>} BGT Staker reward information
   */
  async checkBGTStakerRewards(address) {
    try {
      if (!this.provider) throw new Error("Provider not initialized");
      
      console.log("Starting BGT Staker rewards check...");
      
      // Make sure we're working with a valid address - always validate input
      if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
        console.warn(`Invalid address provided to checkBGTStakerRewards: ${address}`);
        return null;
      }
      
      // Always convert to lowercase first to ensure consistent normalization
      const normalizedAddress = ethers.utils.getAddress(address.toLowerCase());
      
      // Get contract addresses from the central store and normalize - always convert to lowercase first
      const bgtStakerAddress = ethers.utils.getAddress(this.contractAddresses.bgtStaker.toLowerCase());
      const honeyTokenAddress = ethers.utils.getAddress(this.contractAddresses.honeyToken.toLowerCase());
      
      
      // Create contract instance with more comprehensive ABI
      // This matches the ABI from the Berachain docs for BGT Staker
      const bgtStakerABI = [
        "function balanceOf(address) view returns (uint256)",
        "function earned(address) view returns (uint256)",
        "function totalSupply() view returns (uint256)",
        "function rewardRate() view returns (uint256)",
        "function getReward() external",
        "function lastTimeRewardApplicable() view returns (uint256)",
        "function rewardPerToken() view returns (uint256)"
      ];
      
      const bgtStaker = new ethers.Contract(
        bgtStakerAddress,
        bgtStakerABI,
        this.provider
      );
      
      // First check if user has any stake
      let userBalance;
      try {
        console.log(`Checking balance for ${normalizedAddress} at contract ${bgtStakerAddress}`);
        
        userBalance = await this.retryPromise(() => bgtStaker.balanceOf(normalizedAddress));
        console.log(`BGT Staker balance: ${userBalance.toString()}`);
        
        // Even if balance is zero, we continue checking earned rewards
        // as users might have earned rewards but unstaked their tokens
      } catch (err) {
        console.error(`ERROR checking BGT Staker balance:`, err);
        // Continue anyway to check earned rewards
        userBalance = ethers.BigNumber.from(0);
      }
      
      // Check earned rewards with retry - this is the key part
      let earned;
      try {
        console.log(`Checking earned rewards for ${normalizedAddress}`);
        earned = await this.retryPromise(() => bgtStaker.earned(normalizedAddress), 5);
        console.log(`BGT Staker earned: ${earned.toString()}`);
        
        if (earned.isZero() && userBalance.isZero()) {
          console.log("User has no earned rewards and no stake");
          return null;
        }
      } catch (err) {
        console.error(`ERROR checking BGT Staker earned rewards:`, err);
        return null;
      }
      
      // This is always HONEY - no need to check the contract
      const honeyTokenInfo = {
        symbol: "HONEY",
        decimals: 18
      };
      
      // Get price for HONEY
      let priceUsd = null;
      try {
        priceUsd = await tokenBridge.getTokenPrice(honeyTokenAddress);
      } catch (err) {
        console.warn("Could not get price for HONEY:", err);
      }
      
      // Format earned amount - round to 2 decimal places
      const earnedFloat = parseFloat(ethers.utils.formatUnits(earned, honeyTokenInfo.decimals));
      const balanceFloat = parseFloat(ethers.utils.formatUnits(userBalance, honeyTokenInfo.decimals));
      
      // Round to 2 decimal places
      const formattedEarned = earnedFloat.toFixed(2);
      const formattedBalance = balanceFloat.toFixed(2);
      const valueUsd = priceUsd ? earnedFloat * priceUsd : 0;
      
      console.log(`Successfully completed BGT Staker check for ${normalizedAddress}`);
      console.log(`User has ${formattedBalance} staked and ${formattedEarned} earned`);
      
      // Validator boost data will be checked separately through checkValidatorBoosts
      
      return {
        id: `bgtStaker-${bgtStakerAddress.substring(2, 10)}`,
        type: 'bgtStaker',
        name: 'BGT Staker Honey Fees', // Updated name for clarity
        symbol: honeyTokenInfo.symbol, // Keep separately for internal use
        source: 'BGT Staker',
        amount: formattedEarned,
        earned: formattedEarned, // Already rounded to 2 decimal places
        formattedAmount: formattedEarned, // No symbol, just the number
        valueUsd: parseFloat(valueUsd.toFixed(2)), // Round to 2 decimal places
        formattedValueUsd: valueUsd.toLocaleString(undefined, {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }),
        rewardToken: {
          symbol: honeyTokenInfo.symbol,
          address: honeyTokenAddress,
          decimals: honeyTokenInfo.decimals
        },
        contractAddress: bgtStakerAddress,
        rawEarned: earned,
        // We still include userBalance in case other components need it, but it won't be displayed
        userBalance: formattedBalance
      };
    } catch (error) {
      console.error("Error checking BGT Staker rewards:", error);
      return null;
    }
  }
  
  
  /**
   * Check vaults for rewards
   * @param {string} address - User wallet address
   * @returns {Promise<Array<Object>>} Array of vault rewards
   */
  async checkVaultRewards(address) {
    try {
      // Validate address
      if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
        console.warn(`Warning: Invalid address provided to checkVaultRewards: ${address}`);
        return [];
      }
      
      // Normalize address for consistency - always convert to lowercase first
      const normalizedAddress = ethers.utils.getAddress(address.toLowerCase());
      
      // Get vault addresses directly from the chain
      console.log("Finding vaults with active stakes...");
      const vaultAddresses = await this.getRewardVaults();
      
      if (!vaultAddresses || vaultAddresses.length === 0) {
        console.log("No vaults found on-chain");
        return [];
      }
      
      console.log(`Found ${vaultAddresses.length} total vaults to check...`);

      // Process vaults in batches to avoid overwhelming the network
      const batchSize = 10;
      const vaultsWithStakes = [];
      
      // Create batches of vault addresses
      const batches = [];
      for (let i = 0; i < vaultAddresses.length; i += batchSize) {
        batches.push(vaultAddresses.slice(i, i + batchSize));
      }
      
      console.log(`Processing ${vaultAddresses.length} vaults in ${batches.length} batches...`);
      
      // Process each batch sequentially
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchPromises = batch.map(vaultAddress => this.checkVaultByAddress(vaultAddress, normalizedAddress));
        
        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter(Boolean);
        
        // Add to total stakes
        vaultsWithStakes.push(...validResults);
        
        // Log progress
        const processed = Math.min((i + 1) * batchSize, vaultAddresses.length);
        const percent = Math.round((processed / vaultAddresses.length) * 100);
        
        // More detailed log message for debugging
        if (validResults.length > 0 || i % 5 === 0 || i === batches.length - 1) {
          console.log(`Processed ${processed}/${vaultAddresses.length} vaults (${percent}%), found ${vaultsWithStakes.length} active stakes` + 
            (validResults.length > 0 ? ` (+${validResults.length} new)` : ''));
          
          // If we found new stakes, log some info about them
          if (validResults.length > 0) {
            validResults.forEach(stake => {
              console.log(`  - Found stake: ${stake.userStake}, earned: ${stake.earned}`);
            });
          }
        }
        
        // Add a small delay between batches to avoid rate limits
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`Vault checking complete. Found ${vaultsWithStakes.length} vaults with active stakes.`);
      return vaultsWithStakes;
    } catch (error) {
      console.warn("Error checking vault rewards:", error);
      return [];
    }
  }
  
  /**
   * Check a vault by its address for rewards
   * @param {string} vaultAddress - Vault contract address
   * @param {string} userAddress - User wallet address
   * @returns {Promise<Object|null>} Vault reward information
   */
  async checkVaultByAddress(vaultAddress, userAddress) {
    try {
      // Validate addresses
      if (!vaultAddress || typeof vaultAddress !== 'string' || !vaultAddress.startsWith('0x')) {
        console.warn(`Warning: Invalid vault address: ${vaultAddress}`);
        return null;
      }
      
      if (!userAddress || typeof userAddress !== 'string' || !userAddress.startsWith('0x')) {
        console.warn(`Warning: Invalid user address: ${userAddress}`);
        return null;
      }
      
      // Normalize addresses - always convert to lowercase first for consistency
      const normalizedVaultAddress = ethers.utils.getAddress(vaultAddress.toString().toLowerCase());
      const normalizedUserAddress = ethers.utils.getAddress(userAddress.toString().toLowerCase());
      
      
      // Create a simple vault object with just the normalized address
      const vault = { address: normalizedVaultAddress };
      
      // Use the existing checkVault method
      return await this.checkVault(vault, normalizedUserAddress);
    } catch (error) {
      console.warn(`Warning: Could not check vault ${vaultAddress}:`, error.message);
      return null;
    }
  }
  
  /**
   * Check a specific vault for rewards
   * @param {Object} vault - Vault information from metadata
   * @param {string} userAddress - User wallet address
   * @returns {Promise<Object|null>} Vault reward information
   */
  async checkVault(vault, userAddress) {
    try {
      if (!this.provider) throw new Error("Provider not initialized");
      
      // Get the vault address and validate
      let vaultAddress = vault.address || vault.vaultAddress;
      
      // Validate addresses before proceeding
      if (!vaultAddress || typeof vaultAddress !== 'string' || !vaultAddress.startsWith('0x')) {
        console.warn(`Warning: Invalid vault address: ${vaultAddress}`);
        return null;
      }
      
      if (!userAddress || typeof userAddress !== 'string' || !userAddress.startsWith('0x')) {
        console.warn(`Warning: Invalid user address: ${userAddress}`);
        return null;
      }
      
      // Normalize addresses - always convert to lowercase first for consistency
      try {
        // Always convert to lowercase first to ensure consistent normalization
        vaultAddress = ethers.utils.getAddress(vaultAddress.toString().toLowerCase());
        userAddress = ethers.utils.getAddress(userAddress.toString().toLowerCase());
      } catch (err) {
        console.warn(`Warning: Could not normalize addresses: ${err.message}`);
        return null;
      }
      
      // Create contract instance to interact with the vault
      const vaultContract = new ethers.Contract(
        vaultAddress,
        [
          "function balanceOf(address) view returns (uint256)",
          "function stakeToken() view returns (address)",
          "function rewardToken() view returns (address)",
          "function totalSupply() view returns (uint256)",
          "function earned(address) view returns (uint256)",
          "function rewardRate() view returns (uint256)",
          "function getRewardForDuration() view returns (uint256)"
        ],
        this.provider
      );
      
      // First check if user has any stake - this is the fastest check
      let userBalance;
      try {
        userBalance = await vaultContract.balanceOf(userAddress);
        if (userBalance.eq(0)) {
          return null;
        }
      } catch (err) {
        console.warn(`Warning: Could not check balance for vault ${vaultAddress}:`, err.message);
        return null;
      }
      
      // Get all other data in parallel with retry logic
      try {
        const [
          stakeTokenAddress,
          rewardTokenAddress,
          totalSupply,
          earned,
          rewardRate,
          rewardForDuration
        ] = await Promise.all([
          this.retryPromise(() => vaultContract.stakeToken()),
          this.retryPromise(() => vaultContract.rewardToken()),
          this.retryPromise(() => vaultContract.totalSupply()),
          this.retryPromise(() => vaultContract.earned(userAddress)),
          this.retryPromise(() => vaultContract.rewardRate()),
          this.retryPromise(() => vaultContract.getRewardForDuration())
        ]);
        
        // Normalize token addresses before getting info - convert to string to handle any object addresses
        const normalizedStakeTokenAddress = ethers.utils.getAddress(stakeTokenAddress.toString().toLowerCase());
        const normalizedRewardTokenAddress = ethers.utils.getAddress(rewardTokenAddress.toString().toLowerCase());
        
        console.log(`Normalized stake token address: ${normalizedStakeTokenAddress}`);
        console.log(`Normalized reward token address: ${normalizedRewardTokenAddress}`);
        
        // Get token info in parallel with normalized addresses
        const [stakeTokenInfo, rewardTokenInfo] = await Promise.all([
          this.getTokenInfo(normalizedStakeTokenAddress),
          this.getTokenInfo(normalizedRewardTokenAddress)
        ]);
        
        // Format values - parse float and round to 2 decimal places
        const userStakeFloat = parseFloat(ethers.utils.formatUnits(userBalance, stakeTokenInfo.decimals));
        const totalStakeFloat = parseFloat(ethers.utils.formatUnits(totalSupply, stakeTokenInfo.decimals));
        const earnedFloat = parseFloat(ethers.utils.formatUnits(earned, rewardTokenInfo.decimals));
        
        // Round to 2 decimal places for display
        const userStake = userStakeFloat.toFixed(2);
        const totalStake = totalStakeFloat.toFixed(2);
        const earnedFormatted = earnedFloat.toFixed(2);
        
        // Calculate percentage share - also round to 2 decimal places
        const share = totalStakeFloat > 0 
          ? ((userStakeFloat / totalStakeFloat) * 100).toFixed(2)
          : "0.00";
        
        // Get price for reward token
        let priceUsd = null;
        try {
          priceUsd = await tokenBridge.getTokenPrice(normalizedRewardTokenAddress);
        } catch (err) {
          console.warn(`Could not get price for ${rewardTokenInfo.symbol}:`, err);
        }
        
        // Calculate value in USD - round to 2 decimal places
        const valueUsd = priceUsd ? earnedFloat * priceUsd : 0;
        
        // Build metadata from vault info and chain data
        // Use name and protocol from GitHub metadata via vault cache
        // This vault object comes from the checkVaultByAddress method, which creates
        // a simple object with just the address. The real metadata is in the vaultCache.
        const vaultCacheData = this.vaultCache ? this.vaultCache.get(vaultAddress) || {} : {};
        const vaultName = vaultCacheData.name || vault.name || `Vault ${vaultAddress.substring(2, 10)}`;
        const protocolName = vaultCacheData.protocol || vault.protocol || "";
        
        
        return {
          id: `vault-${vaultAddress.substring(2, 10)}`,
          type: 'vault',
          name: vaultName, // Use name from GitHub metadata, fall back to address if not available
          protocol: protocolName, // Use protocol from GitHub metadata
          description: vaultCacheData.description || vault.description || "",
          symbol: rewardTokenInfo.symbol, // Keep separately for internal use
          source: vault.protocol ? `${vault.protocol} Vault` : "Vault Staking",
          amount: earnedFormatted,
          earned: earnedFormatted, // Already rounded to 2 decimal places
          formattedAmount: earnedFormatted, // No symbol, just the number
          valueUsd: parseFloat(valueUsd.toFixed(2)), // Round to 2 decimal places
          formattedValueUsd: valueUsd.toLocaleString(undefined, {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }),
          rewardToken: {
            symbol: rewardTokenInfo.symbol,
            address: normalizedRewardTokenAddress,
            decimals: rewardTokenInfo.decimals
          },
          stakeToken: {
            symbol: stakeTokenInfo.symbol,
            address: normalizedStakeTokenAddress,
            decimals: stakeTokenInfo.decimals
          },
          vaultAddress,
          address: vaultAddress, // Add this for compatibility with different field names
          userStake,
          totalStake,
          share,
          rawEarned: earned,
          rewardRate: parseFloat(ethers.utils.formatUnits(rewardRate, rewardTokenInfo.decimals)).toFixed(2),
          rewardForDuration: parseFloat(ethers.utils.formatUnits(rewardForDuration, rewardTokenInfo.decimals)).toFixed(2),
          url: vault.url || ""
        };
      } catch (error) {
        console.warn(`Warning: Could not get data for vault ${vaultAddress}:`, error.message);
        return null;
      }
    } catch (error) {
      console.warn(`Warning: Could not check vault ${vault.address || vault.vaultAddress}:`, error.message);
      return null;
    }
  }
  
  /**
   * Helper function to retry a failed promise with exponential backoff
   * This is kept for backward compatibility but will be deprecated
   * in favor of backend retry logic in the future
   * 
   * @param {Function} operation - Function that returns a promise to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {Promise<any>} Result of the operation
   */
  async retryPromise(operation, maxRetries = 3, baseDelay = 100) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await operation();
        if (i > 0) {
          console.log(`Operation succeeded after ${i+1} attempts`);
        }
        return result;
      } catch (error) {
        lastError = error;
        
        // Log the retry attempt
        console.warn(`Retry attempt ${i+1}/${maxRetries} failed: ${error.message}`);
        
        // If this is the last attempt, throw the error
        if (i === maxRetries - 1) {
          console.error(`All ${maxRetries} retry attempts failed`);
          throw error;
        }
        
        // Calculate backoff delay with jitter
        const jitter = 0.5 + Math.random(); // Random value between 0.5 and 1.5
        const delay = baseDelay * Math.pow(2, i) * jitter;
        
        console.log(`Retrying in ${Math.round(delay)}ms with jitter factor ${jitter.toFixed(2)}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
  
  /**
   * Get token information
   * @param {string} tokenAddress - Token address
   * @returns {Promise<Object>} Token information
   */
  async getTokenInfo(tokenAddress) {
    try {
      if (!tokenAddress || !tokenAddress.startsWith('0x')) {
        return { symbol: "UNKNOWN", decimals: 18 };
      }
      
      // Check cache
      if (this.tokenInfoCache.has(tokenAddress)) {
        return this.tokenInfoCache.get(tokenAddress);
      }
      
      // Try to get token info from cache
      try {
        const cachedTokens = await this.loadTokensMetadata();
        if (cachedTokens[tokenAddress.toLowerCase()]) {
          const tokenInfo = {
            symbol: cachedTokens[tokenAddress.toLowerCase()].symbol || "UNKNOWN",
            decimals: cachedTokens[tokenAddress.toLowerCase()].decimals || 18
          };
          
          this.tokenInfoCache.set(tokenAddress, tokenInfo);
          return tokenInfo;
        }
      } catch (err) {
        console.warn(`Could not load token info from cache for ${tokenAddress}:`, err);
      }
      
      // Query on-chain
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          "function symbol() view returns (string)",
          "function decimals() view returns (uint8)"
        ],
        this.provider
      );
      
      const [symbol, decimals] = await Promise.all([
        tokenContract.symbol().catch(() => "UNKNOWN"),
        tokenContract.decimals().catch(() => 18)
      ]);
      
      const info = { symbol, decimals };
      this.tokenInfoCache.set(tokenAddress, info);
      return info;
    } catch (error) {
      console.warn(`Warning: Could not get token info for ${tokenAddress}:`, error);
      return { symbol: "UNKNOWN", decimals: 18 };
    }
  }
  
  /**
   * Get all reward vaults from GitHub metadata
   * This is more efficient than querying all vaults from the blockchain
   * @returns {Promise<Array<string>>} Array of vault addresses
   */
  async getRewardVaults() {
    try {
      console.log("Fetching vaults from GitHub metadata...");
      
      // Import and use metadataService
      const metadataService = await import('../services/MetadataService').then(module => module.default);
      
      // Get vaults from metadata service (which will use localStorage cache if available)
      const vaultsResult = await metadataService.getVaults();
      
      if (vaultsResult.success && vaultsResult.vaults && Array.isArray(vaultsResult.vaults.data)) {
        const vaultsData = vaultsResult.vaults.data;
        console.log(`Loaded ${vaultsData.length} vaults from GitHub metadata`);
        
        // Extract and normalize addresses
        const vaultAddresses = [];
        
        // Initialize the vault cache if needed
        this.vaultCache = this.vaultCache || new Map();
        
        for (const vault of vaultsData) {
          try {
            // Should be vaultAddress based on the GitHub structure
            let vaultAddress = vault.vaultAddress || vault.address;
            
            if (!vaultAddress || typeof vaultAddress !== 'string' || !vaultAddress.startsWith('0x')) {
              console.warn(`Skipping vault with invalid address: ${JSON.stringify(vault)}`);
              continue;
            }
            
            // Convert to lowercase first for consistent normalization
            const normalizedAddress = ethers.utils.getAddress(vaultAddress.toString().toLowerCase());
            vaultAddresses.push(normalizedAddress);
            
            // Store complete metadata for this vault in memory for later use
            this.vaultCache.set(normalizedAddress, {
              // Basic info
              name: vault.name || "Unknown Vault",
              protocol: vault.protocol || "",
              description: vault.description || "",
              // Token addresses
              stakeTokenAddress: vault.stakingTokenAddress || "",
              rewardTokenAddress: vault.rewardTokenAddress || "",
              // Additional metadata from GitHub
              logoURI: vault.logoURI || "",
              url: vault.url || "",
              owner: vault.owner || "",
              // Protocol metadata
              protocolLogo: vault.protocolLogo || "",
              protocolUrl: vault.protocolUrl || "",
              protocolDescription: vault.protocolDescription || ""
            });
            
          } catch (err) {
            console.warn(`Error processing vault address: ${err.message}`, err);
          }
        }
        
        console.log(`Processed ${vaultAddresses.length} valid vault addresses with metadata`);
        return vaultAddresses;
      } else {
        // If GitHub metadata isn't available, try cache
        console.warn("Failed to get vaults from GitHub metadata, trying cache");
        
        try {
          const cachedVaults = localStorage.getItem('vaultsMetadata');
          if (cachedVaults) {
            const parsed = JSON.parse(cachedVaults);
            console.log(`Using cached vault addresses (${parsed.length} vaults)`);
            return parsed;
          }
        } catch (cacheError) {
          console.warn("Cache retrieval error:", cacheError);
        }
        
        // If nothing else works, return empty array
        console.error("Could not get vault addresses from any source");
        return [];
      }
    } catch (error) {
      console.error(`Error getting reward vaults: ${error.message}`);
      
      // Try to get from cache if available
      try {
        const cachedVaults = localStorage.getItem('vaultsMetadata');
        if (cachedVaults) {
          const parsed = JSON.parse(cachedVaults);
          console.log(`Using cached vault addresses (${parsed.length} vaults)`);
          return parsed;
        }
      } catch (cacheError) {
        console.warn("Cache retrieval error:", cacheError);
      }
      
      // Return empty array if all else fails
      console.error("Could not get vault addresses from any source");
      return [];
    }
  }
  
  /**
   * Get token information from contract
   * @param {string} tokenAddress - Token contract address
   * @returns {Promise<Object>} Token information
   */
  async getTokenInfo(tokenAddress) {
    try {
      if (!this.provider) throw new Error("Provider not initialized");
      
      // Validate address
      if (!tokenAddress || typeof tokenAddress !== 'string' || !tokenAddress.startsWith('0x')) {
        console.warn(`Warning: Invalid token address: ${tokenAddress}`);
        return { symbol: "UNKNOWN", decimals: 18 };
      }
      
      // Normalize address - always convert to lowercase first to ensure consistent normalization
      try {
        // Always convert to lowercase first to ensure consistent normalization
        const addressString = tokenAddress.toString().toLowerCase();
        tokenAddress = ethers.utils.getAddress(addressString);
      } catch (err) {
        console.warn(`Warning: Could not normalize token address ${tokenAddress}:`, err.message);
        return { symbol: "UNKNOWN", decimals: 18 };
      }
      
      // Check in-memory cache first
      if (this.tokenInfoCache.has(tokenAddress)) {
        return this.tokenInfoCache.get(tokenAddress);
      }
      
      // Check local storage cache next
      const localStorageKey = `tokenInfo-${tokenAddress}`;
      try {
        const cachedInfo = localStorage.getItem(localStorageKey);
        if (cachedInfo) {
          const parsed = JSON.parse(cachedInfo);
          this.tokenInfoCache.set(tokenAddress, parsed);
          return parsed;
        }
      } catch (cacheError) {
        console.warn(`Token cache error for ${tokenAddress}:`, cacheError);
      }
      
      // Query token contract directly
      console.log(`Fetching token info for ${tokenAddress} from chain...`);
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          "function symbol() view returns (string)",
          "function decimals() view returns (uint8)"
        ],
        this.provider
      );
      
      // Get token data with fallbacks
      const [symbol, decimals] = await Promise.all([
        this.retryPromise(() => tokenContract.symbol().catch(() => "UNKNOWN")),
        this.retryPromise(() => tokenContract.decimals().catch(() => 18))
      ]);
      
      const info = { 
        symbol, 
        decimals: typeof decimals === 'number' ? decimals : parseInt(decimals.toString())
      };
      
      // Cache the result
      this.tokenInfoCache.set(tokenAddress, info);
      
      // Also store in localStorage for persistence
      try {
        localStorage.setItem(localStorageKey, JSON.stringify(info));
      } catch (storageError) {
        console.warn(`Could not cache token info for ${tokenAddress}:`, storageError);
      }
      
      return info;
    } catch (error) {
      console.warn(`Warning: Could not get token info for ${tokenAddress}:`, error.message);
      return { symbol: "UNKNOWN", decimals: 18 };
    }
  }
  
  /**
   * Makes an authenticated API call to the OogaBooga API
   * @param {string} endpoint - API endpoint path
   * @param {Object} params - Query parameters to include in the request
   * @returns {Promise<Object>} API response data
   * @throws {Error} If API key is missing or API call fails
   */
  async apiCallWithAuth(endpoint, params = {}) {
    if (!this.apiKey) {
      throw new Error("OogaBooga API key not set. Please set it in settings.");
    }
    
    const url = endpoint.startsWith('http') ? endpoint : `${tokenBridge.apiBaseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${this.apiKey.trim()}`,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        return await response.json();
      } else {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get a readable source name from the reward type
   * @param {string} rewardType - Reward type from API
   * @returns {string} Human-readable source name
   */
  getSourceName(rewardType) {
    const sourceMap = {
      'airdrops': 'Airdrop Allocation',
      'validators': 'Validator Rewards',
      'faucets': 'Faucet Claim',
      'liquidity': 'Liquidity Rewards',
      'staking': 'Staking Rewards'
    };
    
    return sourceMap[rewardType] || rewardType.charAt(0).toUpperCase() + rewardType.slice(1);
  }
  
  /**
   * Claim selected rewards for an address using the backend API
   * @param {string} address - Wallet address to claim for
   * @param {Array} selectedRewards - Array of selected reward objects
   * @returns {Promise<Object>} Claim result
   */
  async claimRewards(address, selectedRewards) {
    if (!this.isInitialized()) throw new Error("RewardsService not initialized");
    
    try {
      // Validate address
      if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
        throw new Error(`Invalid address provided for claiming rewards: ${address}`);
      }
      
      if (!this.provider) {
        throw new Error("Provider not available");
      }
      
      // Normalize address
      const normalizedAddress = ethers.utils.getAddress(address.toLowerCase());
      
      // Need a signer to send transactions
      const signer = this.provider.getSigner();
      if (!signer) {
        throw new Error("Signer not available. Make sure wallet is connected.");
      }
      
      console.log(`Claiming rewards for ${normalizedAddress}...`);
      
      // Use the API client to claim rewards
      const result = await apiClient.claimRewards(normalizedAddress, selectedRewards);
      
      // Handle API response
      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to claim rewards");
      }
      
      // Log results
      console.log(`Claim operations complete. ${result.claimedRewards?.length || 0}/${selectedRewards.length} claims successful.`);
      
      // Update local state to reflect claimed rewards
      if (result.remainingRewards) {
        this.checkedRewards = result.remainingRewards;
      } else if (result.claimedRewards) {
        // Remove claimed rewards from the checked rewards if not provided by the API
        const claimedIds = new Set(result.claimedRewards.map(r => r.id));
        this.checkedRewards = this.checkedRewards.filter(r => !claimedIds.has(r.id));
      }
      
      return result;
    } catch (error) {
      console.error("Error claiming rewards:", error);
      
      return {
        success: false,
        error: error.message || "Failed to claim rewards",
        claimedRewards: [],
        remainingRewards: this.checkedRewards
      };
    }
  }
  /**
   * Find validator info by public key
   * @param {string} pubkey - Validator's public key
   * @returns {Object} Validator information
   */
  findValidatorByPubkey(pubkey) {
    if (!pubkey) return { pubkey: "unknown", name: "Unknown Validator" };
    
    // Access the validator map
    if (this.validatorMap && Object.keys(this.validatorMap).length > 0) {
      // Try to find by lowercase key for case-insensitive matching
      const validator = this.validatorMap[pubkey.toLowerCase()];
      if (validator) {
        return validator;
      }
    }
    
    // If not found, create a generic validator object
    return {
      pubkey: pubkey,
      id: pubkey,
      name: `Validator ${pubkey.substring(0, 8)}`
    };
  }
  
  /**
   * Get validators list from the backend API
   * @returns {Promise<Array<Object>>} Array of validator objects
   */
  async getValidators() {
    try {
      // Use the API client to get validators
      const result = await apiClient.getValidators();
      
      // Handle API response
      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to get validators");
      }
      
      return result.validators || [];
    } catch (error) {
      console.error("Error getting validators:", error);
      return [];
    }
  }

  /**
   * Find validator by ID using the cached validator map
   * @param {string} validatorId - Validator ID to find
   * @returns {Promise<Object>} Validator information
   */
  async findValidator(validatorId) {
    if (!validatorId) return { id: "unknown", name: "Unknown Validator" };
    
    try {
      // Get validators if not already cached
      if (!this.validatorMap || Object.keys(this.validatorMap).length === 0) {
        const validators = await this.getValidators();
        this.validatorMap = this.buildValidatorMap(validators);
      }
      
      // Try to find by lowercase key for case-insensitive matching
      const validator = this.validatorMap[validatorId.toLowerCase()];
      if (validator) {
        return validator;
      }
      
      // If not found, create a generic validator object
      return {
        id: validatorId,
        name: `Validator ${validatorId.substring(0, 8)}`
      };
    } catch (error) {
      console.error("Error finding validator:", error);
      return { 
        id: validatorId,
        name: `Validator ${validatorId.substring(0, 8)}`
      };
    }
  }

  /**
   * Build validator map for efficient lookups
   * @param {Array<Object>} validators - Array of validator objects
   * @returns {Object} Map of validator IDs to validator objects
   */
  buildValidatorMap(validators) {
    const validatorMap = {};
    
    validators.forEach(validator => {
      if (validator.id) {
        // Store with id as key (case-insensitive)
        validatorMap[validator.id.toLowerCase()] = {
          id: validator.id,
          name: validator.name || `Validator ${validator.id.substring(0, 8)}`
        };
      }
    });
    
    console.log(`Built validator map with ${Object.keys(validatorMap).length} validators`);
    return validatorMap;
  }

  /**
   * Check validator boosts for a user using the backend API
   * @param {string} address - User wallet address
   * @returns {Promise<Object>} Validator boost information
   */
  async checkValidatorBoosts(address) {
    if (!this.isInitialized()) {
      console.warn("RewardsService not initialized when checking validator boosts");
      return { activeBoosts: [], queuedBoosts: [] };
    }
    
    try {
      console.log(`Checking validator boosts for ${address}...`);
      
      // Validate address
      if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
        console.warn(`Invalid address provided for checking validator boosts: ${address}`);
        return { activeBoosts: [], queuedBoosts: [] };
      }
      
      // Normalize the address
      const normalizedAddress = ethers.utils.getAddress(address.toLowerCase());
      
      // Use the API client to get validator boosts
      const result = await apiClient.getValidatorBoosts(normalizedAddress);
      
      // Handle API response
      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to check validator boosts");
      }
      
      // Log results
      console.log(`Found ${result.activeBoosts?.length || 0} active validator boosts`);
      console.log(`Found ${result.queuedBoosts?.length || 0} queued validator boosts`);
      
      return result;
    } catch (error) {
      console.error("Error checking validator boosts:", error);
      return { 
        activeBoosts: [], 
        queuedBoosts: [],
        error: error.message 
      };
    }
  }
}

// Export singleton instance
const rewardsService = new RewardsService();
export default rewardsService;