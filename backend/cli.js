#!/usr/bin/env node

/**
 * BeraBundle CLI
 * 
 * A simple command-line interface for testing the BeraBundle backend services.
 * Usage: node backend/cli.js <command> [options]
 */

const backend = require('./index');
const env = require('./config/env');
const { ethers } = require('ethers');

// Parse command-line arguments
const args = process.argv.slice(2);
const command = args[0] || 'help';

// Helper to format numbers
function formatNumber(num) {
  return parseFloat(parseFloat(num).toFixed(4));
}

// Initialize backend with config
async function initBackend() {
  console.log('Initializing backend...');
  
  // Create provider from private key if available
  let signer;
  const privateKey = env.getConfig('private_key');
  
  if (privateKey) {
    try {
      // Use Berachain provider
      const provider = new ethers.providers.JsonRpcProvider('https://rpc.berachain.com');
      signer = new ethers.Wallet(privateKey, provider);
      console.log(`Using wallet: ${signer.address}`);
    } catch (error) {
      console.error('Error creating signer from private key:', error.message);
    }
  }
  
  // API key is loaded automatically by the backend through env config
  return backend.initialize({ signer });
}

// Command handlers
const commands = {
  // Configuration commands
  config: async () => {
    console.log('Current Configuration:');
    
    // Show API key if exists (masked)
    const apiKey = env.getConfig('api_key');
    if (apiKey) {
      const maskedKey = apiKey.substring(0, 4) + 
        '*'.repeat(apiKey.length - 8) + 
        apiKey.substring(apiKey.length - 4);
      console.log(`API Key: ${maskedKey}`);
    } else {
      console.log('API Key: Not set');
    }
    
    // Show wallet if exists (masked private key)
    const privateKey = env.getConfig('private_key');
    if (privateKey) {
      try {
        const wallet = new ethers.Wallet(privateKey);
        console.log(`Wallet Address: ${wallet.address}`);
        console.log(`Private Key: ${privateKey.substring(0, 6)}...${privateKey.substring(privateKey.length - 4)}`);
      } catch (error) {
        console.log('Wallet: Invalid private key');
      }
    } else {
      console.log('Wallet: Not set');
    }
    
    // Show environment
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Config source: ${env.isServerEnvironment() ? 'Environment variables' : 'Local config file'}`);
  },
  
  'set-api-key': async () => {
    if (args.length < 2) {
      console.error('Usage: node backend/cli.js set-api-key <api-key>');
      return;
    }
    
    const apiKey = args[1];
    const localConfig = env.loadLocalConfig();
    localConfig.api_key = apiKey;
    
    if (env.saveLocalConfig(localConfig)) {
      console.log('API key saved successfully to local config');
      console.log('Note: In production, use BERABUNDLE_API_KEY environment variable instead');
    }
  },
  
  'set-wallet': async () => {
    if (args.length < 2) {
      console.error('Usage: node backend/cli.js set-wallet <private-key>');
      return;
    }
    
    const privateKey = args[1];
    
    try {
      // Validate private key
      const wallet = new ethers.Wallet(privateKey);
      console.log(`Wallet address: ${wallet.address}`);
      
      const localConfig = env.loadLocalConfig();
      localConfig.private_key = privateKey;
      
      if (env.saveLocalConfig(localConfig)) {
        console.log('Wallet private key saved successfully to local config');
        console.log('Note: In production, use BERABUNDLE_PRIVATE_KEY environment variable instead');
      }
    } catch (error) {
      console.error('Invalid private key:', error.message);
    }
  },
  
  // Token-related commands
  tokens: async () => {
    await initBackend();
    
    try {
      console.log('Fetching token list from OogaBooga...');
      const result = await backend.services.token.fetchOogaBoogaTokens();
      
      if (!result.success) {
        console.error('Error fetching tokens:', result.error);
        return;
      }
      
      const tokens = Object.values(result.tokens.data);
      console.log(`Found ${tokens.length} tokens:`);
      tokens.slice(0, 20).forEach(token => {
        console.log(`- ${token.symbol}: ${token.name} (${token.address})`);
      });
      
      if (tokens.length > 20) {
        console.log(`... and ${tokens.length - 20} more`);
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  },
  
  'token-price': async () => {
    if (args.length < 2) {
      console.error('Usage: node backend/cli.js token-price <token-address>');
      return;
    }
    
    await initBackend();
    
    try {
      const tokenAddress = args[1];
      console.log(`Fetching price for token ${tokenAddress}...`);
      
      const price = await backend.services.token.getTokenPrice(tokenAddress);
      console.log(`Price: $${price}`);
    } catch (error) {
      console.error('Error:', error.message);
    }
  },
  
  'token-balance': async () => {
    if (args.length < 3) {
      console.error('Usage: node backend/cli.js token-balance <wallet-address> <token-address>');
      return;
    }
    
    await initBackend();
    
    try {
      const walletAddress = args[1];
      const tokenAddress = args[2];
      
      // Special handling for native token
      if (tokenAddress === 'native' || tokenAddress === 'BERA') {
        console.log(`Fetching native BERA balance for wallet ${walletAddress}...`);
        const balanceInfo = await backend.services.token.getNativeBalance(walletAddress);
        
        if (balanceInfo) {
          console.log(`BERA Balance: ${balanceInfo.balance} (${balanceInfo.formattedValueUsd})`);
        } else {
          console.log("Could not fetch native balance");
        }
        return;
      }
      
      console.log(`Fetching balance for token ${tokenAddress} in wallet ${walletAddress}...`);
      
      // For regular tokens, need to get token data first
      const result = await backend.services.token.fetchOogaBoogaTokens();
      if (result.success) {
        // Find token in the results
        const tokens = result.tokens.data;
        let token = null;
        
        // Check if user provided address or symbol
        if (tokenAddress.startsWith('0x')) {
          // Find by address (case-insensitive)
          const normalizedAddr = tokenAddress.toLowerCase();
          token = tokens[normalizedAddr] || Object.values(tokens).find(t => 
            t.address.toLowerCase() === normalizedAddr
          );
        } else {
          // Find by symbol (case-insensitive)
          token = Object.values(tokens).find(t => 
            t.symbol.toLowerCase() === tokenAddress.toLowerCase()
          );
        }
        
        if (token) {
          const balanceInfo = await backend.services.token.getTokenBalance(walletAddress, token);
          
          if (balanceInfo) {
            console.log(`${token.symbol} Balance: ${balanceInfo.balance} (${balanceInfo.formattedValueUsd})`);
          } else {
            console.log(`No ${token.symbol} balance found for this wallet`);
          }
        } else {
          console.error(`Token not found: ${tokenAddress}`);
        }
      } else {
        console.error('Error fetching token list:', result.error);
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  },
  
  // Rewards-related commands
  rewards: async () => {
    if (args.length < 2) {
      console.error('Usage: node backend/cli.js rewards <wallet-address>');
      return;
    }
    
    await initBackend();
    
    try {
      const walletAddress = args[1];
      console.log(`Checking rewards for wallet ${walletAddress}...`);
      
      const result = await backend.services.rewards.checkRewards(walletAddress);
      
      if (!result.success) {
        console.error('Error checking rewards:', result.error);
        return;
      }
      
      console.log(`Found ${result.rewards.length} rewards:`);
      console.log(`Total value: $${result.totalValue}`);
      
      // Show rewards by token
      console.log('\nRewards by token:');
      Object.entries(result.rewardsByToken).forEach(([symbol, data]) => {
        console.log(`- ${symbol}: ${data.formatted}`);
      });
      
      // Show individual rewards
      console.log('\nIndividual rewards:');
      result.rewards.forEach(reward => {
        console.log(`- ${reward.name}: ${reward.earned} ${reward.symbol} ($${reward.valueUsd})`);
      });
    } catch (error) {
      console.error('Error:', error.message);
    }
  },
  
  'check-vaults': async () => {
    if (args.length < 2) {
      console.error('Usage: node backend/cli.js check-vaults <wallet-address>');
      return;
    }
    
    await initBackend();
    
    try {
      const walletAddress = args[1];
      console.log(`Checking vault rewards for wallet ${walletAddress}...`);
      
      const vaultRewards = await backend.services.rewards.checkVaultRewards(walletAddress);
      
      console.log(`Found ${vaultRewards.length} vaults with rewards:`);
      vaultRewards.forEach(vault => {
        console.log(`- ${vault.name}: ${vault.earned} ${vault.symbol} ($${vault.valueUsd})`);
      });
    } catch (error) {
      console.error('Error:', error.message);
    }
  },
  
  // Validator-related commands
  validators: async () => {
    await initBackend();
    
    try {
      console.log('Fetching validators...');
      const result = await backend.services.validator.getValidators();
      
      if (!result.success) {
        console.error('Error fetching validators:', result.error);
        return;
      }
      
      console.log(`Found ${result.validators.length} validators:`);
      result.validators.slice(0, 15).forEach(validator => {
        console.log(`- ${validator.name} (${validator.id.substring(0, 10)}...)`);
      });
      
      if (result.validators.length > 15) {
        console.log(`... and ${result.validators.length - 15} more`);
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  },
  
  'validator-boosts': async () => {
    if (args.length < 2) {
      console.error('Usage: node backend/cli.js validator-boosts <wallet-address>');
      return;
    }
    
    await initBackend();
    
    try {
      const walletAddress = args[1];
      console.log(`Checking validator boosts for wallet ${walletAddress}...`);
      
      const result = await backend.services.validator.getValidatorBoosts(walletAddress);
      
      if (!result.success) {
        console.error('Error checking validator boosts:', result.error);
        return;
      }
      
      console.log(`Active boosts: ${result.activeBoosts.length}`);
      result.activeBoosts.forEach(boost => {
        console.log(`- ${boost.name}: ${boost.userBoostAmount} BGT (${boost.share}% of total)`);
      });
      
      console.log(`\nQueued boosts: ${result.queuedBoosts.length}`);
      result.queuedBoosts.forEach(boost => {
        console.log(`- ${boost.name}: ${boost.queuedBoostAmount} BGT`);
      });
      
      console.log(`\nTotal active boost: ${result.totalActiveBoost} BGT`);
      console.log(`Total queued boost: ${result.totalQueuedBoost} BGT`);
    } catch (error) {
      console.error('Error:', error.message);
    }
  },
  
  // Token approval commands
  'check-approval': async () => {
    if (args.length < 3) {
      console.error('Usage: node backend/cli.js check-approval <wallet-address> <token-address-or-symbol> [amount]');
      return;
    }
    
    await initBackend();
    
    try {
      const walletAddress = args[1];
      const tokenAddress = args[2];
      const amount = args[3] || '1'; // Default to 1 token if not specified
      
      console.log(`Checking approval for token ${tokenAddress} by wallet ${walletAddress}...`);
      
      const approvalResult = await backend.services.approval.checkApproval(
        tokenAddress,
        walletAddress,
        amount
      );
      
      if (approvalResult.isApproved) {
        console.log(`✅ Token is approved for spending by the bundler contract`);
        if (approvalResult.token) {
          console.log(`Token: ${approvalResult.token.symbol} (${approvalResult.token.address})`);
        }
        console.log(`Current allowance: ${approvalResult.formattedAllowance}`);
        console.log(`Required amount: ${approvalResult.formattedRequiredAmount}`);
      } else if (approvalResult.error) {
        console.error(`Failed to check approval: ${approvalResult.error}`);
      } else {
        console.log(`❌ Token is NOT approved for spending by the bundler contract`);
        if (approvalResult.token) {
          console.log(`Token: ${approvalResult.token.symbol} (${approvalResult.token.address})`);
        }
        console.log(`Current allowance: ${approvalResult.formattedAllowance}`);
        console.log(`Required amount: ${approvalResult.formattedRequiredAmount}`);
        console.log('\nTo approve, use the approve-token command:');
        console.log(`node backend/cli.js approve-token ${tokenAddress}`);
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  },
  
  'approve-token': async () => {
    if (args.length < 2) {
      console.error('Usage: node backend/cli.js approve-token <token-address-or-symbol> [amount]');
      return;
    }
    
    await initBackend();
    
    try {
      const tokenAddress = args[1];
      const amount = args[2] || 'max'; // Default to max approval
      
      // Verify we have a signer
      const privateKey = env.getConfig('private_key');
      if (!privateKey) {
        console.error('No wallet private key configured. Use set-wallet command first.');
        return;
      }
      
      console.log(`Approving token ${tokenAddress} for the bundler contract...`);
      
      // Use max approval or specific amount
      let approvalResult;
      if (amount === 'max') {
        console.log('Using maximum approval amount (unlimited)');
        approvalResult = await backend.services.approval.approveToken(tokenAddress);
      } else {
        console.log(`Using approval amount: ${amount} tokens`);
        approvalResult = await backend.services.approval.approveToken(tokenAddress, amount);
      }
      
      if (approvalResult.success) {
        console.log(`✅ Token approved successfully!`);
        if (approvalResult.token) {
          console.log(`Token: ${approvalResult.token.symbol} (${approvalResult.token.address})`);
        }
        console.log(`Transaction hash: ${approvalResult.hash}`);
      } else {
        console.error(`❌ Approval failed: ${approvalResult.error}`);
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  },
  
  'revoke-approval': async () => {
    if (args.length < 2) {
      console.error('Usage: node backend/cli.js revoke-approval <token-address-or-symbol>');
      return;
    }
    
    await initBackend();
    
    try {
      const tokenAddress = args[1];
      
      // Verify we have a signer
      const privateKey = env.getConfig('private_key');
      if (!privateKey) {
        console.error('No wallet private key configured. Use set-wallet command first.');
        return;
      }
      
      console.log(`Revoking approval for token ${tokenAddress}...`);
      
      const revokeResult = await backend.services.approval.revokeToken(tokenAddress);
      
      if (revokeResult.success) {
        console.log(`✅ Token approval revoked successfully!`);
        if (revokeResult.token) {
          console.log(`Token: ${revokeResult.token.symbol} (${revokeResult.token.address})`);
        }
        console.log(`Transaction hash: ${revokeResult.hash}`);
      } else {
        console.error(`❌ Revocation failed: ${revokeResult.error}`);
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  },

  // Help command
  help: async () => {
    console.log('BeraBundle CLI');
    console.log('=============');
    console.log('A command-line interface for testing the BeraBundle backend services.');
    console.log('\nUsage: node backend/cli.js <command> [options]');
    console.log('\nAvailable commands:');
    console.log('  help                          Show this help message');
    console.log('  config                        Show current configuration');
    console.log('  set-api-key <api-key>         Set OogaBooga API key');
    console.log('  set-wallet <private-key>      Set wallet private key');
    console.log('\n  tokens                        List available tokens');
    console.log('  token-price <token-address>   Get token price');
    console.log('  token-balance <wallet> <token> Check token balance');
    console.log('\n  check-approval <wallet> <token> [amount] Check token approval');
    console.log('  approve-token <token> [amount] Approve token for bundler');
    console.log('  revoke-approval <token>       Revoke token approval');
    console.log('\n  rewards <wallet-address>      Check all rewards');
    console.log('  check-vaults <wallet-address> Check vault rewards');
    console.log('\n  validators                    List validators');
    console.log('  validator-boosts <wallet>     Check validator boosts');
  }
};

// Execute command
async function run() {
  if (commands[command]) {
    await commands[command]();
  } else {
    console.error(`Unknown command: ${command}`);
    await commands.help();
  }
}

// Run
run().catch(error => {
  console.error('Error:', error);
});