import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { GlobalToolBar } from '../../global';
import useDepositHistory from '../../hooks/useDepositHistory';
import './History.css';

export default function History({ contract, address, isConnected, isMember }) {
    const [expenses, setExpenses] = useState([]);
    const [filter, setFilter] = useState('all'); // 'all', 'executed', 'pending', 'my', 'deposits'
    const [loading, setLoading] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [transactionDetails, setTransactionDetails] = useState(null);
    const navigate = useNavigate();
    
    // Use the deposit history hook
    const { deposits, loading: depositsLoading } = useDepositHistory(contract);

    useEffect(() => {
        if (!isConnected) {
            navigate('/login');
        }
    }, [isConnected, navigate]);

    const loadHistory = useCallback(async () => {
        if (!contract) return;

        try {
            setLoading(true);
            const expensesList = [];
            
            // Get next expense ID
            const nextId = await contract.getNextExpenseId();

            // Load all expenses
            for (let i = 1; i < nextId; i++) {
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
            console.error("Error loading history:", err);
        } finally {
            setLoading(false);
        }
    }, [contract, address]);

    useEffect(() => {
        if (contract && isMember) {
            loadHistory();
        }
    }, [contract, isMember, loadHistory]);

    const getFilteredExpenses = () => {
        switch (filter) {
            case 'executed':
                return expenses.filter(e => e.executed);
            case 'pending':
                return expenses.filter(e => !e.executed);
            case 'my':
                return expenses.filter(e => e.isParticipant);
            default:
                return expenses;
        }
    };

    const filteredExpenses = getFilteredExpenses();

    const getTotalStats = () => {
        const total = expenses.length;
        const executed = expenses.filter(e => e.executed).length;
        const pending = expenses.filter(e => !e.executed).length;
        const myExpenses = expenses.filter(e => e.isParticipant).length;

        const totalAmount = expenses
            .filter(e => e.executed)
            .reduce((sum, e) => sum + parseFloat(ethers.utils.formatEther(e.amount)), 0);

        const myTotalPaid = expenses
            .filter(e => e.executed && e.isParticipant)
            .reduce((sum, e) => sum + parseFloat(ethers.utils.formatEther(e.userShare)), 0);

        return { total, executed, pending, myExpenses, totalAmount, myTotalPaid };
    };

    const stats = getTotalStats();

    // Load detailed transaction information for modal
    const loadTransactionDetails = async (expense) => {
        if (!contract || !expense) return;

        try {
            // Get all participant details with shares and approval status
            const participantDetails = await Promise.all(
                expense.participants.map(async (participant) => {
                    const share = await contract.getParticipantShare(expense.id, participant);
                    const hasApproved = await contract.hasApproved(expense.id, participant);
                    
                    return {
                        address: participant,
                        share: ethers.utils.formatEther(share),
                        approved: hasApproved
                    };
                })
            );

            setTransactionDetails({
                ...expense,
                participantDetails,
                totalAmount: ethers.utils.formatEther(expense.amount)
            });

        } catch (error) {
            console.error('Error loading transaction details:', error);
        }
    };

    // Handle row click
    const handleRowClick = async (expense) => {
        setSelectedExpense(expense);
        setModalOpen(true);
        await loadTransactionDetails(expense);
    };

    // Close modal
    const closeModal = () => {
        setModalOpen(false);
        setSelectedExpense(null);
        setTransactionDetails(null);
    };

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
                <h1>Transaction History</h1>

                <div className="history-stats">
                    <div className="stat-item">
                        <h3>{stats.total}</h3>
                        <p>Total Expenses</p>
                    </div>
                    <div className="stat-item success">
                        <h3>{stats.executed}</h3>
                        <p>Executed</p>
                    </div>
                    <div className="stat-item warning">
                        <h3>{stats.pending}</h3>
                        <p>Pending</p>
                    </div>
                    <div className="stat-item">
                        <h3>{stats.myExpenses}</h3>
                        <p>My Expenses</p>
                    </div>
                    <div className="stat-item">
                        <h3>{stats.totalAmount.toFixed(4)} ETH</h3>
                        <p>Total Paid Out</p>
                    </div>
                    <div className="stat-item">
                        <h3>{stats.myTotalPaid.toFixed(4)} ETH</h3>
                        <p>I've Paid</p>
                    </div>
                </div>

                <div className="filter-buttons">
                    <button 
                        className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        All ({expenses.length})
                    </button>
                    <button 
                        className={`filter-btn ${filter === 'executed' ? 'active' : ''}`}
                        onClick={() => setFilter('executed')}
                    >
                        Executed ({stats.executed})
                    </button>
                    <button 
                        className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
                        onClick={() => setFilter('pending')}
                    >
                        Pending ({stats.pending})
                    </button>
                    <button 
                        className={`filter-btn ${filter === 'my' ? 'active' : ''}`}
                        onClick={() => setFilter('my')}
                    >
                        My Expenses ({stats.myExpenses})
                    </button>
                    <button 
                        className={`filter-btn ${filter === 'deposits' ? 'active' : ''}`}
                        onClick={() => setFilter('deposits')}
                    >
                        💰 Deposits & Withdrawals ({deposits.length})
                    </button>
                </div>

                {loading && <div className="loading-spinner"></div>}

                {/* Display Deposits & Withdrawals when filter is 'deposits' */}
                {filter === 'deposits' && (
                    <>
                        {depositsLoading && <div className="loading-spinner"></div>}
                        
                        {!depositsLoading && deposits.length === 0 && (
                            <div className="card">
                                <p>No deposit or withdrawal history found.</p>
                            </div>
                        )}

                        {!depositsLoading && deposits.length > 0 && (
                            <div className="history-table-container">
                                <table className="table history-table">
                                    <thead>
                                        <tr>
                                            <th>Type</th>
                                            <th>Member</th>
                                            <th>Amount</th>
                                            <th>Date</th>
                                            <th>Transaction</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {deposits.map((deposit, index) => (
                                            <tr key={`${deposit.transactionHash}-${index}`}>
                                                <td>
                                                    <span className={`status-badge ${deposit.type === 'deposit' ? 'deposit' : 'withdrawal'}`}>
                                                        {deposit.type === 'deposit' ? '💰 Deposit' : '💸 Withdrawal'}
                                                    </span>
                                                </td>
                                                <td className="address-cell">
                                                    <div className="address-container">
                                                        <span title={deposit.member}>
                                                            {deposit.formattedAddress}
                                                        </span>
                                                        {deposit.member.toLowerCase() === address.toLowerCase() && (
                                                            <span className="you-badge">You</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="amount-cell">
                                                    <span className={deposit.type === 'deposit' ? 'positive-amount' : 'negative-amount'}>
                                                        {deposit.type === 'deposit' ? '+' : '-'}{deposit.amountEth} ETH
                                                    </span>
                                                </td>
                                                <td className="date-cell">
                                                    {deposit.date}
                                                </td>
                                                <td className="transaction-cell">
                                                    <a 
                                                        href={`https://sepolia.etherscan.io/tx/${deposit.transactionHash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="transaction-link"
                                                        title="View on Etherscan"
                                                    >
                                                        {deposit.transactionHash.slice(0, 10)}...
                                                    </a>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}

                {/* Display Expenses when filter is not 'deposits' */}
                {filter !== 'deposits' && (
                    <>
                        {!loading && filteredExpenses.length === 0 && (
                            <div className="card">
                                <p>No expenses found for the selected filter.</p>
                            </div>
                        )}

                        {!loading && filteredExpenses.length > 0 && (
                            <div className="history-table-container">
                                <table className="table history-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Status</th>
                                            <th>Recipient</th>
                                            <th>Amount</th>
                                            <th>Approvals</th>
                                            <th>Your Share</th>
                                            <th>Your Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredExpenses.map(expense => (
                                            <tr 
                                                key={expense.id} 
                                                className="clickable-row"
                                                onClick={() => handleRowClick(expense)}
                                                title="Click to view details"
                                            >
                                                <td>#{expense.id}</td>
                                                <td>
                                                    <span className={`status-badge status-${expense.executed ? 'executed' : 'pending'}`}>
                                                        {expense.executed ? 'Executed' : 'Pending'}
                                                    </span>
                                                </td>
                                                <td className="address-cell">
                                                    {expense.recipient.slice(0, 6)}...{expense.recipient.slice(-4)}
                                                </td>
                                                <td className="amount-cell">
                                                    {ethers.utils.formatEther(expense.amount)} ETH
                                                </td>
                                                <td>
                                                    {expense.approvalCount}/{expense.requiredApprovals}
                                                </td>
                                                <td className="amount-cell">
                                                    {expense.isParticipant 
                                                        ? `${ethers.utils.formatEther(expense.userShare)} ETH`
                                                        : '-'
                                                    }
                                                </td>
                                                <td>
                                                    {!expense.isParticipant && '-'}
                                                    {expense.isParticipant && expense.hasApproved && (
                                                        <span className="approved-icon">✓ Approved</span>
                                                    )}
                                                    {expense.isParticipant && !expense.hasApproved && !expense.executed && (
                                                        <span className="pending-icon">⏳ Waiting</span>
                                                    )}
                                                    {expense.isParticipant && !expense.hasApproved && expense.executed && (
                                                        <span className="pending-icon">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Transaction Details Modal */}
            {modalOpen && (
                <div className="transaction-modal" onClick={closeModal}>
                    <div className="transaction-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Expense Details</h2>
                            <button className="close-modal" onClick={closeModal}>×</button>
                        </div>

                        {selectedExpense && (
                            <div className="transaction-details">
                                {/* Basic Info */}
                                <div className="detail-section">
                                    <h3>Basic Information</h3>
                                    <div className="detail-grid">
                                        <span className="detail-label">Expense ID:</span>
                                        <span className="detail-value">#{selectedExpense.id}</span>
                                        
                                        <span className="detail-label">Status:</span>
                                        <span className="detail-value">
                                            <span className={`status-badge ${selectedExpense.executed ? 'executed' : 'pending'}`}>
                                                {selectedExpense.executed ? 'Executed' : 'Pending'}
                                            </span>
                                        </span>
                                        
                                        <span className="detail-label">Recipient:</span>
                                        <span className="detail-value">{selectedExpense.recipient}</span>
                                        
                                        <span className="detail-label">Total Amount:</span>
                                        <span className="detail-value">{ethers.utils.formatEther(selectedExpense.amount)} ETH</span>
                                        
                                        <span className="detail-label">Approvals:</span>
                                        <span className="detail-value">
                                            {selectedExpense.approvalCount} / {selectedExpense.requiredApprovals} required
                                        </span>
                                        
                                        <span className="detail-label">Your Participation:</span>
                                        <span className="detail-value">
                                            {selectedExpense.isParticipant ? 'Yes' : 'No'}
                                        </span>
                                        
                                        {selectedExpense.isParticipant && (
                                            <>
                                                <span className="detail-label">Your Share:</span>
                                                <span className="detail-value">
                                                    {ethers.utils.formatEther(selectedExpense.userShare)} ETH
                                                </span>
                                                
                                                <span className="detail-label">Your Approval:</span>
                                                <span className="detail-value">
                                                    <span className={`approval-status ${selectedExpense.hasApproved ? 'approved' : 'pending'}`}>
                                                        {selectedExpense.hasApproved ? '✓ Approved' : '⏳ Pending'}
                                                    </span>
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Participants Details */}
                                {transactionDetails && transactionDetails.participantDetails && (
                                    <div className="detail-section">
                                        <h3>All Participants & Shares</h3>
                                        <div className="participants-list">
                                            {transactionDetails.participantDetails.map((participant, index) => (
                                                <div key={index} className="participant-row">
                                                    <span className="participant-address">
                                                        {participant.address}
                                                        {participant.address.toLowerCase() === address?.toLowerCase() && ' (You)'}
                                                    </span>
                                                    <span className="participant-share">
                                                        {participant.share} ETH
                                                    </span>
                                                    <div className={`approval-status ${participant.approved ? 'approved' : 'pending'}`}>
                                                        {participant.approved ? '✓ Approved' : '⏳ Pending'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}