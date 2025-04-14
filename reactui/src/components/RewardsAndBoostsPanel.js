import React, { useState, useEffect } from 'react';
import CliRewardsList from './CliRewardsList';
import CliValidatorBoosts from './CliValidatorBoosts';
import ClaimSummaryOverlay from './ClaimSummaryOverlay';
import rewardsService from '../services/RewardsService';
import './CliRewardsList.css';

/**
 * Unified rewards and validator boosts panel
 * 
 * This component combines both the rewards list and validator boosts
 * into a single interface for a comprehensive rewards experience.
 * 
 * @param {Object} props Component props
 * @param {string} props.walletAddress User's wallet address
 * @param {Object} props.provider Ethers provider for blockchain access
 */
function RewardsAndBoostsPanel({ walletAddress, provider }) {
  // States
  const [rewards, setRewards] = useState([]);
  const [validatorBoosts, setValidatorBoosts] = useState({
    activeBoosts: [],
    queuedBoosts: []
  });
  const [selectedRewards, setSelectedRewards] = useState([]);
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);
  const [isLoadingBoosts, setIsLoadingBoosts] = useState(false);
  const [rewardsError, setRewardsError] = useState(null);
  const [boostsError, setBoostsError] = useState(null);
  const [showClaimOverlay, setShowClaimOverlay] = useState(false);
  
  // Active tab state
  const [activeTab, setActiveTab] = useState('rewards'); // 'rewards' or 'boosts'
  
  // Load rewards when wallet address changes
  useEffect(() => {
    if (walletAddress) {
      loadRewards();
      loadValidatorBoosts();
    }
  }, [walletAddress]);
  
  // Load rewards from backend
  const loadRewards = async () => {
    if (!walletAddress) return;
    
    setIsLoadingRewards(true);
    setRewardsError(null);
    
    try {
      // Check if service is initialized
      if (!rewardsService.isInitialized() && provider) {
        const apiKey = localStorage.getItem('oogabooga_api_key');
        rewardsService.initialize(provider, apiKey);
      }
      
      const result = await rewardsService.checkRewards(walletAddress);
      
      if (result.success) {
        setRewards(result.rewards || []);
      } else {
        setRewardsError(result.error);
      }
    } catch (error) {
      console.error("Error loading rewards:", error);
      setRewardsError(error.message || "Failed to load rewards");
    } finally {
      setIsLoadingRewards(false);
    }
  };
  
  // Load validator boosts from backend
  const loadValidatorBoosts = async () => {
    if (!walletAddress) return;
    
    setIsLoadingBoosts(true);
    setBoostsError(null);
    
    try {
      // Check if service is initialized
      if (!rewardsService.isInitialized() && provider) {
        const apiKey = localStorage.getItem('oogabooga_api_key');
        rewardsService.initialize(provider, apiKey);
      }
      
      const result = await rewardsService.checkValidatorBoosts(walletAddress);
      
      if (result.error) {
        setBoostsError(result.error);
      } else {
        setValidatorBoosts(result);
      }
    } catch (error) {
      console.error("Error loading validator boosts:", error);
      setBoostsError(error.message || "Failed to load validator boosts");
    } finally {
      setIsLoadingBoosts(false);
    }
  };
  
  // Handle reward selection for claiming
  const handleRewardsSelected = (selected) => {
    setSelectedRewards(selected);
  };
  
  // Proceed to claim rewards
  const handleClaimRewards = () => {
    if (selectedRewards.length > 0) {
      setShowClaimOverlay(true);
    }
  };
  
  // Execute the claim transaction
  const executeClaim = async () => {
    setShowClaimOverlay(false);
    
    // TODO: Implement the actual claim logic
    // This will be wired up to actually use the claimRewards function from the service
    try {
      const result = await rewardsService.claimRewards(walletAddress, selectedRewards);
      if (result.success) {
        // Refresh data after claiming
        loadRewards();
        loadValidatorBoosts();
      } else {
        setRewardsError(result.error);
      }
    } catch (error) {
      console.error("Error claiming rewards:", error);
      setRewardsError(error.message || "Failed to claim rewards");
    }
  };
  
  // Refresh all data
  const refreshAll = () => {
    loadRewards();
    loadValidatorBoosts();
  };
  
  return (
    <div className="rewards-panel">
      {/* Tab Navigation */}
      <div className="cli-tabs">
        <div 
          className={`cli-tab ${activeTab === 'rewards' ? 'active' : ''}`}
          onClick={() => setActiveTab('rewards')}
        >
          <span className="cli-prompt">berabundle$</span> rewards
        </div>
        <div 
          className={`cli-tab ${activeTab === 'boosts' ? 'active' : ''}`}
          onClick={() => setActiveTab('boosts')}
        >
          <span className="cli-prompt">berabundle$</span> validator-boosts
        </div>
        
        {/* Refresh button */}
        <div className="cli-tab-actions">
          <button 
            className="cli-btn"
            onClick={refreshAll}
            disabled={isLoadingRewards || isLoadingBoosts}
          >
            refresh
          </button>
        </div>
      </div>
      
      {/* Tab Content */}
      <div className="cli-tab-content">
        {activeTab === 'rewards' && (
          <>
            <CliRewardsList 
              rewards={rewards}
              loading={isLoadingRewards}
              error={rewardsError}
              onClaimSelected={handleRewardsSelected}
            />
            
            {selectedRewards.length > 0 && (
              <div className="cli-command-row claim-row">
                <span className="cli-prompt">berabundle$</span>
                <button 
                  className="cli-btn cli-btn-claim"
                  onClick={handleClaimRewards}
                >
                  claim-rewards --count {selectedRewards.length}
                </button>
              </div>
            )}
          </>
        )}
        
        {activeTab === 'boosts' && (
          <CliValidatorBoosts 
            validatorBoosts={validatorBoosts}
            loading={isLoadingBoosts}
            error={boostsError}
          />
        )}
      </div>
      
      {/* Claim Overlay */}
      <ClaimSummaryOverlay
        isOpen={showClaimOverlay}
        onClose={() => setShowClaimOverlay(false)}
        selectedRewards={selectedRewards}
        onProceed={executeClaim}
      />
    </div>
  );
}

export default RewardsAndBoostsPanel;