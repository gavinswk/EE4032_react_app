import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { GlobalToolBar } from '../../global';
import './History.css';

export default function History({ contract, address, isConnected, isMember }) {
    const [expenses, setExpenses] = useState([]);
    const [filter, setFilter] = useState('all'); // 'all', 'executed', 'pending', 'my'
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

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
                </div>

                {loading && <div className="loading-spinner"></div>}

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
                                    <tr key={expense.id}>
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
            </div>
        </div>
    );
}