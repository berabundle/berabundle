/**
 * index.js - Enhanced configuration for BeraBundle backend
 * 
 * This module extends the root config with backend-specific settings.
 */

const path = require('path');
const rootConfig = require('../../config');

// API configuration
const api = {
  // OogaBooga API configuration
  oogabooga: {
    baseUrl: 'https://mainnet.api.oogabooga.io',
    endpoints: {
      prices: '/v1/prices',
      swap: '/v1/swap',
      tokens: '/v1/tokens',
      validators: '/v1/validators'
    },
    // Default API key placeholder - will be populated at runtime
    apiKey: null
  },
  // Cache durations for different data types (in milliseconds)
  cacheDuration: {
    tokens: 24 * 60 * 60 * 1000, // 24 hours
    prices: 5 * 60 * 1000, // 5 minutes
    validators: 60 * 60 * 1000, // 1 hour
    rewards: 10 * 60 * 1000 // 10 minutes
  }
};

// Enhanced paths with backend-specific locations
const paths = {
  ...rootConfig.paths,
  backend: {
    root: path.join(__dirname, '..'),
    cache: path.join(__dirname, '..', 'cache'),
    contracts: path.join(__dirname, '..', 'blockchain', 'contracts')
  }
};

// Contract ABIs
const contractAbis = {
  // The ABI for the BeraBundle_SwapBundler contract
  swapBundler: [
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
  ],
  // Minimal ERC20 ABI for interacting with tokens
  erc20: [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function transferFrom(address from, address to, uint256 value) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)"
  ]
};

// Combine all settings
const config = {
  ...rootConfig,
  api,
  paths,
  contractAbis,
  // Constants used across the backend
  constants: {
    OPERATION_TYPE_APPROVE: 1,
    OPERATION_TYPE_SWAP: 2,
    ZERO_ADDRESS: '0x0000000000000000000000000000000000000000'
  }
};

module.exports = config;