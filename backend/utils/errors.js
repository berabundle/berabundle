/**
 * errors.js - Error handling utilities for BeraBundle
 * 
 * This module provides consistent error handling and formatting
 * across the application.
 */

/**
 * Custom API error class
 */
class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.isApiError = true;
  }
}

/**
 * Custom Blockchain error class
 */
class BlockchainError extends Error {
  constructor(message, code, transaction) {
    super(message);
    this.name = 'BlockchainError';
    this.code = code;
    this.transaction = transaction;
    this.isBlockchainError = true;
  }
}

/**
 * Format an error for consistent logging and presentation
 * @param {Error} error - The error object
 * @param {string} context - Context where the error occurred
 * @returns {Object} Formatted error object
 */
function formatError(error, context) {
  const formatted = {
    message: error.message,
    context: context,
    timestamp: new Date().toISOString()
  };
  
  // Add type-specific properties
  if (error.isApiError) {
    formatted.type = 'API';
    formatted.status = error.status;
    formatted.data = error.data;
  } else if (error.isBlockchainError) {
    formatted.type = 'Blockchain';
    formatted.code = error.code;
    formatted.transaction = error.transaction ? {
      hash: error.transaction.hash,
      from: error.transaction.from,
      to: error.transaction.to
    } : null;
  } else {
    formatted.type = 'General';
    formatted.stack = error.stack;
  }
  
  return formatted;
}

/**
 * Handle errors consistently across the application
 * @param {Error} error - The error object
 * @param {string} context - Context where the error occurred
 * @param {Function|any} fallback - Optional fallback to return on error
 * @returns {any} - Either throws the error or returns fallback value
 */
function handleError(error, context, fallback) {
  // Format and log the error
  const formattedError = formatError(error, context);
  console.error(`[ERROR][${context}]`, JSON.stringify(formattedError, null, 2));
  
  // If fallback is a function, call it
  if (typeof fallback === 'function') {
    return fallback(error);
  }
  
  // If fallback is a value, return it
  if (fallback !== undefined) {
    return fallback;
  }
  
  // Otherwise rethrow the error
  throw error;
}

module.exports = {
  ApiError,
  BlockchainError,
  formatError,
  handleError
};