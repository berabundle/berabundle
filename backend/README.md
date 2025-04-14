# BeraBundle Backend

This directory contains the standalone backend services for BeraBundle, designed to be used by multiple frontends (React UI, CLI, Safe App).

## Directory Structure

```
/backend
├── api/              # API services
│   ├── core.js       # Core API module with authentication
│   ├── TokenService.js
│   ├── SwapService.js
│   ├── RewardsService.js
│   └── ValidatorService.js
├── blockchain/       # Blockchain interaction
│   ├── provider.js   # Web3 provider management
│   └── contracts.js  # Smart contract interfaces
├── config/           # Configuration
│   └── index.js      # Enhanced config with backend settings
├── utils/            # Utilities
│   ├── cache.js      # Caching utilities
│   └── errors.js     # Error handling
├── api.js            # Public API interface for frontend
├── cli.js            # Command-line interface for testing
└── index.js          # Backend service factory
```

## Architecture

The backend follows a service-oriented architecture with clear separation of concerns:

1. **Core Services**: Each service focuses on a specific domain:
   - `TokenService`: Token metadata, balances, and pricing
   - `SwapService`: Token swaps and approvals
   - `RewardsService`: Rewards from BGT Staker and vaults
   - `ValidatorService`: Validator data and boost management

2. **Support Modules**:
   - `provider.js`: Manages Web3 provider and signer
   - `contracts.js`: Smart contract interaction
   - `cache.js`: In-memory and file-based caching
   - `errors.js`: Consistent error handling

3. **Integration Layer**:
   - `index.js`: Service factory for initializing services
   - `api.js`: Clean public API for frontend integration
   - `cli.js`: Command-line interface for testing

## Environment Configuration

BeraBundle backend supports two ways to configure sensitive data like API keys:

1. **Environment Variables (Recommended for Production)**
   - Set environment variables with the `BERABUNDLE_` prefix
   - Example: `BERABUNDLE_API_KEY`, `BERABUNDLE_PRIVATE_KEY`
   - Can use a `.env` file (copy from `.env.example`) in development

2. **Local Config File (CLI and Development)**
   - Uses `.berabundle.json` file in the project root
   - Created and managed by CLI commands
   - Example: `node backend/cli.js set-api-key <your-key>`

The system prioritizes environment variables over local config to ensure security in production environments.

## Usage

### Service Factory

```javascript
const backend = require('./backend');

// Initialize all services
const result = await backend.initialize({
  apiKey: 'your-oogabooga-api-key',
  // Optional: custom provider and signer
  provider: customProvider,
  signer: customSigner
});

// Access services directly
const tokens = await backend.services.token.getTokenList();
const rewards = await backend.services.rewards.checkRewards(address);
```

### Public API

```javascript
const api = require('./backend/api');

// Initialize backend
await api.initialize({ apiKey: 'your-api-key' });

// Token operations
const tokens = await api.tokens.getList();
const price = await api.tokens.getPrice(tokenAddress);

// Rewards operations
const rewards = await api.rewards.getAll(walletAddress);

// Validator operations
const validators = await api.validators.getList();
const boosts = await api.validators.getBoosts(walletAddress);

// Swap operations
const bundle = await api.swaps.createBundle(fromAddress, tokensToSwap);
const result = await api.swaps.executeBundle(bundle);
```

### CLI Commands

The CLI provides a command-line interface for testing the backend:

```bash
# Setup
node backend/cli.js set-api-key <your-api-key>
node backend/cli.js set-wallet <your-private-key>

# Token commands
node backend/cli.js tokens
node backend/cli.js token-price 0x656b95e550c07a9ffe548bd4085c72418ceb1dba

# Rewards commands
node backend/cli.js rewards 0x123...
node backend/cli.js check-vaults 0x123...

# Validator commands
node backend/cli.js validators
node backend/cli.js validator-boosts 0x123...
```

## Integration with Frontend

The frontend can use the public API interface (`backend/api.js`) to interact with the backend services:

```javascript
import beraBundle from '../../backend/api';

// Initialize backend when the app starts
useEffect(() => {
  const initBackend = async () => {
    const apiKey = localStorage.getItem('apiKey');
    await beraBundle.initialize({ apiKey });
    
    // Connect with browser wallet if available
    await beraBundle.blockchain.connectBrowser();
  };
  
  initBackend();
}, []);

// Example: Get token list
const fetchTokens = async () => {
  const result = await beraBundle.tokens.getList();
  if (result.success) {
    setTokens(result.tokens);
  }
};

// Example: Check rewards
const checkRewards = async (address) => {
  const result = await beraBundle.rewards.getAll(address);
  if (result.success) {
    setRewards(result.rewards);
    setTotalValue(result.totalValue);
  }
};
```

## Advanced Usage

### Custom Provider

```javascript
// Use custom providers
import { providers } from 'ethers';

const provider = new providers.JsonRpcProvider('https://rpc.berachain.com');
await beraBundle.initialize({ provider });
```

### Caching Control

```javascript
// Initialize with caching options
await beraBundle.initialize({
  withCache: true, // Enable caching
  cacheDuration: {
    tokens: 3600, // 1 hour for tokens
    prices: 300,  // 5 minutes for prices
    validators: 600 // 10 minutes for validators
  }
});
```