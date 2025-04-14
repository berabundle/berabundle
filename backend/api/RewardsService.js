/**
 * RewardsService.js - Service for checking and claiming rewards
 * 
 * This service handles checking and claiming rewards from BGT Staker and vaults.
 * Validator boost functionality is handled by ValidatorService.
 */

const { ethers } = require('ethers');
const apiCore = require('./core');
const tokenService = require('./TokenService');
const provider = require('../blockchain/provider');
const cache = require('../utils/cache');
const config = require('../config');
const { handleError } = require('../utils/errors');

// GitHub repositories and files
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const METADATA_REPO = 'berachain/metadata';
const METADATA_BRANCH = 'main';

class RewardsService {
  constructor() {
    this.checkedRewards = [];
    this.initialized = false;
    this.tokenInfoCache = new Map();
    this.vaultCache = new Map();
    
    // Contract addresses
    this.contractAddresses = {
      bgtStaker: '0x44f07ce5afecbcc406e6befd40cc2998eeb8c7c6',
      honeyToken: '0x7eeca4205ff31f947edbd49195a7a88e6a91161b',
      bgtToken: '0x656b95e550c07a9ffe548bd4085c72418ceb1dba',
      rewardVaultFactory: '0x94ad6ac84f6c6fba8b8ccbd71d9f4f101def52a8'
    };
  }
  
  /**
   * Initialize the rewards service
   * @param {Object} options - Initialization options
   * @param {string} [options.apiKey] - OogaBooga API key
   * @returns {boolean} Whether initialization was successful
   */
  initialize(options = {}) {
    try {
      if (options.apiKey) {
        apiCore.configure({ apiKey: options.apiKey });
      }
      
      // Initialize tokenService if not already initialized
      if (!tokenService.isInitialized() && options.apiKey) {
        tokenService.initialize({ apiKey: options.apiKey });
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      return handleError(error, 'RewardsService.initialize', false);
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
   * Helper function to retry a failed promise with exponential backoff
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
        const jitter = 0.5 + Math.random();
        const delay = baseDelay * Math.pow(2, i) * jitter;
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
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
      return handleError(error, 'RewardsService.fetchFromGitHub');
    }
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
      
      // Check if cached in backend
      const cacheKey = `token_info_${tokenAddress.toLowerCase()}`;
      const cachedInfo = await cache.get(cacheKey);
      if (cachedInfo) {
        this.tokenInfoCache.set(tokenAddress, cachedInfo);
        return cachedInfo;
      }
      
      // Query on-chain
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          "function symbol() view returns (string)",
          "function decimals() view returns (uint8)"
        ],
        provider.getProvider()
      );
      
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
      await cache.set(cacheKey, info, { cacheType: 'tokens', persist: true });
      
