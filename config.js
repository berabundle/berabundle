// config.js - Centralized configuration for BeraBundle
const path = require('path');

// Network configuration
const networks = {
    berachain: {
        name: 'Berachain',
        chainId: '0x1385e', // 80094 in decimal
        rpcUrl: process.env.RPC_URL || 'https://rpc.berachain.com',
        blockExplorer: 'https://berascan.com',
        honeyTokenAddress: '0x7EeCA4205fF31f947EdBd49195a7A88E6A91161B', 
        bgtTokenAddress: '0x656b95E550C07a9ffe548bd4085c72418Ceb1dba',
        swapBundlerAddress: '0xF9b3593C58cd1A2e3D1Fc8ff44Da6421B5828c18'
    }
};

// Performance settings
const performance = {
    batchSize: 10,
    delayBetweenBatches: 50, // ms
};

// File paths
const paths = {
    // Directories
    metadataDir: path.join(__dirname, 'metadata'),
    
    // Metadata files
    tokensFile: path.join(__dirname, 'metadata', 'tokens.json'),
};

// Gas settings
const gas = {
    maxFeePerGas: '0x3b9aca00', // 1 Gwei
    maxPriorityFeePerGas: '0x3b9aca00', // 1 Gwei
    estimateGasLimit: true,
    defaultGasLimit: '0x500000',
};

module.exports = {
    networks,
    performance,
    paths,
    gas,
    currentNetwork: networks.berachain // Default network
};