import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

/**
 * Custom hook to fetch deposit history from contract events
 * @param {Object} contract - Ethers contract instance for TrustlessExpenseSplitter
 * @returns {Object} - { loading, deposits, refresh }
 */
export default function useDepositHistory(contract) {
    const [loading, setLoading] = useState(true);
    const [deposits, setDeposits] = useState([]);
    const [error, setError] = useState(null);

    const formatAddress = (addr) => {
        if (!addr) return '';
        return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    };

    const fetchDepositHistory = useCallback(async () => {
        if (!contract) return;
        
        try {
            setLoading(true);
            setError(null);

            // Get MemberDeposited events
            const depositFilter = contract.filters.MemberDeposited();
            const depositEvents = await contract.queryFilter(depositFilter);

            // Get MemberBalanceUpdated events (for withdrawals)
            const balanceUpdateFilter = contract.filters.MemberBalanceUpdated();
            const balanceUpdateEvents = await contract.queryFilter(balanceUpdateFilter);

            // Process deposit events
            const depositHistory = await Promise.all(
                depositEvents.map(async (event) => {
                    try {
                        const block = await event.getBlock();
                        return {
                            type: 'deposit',
                            member: event.args.member,
                            amount: event.args.amount,
                            formattedAddress: formatAddress(event.args.member),
                            amountEth: ethers.utils.formatEther(event.args.amount),
                            timestamp: block.timestamp,
                            blockNumber: event.blockNumber,
                            transactionHash: event.transactionHash,
                            date: new Date(block.timestamp * 1000).toLocaleString()
                        };
                    } catch (err) {
                        console.error('Error processing deposit event:', err);
                        return null;
                    }
                })
            );

            // Process potential withdrawal events (when balance decreases outside of expense execution)
            const withdrawalHistory = [];
            
            // Group balance update events by member and look for decreases
            const memberBalanceUpdates = {};
            for (const event of balanceUpdateEvents) {
                const member = event.args.member;
                if (!memberBalanceUpdates[member]) {
                    memberBalanceUpdates[member] = [];
                }
                memberBalanceUpdates[member].push(event);
            }

            // Detect withdrawals (this is a simplified approach)
            for (const [member, events] of Object.entries(memberBalanceUpdates)) {
                // Sort events by block number
                events.sort((a, b) => a.blockNumber - b.blockNumber);
                
                for (let i = 1; i < events.length; i++) {
                    const prevBalance = events[i - 1].args.newBalance;
                    const currentBalance = events[i].args.newBalance;
                    
                    // If balance decreased significantly, it might be a withdrawal
                    if (prevBalance.gt(currentBalance)) {
                        const withdrawnAmount = prevBalance.sub(currentBalance);
                        
                        try {
                            const block = await events[i].getBlock();
                            withdrawalHistory.push({
                                type: 'withdrawal',
                                member: member,
                                amount: withdrawnAmount,
                                formattedAddress: formatAddress(member),
                                amountEth: ethers.utils.formatEther(withdrawnAmount),
                                timestamp: block.timestamp,
                                blockNumber: events[i].blockNumber,
                                transactionHash: events[i].transactionHash,
                                date: new Date(block.timestamp * 1000).toLocaleString()
                            });
                        } catch (err) {
                            console.error('Error processing withdrawal event:', err);
                        }
                    }
                }
            }

            // Combine and sort all history
            const allHistory = [...depositHistory.filter(Boolean), ...withdrawalHistory]
                .sort((a, b) => b.timestamp - a.timestamp); // Most recent first

            setDeposits(allHistory);
        } catch (err) {
            console.error('Error fetching deposit history:', err);
            setError('Failed to load deposit history');
        } finally {
            setLoading(false);
        }
    }, [contract]);

    useEffect(() => {
        fetchDepositHistory();

        if (!contract) return;

        // Set up event listeners for real-time updates
        const handleDeposit = () => {
            fetchDepositHistory().catch(console.error);
        };

        const handleBalanceUpdate = () => {
            fetchDepositHistory().catch(console.error);
        };

        try {
            contract.on('MemberDeposited', handleDeposit);
            contract.on('MemberBalanceUpdated', handleBalanceUpdate);
        } catch (err) {
            console.error('Error setting up deposit history event listeners:', err);
        }

        return () => {
            try {
                contract.off('MemberDeposited', handleDeposit);
                contract.off('MemberBalanceUpdated', handleBalanceUpdate);
            } catch (err) {
                // Ignore cleanup errors
            }
        };
    }, [contract, fetchDepositHistory]);

    return { 
        loading, 
        deposits, 
        error,
        refresh: fetchDepositHistory 
    };
}