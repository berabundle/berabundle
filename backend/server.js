/**
 * BeraBundle Backend Server
 * 
 * This server exposes the backend API to the frontend via HTTP.
 */

const express = require('express');
const cors = require('cors');
const api = require('./api');
const config = require('./config');
const env = require('./config/env');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for frontend
app.use(cors());

// Parse JSON request body
app.use(express.json());

// API Key middleware
const apiKeyMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  // Store API key in request for later use
  if (apiKey) {
    req.apiKey = apiKey;
  }
  
  next();
};

app.use(apiKeyMiddleware);

// Initialize backend with API key from environment or first request
let backendInitialized = false;

async function initializeBackend(apiKey) {
  if (!backendInitialized) {
    console.log('Initializing backend services...');
    await api.initialize({ apiKey });
    backendInitialized = true;
    return true;
  }
  return false;
}

// Initialize with environment API key if available
const envApiKey = env.getConfig('api_key');
if (envApiKey) {
  console.log('Found API key in environment variables, initializing backend...');
  initializeBackend(envApiKey)
    .then(() => console.log('Backend initialized with environment API key'))
    .catch(err => console.error('Error initializing backend:', err));
} else {
  console.warn('No API key found in environment variables. Backend will be initialized on first request.');
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'BeraBundle Backend API',
    version: '1.0.0',
    status: api.getStatus()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: Date.now()
  });
});

// Token endpoints
app.get('/tokens/list', async (req, res) => {
  try {
    await initializeBackend(req.apiKey);
    const result = await api.tokens.getList(req.query);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/tokens/price/:tokenAddress', async (req, res) => {
  try {
    await initializeBackend(req.apiKey);
    const { tokenAddress } = req.params;
    const result = await api.tokens.getPrice(tokenAddress);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/tokens/balance/:address/:tokenAddress', async (req, res) => {
  try {
    await initializeBackend(req.apiKey);
    const { address, tokenAddress } = req.params;
    const result = await api.tokens.getBalance(address, tokenAddress);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/tokens/native-balance/:address', async (req, res) => {
  try {
    await initializeBackend(req.apiKey);
    const { address } = req.params;
    const result = await api.tokens.getNativeBalance(address);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/tokens/all-balances/:address', async (req, res) => {
  try {
    await initializeBackend(req.apiKey);
    const { address } = req.params;
    
    console.log(`[Server] Getting all balances for ${address}`);
    
    // Use the backend's getAllBalances method
    // Check if there's an API method for this, otherwise use our TokenService directly
    const tokenService = require('./api/TokenService');
    const result = await tokenService.getAllBalances(address);
    
    if (!result || !result.success) {
      throw new Error(result?.error || 'Failed to get balances');
    }
    
    console.log(`[Server] Returning token balances for ${address}`);
    res.json(result);
  } catch (error) {
    console.error(`[Server] Error getting all balances:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Validator endpoints
app.get('/validators/list', async (req, res) => {
  try {
    await initializeBackend(req.apiKey);
    const result = await api.validators.getList();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Swap endpoints
app.post('/swaps/create-bundle', async (req, res) => {
  try {
    await initializeBackend(req.apiKey);
    const { fromAddress, tokensToSwap, options } = req.body;
    
    if (!fromAddress || !tokensToSwap || !Array.isArray(tokensToSwap)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters. Required: fromAddress and tokensToSwap array'
      });
    }
    
    console.log(`[Server] Creating swap bundle for ${fromAddress} with ${tokensToSwap.length} tokens`);
    
    // Use the SwapService to create the bundle
    const swapService = require('./api/SwapService');
    const result = await swapService.createSwapBundle(fromAddress, tokensToSwap, options || {});
    
    if (!result) {
      throw new Error('Failed to create swap bundle');
    }
    
    console.log(`[Server] Swap bundle created with ${result.swapTxs?.length || 0} transactions`);
    res.json(result);
  } catch (error) {
    console.error(`[Server] Error creating swap bundle:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/swaps/execute-bundle', async (req, res) => {
  try {
    await initializeBackend(req.apiKey);
    const bundle = req.body;
    
    if (!bundle || !bundle.fromAddress || !bundle.swapTxs) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bundle format. Required: fromAddress and swapTxs'
      });
    }
    
    console.log(`[Server] Executing swap bundle for ${bundle.fromAddress} with ${bundle.swapTxs.length} transactions`);
    
    // Use the SwapService to execute the bundle
    const swapService = require('./api/SwapService');
    const result = await swapService.executeSwapBundle(bundle);
    
    if (!result) {
      throw new Error('Failed to execute swap bundle');
    }
    
    console.log(`[Server] Swap execution completed`);
    res.json(result);
  } catch (error) {
    console.error(`[Server] Error executing swap bundle:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/swaps/check-approval', async (req, res) => {
  try {
    await initializeBackend(req.apiKey);
    const { tokenAddress, ownerAddress, amount } = req.body;
    
    if (!tokenAddress || !ownerAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: tokenAddress and ownerAddress'
      });
    }
    
    console.log(`[Server] Checking approval for ${tokenAddress} by ${ownerAddress}`);
    
    // Use the ApprovalService to check approval
    const approvalService = require('./api/ApprovalService');
    const result = await approvalService.checkApproval(tokenAddress, ownerAddress, amount);
    
    // Pass through the result directly to the frontend
    res.json(result);
  } catch (error) {
    console.error(`[Server] Error checking approval:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/swaps/approve-token', async (req, res) => {
  try {
    await initializeBackend(req.apiKey);
    const { tokenAddress, amount } = req.body;
    
    if (!tokenAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: tokenAddress'
      });
    }
    
    console.log(`[Server] Approving token ${tokenAddress}`);
    
    // Use the ApprovalService to approve the token
    const approvalService = require('./api/ApprovalService');
    const result = await approvalService.approveToken(tokenAddress, amount);
    
    console.log(`[Server] Token approval completed for ${tokenAddress}`);
    
    res.json(result);
  } catch (error) {
    console.error(`[Server] Error approving token:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/swaps/revoke-token', async (req, res) => {
  try {
    await initializeBackend(req.apiKey);
    const { tokenAddress } = req.body;
    
    if (!tokenAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: tokenAddress'
      });
    }
    
    console.log(`[Server] Revoking approval for token ${tokenAddress}`);
    
    // Use the ApprovalService to revoke approval
    const approvalService = require('./api/ApprovalService');
    const result = await approvalService.revokeToken(tokenAddress);
    
    console.log(`[Server] Token revocation completed for ${tokenAddress}`);
    
    res.json(result);
  } catch (error) {
    console.error(`[Server] Error revoking token approval:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`BeraBundle backend server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}`);
});