import React from 'react';
import useGroupBalances from '../../hooks/useGroupBalances';
import './GroupBalances.css';

export default function GroupBalances({ contract, currentUserAddress }) {
    const { loading, members, error, refresh } = useGroupBalances(contract);

    if (!contract) {
        return (
            <div className="card">
                <h3>Group Balances</h3>
                <p>Contract not available</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="card">
                <h3>Group Balances</h3>
                <div className="loading-state">
                    <p>Loading member balances...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="card">
                <h3>Group Balances</h3>
                <div className="error-state">
                    <p>{error}</p>
                    <button className="button" onClick={refresh}>
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="card group-balances">
            <div className="group-balances-header">
                <h3>Group Balances</h3>
                <button 
                    className="button button-small" 
                    onClick={refresh}
                    title="Refresh balances"
                >
                    🔄 Refresh
                </button>
            </div>

            {members.length === 0 ? (
                <div className="empty-state">
                    <p>No members found</p>
                </div>
            ) : (
                <div className="balances-table-container">
                    <table className="balances-table">
                        <thead>
                            <tr>
                                <th>Member</th>
                                <th>Total Deposited</th>
                                <th>Reserved</th>
                                <th>Available to Withdraw</th>
                            </tr>
                        </thead>
                        <tbody>
                            {members.map((member) => (
                                <tr 
                                    key={member.address} 
                                    className={member.address.toLowerCase() === currentUserAddress?.toLowerCase() ? 'current-user' : ''}
                                >
                                    <td className="member-address">
                                        <div className="address-container">
                                            <span className="address-text" title={member.address}>
                                                {member.formattedAddress}
                                            </span>
                                            {member.address.toLowerCase() === currentUserAddress?.toLowerCase() && (
                                                <span className="you-badge">You</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="balance-amount deposited">
                                        <span className="amount">{member.depositedEth}</span>
                                        <span className="currency">ETH</span>
                                    </td>
                                    <td className="balance-amount reserved">
                                        <span className="amount">{member.reservedEth}</span>
                                        <span className="currency">ETH</span>
                                    </td>
                                    <td className="balance-amount available">
                                        <span className="amount">{member.availableEth}</span>
                                        <span className="currency">ETH</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="balance-summary">
                <div className="summary-item">
                    <span className="summary-label">Total Group Deposits:</span>
                    <span className="summary-value">
                        {members.reduce((sum, member) => sum + parseFloat(member.depositedEth || 0), 0).toFixed(4)} ETH
                    </span>
                </div>
                <div className="summary-item">
                    <span className="summary-label">Total Available:</span>
                    <span className="summary-value">
                        {members.reduce((sum, member) => sum + parseFloat(member.availableEth || 0), 0).toFixed(4)} ETH
                    </span>
                </div>
            </div>
        </div>
    );
}