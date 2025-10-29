import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { GlobalToolBar } from '../../global';
import './Expenses.css';

export default function Expenses({ 
    contract, 
    address, 
    allMembers, 
    nextExpenseId,
    isConnected, 
    isMember,
    refreshData 
}) {
    const [activeTab, setActiveTab] = useState('view'); // 'view' or 'propose'
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    
    // Propose expense form
    const [recipient, setRecipient] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [selectedParticipants, setSelectedParticipants] = useState([]);
    const [participantShares, setParticipantShares] = useState({});
    
    const navigate = useNavigate();

    const loadExpenses = useCallback(async () => {
        if (!contract) return;

        try {
            setLoading(true);
            const expensesList = [];

            // Load all expenses from ID 1 to nextExpenseId
            for (let i = 1; i < nextExpenseId; i++) {
                try {
                    const expense = await contract.getExpenseDetails(i);
                    
                    // Check if user is a participant
                    const isParticipant = expense.participants.some(
                        p => p.toLowerCase() === address.toLowerCase()
                    );
                    
                    // Get user's approval status
                    const hasApproved = await contract.hasApproved(i, address);
                    
                    // Get user's share if participant
                    let userShare = '0';
                    if (isParticipant) {
                        userShare = await contract.getParticipantShare(i, address);
                    }

                    expensesList.push({
                        id: i,
                        recipient: expense.recipient,
                        amount: expense.amount,
                        participants: expense.participants,
                        approvalCount: parseInt(expense.approvalCount),
                        requiredApprovals: parseInt(expense.requiredApprovals),
                        executed: expense.executed,
                        isParticipant,
                        hasApproved,
                        userShare
                    });
                } catch (err) {
                    console.error(`Error loading expense ${i}:`, err);
                }
            }

            setExpenses(expensesList);
        } catch (err) {
            console.error("Error loading expenses:", err);
            setError("Failed to load expenses");
        } finally {
            setLoading(false);
        }
    }, [contract, nextExpenseId, address]);

    const handleProposeExpense = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            if (!contract) {
                throw new Error("Contract not initialized");
            }

            if (!recipient || !ethers.utils.isAddress(recipient)) {
                throw new Error("Invalid recipient address");
            }

            if (!totalAmount || parseFloat(totalAmount) <= 0) {
                throw new Error("Invalid amount");
            }

            if (selectedParticipants.length === 0) {
                throw new Error("Please select at least one participant");
            }

            // Prepare participants and shares arrays
            const participantsArray = selectedParticipants;
            const sharesArray = participantsArray.map(p => 
                ethers.utils.parseEther(participantShares[p] || '0')
            );

            const totalAmountWei = ethers.utils.parseEther(totalAmount);

            // Verify shares sum to total
            const sharesSum = sharesArray.reduce((a, b) => 
                ethers.BigNumber.from(a).add(ethers.BigNumber.from(b)), ethers.BigNumber.from(0)
            );

            if (!sharesSum.eq(totalAmountWei)) {
                throw new Error("Participant shares must sum to total amount");
            }

            const tx = await contract.proposeExpense(
                recipient,
                totalAmountWei,
                participantsArray,
                sharesArray
            );
            await tx.wait();

            setSuccess("Expense proposed successfully!");
            
            // Reset form
            setRecipient('');
            setTotalAmount('');
            setSelectedParticipants([]);
            setParticipantShares({});
            
            // Refresh and switch to view tab
            setTimeout(() => {
                loadExpenses();
                refreshData();
                setActiveTab('view');
            }, 2000);

        } catch (err) {
            console.error("Propose expense error:", err);
            setError(err.message || "Failed to propose expense");
        } finally {
            setLoading(false);
        }
    };

    const handleApproveExpense = async (expenseId) => {
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            if (!contract) {
                throw new Error("Contract not initialized");
            }

            const tx = await contract.approveExpense(expenseId);
            await tx.wait();

            setSuccess(`Expense #${expenseId} approved successfully!`);
            
            setTimeout(() => {
                loadExpenses();
                refreshData();
            }, 2000);

        } catch (err) {
            console.error("Approve expense error:", err);
            setError(err.message || "Failed to approve expense");
        } finally {
            setLoading(false);
        }
    };

    const handleExecuteExpense = async (expenseId) => {
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            if (!contract) {
                throw new Error("Contract not initialized");
            }

            const tx = await contract._executeExpense(expenseId);
            await tx.wait();

            setSuccess(`Expense #${expenseId} executed successfully!`);
            
            setTimeout(() => {
                loadExpenses();
                refreshData();
            }, 2000);

        } catch (err) {
            console.error("Execute expense error:", err);
            setError(err.message || "Failed to execute expense");
        } finally {
            setLoading(false);
        }
    };

    const toggleParticipant = (participant) => {
        if (selectedParticipants.includes(participant)) {
            setSelectedParticipants(selectedParticipants.filter(p => p !== participant));
            const newShares = { ...participantShares };
            delete newShares[participant];
            setParticipantShares(newShares);
        } else {
            setSelectedParticipants([...selectedParticipants, participant]);
        }
    };

    const handleShareChange = (participant, value) => {
        setParticipantShares({
            ...participantShares,
            [participant]: value
        });
    };

    const splitEqually = () => {
        if (selectedParticipants.length === 0 || !totalAmount) return;
        
        const equalShare = (parseFloat(totalAmount) / selectedParticipants.length).toFixed(4);
        const newShares = {};
        selectedParticipants.forEach(p => {
            newShares[p] = equalShare;
        });
        setParticipantShares(newShares);
    };

    useEffect(() => {
        if (!isConnected) {
            navigate('/login');
        }
    }, [isConnected, navigate]);

    useEffect(() => {
        if (contract && isMember) {
            loadExpenses();
        }
    }, [contract, isMember, nextExpenseId, loadExpenses]);

    if (!isMember) {
        return (
            <div>
                <GlobalToolBar />
                <div className="page-container">
                    <div className="error-message">
                        <h3>You are not a member of this expense group</h3>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <GlobalToolBar />
            <div className="page-container">
                <h1>Expenses</h1>

                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                <div className="tabs">
                    <button 
                        className={`tab ${activeTab === 'view' ? 'active' : ''}`}
                        onClick={() => setActiveTab('view')}
                    >
                        View Expenses
                    </button>
                    <button 
                        className={`tab ${activeTab === 'propose' ? 'active' : ''}`}
                        onClick={() => setActiveTab('propose')}
                    >
                        Propose New Expense
                    </button>
                </div>

                {activeTab === 'view' && (
                    <div className="expenses-list">
                        {loading && <div className="loading-spinner"></div>}
                        
                        {!loading && expenses.length === 0 && (
                            <div className="card">
                                <p>No expenses found. Propose one to get started!</p>
                            </div>
                        )}

                        {!loading && expenses.map(expense => (
                            <div key={expense.id} className="expense-card">
                                <div className="expense-header">
                                    <h3>Expense #{expense.id}</h3>
                                    <span className={`status-badge status-${expense.executed ? 'executed' : 'pending'}`}>
                                        {expense.executed ? 'Executed' : 'Pending'}
                                    </span>
                                </div>

                                <div className="expense-details">
                                    <div className="detail-row">
                                        <span>Recipient:</span>
                                        <span className="address-short">{expense.recipient}</span>
                                    </div>
                                    <div className="detail-row">
                                        <span>Total Amount:</span>
                                        <span className="amount">{ethers.utils.formatEther(expense.amount)} ETH</span>
                                    </div>
                                    <div className="detail-row">
                                        <span>Approvals:</span>
                                        <span>{expense.approvalCount} / {expense.requiredApprovals}</span>
                                    </div>
                                    
                                    {expense.isParticipant && (
                                        <div className="detail-row highlight">
                                            <span>Your Share:</span>
                                            <span className="amount">{ethers.utils.formatEther(expense.userShare)} ETH</span>
                                        </div>
                                    )}
                                </div>

                                <div className="expense-actions">
                                    {expense.isParticipant && !expense.hasApproved && !expense.executed && (
                                        <button 
                                            onClick={() => handleApproveExpense(expense.id)}
                                            className="button"
                                            disabled={loading}
                                        >
                                            ✓ Approve
                                        </button>
                                    )}
                                    
                                    {expense.hasApproved && !expense.executed && (
                                        <span className="approved-badge">✓ You've Approved</span>
                                    )}
                                    
                                    {!expense.executed && expense.approvalCount === expense.requiredApprovals && (
                                        <button 
                                            onClick={() => handleExecuteExpense(expense.id)}
                                            className="button button-secondary"
                                            disabled={loading}
                                        >
                                            Execute Payment
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'propose' && (
                    <div className="card">
                        <h2>Propose New Expense</h2>
                        <form onSubmit={handleProposeExpense} className="propose-form">
                            <div className="form-group">
                                <label>Recipient Address</label>
                                <input
                                    type="text"
                                    placeholder="0x..."
                                    value={recipient}
                                    onChange={(e) => setRecipient(e.target.value)}
                                    className="input-field"
                                    disabled={loading}
                                />
                            </div>

                            <div className="form-group">
                                <label>Total Amount (ETH)</label>
                                <input
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    placeholder="0.0"
                                    value={totalAmount}
                                    onChange={(e) => setTotalAmount(e.target.value)}
                                    className="input-field"
                                    disabled={loading}
                                />
                            </div>

                            <div className="form-group">
                                <label>Select Participants</label>
                                <div className="participants-selector">
                                    {allMembers.map((member, index) => (
                                        <div key={index} className="participant-item">
                                            <input
                                                type="checkbox"
                                                id={`member-${index}`}
                                                checked={selectedParticipants.includes(member)}
                                                onChange={() => toggleParticipant(member)}
                                                disabled={loading}
                                            />
                                            <label htmlFor={`member-${index}`}>
                                                {member.slice(0, 6)}...{member.slice(-4)}
                                                {member.toLowerCase() === address.toLowerCase() && ' (You)'}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {selectedParticipants.length > 0 && (
                                <div className="form-group">
                                    <div className="shares-header">
                                        <label>Participant Shares (ETH)</label>
                                        <button 
                                            type="button" 
                                            onClick={splitEqually}
                                            className="button-quick"
                                            disabled={loading}
                                        >
                                            Split Equally
                                        </button>
                                    </div>
                                    
                                    {selectedParticipants.map((participant, index) => (
                                        <div key={index} className="share-input">
                                            <label>
                                                {participant.slice(0, 6)}...{participant.slice(-4)}:
                                            </label>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                min="0"
                                                placeholder="0.0"
                                                value={participantShares[participant] || ''}
                                                onChange={(e) => handleShareChange(participant, e.target.value)}
                                                className="input-field"
                                                disabled={loading}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <button 
                                type="submit" 
                                className="button button-primary"
                                disabled={loading || selectedParticipants.length === 0}
                            >
                                {loading ? 'Processing...' : 'Propose Expense'}
                            </button>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}
