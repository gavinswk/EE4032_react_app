import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalToolBar } from '../../global';
import { ethers } from "ethers";
import { SPLITTER_ABI } from '../../contracts/config';
import './Splitters.css';

export default function Splitters({ 
    factoryContract,
    address, 
    isConnected,
    onSelectSplitter
}) {
    const navigate = useNavigate();
    const [userSplitters, setUserSplitters] = useState([]);
    const [activeSplitters, setActiveSplitters] = useState([]);
    const [finalizedSplitters, setFinalizedSplitters] = useState([]);
    const [showFinalized, setShowFinalized] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    
    // Create splitter form states
    const [memberAddresses, setMemberAddresses] = useState('');
    const [creating, setCreating] = useState(false);
    
    // Editable name states
    const [editingName, setEditingName] = useState({});
    const [splitterNames, setSplitterNames] = useState({});
    
    // Final settlement states
    const [settlementLoading, setSettlementLoading] = useState({});
    const [showSettlementConfirm, setShowSettlementConfirm] = useState({});

    useEffect(() => {
        if (!isConnected) {
            navigate('/login');
        }
    }, [isConnected, navigate]);

    const loadUserSplitters = useCallback(async () => {
        if (!factoryContract || !address) return;

        try {
            setLoading(true);
            setError(null);

            const splitters = await factoryContract.getUserSplitters(address);
            
            // Load metadata and finalization status for each splitter
            const splittersWithInfo = await Promise.all(
                splitters.map(async (splitterAddress) => {
                    try {
                        const info = await factoryContract.getSplitterInfo(splitterAddress);
                        
                        // Check if splitter is finalized
                        const provider = new ethers.providers.Web3Provider(window.ethereum);
                        const splitterContract = new ethers.Contract(splitterAddress, SPLITTER_ABI, provider);
                        
                        // Get current state
                        const totalFunds = await splitterContract.totalPooledFunds();
                        const contractBalance = await splitterContract.getContractBalance();
                        
                        // A splitter is considered finalized if:
                        // 1. Total pooled funds is 0 AND contract balance is 0 AND
                        // 2. The contract balance has been non-zero at some point (indicating it was used)
                        // We can check this by seeing if totalPooledFunds is 0 but there's transaction history
                        
                        // Simple heuristic: if both total funds and contract balance are 0,
                        // and the splitter was created more than 5 minutes ago, check if it ever had funds
                        const createdAt = info.createdAt || info[1] || 0;
                        const now = Math.floor(Date.now() / 1000);
                        const ageInMinutes = (now - parseInt(createdAt)) / 60;
                        
                        let isFinalized = false;
                        
                        if (totalFunds.eq(0) && contractBalance.eq(0) && ageInMinutes > 5) {
                            // For older contracts with no funds, we need to determine if they were ever used
                            // Check if this is a fresh contract by looking at next expense ID
                            try {
                                const nextExpenseId = await splitterContract.getNextExpenseId();
                                // If nextExpenseId > 1, it means expenses were created, so it was used
                                // If any member has a non-zero balance, it was used
                                
                                let hasBeenUsed = nextExpenseId.gt(1);
                                
                                if (!hasBeenUsed) {
                                    // Quick check: see if any member has any deposit history
                                    const members = info.members || info[2] || [];
                                    for (let i = 0; i < Math.min(members.length, 3); i++) { // Check first 3 members only for performance
                                        const memberBalance = await splitterContract.getMemberBalance(members[i]);
                                        if (memberBalance.gt(0)) {
                                            hasBeenUsed = true;
                                            break;
                                        }
                                    }
                                }
                                
                                isFinalized = hasBeenUsed;
                            } catch (err) {
                                // If we can't determine usage, assume it's not finalized (keep it active)
                                isFinalized = false;
                            }
                        }
                        
                        return {
                            address: splitterAddress,
                            creator: info.creator || info[0],
                            createdAt: createdAt,
                            members: info.members || info[2] || [],
                            isFinalized: isFinalized
                        };
                    } catch (err) {
                        console.error(`Error loading info for splitter ${splitterAddress}:`, err);
                        return {
                            address: splitterAddress,
                            creator: 'Unknown',
                            createdAt: 0,
                            members: [],
                            isFinalized: false
                        };
                    }
                })
            );

            // Separate active and finalized splitters
            const active = splittersWithInfo.filter(splitter => !splitter.isFinalized);
            const finalized = splittersWithInfo.filter(splitter => splitter.isFinalized);

            setUserSplitters(splittersWithInfo);
            setActiveSplitters(active);
            setFinalizedSplitters(finalized);
        } catch (err) {
            console.error("Error loading splitters:", err);
            setError("Failed to load your splitters");
        } finally {
            setLoading(false);
        }
    }, [factoryContract, address]);

    useEffect(() => {
        if (factoryContract && address) {
            loadUserSplitters();
        }
    }, [factoryContract, address, loadUserSplitters]);

    // Load saved splitter names from localStorage
    useEffect(() => {
        const savedNames = localStorage.getItem('splitterNames');
        if (savedNames) {
            setSplitterNames(JSON.parse(savedNames));
        }
    }, []);

    // Save splitter names to localStorage
    const saveSplitterNames = (names) => {
        localStorage.setItem('splitterNames', JSON.stringify(names));
        setSplitterNames(names);
    };

    // Handle name editing
    const handleNameEdit = (splitterAddress, newName) => {
        const updatedNames = {
            ...splitterNames,
            [splitterAddress]: newName
        };
        saveSplitterNames(updatedNames);
        setEditingName({ ...editingName, [splitterAddress]: false });
    };

    // Handle final settlement
    const handleFinalSettlement = async (splitterAddress) => {
        try {
            setSettlementLoading({ ...settlementLoading, [splitterAddress]: true });
            setError(null);

            // Check if we have a valid provider
            if (!window.ethereum) {
                throw new Error("No Web3 provider found. Please install MetaMask.");
            }

            // Get the splitter contract instance
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();
            
            // Use the proper SPLITTER_ABI instead of manual ABI
            const splitterContract = new ethers.Contract(
                splitterAddress,
                SPLITTER_ABI,
                signer
            );

            // Verify the contract is valid by calling a view function
            try {
                await splitterContract.getAllMembers();
            } catch (contractError) {
                throw new Error("Invalid contract address or contract not deployed");
            }

            // Check if user is a member
            const isMemberResult = await splitterContract.isMember(address);
            if (!isMemberResult) {
                throw new Error("You must be a member to initiate final settlement");
            }

            // Check if there are funds to settle
            const totalFunds = await splitterContract.totalPooledFunds();
            if (totalFunds.eq(0)) {
                throw new Error("No funds available for settlement");
            }

            // Execute final settlement
            const tx = await splitterContract.finalSettlement();
            await tx.wait();

            // Refresh the splitters list
            await loadUserSplitters();
            
            setShowSettlementConfirm({ ...showSettlementConfirm, [splitterAddress]: false });
            
            // Switch to finalized tab to show the newly finalized splitter
            setShowFinalized(true);
            
            alert("Final settlement completed successfully! All funds have been distributed to members. The splitter has been moved to the 'Finalized' tab.");

        } catch (err) {
            console.error("Final settlement error:", err);
            setError(`Final settlement failed: ${err.message}`);
        } finally {
            setSettlementLoading({ ...settlementLoading, [splitterAddress]: false });
        }
    };

    const handleCreateSplitter = async (e) => {
        e.preventDefault();
        
        if (!factoryContract || !address) {
            setError("Factory contract not initialized");
            return;
        }

        try {
            setCreating(true);
            setError(null);

            // Parse member addresses
            const addresses = memberAddresses
                .split(',')
                .map(addr => addr.trim())
                .filter(addr => addr.length > 0);

            if (addresses.length === 0) {
                setError("Please enter at least one member address");
                return;
            }

            // Check if user included themselves
            const userIncluded = addresses.some(addr => addr.toLowerCase() === address.toLowerCase());
            if (!userIncluded) {
                // Automatically add the user
                addresses.unshift(address);
            }

            // Validate addresses
            for (const addr of addresses) {
                if (!ethers.utils.isAddress(addr)) {
                    setError(`Invalid Ethereum address: ${addr}`);
                    return;
                }
            }

            // Create the splitter (ethers.js syntax)
            const tx = await factoryContract.createSplitter(addresses);
            const receipt = await tx.wait();

            console.log("Splitter created:", receipt);
            
            // Refresh the list
            await loadUserSplitters();
            
            // Reset form
            setMemberAddresses('');
            setShowCreateForm(false);
            
        } catch (err) {
            console.error("Error creating splitter:", err);
            setError(err.message || "Failed to create splitter");
        } finally {
            setCreating(false);
        }
    };

    const handleSelectSplitter = (splitterAddress) => {
        onSelectSplitter(splitterAddress);
        navigate('/dashboard');
    };

    const formatDate = (timestamp) => {
        if (!timestamp || timestamp === 0) return 'Unknown';
        return new Date(parseInt(timestamp) * 1000).toLocaleDateString();
    };

    const formatAddress = (addr) => {
        if (!addr) return '';
        return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    };

    return (
        <div>
            <GlobalToolBar />
            <div className="page-container">
                <div className="dashboard-header">
                    <h1>Your Expense Splitters</h1>
                    <button 
                        onClick={() => setShowCreateForm(!showCreateForm)} 
                        className="button"
                    >
                        {showCreateForm ? '❌ Cancel' : '➕ Create New Splitter'}
                    </button>
                </div>

                {error && (
                    <div className="error-message">
                        <p>{error}</p>
                    </div>
                )}

                {showCreateForm && (
                    <div className="card">
                        <h2>Create New Expense Splitter</h2>
                        <form onSubmit={handleCreateSplitter}>
                            <div className="form-group">
                                <label>Member Addresses (comma-separated)</label>
                                <textarea
                                    value={memberAddresses}
                                    onChange={(e) => setMemberAddresses(e.target.value)}
                                    placeholder="0x123..., 0x456..., 0x789..."
                                    rows="4"
                                    required
                                />
                                <small>
                                    Enter Ethereum addresses separated by commas. 
                                    Your address ({formatAddress(address)}) will be included automatically if not present.
                                </small>
                            </div>
                            
                            <button 
                                type="submit" 
                                className="button" 
                                disabled={creating || !memberAddresses.trim()}
                            >
                                {creating ? 'Creating...' : 'Create Splitter'}
                            </button>
                        </form>
                    </div>
                )}

                <div className="card">
                    <div className="splitters-header">
                        <div className="splitters-tabs">
                            <button 
                                className={`tab ${!showFinalized ? 'active' : ''}`}
                                onClick={() => setShowFinalized(false)}
                            >
                                Active Splitters ({activeSplitters.length})
                            </button>
                            <button 
                                className={`tab ${showFinalized ? 'active' : ''}`}
                                onClick={() => setShowFinalized(true)}
                            >
                                Finalized Splitters ({finalizedSplitters.length})
                            </button>
                        </div>
                    </div>
                    
                    {loading && <p>Loading your splitters...</p>}
                    
                    {!loading && !showFinalized && activeSplitters.length === 0 && (
                        <div className="empty-state">
                            <p>You don't have any active expense splitters yet.</p>
                            <p>Create one to start splitting expenses with your group!</p>
                        </div>
                    )}
                    
                    {!loading && showFinalized && finalizedSplitters.length === 0 && (
                        <div className="empty-state">
                            <p>You don't have any finalized splitters yet.</p>
                            <p>Finalized splitters will appear here after settlement.</p>
                        </div>
                    )}
                    
                    {!loading && (showFinalized ? finalizedSplitters : activeSplitters).length > 0 && (
                        <div className="splitters-grid">
                            {(showFinalized ? finalizedSplitters : activeSplitters).map((splitter, index) => (
                                <div key={index} className={`splitter-card ${splitter.isFinalized ? 'finalized' : ''}`}>
                                    <div className="splitter-header">
                                        {splitter.isFinalized && <span className="finalized-badge">✅ Finalized</span>}
                                        {editingName[splitter.address] ? (
                                            <input
                                                type="text"
                                                className="editable-name-input"
                                                defaultValue={splitterNames[splitter.address] || `Splitter #${index + 1}`}
                                                onBlur={(e) => handleNameEdit(splitter.address, e.target.value)}
                                                onKeyPress={(e) => {
                                                    if (e.key === 'Enter') {
                                                        handleNameEdit(splitter.address, e.target.value);
                                                    }
                                                }}
                                                autoFocus
                                            />
                                        ) : (
                                            <h3 
                                                className="editable-name"
                                                onClick={() => setEditingName({ ...editingName, [splitter.address]: true })}
                                                title="Click to edit name"
                                            >
                                                {splitterNames[splitter.address] || `Splitter #${index + 1}`}
                                                <span className="edit-icon">✏️</span>
                                            </h3>
                                        )}
                                        <span className="splitter-date">
                                            Created: {formatDate(splitter.createdAt)}
                                        </span>
                                    </div>
                                    
                                    <div className="splitter-info">
                                        <div className="info-row">
                                            <span className="info-label">Address:</span>
                                            <span className="info-value address-text" title={splitter.address}>
                                                {formatAddress(splitter.address)}
                                            </span>
                                        </div>
                                        
                                        <div className="info-row">
                                            <span className="info-label">Creator:</span>
                                            <span className="info-value address-text" title={splitter.creator}>
                                                {formatAddress(splitter.creator)}
                                                {splitter.creator && splitter.creator.toLowerCase() === address.toLowerCase() && 
                                                    <span className="badge">You</span>
                                                }
                                            </span>
                                        </div>
                                        
                                        <div className="info-row">
                                            <span className="info-label">Members:</span>
                                            <span className="info-value">{splitter.members.length}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="splitter-actions">
                                        <button 
                                            onClick={() => handleSelectSplitter(splitter.address)}
                                            className="button button-primary"
                                        >
                                            {splitter.isFinalized ? '👁️ View History' : 'Open Splitter'}
                                        </button>
                                        
                                        {!splitter.isFinalized && splitter.creator && splitter.creator.toLowerCase() === address.toLowerCase() && (
                                            <button 
                                                onClick={() => setShowSettlementConfirm({ ...showSettlementConfirm, [splitter.address]: true })}
                                                className="button button-danger"
                                                disabled={settlementLoading[splitter.address]}
                                            >
                                                {settlementLoading[splitter.address] ? 'Settling...' : '⚠️ Final Settlement'}
                                            </button>
                                        )}
                                    </div>
                                    
                                    {/* Final Settlement Confirmation Modal - Only show for active splitters */}
                                    {!splitter.isFinalized && showSettlementConfirm[splitter.address] && (
                                        <div className="settlement-modal">
                                            <div className="settlement-modal-content">
                                                <h3>⚠️ Final Settlement</h3>
                                                <p>This will distribute all remaining funds to group members and effectively close this splitter.</p>
                                                <p><strong>This action cannot be undone!</strong></p>
                                                <div className="settlement-actions">
                                                    <button 
                                                        onClick={() => handleFinalSettlement(splitter.address)}
                                                        className="button button-danger"
                                                        disabled={settlementLoading[splitter.address]}
                                                    >
                                                        {settlementLoading[splitter.address] ? 'Processing...' : 'Confirm Settlement'}
                                                    </button>
                                                    <button 
                                                        onClick={() => setShowSettlementConfirm({ ...showSettlementConfirm, [splitter.address]: false })}
                                                        className="button button-secondary"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}