import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './SwapForm.css';
import tokenBridge from '../services/TokenBridge';
import metadataService from '../services/MetadataService';

/**
 * Component for creating token swap transactions
 * 
 * @param {Object} props Component props
 * @param {Array} props.selectedTokens Array of selected tokens to swap
 * @param {Object} props.beraToken BERA token data
 * @param {Function} props.onClose Callback to close the swap form
 * @param {Function} props.onSwap Callback to execute the swap
 */
function SwapForm({ selectedTokens, beraToken, onClose, onSwap }) {
  const [swapAmounts, setSwapAmounts] = useState({});
  const [totalValueUsd, setTotalValueUsd] = useState(0);
  const [estimatedOutput, setEstimatedOutput] = useState(0);
  const [targetToken, setTargetToken] = useState({ address: '0x0000000000000000000000000000000000000000', symbol: 'BERA', decimals: 18 });
  const [availableTokens, setAvailableTokens] = useState([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [error, setError] = useState('');
  const [approvalStatus, setApprovalStatus] = useState({});
  const [maxApprovalUsd, setMaxApprovalUsd] = useState('50'); // Default to $50 worth of each token

  // Initialize swap amounts with MAX by default
  useEffect(() => {
    if (selectedTokens && selectedTokens.length > 0) {
      const initialAmounts = {};
      
      // Set all tokens to MAX by default (include BERA)
      selectedTokens.forEach(token => {
        const amount = parseFloat(token.balance).toFixed(3);
        const numericAmount = parseFloat(amount);
        const valueUsd = token.priceUsd ? numericAmount * token.priceUsd : 0;
        
        initialAmounts[token.address] = {
          rawInput: amount,
          amount: numericAmount,
          valueUsd,
          isValid: true
        };
      });
      
      setSwapAmounts(initialAmounts);
      
      // Set initial approval status to "checking" to show loading state
      const initialApprovalStatus = {};
      selectedTokens.forEach(token => {
        if (!(token.isNative || token.address === 'native' || token.symbol === 'BERA')) {
          initialApprovalStatus[token.address] = {
            checking: true, // Show as checking initially
            lastCheckedAmount: null
          };
        }
      });
      
      setApprovalStatus(initialApprovalStatus);
      
      // Check approvals for all tokens on component load
      const tokensToCheck = selectedTokens.filter(
        token => !(token.isNative || token.address === 'native' || token.symbol === 'BERA')
      );
      
      if (tokensToCheck.length > 0) {
        setTimeout(() => checkTokenApprovals(tokensToCheck), 100);
      }
    }
  }, [selectedTokens]);
  
  // Check if tokens are approved for the bundler contract
  const checkTokenApprovals = async (tokensToCheck) => {
    if (!tokenBridge.isInitialized() || !window.ethereum) return;
    
    try {
      // Get current account
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (!accounts || accounts.length === 0) return;
      
      const address = accounts[0];
      const updatedApprovalStatus = {...approvalStatus}; // Start with current status
      
      // Skip native tokens
      const tokensToActuallyCheck = tokensToCheck.filter(token => 
        !(token.isNative || token.address === 'native' || token.symbol === 'BERA')
      );
      
      if (tokensToActuallyCheck.length === 0) return;
      
      console.log(`Checking approval for ${tokensToActuallyCheck.length} tokens based on $${maxApprovalUsd} value`);
      
      // Debug token prices
      tokensToActuallyCheck.forEach(token => {
        console.log(`${token.symbol} price: $${token.priceUsd || 'unknown'}`);
      });
      
      // Set checking status for all tokens at once
      tokensToActuallyCheck.forEach(token => {
        updatedApprovalStatus[token.address] = {
          ...(updatedApprovalStatus[token.address] || {}),
          checking: true
        };
      });
      
      // Update UI immediately to show checking for all tokens
      setApprovalStatus({...updatedApprovalStatus});
      
      // Create array of promises for parallel execution
      const approvalPromises = tokensToActuallyCheck.map(async (token) => {
        try {
          // Calculate the token amount based on $maxApprovalUsd
          let amountToCheck;
          const maxUsdValue = parseFloat(maxApprovalUsd);
          
          if (isNaN(maxUsdValue) || maxUsdValue <= 0 || !token.priceUsd) {
            // If maxApprovalUsd is invalid or we don't have a price, use the token amount
            amountToCheck = swapAmounts[token.address]?.amount || token.balance;
            console.log(`Using token amount for ${token.symbol}: ${amountToCheck} (no valid USD value)`);
          } else if (token.priceUsd < 0.0000001) {
            // If price is extremely small (almost worthless token), use a reasonable large value
            // but not so large it causes parsing errors
            amountToCheck = "1000000"; // Use 1 million tokens as a reasonable limit
            console.log(`Price too small for ${token.symbol}, using fixed amount of ${amountToCheck} tokens (price: ${token.priceUsd})`);
          } else {
            // Calculate token amount based on USD value with proper precision
            const rawAmount = maxUsdValue / token.priceUsd;
            
            // Cap the amount to prevent overflow errors (max 1 trillion)
            const cappedAmount = Math.min(rawAmount, 1000000000000);
            
            // Format to avoid precision errors - use 6 decimal places max to avoid errors
            amountToCheck = cappedAmount.toFixed(6);
            console.log(`Calculated ${token.symbol} amount for $${maxUsdValue}: ${amountToCheck} (price: ${token.priceUsd})`);
          }
          
          // Get the actual amount being swapped for this token
          let tokenAmountToCheck = swapAmounts[token.address]?.amount || 0;
          
          console.log(`DEBUG: Token ${token.symbol} swap state: `, {
            amountInSwapState: tokenAmountToCheck,
            fullSwapInfo: swapAmounts[token.address]
          });
          
          // Get actual token address for debugging
          console.log(`DEBUG: Token ${token.symbol} address: ${token.address}`);
          console.log(`DEBUG: Token ${token.symbol} balance: ${token.balance}`);
          
          // Check if this is a valid amount to swap (should be > 0)
          if (tokenAmountToCheck <= 0) {
            console.log(`Token ${token.symbol} amount (${tokenAmountToCheck}) is invalid or zero, checking for balance value`);
            // Try to get from token balance instead (for initial load)
            const tokenBalance = parseFloat(token.balance || '0');
            if (tokenBalance > 0) {
              console.log(`Using token balance for approval check: ${tokenBalance} ${token.symbol}`);
              // Use token balance instead
              tokenAmountToCheck = tokenBalance;
            } else {
              console.log(`No valid amount found for ${token.symbol}, skipping approval check`);
              return {
                token,
                result: { 
                  isApproved: true, // No amount needed, so consider it approved
                  checking: false,
                  error: null
                }
              };
            }
          }
          
          // Format with appropriate precision - this is critical for correct comparison
          const formattedActualAmount = parseFloat(tokenAmountToCheck).toFixed(6);
          console.log(`Using ACTUAL swap amount for approval check: ${formattedActualAmount} ${token.symbol}`);
          
          // Get the backend's approval check result
          const approvalResult = await tokenBridge.checkBundlerApproval(
            token.address,
            address,
            formattedActualAmount // Use the actual swap amount
          );
          
          // Adapt the backend's response to what our UI expects
          const uiApprovalResult = {
            ...approvalResult,
            checking: false,
            error: approvalResult.error || null,
            actualSwapAmount: tokenAmountToCheck,
            tokenPrice: token.priceUsd,
            requiredUsdAmount: maxApprovalUsd,
            requiredTokenAmount: amountToCheck
          };
          
          // Calculate USD values if not provided by backend
          if (token.priceUsd && approvalResult.formattedAllowance) {
            const approvalUsdValue = parseFloat(approvalResult.formattedAllowance) * token.priceUsd;
            const swapUsdValue = parseFloat(formattedActualAmount) * token.priceUsd;
            
            // Store for UI display
            uiApprovalResult.approvalUsdValue = approvalUsdValue.toFixed(2);
            uiApprovalResult.swapUsdValue = swapUsdValue.toFixed(2);
            
            console.log(`Token ${token.symbol}: Allowance=$${approvalUsdValue.toFixed(2)}, Swap Amount=$${swapUsdValue.toFixed(2)}`);
            
            // If allowance USD value is greater than swap USD value, consider it approved
            if (approvalUsdValue >= swapUsdValue) {
              uiApprovalResult.isApproved = true;
            }
          }
          
          // Log the result
          if (uiApprovalResult.isApproved) {
            console.log(`✅ APPROVED: Token ${token.symbol} is approved for $${uiApprovalResult.swapUsdValue || '?'} (${formattedActualAmount} ${token.symbol})`);
          } else {
            console.log(`❌ NOT APPROVED: Token ${token.symbol} needs approval for $${uiApprovalResult.swapUsdValue || '?'} (${formattedActualAmount} ${token.symbol})`);
          }
          
          console.log(`Approval check for ${token.symbol}:`, uiApprovalResult);
          
          return {
            token,
            result: uiApprovalResult
          };
        } catch (error) {
          console.error(`Error checking approval for ${token.symbol}:`, error);
          return {
            token,
            result: { 
              isApproved: false, 
              checking: false,
              error: error.message
            }
          };
        }
      });
      
      // Wait for all approval checks to complete in parallel
      const results = await Promise.all(approvalPromises);
      
      // Update approval status with all results
      results.forEach(({ token, result }) => {
        updatedApprovalStatus[token.address] = {
          ...(updatedApprovalStatus[token.address] || {}),
          ...result
        };
      });
      
      // Update state once with all changes
      setApprovalStatus({...updatedApprovalStatus});
    } catch (error) {
      console.error("Error checking token approvals:", error);
    }
  };

  // Load available tokens from OogaBooga API
  useEffect(() => {
    async function loadAvailableTokens() {
      setIsLoadingTokens(true);
      try {
        const result = await metadataService.getOogaBoogaTokens();
        if (result.success && result.tokens) {
          // Convert token map to array
          const tokenArray = Object.values(result.tokens.data);
          
          // Sort tokens by symbol
          const sortedTokens = [...tokenArray].sort((a, b) => a.symbol.localeCompare(b.symbol));
          
          setAvailableTokens(sortedTokens);
          
          // Pre-select BERA as target token by default
          const beraToken = sortedTokens.find(token => 
            token.symbol === 'BERA' || 
            token.address === '0x0000000000000000000000000000000000000000'
          );
          
          if (beraToken) {
            setTargetToken(beraToken);
          }
        } else {
          console.error("Failed to load tokens:", result.error);
        }
      } catch (error) {
        console.error("Error loading tokens:", error);
      } finally {
        setIsLoadingTokens(false);
      }
    }
    
    loadAvailableTokens();
  }, []);

  // Update total values when amounts change
  useEffect(() => {
    let total = 0;
    let valid = false;

    // Calculate total value
    Object.values(swapAmounts).forEach(tokenData => {
      total += tokenData.valueUsd || 0;
      if (tokenData.isValid) valid = true;
    });

    // Calculate estimated output based on target token
    let estimatedOutput = 0;
    if (targetToken && targetToken.priceUsd && total > 0) {
      estimatedOutput = total / targetToken.priceUsd;
    } else if (targetToken && targetToken.symbol === 'BERA' && beraToken && beraToken.priceUsd && total > 0) {
      // Fallback to using beraToken price if available
      estimatedOutput = total / beraToken.priceUsd;
    }

    setTotalValueUsd(total);
    setEstimatedOutput(estimatedOutput);
    setIsValid(valid);
  }, [swapAmounts, targetToken, beraToken]);

  // Handle amount change for a token
  const handleAmountChange = (token, value, checkApproval = false) => {
    // Store raw input value for display
    const inputValue = value.trim();
    
    // Parse numeric value for calculations
    const numericAmount = parseFloat(inputValue);
    
    // Validate amount
    const isValid = 
      inputValue !== '' && 
      !isNaN(numericAmount) && 
      numericAmount > 0 && 
      numericAmount <= parseFloat(token.balance);
    
    // Calculate value in USD
    const valueUsd = isValid && token.priceUsd 
      ? numericAmount * token.priceUsd 
      : 0;
    
    // Update state
    setSwapAmounts(prev => ({
      ...prev,
      [token.address]: {
        rawInput: inputValue,      // Store raw input value
        amount: isValid ? numericAmount : 0, // Store numeric amount
        valueUsd,
        isValid
      }
    }));

    // Clear error if any input is valid
    if (isValid) {
      setError('');
    }
    
    // We no longer check approvals automatically when amount changes
    // Approvals are only checked when the component loads
    // and after explicit approve/revoke actions
  };
  
  // Approve a token to the bundler with USD amount limit
  const handleApproveToken = async (token, customUsdAmount = null) => {
    try {
      // Get the actual swap amount for this token
      const actualSwapAmount = swapAmounts[token.address]?.amount || 0;
      let approvalAmount;
      
      // Parse the approval USD amount - use custom amount if provided, otherwise use maxApprovalUsd
      const approvalUsdInput = customUsdAmount !== null ? customUsdAmount : maxApprovalUsd;
      const maxUsdAmount = parseFloat(approvalUsdInput);
      
      console.log(`Approving ${token.symbol} for $${maxUsdAmount}`);
      
      if (isNaN(maxUsdAmount) || maxUsdAmount <= 0) {
        // If USD amount is invalid, fall back to using the actual swap amount or token balance
        const currentAmount = actualSwapAmount > 0 ? actualSwapAmount : token.balance;
        approvalAmount = ethers.utils.parseUnits(
          currentAmount.toString(),
          token.decimals || 18
        );
        console.log(`Using current amount for approval: ${currentAmount} ${token.symbol}`);
      } else if (token.priceUsd && token.priceUsd > 0) {
        // Calculate how many tokens are worth maxUsdAmount with proper precision
        const rawAmount = maxUsdAmount / token.priceUsd;
        
        // Cap the amount to prevent overflow errors
        const cappedAmount = Math.min(rawAmount, 1000000000000);
        
        // Format with appropriate precision to avoid errors
        const tokenAmount = cappedAmount.toFixed(6);
        console.log(`Approving $${maxUsdAmount} worth of ${token.symbol} (${tokenAmount} tokens)`);
        
        // IMPORTANT: Only approve exactly what was requested, don't auto-adjust to the swap amount
        
        // Convert to wei with proper decimals
        approvalAmount = ethers.utils.parseUnits(
          tokenAmount,
          token.decimals || 18
        );
      } else {
        // If we can't determine the price, use the actual swap amount or token balance
        const currentAmount = actualSwapAmount > 0 ? actualSwapAmount : token.balance;
        approvalAmount = ethers.utils.parseUnits(
          currentAmount.toString(),
          token.decimals || 18
        );
        console.log(`No price data for ${token.symbol}, using current amount: ${currentAmount}`);
      }
      
      // Update approval status to show loading
      setApprovalStatus(prev => ({
        ...prev,
        [token.address]: {
          ...prev[token.address],
          checking: false,
          approving: true,
          error: null,
          approvingAmount: false // Close the approval input UI
        }
      }));
      
      // Send approval transaction with the calculated amount
      const result = await tokenBridge.approveTokenToBundler(token.address, approvalAmount);
      
      if (result.success) {
        console.log(`Successfully approved ${token.symbol} to bundler, tx: ${result.hash}`);
        
        // Always recheck the actual approval status after transaction
        setTimeout(() => {
          const tokensToRecheck = [token];
          checkTokenApprovals(tokensToRecheck);
        }, 1000);
        
        // Show temporary success
        setApprovalStatus(prev => ({
          ...prev,
          [token.address]: {
            ...(prev[token.address] || {}),
            approving: false,
            hash: result.hash,
            // Let the checkTokenApprovals update the final status
          }
        }));
      } else {
        console.error(`Failed to approve ${token.symbol}: ${result.error}`);
        
        // Update approval status with error
        setApprovalStatus(prev => ({
          ...prev,
          [token.address]: {
            ...(prev[token.address] || {}),
            isApproved: false,
            checking: false,
            approving: false,
            error: result.error
          }
        }));
      }
    } catch (error) {
      console.error(`Error approving ${token.symbol}:`, error);
      setApprovalStatus(prev => ({
        ...prev,
        [token.address]: {
          ...(prev[token.address] || {}),
          isApproved: false,
          checking: false,
          approving: false,
          error: error.message
        }
      }));
    }
  };

  // Handle token approval revocation
  const handleRevokeToken = async (token) => {
    try {
      // Update approval status to show loading
      setApprovalStatus(prev => ({
        ...prev,
        [token.address]: {
          ...(prev[token.address] || {}),
          checking: false,
          approving: false,
          revoking: true,
          revokingApproval: false, // Close the revoke confirmation UI
          error: null
        }
      }));
      
      // Send revoke transaction
      const result = await tokenBridge.revokeTokenFromBundler(token.address);
      
      if (result.success) {
        console.log(`Successfully revoked ${token.symbol} approval, tx: ${result.hash}`);
        
        // Recheck approval status after revocation
        setTimeout(() => {
          const tokensToRecheck = [token];
          checkTokenApprovals(tokensToRecheck);
        }, 1000);
        
        // Show temporary status
        setApprovalStatus(prev => ({
          ...prev,
          [token.address]: {
            ...(prev[token.address] || {}),
            revoking: false,
            hash: result.hash,
            // Let the checkTokenApprovals update the final status
          }
        }));
      } else {
        console.error(`Failed to revoke ${token.symbol} approval: ${result.error}`);
        
        // Update approval status with error
        setApprovalStatus(prev => ({
          ...prev,
          [token.address]: {
            ...(prev[token.address] || {}),
            revoking: false,
            error: result.error
          }
        }));
      }
    } catch (error) {
      console.error(`Error revoking ${token.symbol} approval:`, error);
      setApprovalStatus(prev => ({
        ...prev,
        [token.address]: {
          ...(prev[token.address] || {}),
          revoking: false,
          error: error.message
        }
      }));
    }
  };

  // Handle percentage selection
  const handlePercentClick = (token, percentage) => {
    if (percentage === 0) {
      handleAmountChange(token, '0', true); // Check approval on quick selection
      return;
    }
    
    const amount = (parseFloat(token.balance) * (percentage / 100)).toFixed(3);
    handleAmountChange(token, amount, true); // Check approval on quick selection
  };

  // Get token price for the selected target token
  const getTargetTokenPrice = async (token) => {
    if (!token || !token.address) return null;
    
    try {
      const price = await tokenBridge.getTokenPrice(token.address);
      console.log(`[DEBUG] Price for ${token.symbol}: ${price}`);
      return price;
    } catch (error) {
      console.error(`[DEBUG] Error getting price for ${token.symbol}:`, error);
      return null;
    }
  };
  
  // Handle target token change
  const handleTargetTokenChange = async (event) => {
    const tokenAddress = event.target.value;
    const selected = availableTokens.find(token => token.address === tokenAddress);
    
    if (selected) {
      console.log("[DEBUG] Selected target token:", selected);
      
      // Update the target token state
      setTargetToken(prev => ({ ...selected }));
      
      // Get price for the new target token if not available
      if (!selected.priceUsd) {
        const price = await getTargetTokenPrice(selected);
        if (price) {
          setTargetToken(prev => ({ ...prev, priceUsd: price }));
        }
      }
      
      // Recalculate estimated output based on new target token price
      const total = Object.values(swapAmounts).reduce((sum, tokenData) => sum + (tokenData.valueUsd || 0), 0);
      
      let newEstimatedOutput = 0;
      if (selected.priceUsd && total > 0) {
        newEstimatedOutput = total / selected.priceUsd;
        setEstimatedOutput(newEstimatedOutput);
      } else if (beraToken && beraToken.priceUsd && total > 0 && selected.symbol === 'BERA') {
        // Fallback to beraToken price for BERA
        newEstimatedOutput = total / beraToken.priceUsd;
        setEstimatedOutput(newEstimatedOutput);
      }
      
      // For any token with valid amount, regenerate swap data through API
      const validTokens = Object.entries(swapAmounts)
        .filter(([address, data]) => data.isValid)
        .map(([address]) => selectedTokens.find(t => t.address === address))
        .filter(token => token);
      
      if (validTokens.length > 0) {
        console.log("[DEBUG] Valid tokens for recalculating swap data:", validTokens);
        // We have valid tokens, we should recalculate swap data, but we'll do this at execution time
        // to avoid making too many API calls
      }
    }
  };
  
  // Helper function to check if token's approval is sufficient for swap amount
  const isApprovalSufficient = (token) => {
    if (!token) return false;
    
    if (token.isNative || token.address === 'native' || token.symbol === 'BERA') {
      return true; // Native tokens always approved
    }
    
    const status = approvalStatus[token.address];
    if (!status) return false;
    
    // If checking/approving/revoking, can't determine
    if (status.checking || status.approving || status.revoking) return false;
    
    // Get current swap amount USD value
    const swapData = swapAmounts[token.address];
    if (!swapData || !swapData.isValid) return true; // No valid amount to swap
    
    const swapUsdValue = swapData.valueUsd || 0;
    
    // Check if approved amount is sufficient
    if (status.approvalUsdValue) {
      const approvedUsdValue = parseFloat(status.approvalUsdValue);
      return approvedUsdValue >= swapUsdValue;
    }
    
    return !!status.isApproved; // Fall back to boolean approval status
  };
  
  // Handle swap button click
  const handleSwap = () => {
    if (!isValid) {
      setError('Please enter valid amounts for at least one token');
      return;
    }
    
    // Check if all tokens with valid swap amounts have sufficient approvals
    const tokensWithInsufficientApproval = selectedTokens
      .filter(token => 
        !(token.isNative || token.address === 'native' || token.symbol === 'BERA') &&
        swapAmounts[token.address]?.isValid &&
        !isApprovalSufficient(token)
      );
    
    // Log approval status for debugging
    console.log("Approval status check on swap execution:");
    selectedTokens
      .filter(token => swapAmounts[token.address]?.isValid)
      .forEach(token => {
        console.log(`Token ${token.symbol}: approved=${isApprovalSufficient(token)}`);
      });
    
    if (tokensWithInsufficientApproval.length > 0) {
      const tokenSymbols = tokensWithInsufficientApproval.map(t => t.symbol).join(', ');
      setError(`Insufficient approval for: ${tokenSymbols}. Please adjust approvals or swap amounts.`);
      return;
    }

    // Create swap data based on the form inputs
    const swapData = selectedTokens
      .filter(token => swapAmounts[token.address]?.isValid)
      .map(token => ({
        ...token, // Include all token data
        amount: swapAmounts[token.address].amount.toString(),
        valueUsd: swapAmounts[token.address].valueUsd
      }));

    // Create bundle options that include the target token
    // The API will generate fresh transaction data upon execution
    const bundleOptions = {
      targetToken: targetToken,
      regenerateOnExecute: true // Flag to ensure fresh quotes for the current target token
    };

    console.log(`[DEBUG] Executing swap with target token: ${targetToken.symbol} (${targetToken.address})`);
    console.log(`[DEBUG] Selected amount(s): ${swapData.map(token => `${token.amount} ${token.symbol}`).join(', ')}`);
    console.log(`[DEBUG] Estimated output: ${estimatedOutput.toFixed(6)} ${targetToken.symbol}`);

    // Set bundleMethod to use Berabundler contract
    onSwap(swapData, totalValueUsd, estimatedOutput, 'berabundler', bundleOptions);
  };

  // Show all tokens, including BERA
  const validTokens = selectedTokens;
  
  // If no valid tokens are selected
  if (!validTokens || validTokens.length === 0) {
    return (
      <div className="cli-overlay-terminal">
        <div className="cli-overlay-header">
          <div className="cli-overlay-title">
            <span className="cli-prompt">berabundle$</span> <span className="cli-overlay-command">swap --tokens 0</span>
          </div>
          <button className="cli-overlay-close" onClick={onClose}>&times;</button>
        </div>
        <div className="cli-overlay-content">
          <p className="cli-error">Error: No tokens selected for swap. Please select at least one token.</p>
          <div className="cli-command-row" style={{marginTop: '20px'}}>
            <span className="cli-prompt">berabundle$</span> 
            <button className="cli-btn" onClick={onClose}>exit</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cli-overlay-terminal" style={{ maxWidth: '840px', width: '98%' }}>
      <div className="cli-overlay-header">
        <div className="cli-overlay-title">
          <span className="cli-prompt">berabundle$</span> <span className="cli-overlay-command">swap --tokens {validTokens.length}</span>
        </div>
        <button className="cli-overlay-close" onClick={onClose}>&times;</button>
      </div>

      <div className="cli-overlay-content">
        <div className="swap-instruction" style={{ marginBottom: '20px', color: '#aaa', textAlign: 'left' }}>
          # Enter amount for each token you want to swap
        </div>

        <div className="cli-table" style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
          {/* Table header row with enhanced layout - added approved amount column */}
          <div className="cli-table-header">
            <div className="cli-header-cell token-symbol" style={{textAlign: 'center'}}>TOKEN</div>
            <div className="cli-header-cell token-balance" style={{textAlign: 'center'}}>AMOUNT</div>
            <div className="cli-header-cell token-value" style={{textAlign: 'center'}}>VALUE</div>
            <div className="cli-header-cell token-approved" style={{textAlign: 'center'}}>APPROVED</div>
            <div className="cli-header-cell token-actions" style={{textAlign: 'center'}}>ACTIONS</div>
          </div>
          
          {validTokens.map(token => (
            <div 
              key={token.address} 
              className={`cli-row ${swapAmounts[token.address]?.isValid ? 'selected' : ''}`}
            >
              <div className="cli-cell token-symbol">
                {token.symbol}
              </div>
              
              <div className="cli-cell token-balance">
                <input
                  type="text"
                  value={swapAmounts[token.address]?.rawInput || ''}
                  onChange={(e) => handleAmountChange(token, e.target.value, false)}
                  // No longer checking approval on blur
                  onBlur={(e) => {}}
                  className={`cli-amount-input ${swapAmounts[token.address]?.isValid ? 'valid' : ''}`}
                />
                <div style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
                  <span 
                    className="cli-command-option" 
                    onClick={() => handlePercentClick(token, 100)}
                  >
                    --max
                  </span>
                  <span 
                    className="cli-command-option" 
                    onClick={() => handlePercentClick(token, 0)}
                  >
                    --none
                  </span>
                </div>
              </div>
              
              <div className="cli-cell token-value amount-cell">
                {swapAmounts[token.address]?.isValid && swapAmounts[token.address]?.valueUsd > 0 
                  ? `$${swapAmounts[token.address].valueUsd.toFixed(2)}`
                  : '-'
                }
              </div>
              
              {/* Approved Amount Column */}
              <div className="cli-cell token-approved approved-amount">
                {/* For BERA or native token, no approval needed */}
                {token.isNative || token.address === 'native' || token.symbol === 'BERA' ? (
                  <span style={{ color: '#55bb55' }}>✓ Native</span>
                ) : approvalStatus[token.address]?.checking ? (
                  <span style={{ color: '#888' }}>Checking...</span>
                ) : approvalStatus[token.address]?.approving ? (
                  <span style={{ color: '#888' }}>Approving...</span>
                ) : approvalStatus[token.address]?.revoking ? (
                  <span style={{ color: '#888' }}>Revoking...</span>
                ) : (
                  <span style={{
                    color: isApprovalSufficient(token) ? '#55bb55' : '#ff6666'
                  }}>
                    {approvalStatus[token.address]?.approvalUsdValue ? 
                      `$${approvalStatus[token.address].approvalUsdValue}` : 
                      (approvalStatus[token.address]?.isApproved ? '✓ Approved' : '⨯ Not approved')}
                  </span>
                )}
              </div>
              
              {/* Approval Actions Column */}
              <div className="cli-cell token-actions">
                {/* For BERA or native token, no approval actions needed */}
                {!(token.isNative || token.address === 'native' || token.symbol === 'BERA') && 
                 approvalStatus[token.address] && 
                 !approvalStatus[token.address].checking && 
                 !approvalStatus[token.address].approving && 
                 !approvalStatus[token.address].revoking && (
                  <>
                    {/* Standard Approval Action Buttons */}
                    {!approvalStatus[token.address].approvingAmount && 
                     !approvalStatus[token.address].revokingApproval && (
                      <div className="approval-actions">
                        <button 
                          className="approval-action-btn approve"
                          onClick={() => {
                            // Track approval amount input mode
                            setApprovalStatus(prev => ({
                              ...prev,
                              [token.address]: {
                                ...prev[token.address],
                                approvingAmount: true,
                                approvalAmountInput: maxApprovalUsd || "50"
                              }
                            }));
                          }}
                        >
                          Approve More
                        </button>
                        
                        <button
                          className="approval-action-btn revoke"
                          onClick={() => {
                            // Track revocation input mode
                            setApprovalStatus(prev => ({
                              ...prev,
                              [token.address]: {
                                ...prev[token.address],
                                revokingApproval: true
                              }
                            }));
                          }}
                        >
                          Revoke
                        </button>
                      </div>
                    )}
                    
                    {/* Approval Amount Input */}
                    {approvalStatus[token.address].approvingAmount && (
                      <div className="approval-input-container">
                        <span className="approval-symbol">$</span>
                        <input
                          type="text"
                          className="approval-input"
                          value={approvalStatus[token.address].approvalAmountInput || "50"}
                          onChange={(e) => {
                            setApprovalStatus(prev => ({
                              ...prev,
                              [token.address]: {
                                ...prev[token.address],
                                approvalAmountInput: e.target.value
                              }
                            }));
                          }}
                        />
                        <button
                          className="approval-confirm"
                          onClick={() => {
                            // Use the entered amount for approval
                            handleApproveToken(token, approvalStatus[token.address].approvalAmountInput);
                            
                            // Exit approval input mode
                            setApprovalStatus(prev => ({
                              ...prev,
                              [token.address]: {
                                ...prev[token.address],
                                approvingAmount: false
                              }
                            }));
                          }}
                        >
                          Ok
                        </button>
                        <button
                          className="approval-action-btn"
                          onClick={() => {
                            // Cancel approval input
                            setApprovalStatus(prev => ({
                              ...prev,
                              [token.address]: {
                                ...prev[token.address],
                                approvingAmount: false
                              }
                            }));
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    
                    {/* Revoke Confirmation */}
                    {approvalStatus[token.address].revokingApproval && (
                      <div className="approval-input-container">
                        <span style={{ fontSize: '0.8rem', color: '#ff6666' }}>
                          Confirm:
                        </span>
                        <button
                          className="approval-confirm revoke"
                          onClick={() => {
                            // Revoke approval
                            handleRevokeToken(token);
                            
                            // Exit revoke mode
                            setApprovalStatus(prev => ({
                              ...prev,
                              [token.address]: {
                                ...prev[token.address],
                                revokingApproval: false
                              }
                            }));
                          }}
                        >
                          Revoke
                        </button>
                        <button
                          className="approval-action-btn"
                          onClick={() => {
                            // Cancel revocation
                            setApprovalStatus(prev => ({
                              ...prev,
                              [token.address]: {
                                ...prev[token.address],
                                revokingApproval: false
                              }
                            }));
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  
                    {/* Error Message */}
                    {approvalStatus[token.address].error && (
                      <div style={{ color: '#dd5555', fontSize: '0.8rem', marginTop: '4px' }}>
                        Error: {approvalStatus[token.address].error.substring(0, 40)}...
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="cli-error" style={{margin: '10px 0'}}>
            Error: {error}
          </div>
        )}

        <div className="cli-swap-summary" style={{ width: '95%', maxWidth: '500px', margin: '20px auto' }}>
          <div className="cli-summary-line" style={{ display: 'flex', justifyContent: 'space-between', margin: '5px 0' }}>
            <span className="cli-summary-label" style={{ flex: '0 0 130px' }}>Total Value:</span>
            <span className="cli-summary-value" style={{ textAlign: 'left' }}>
              ${totalValueUsd.toFixed(2)}
            </span>
          </div>
          
          <div className="cli-summary-line" style={{ display: 'flex', alignItems: 'center', margin: '5px 0' }}>
            <span className="cli-summary-label" style={{ flex: '0 0 130px' }}>Target Token:</span>
            <div style={{ textAlign: 'left' }}>
              <select
                className="cli-select"
                value={targetToken.address}
                onChange={handleTargetTokenChange}
                style={{
                  padding: '2px 6px', 
                  background: '#333',
                  color: '#fff',
                  border: '1px solid #666',
                  borderRadius: '3px',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                  maxWidth: '200px'
                }}
              >
                {isLoadingTokens ? (
                  <option value="">Loading tokens...</option>
                ) : (
                  availableTokens.map(token => (
                    <option key={token.address} value={token.address}>
                      {token.symbol}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
          
          <div className="cli-summary-line" style={{ display: 'flex', justifyContent: 'space-between', margin: '5px 0' }}>
            <span className="cli-summary-label" style={{ flex: '0 0 130px' }}>Estimated Output:</span>
            <span className="cli-summary-value" style={{ textAlign: 'left' }}>
              {estimatedOutput.toFixed(3)} {targetToken.symbol}
            </span>
          </div>
        </div>

        <div className="swap-actions">
          <div className="cli-command-row">
            <span className="cli-prompt">berabundle$</span> 
            <button 
              className="cli-btn cli-btn-swap" 
              onClick={handleSwap}
              disabled={!isValid}
            >
              execute-swap
            </button>
            <button 
              className="cli-btn" 
              onClick={onClose}
            >
              cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SwapForm;