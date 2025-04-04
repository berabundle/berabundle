import React, { useState, useMemo } from 'react';
import './CliTokenList.css';

/**
 * CLI-like component to display a list of tokens with their balances and values
 * 
 * @param {Object} props Component props
 * @param {Array} props.tokens Array of token objects with balance info
 * @param {string} props.totalValueUsd Total portfolio value in USD
 * @param {string} props.totalValueNative Total portfolio value in native currency
 * @param {boolean} props.loading Whether data is loading
 * @param {string} props.error Error message to display
 * @param {boolean} props.selectable Whether tokens can be selected
 * @param {Function} props.onTokenSelect Callback when tokens are selected
 */
function CliTokenList({ 
  tokens, 
  totalValueUsd, 
  totalValueNative, 
  loading, 
  error, 
  selectable = true,
  onTokenSelect = () => {}
}) {
  const [selectedTokens, setSelectedTokens] = useState({});
  const [sortConfig, setSortConfig] = useState({
    key: 'valueUsd',
    direction: 'desc'
  });
  
  // All tokens are now selectable
  const selectableTokens = useMemo(() => {
    return tokens;
  }, [tokens]);
  
  // Sort tokens
  const sortedTokens = useMemo(() => {
    // Create a copy of tokens to avoid modifying the original
    const sortableTokens = [...tokens];
    
    // Define the sort function
    sortableTokens.sort((a, b) => {
      // Put native token (BERA) at the top regardless of sort
      if (a.isNative || a.address === 'native') return -1;
      if (b.isNative || b.address === 'native') return 1;
      
      // For value sorting, treat missing values as zero
      if (sortConfig.key === 'valueUsd') {
        const aValue = a.valueUsd || 0;
        const bValue = b.valueUsd || 0;
        
        return sortConfig.direction === 'asc'
          ? aValue - bValue
          : bValue - aValue;
      }
      
      // For other numeric fields
      if (sortConfig.key === 'balance' || sortConfig.key === 'priceUsd') {
        const aValue = parseFloat(a[sortConfig.key] || 0);
        const bValue = parseFloat(b[sortConfig.key] || 0);
        
        return sortConfig.direction === 'asc'
          ? aValue - bValue
          : bValue - aValue;
      }
      
      // For string values (like symbol)
      const aValue = a[sortConfig.key] || '';
      const bValue = b[sortConfig.key] || '';
      
      return sortConfig.direction === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    });
    
    return sortableTokens;
  }, [tokens, sortConfig]);
  
  // Handle sorting
  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };
  
  // Get sort indicator
  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };
  
  // Handle token selection
  const handleTokenSelect = (token) => {
    const tokenKey = token.address || 'native';
    
    const newSelections = { ...selectedTokens };
    newSelections[tokenKey] = !newSelections[tokenKey];
    setSelectedTokens(newSelections);
    
    notifyParent(newSelections);
  };
  
  // Select all tokens
  const handleSelectAll = () => {
    const newSelections = { ...selectedTokens };
    selectableTokens.forEach(token => {
      newSelections[token.address] = true;
    });
    setSelectedTokens(newSelections);
    
    notifyParent(newSelections);
  };
  
  // Deselect all tokens
  const handleSelectNone = () => {
    setSelectedTokens({});
    onTokenSelect([]);
  };
  
  // Invert selection
  const handleInvertSelection = () => {
    const newSelections = { ...selectedTokens };
    selectableTokens.forEach(token => {
      newSelections[token.address] = !newSelections[token.address];
    });
    setSelectedTokens(newSelections);
    
    notifyParent(newSelections);
  };
  
  // Notify parent component about selection changes
  const notifyParent = (selections) => {
    const selectedTokensList = Object.entries(selections)
      .filter(([_, isSelected]) => isSelected)
      .map(([address]) => {
        if (address === 'native') {
          return tokens.find(t => t.isNative || t.address === 'native');
        }
        return tokens.find(t => t.address === address);
      })
      .filter(t => t);
      
    onTokenSelect(selectedTokensList);
  };

  // If loading, show a spinner
  if (loading) {
    return (
      <div className="cli-terminal">
        <div className="cli-header">
          <span className="cli-prompt">berabundle$</span> token-list
        </div>
        <div className="cli-content">
          <p>Loading token balances...</p>
          <div className="cli-loader"></div>
        </div>
      </div>
    );
  }
  
  // If error, show error message
  if (error) {
    return (
      <div className="cli-terminal">
        <div className="cli-header">
          <span className="cli-prompt">berabundle$</span> token-list
        </div>
        <div className="cli-content">
          <p className="cli-error">Error: {error}</p>
        </div>
      </div>
    );
  }
  
  // If no tokens, show empty message
  if (!tokens || tokens.length === 0) {
    return (
      <div className="cli-terminal">
        <div className="cli-header">
          <span className="cli-prompt">berabundle$</span> token-list
        </div>
        <div className="cli-content">
          <p>No tokens found with non-zero balance.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="cli-terminal">
      <div className="cli-header">
        <div className="cli-header-commands">
          <div className="cli-header-main">
            <span className="cli-prompt">berabundle$</span> token-list --balances
          </div>
          {selectableTokens.length > 0 && (
            <div className="cli-header-selection">
              <span className="cli-action">select</span>
              <span 
                className="cli-command-option" 
                onClick={handleSelectAll}
                title="Select all tokens"
              >--all</span> | 
              <span 
                className="cli-command-option" 
                onClick={handleSelectNone}
                title="Deselect all tokens"
              >--none</span> | 
              <span 
                className="cli-command-option" 
                onClick={handleInvertSelection}
                title="Invert selection"
              >--invert</span>
            </div>
          )}
        </div>
      </div>
      <div className="cli-content">
        
        <div className="cli-table">
          {/* Table Header */}
          <div className="cli-table-header">
            <div 
              className="cli-header-cell token-symbol"
              onClick={() => requestSort('symbol')}
            >
              TOKEN{getSortIndicator('symbol')}
            </div>
            <div 
              className="cli-header-cell token-balance"
              onClick={() => requestSort('balance')}
            >
              AMOUNT{getSortIndicator('balance')}
            </div>
            <div 
              className="cli-header-cell token-price"
              onClick={() => requestSort('priceUsd')}
            >
              PRICE{getSortIndicator('priceUsd')}
            </div>
            <div 
              className="cli-header-cell token-value"
              onClick={() => requestSort('valueUsd')}
            >
              TOTAL{getSortIndicator('valueUsd')}
            </div>
          </div>
          
          {/* Table Rows */}
          {sortedTokens.map((token, index) => (
            <div 
              key={token.address || index} 
              className={`cli-row ${token.isNative ? 'native-token' : ''} ${selectedTokens[token.address || 'native'] ? 'selected' : ''}`}
              onClick={() => selectable && handleTokenSelect(token)}
            >
              <div className="cli-cell token-symbol">
                {selectedTokens[token.address || 'native'] ? '[X]' : '[ ]'} {token.symbol}
              </div>
              <div className="cli-cell token-balance">
                {parseFloat(token.balance).toFixed(3)}
              </div>
              <div className="cli-cell token-price">
                {token.priceUsd 
                  ? `$${parseFloat(token.priceUsd).toFixed(3)}`
                  : '-'
                }
              </div>
              <div className="cli-cell token-value">
                {token.valueUsd
                  ? `$${parseFloat(token.valueUsd).toFixed(2)}`
                  : '-'
                }
              </div>
            </div>
          ))}
        </div>
        
        {totalValueUsd && (
          <div className="cli-summary">
            <div className="cli-summary-line">
              <span className="cli-summary-label">Total Value:</span>
              <span className="cli-summary-value">{totalValueUsd}</span>
            </div>
            {totalValueNative && (
              <div className="cli-summary-line">
                <span className="cli-summary-label">Value in BERA:</span>
                <span className="cli-summary-value">{totalValueNative}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CliTokenList;