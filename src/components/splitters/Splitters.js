import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalToolBar } from '../../global';
import { ethers } from "ethers";
import './Splitters.css';

export default function Splitters({ 
    factoryContract,
    address, 
    isConnected,
    onSelectSplitter
}) {
    const navigate = useNavigate();
    const [userSplitters, setUserSplitters] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    
    // Create splitter form states
    const [memberAddresses, setMemberAddresses] = useState('');
    const [creating, setCreating] = useState(false);

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
            
            // Load metadata for each splitter
            const splittersWithInfo = await Promise.all(
                splitters.map(async (splitterAddress) => {
                    try {
                        const info = await factoryContract.getSplitterInfo(splitterAddress);
                        return {
                            address: splitterAddress,
                            creator: info.creator || info[0],
                            createdAt: info.createdAt || info[1],
                            members: info.members || info[2]
                        };
                    } catch (err) {
                        console.error(`Error loading info for splitter ${splitterAddress}:`, err);
                        return {
                            address: splitterAddress,
                            creator: 'Unknown',
                            createdAt: 0,
                            members: []
                        };
                    }
                })
            );

            setUserSplitters(splittersWithInfo);
        } catch (err) {
            console.error("Error loading splitters:", err);
            setError("Failed to load your splitters");
        } finally {
            setLoading(false);
        }
    }, [factoryContract, address, loadUserSplitters]);

    useEffect(() => {
        if (factoryContract && address) {
            loadUserSplitters();
        }
    }, [factoryContract, address, loadUserSplitters]);

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
                    <h2>Your Splitters</h2>
                    
                    {loading && <p>Loading your splitters...</p>}
                    
                    {!loading && userSplitters.length === 0 && (
                        <div className="empty-state">
                            <p>You don't have any expense splitters yet.</p>
                            <p>Create one to start splitting expenses with your group!</p>
                        </div>
                    )}
                    
                    {!loading && userSplitters.length > 0 && (
                        <div className="splitters-grid">
                            {userSplitters.map((splitter, index) => (
                                <div key={index} className="splitter-card">
                                    <div className="splitter-header">
                                        <h3>Splitter #{index + 1}</h3>
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
                                    
                                    <button 
                                        onClick={() => handleSelectSplitter(splitter.address)}
                                        className="button button-primary"
                                    >
                                        Open Splitter
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