      return info;
    } catch (error) {
      return handleError(error, 'RewardsService.getTokenInfo', { 
        symbol: "UNKNOWN", 
        decimals: 18 
      });
    }
  }
  
  /**
   * Fetch vaults from GitHub
   * @param {boolean} [useCache=true] - Whether to use cached data if available
   * @returns {Promise<Array<string>>} Array of vault addresses
   */
  async getRewardVaults(useCache = true) {
    try {
      // Check cache first
      if (useCache) {
        const cachedVaults = await cache.get('vaults_list', true);
        if (cachedVaults) {
          console.log(`Using cached vault addresses (${cachedVaults.length} vaults)`);
          return cachedVaults;
        }
      }
      
      // Fetch from GitHub
      console.log("Fetching vaults from GitHub metadata...");
      const vaultsData = await this.fetchFromGitHub('src/vaults/mainnet.json');
      
      if (vaultsData && vaultsData.vaults && Array.isArray(vaultsData.vaults)) {
        const vaults = vaultsData.vaults;
        console.log(`Loaded ${vaults.length} vaults from GitHub metadata`);
        
        // Extract and normalize addresses
        const vaultAddresses = [];
        this.vaultCache = new Map();
        
        for (const vault of vaults) {
          try {
            // Should be vaultAddress based on the GitHub structure
            let vaultAddress = vault.vaultAddress || vault.address;
            
            if (!vaultAddress || typeof vaultAddress !== 'string' || !vaultAddress.startsWith('0x')) {
              console.warn(`Skipping vault with invalid address: ${JSON.stringify(vault)}`);
              continue;
            }
            
            // Normalize address
            const normalizedAddress = ethers.utils.getAddress(vaultAddress.toString().toLowerCase());
            vaultAddresses.push(normalizedAddress);
            
            // Extract protocols for mapping
            let protocolInfo = {};
            if (vaultsData.protocols && Array.isArray(vaultsData.protocols) && vault.protocol) {
              const protocol = vaultsData.protocols.find(p => p.name === vault.protocol);
              if (protocol) {
                protocolInfo = {
                  protocolLogo: protocol.logoURI,
                  protocolUrl: protocol.url,
                  protocolDescription: protocol.description
                };
              }
            }
            
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
              ...protocolInfo
            });
          } catch (err) {
            console.warn(`Error processing vault address: ${err.message}`, err);
          }
        }
        
        // Cache the valid addresses
        await cache.set('vaults_list', vaultAddresses, { cacheType: 'vaults', persist: true });
        
        console.log(`Processed ${vaultAddresses.length} valid vault addresses with metadata`);
        return vaultAddresses;
      } else {
        console.warn("Invalid vaults data format from GitHub");
        return [];
      }
    } catch (error) {
      return handleError(error, 'RewardsService.getRewardVaults', []);
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
      if (!provider.isInitialized()) {
        throw new Error("Provider not initialized");
      }
      
      // Get the vault address and validate
      let vaultAddress = vault.address || vault.vaultAddress;
      
      // Validate addresses
      if (!vaultAddress || typeof vaultAddress !== 'string' || !vaultAddress.startsWith('0x')) {
        console.warn(`Invalid vault address: ${vaultAddress}`);
        return null;
      }
      
      if (!userAddress || typeof userAddress !== 'string' || !userAddress.startsWith('0x')) {
        console.warn(`Invalid user address: ${userAddress}`);
        return null;
      }
      
      // Normalize addresses
      vaultAddress = ethers.utils.getAddress(vaultAddress.toString().toLowerCase());
      userAddress = ethers.utils.getAddress(userAddress.toString().toLowerCase());
      
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
        provider.getProvider()
      );
      
      // First check if user has any stake - this is the fastest check
      let userBalance;
      try {
        userBalance = await vaultContract.balanceOf(userAddress);
        if (userBalance.eq(0)) {
          return null;
        }
      } catch (err) {
        console.warn(`Could not check balance for vault ${vaultAddress}:`, err.message);
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
        
        // Normalize token addresses
        const normalizedStakeTokenAddress = ethers.utils.getAddress(stakeTokenAddress.toString().toLowerCase());
        const normalizedRewardTokenAddress = ethers.utils.getAddress(rewardTokenAddress.toString().toLowerCase());
        
        // Get token info in parallel with normalized addresses
        const [stakeTokenInfo, rewardTokenInfo] = await Promise.all([
          this.getTokenInfo(normalizedStakeTokenAddress),
          this.getTokenInfo(normalizedRewardTokenAddress)
        ]);
        
        // Format values
        const userStakeFloat = parseFloat(ethers.utils.formatUnits(userBalance, stakeTokenInfo.decimals));
        const totalStakeFloat = parseFloat(ethers.utils.formatUnits(totalSupply, stakeTokenInfo.decimals));
        const earnedFloat = parseFloat(ethers.utils.formatUnits(earned, rewardTokenInfo.decimals));
        
        // Round to 2 decimal places for display
        const userStake = userStakeFloat.toFixed(2);
        const totalStake = totalStakeFloat.toFixed(2);
        const earnedFormatted = earnedFloat.toFixed(2);
        
        // Calculate percentage share
        const share = totalStakeFloat > 0 
          ? ((userStakeFloat / totalStakeFloat) * 100).toFixed(2)
          : "0.00";
        
        // Get price for reward token
        let priceUsd = null;
        try {
          priceUsd = await tokenService.getTokenPrice(normalizedRewardTokenAddress);
        } catch (err) {
          console.warn(`Could not get price for ${rewardTokenInfo.symbol}:`, err);
        }
        
        // Calculate value in USD
        const valueUsd = priceUsd ? earnedFloat * priceUsd : 0;
        
        // Get vault metadata from cache
        const vaultCacheData = this.vaultCache.get(vaultAddress) || {};
        const vaultName = vaultCacheData.name || vault.name || `Vault ${vaultAddress.substring(2, 10)}`;
        const protocolName = vaultCacheData.protocol || vault.protocol || "";
        
        return {
          id: `vault-${vaultAddress.substring(2, 10)}`,
          type: 'vault',
          name: vaultName,
          protocol: protocolName,
          description: vaultCacheData.description || vault.description || "",
          symbol: rewardTokenInfo.symbol,
          source: protocolName ? `${protocolName} Vault` : "Vault Staking",
          amount: earnedFormatted,
          earned: earnedFormatted,
          formattedAmount: earnedFormatted,
          valueUsd: parseFloat(valueUsd.toFixed(2)),
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
          address: vaultAddress,
          userStake,
          totalStake,
          share,
          rawEarned: earned.toString(),
          rewardRate: parseFloat(ethers.utils.formatUnits(rewardRate, rewardTokenInfo.decimals)).toFixed(2),
          rewardForDuration: parseFloat(ethers.utils.formatUnits(rewardForDuration, rewardTokenInfo.decimals)).toFixed(2),
          url: vaultCacheData.url || vault.url || ""
        };
      } catch (error) {
        console.warn(`Could not get data for vault ${vaultAddress}:`, error.message);
        return null;
      }
    } catch (error) {
      return handleError(error, 'RewardsService.checkVault', null);
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
        console.warn(`Invalid address provided to checkVaultRewards: ${address}`);
        return [];
      }
      
      // Normalize address
      const normalizedAddress = ethers.utils.getAddress(address.toLowerCase());
      
      // Get vault addresses
      console.log("Finding vaults with active stakes...");
      const vaultAddresses = await this.getRewardVaults();
      
      if (!vaultAddresses || vaultAddresses.length === 0) {
        console.log("No vaults found");
        return [];
      }
      
      console.log(`Found ${vaultAddresses.length} total vaults to check...`);
      
      // Process vaults in batches
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
        const batchPromises = batch.map(vaultAddress => 
          this.checkVault({ address: vaultAddress }, normalizedAddress)
        );
        
        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter(Boolean);
        
        // Add to total stakes
        vaultsWithStakes.push(...validResults);
        
        // Add a small delay between batches to avoid rate limits
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`Vault checking complete. Found ${vaultsWithStakes.length} vaults with active stakes.`);
      return vaultsWithStakes;
    } catch (error) {
      return handleError(error, 'RewardsService.checkVaultRewards', []);
    }
  }
  
  /**
   * Check BGT Staker for rewards
   * @param {string} address - User wallet address
   * @returns {Promise<Object|null>} BGT Staker reward information
   */
  async checkBGTStakerRewards(address) {
    try {
      if (!provider.isInitialized()) {
        throw new Error("Provider not initialized");
      }
      
      console.log("Starting BGT Staker rewards check...");
      
      // Validate address
      if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
        console.warn(`Invalid address provided to checkBGTStakerRewards: ${address}`);
        return null;
      }
      
      // Normalize address
      const normalizedAddress = ethers.utils.getAddress(address.toLowerCase());
      
      // Get contract addresses
      const bgtStakerAddress = ethers.utils.getAddress(this.contractAddresses.bgtStaker.toLowerCase());
      const honeyTokenAddress = ethers.utils.getAddress(this.contractAddresses.honeyToken.toLowerCase());
      
      // Create contract instance
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
        provider.getProvider()
      );
      
      // First check if user has any stake
      let userBalance;
      try {
        userBalance = await this.retryPromise(() => bgtStaker.balanceOf(normalizedAddress));
      } catch (err) {
        console.error(`ERROR checking BGT Staker balance:`, err);
        userBalance = ethers.BigNumber.from(0);
      }
      
      // Check earned rewards
      let earned;
      try {
        earned = await this.retryPromise(() => bgtStaker.earned(normalizedAddress), 5);
        
        if (earned.isZero() && userBalance.isZero()) {
          console.log("User has no earned rewards and no stake");
          return null;
        }
      } catch (err) {
        console.error(`ERROR checking BGT Staker earned rewards:`, err);
        return null;
      }
      
      // HONEY token info
      const honeyTokenInfo = {
        symbol: "HONEY",
        decimals: 18
      };
      
      // Get price for HONEY
      let priceUsd = null;
      try {
        priceUsd = await tokenService.getTokenPrice(honeyTokenAddress);
      } catch (err) {
        console.warn("Could not get price for HONEY:", err);
      }
      
      // Format earned amount
      const earnedFloat = parseFloat(ethers.utils.formatUnits(earned, honeyTokenInfo.decimals));
      const balanceFloat = parseFloat(ethers.utils.formatUnits(userBalance, honeyTokenInfo.decimals));
      
      // Round to 2 decimal places
      const formattedEarned = earnedFloat.toFixed(2);
      const formattedBalance = balanceFloat.toFixed(2);
      const valueUsd = priceUsd ? earnedFloat * priceUsd : 0;
      
      return {
        id: `bgtStaker-${bgtStakerAddress.substring(2, 10)}`,
        type: 'bgtStaker',
        name: 'BGT Staker Honey Fees',
        symbol: honeyTokenInfo.symbol,
        source: 'BGT Staker',
        amount: formattedEarned,
        earned: formattedEarned,
        formattedAmount: formattedEarned,
        valueUsd: parseFloat(valueUsd.toFixed(2)),
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
        rawEarned: earned.toString(),
        userBalance: formattedBalance
      };
    } catch (error) {
      return handleError(error, 'RewardsService.checkBGTStakerRewards', null);
    }
  }
  
  /**
   * Check all rewards for a user
   * @param {string} address - Wallet address to check
   * @returns {Promise<Object>} Rewards information
   */
  async checkRewards(address) {
    if (!this.isInitialized()) {
      throw new Error("RewardsService not initialized");
    }
    
    try {
      // Validate address
      if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
        throw new Error(`Invalid address provided: ${address}`);
      }
      
      // Normalize user address
      const normalizedAddress = ethers.utils.getAddress(address.toLowerCase());
      console.log(`Checking all rewards for ${normalizedAddress}...`);
      
      // Get all vaults with active stakes
      console.log("Finding vaults with active stakes...");
      const vaultRewards = await this.checkVaultRewards(normalizedAddress);
      console.log(`Found ${vaultRewards.length} vaults with active stakes`);
      
      // Track all rewards
      const allRewards = [...vaultRewards];
      
      // Check BGT Staker rewards
      console.log(`Checking BGT Staker rewards for ${normalizedAddress}...`);
      const bgtStakerRewards = await this.checkBGTStakerRewards(normalizedAddress);
      
      if (bgtStakerRewards) {
        allRewards.push(bgtStakerRewards);
        console.log(`Found BGT Staker rewards: ${bgtStakerRewards.earned}`);
      } else {
        console.log("No BGT Staker rewards found.");
      }
      
      // Calculate summary information
      const rewardsByToken = {};
      let totalValue = 0;
      
      for (const reward of allRewards) {
        // Add to token-specific total
        const tokenSymbol = reward.rewardToken.symbol;
        
        if (!rewardsByToken[tokenSymbol]) {
          rewardsByToken[tokenSymbol] = {
            amount: 0,
            formatted: "0",
            token: reward.rewardToken
          };
        }
        
        // Add to token amount
        const amount = parseFloat(reward.earned) || 0;
        rewardsByToken[tokenSymbol].amount += amount;
        rewardsByToken[tokenSymbol].formatted = rewardsByToken[tokenSymbol].amount.toFixed(2);
        
        // Add to total value
        totalValue += (reward.valueUsd || 0);
      }
      
      // Make sure total value is rounded to 2 decimal places
      totalValue = parseFloat(totalValue.toFixed(2));
      
      // Save rewards for later (for claiming)
      this.checkedRewards = allRewards;
      
      return {
        success: true,
        rewards: allRewards,
        totalValue: totalValue,
        rewardsByToken: rewardsByToken
      };
    } catch (error) {
      return handleError(error, 'RewardsService.checkRewards', {
        success: false,
        error: error.message || "Failed to check rewards",
        rewards: []
      });
    }
  }
  
  /**
   * Claim rewards for an address
   * @param {string} address - Wallet address to claim for
   * @param {Array} selectedRewards - Array of selected reward objects
   * @returns {Promise<Object>} Claim result
   */
  async claimRewards(address, selectedRewards) {
    if (!this.isInitialized()) {
      throw new Error("RewardsService not initialized");
    }
    
    try {
      // Validate address
      if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
        throw new Error(`Invalid address provided for claiming rewards: ${address}`);
      }
      
      if (!provider.isInitialized()) {
        throw new Error("Provider not available");
      }
      
      if (!provider.getSigner()) {
        throw new Error("Signer not available. Make sure wallet is connected.");
      }
      
      // Normalize address
      const normalizedAddress = ethers.utils.getAddress(address.toLowerCase());
      
      console.log(`Claiming rewards for ${normalizedAddress}...`);
      
      // Group rewards by type
      const vaultRewards = selectedRewards.filter(r => r.type === 'vault');
      const bgtStakerRewards = selectedRewards.find(r => r.type === 'bgtStaker');
      
      // Track claim results
      const claimResults = [];
      const claimedRewards = [];
      
      // 1. Claim vault rewards
      if (vaultRewards.length > 0) {
        console.log(`Claiming rewards from ${vaultRewards.length} vaults...`);
        
        // Process each vault
        for (const reward of vaultRewards) {
          try {
            console.log(`Claiming from vault ${reward.name} (${reward.vaultAddress})...`);
            
            // Validate and normalize vault address
            if (!reward.vaultAddress || typeof reward.vaultAddress !== 'string' || !reward.vaultAddress.startsWith('0x')) {
              console.error(`Invalid vault address: ${reward.vaultAddress}`);
              throw new Error(`Invalid vault address format for ${reward.name}`);
            }
            
            // Normalize vault address
            const normalizedVaultAddress = ethers.utils.getAddress(reward.vaultAddress.toString().toLowerCase());
            
            // Create contract instance with signer
            const vaultContract = new ethers.Contract(
              normalizedVaultAddress,
              ["function getReward() external"],
              provider.getSigner()
            );
            
            // Execute claim
            const tx = await vaultContract.getReward();
            console.log(`Transaction sent: ${tx.hash}`);
            
            // Wait for confirmation
            const receipt = await tx.wait();
            
            if (receipt.status === 1) {
              console.log(`Successfully claimed ${reward.earned} ${reward.rewardToken.symbol} from ${reward.name}`);
              claimedRewards.push(reward);
              claimResults.push({
                type: 'vault',
                name: reward.name,
                success: true,
                amount: reward.earned,
                symbol: reward.rewardToken.symbol,
                txHash: tx.hash
              });
            } else {
              console.error(`Claim transaction failed for ${reward.name}`);
              claimResults.push({
                type: 'vault',
                name: reward.name,
                success: false,
                error: "Transaction failed"
              });
            }
          } catch (error) {
            console.error(`Error claiming from vault ${reward.name}:`, error);
            claimResults.push({
              type: 'vault',
              name: reward.name,
              success: false,
              error: error.message || "Claim failed"
            });
          }
        }
      }
      
      // 2. Claim BGT Staker rewards
      if (bgtStakerRewards) {
        try {
          console.log(`Claiming BGT Staker rewards...`);
          
          // Normalize address
          const normalizedBgtStakerAddress = ethers.utils.getAddress(bgtStakerRewards.contractAddress.toLowerCase());
          
          // Create contract instance with signer
          const bgtStaker = new ethers.Contract(
            normalizedBgtStakerAddress,
            ["function getReward() external"],
            provider.getSigner()
          );
          
          // Execute claim
          const tx = await bgtStaker.getReward();
          console.log(`Transaction sent: ${tx.hash}`);
          
          // Wait for confirmation
          const receipt = await tx.wait();
          
          if (receipt.status === 1) {
            console.log(`Successfully claimed ${bgtStakerRewards.earned} ${bgtStakerRewards.rewardToken.symbol} from BGT Staker`);
            claimedRewards.push(bgtStakerRewards);
            claimResults.push({
              type: 'bgtStaker',
              name: bgtStakerRewards.name,
              success: true,
              amount: bgtStakerRewards.earned,
              symbol: bgtStakerRewards.rewardToken.symbol,
              txHash: tx.hash
            });
          } else {
            console.error("BGT Staker claim transaction failed");
            claimResults.push({
              type: 'bgtStaker',
              name: bgtStakerRewards.name,
              success: false,
              error: "Transaction failed"
            });
          }
        } catch (error) {
          console.error("Error claiming BGT Staker rewards:", error);
          claimResults.push({
            type: 'bgtStaker',
            name: bgtStakerRewards.name,
            success: false,
            error: error.message || "Claim failed"
          });
        }
      }
      
      // Calculate total claimed value
      const totalClaimed = claimedRewards.reduce((sum, reward) => sum + (reward.valueUsd || 0), 0);
      
      // Remove claimed rewards from the checked rewards
      const claimedIds = new Set(claimedRewards.map(r => r.id));
      this.checkedRewards = this.checkedRewards.filter(r => !claimedIds.has(r.id));
      
      return {
        success: claimedRewards.length > 0,
        claimedRewards: claimedRewards,
        claimResults: claimResults,
        totalClaimed,
        remainingRewards: this.checkedRewards
      };
    } catch (error) {
      return handleError(error, 'RewardsService.claimRewards', {
        success: false,
        error: error.message || "Failed to claim rewards",
        claimedRewards: [],
        remainingRewards: this.checkedRewards
      });
    }
  }
}

// Export singleton instance
const rewardsService = new RewardsService();
module.exports = rewardsService;