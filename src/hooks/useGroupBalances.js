import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

/**
 * Custom hook to fetch all members' balances for a splitter contract
 * @param {Object} contract - Ethers contract instance for TrustlessExpenseSplitter
 * @returns {Object} - { loading, members, refresh }
 */
export default function useGroupBalances(contract) {
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState([]); // [{ address, deposited, reserved, available, formattedAddress }]
    const [error, setError] = useState(null);

    const formatAddress = (addr) => {
        if (!addr) return '';
        return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    };

    const fetchBalances = useCallback(async () => {
        if (!contract) return;
        
        try {
            setLoading(true);
            setError(null);

            // Get all members from the contract
            const memberAddresses = await contract.getAllMembers();
            
            // Fetch balance data for each member
            const memberData = await Promise.all(
                memberAddresses.map(async (address) => {
                    try {
                        const deposited = await contract.getMemberBalance(address);
                        const reserved = await contract.getReservedDeposits(address);
                        const available = await contract.getAvailableBalance(address);
                        
                        return {
                            address: address,
                            deposited: deposited,
                            reserved: reserved,
                            available: available,
                            formattedAddress: formatAddress(address),
                            depositedEth: ethers.utils.formatEther(deposited),
                            reservedEth: ethers.utils.formatEther(reserved),
                            availableEth: ethers.utils.formatEther(available)
                        };
                    } catch (err) {
                        console.error(`Error fetching balance for ${address}:`, err);
                        return {
                            address: address,
                            deposited: ethers.BigNumber.from(0),
                            reserved: ethers.BigNumber.from(0),
                            available: ethers.BigNumber.from(0),
                            formattedAddress: formatAddress(address),
                            depositedEth: '0',
                            reservedEth: '0',
                            availableEth: '0'
                        };
                    }
                })
            );

            setMembers(memberData);
        } catch (err) {
            console.error('Error fetching group balances:', err);
            setError('Failed to load member balances');
        } finally {
            setLoading(false);
        }
    }, [contract]);

    useEffect(() => {
        fetchBalances();

        if (!contract) return;

        // Set up event listeners to refresh balances when relevant events occur
        const refreshBalances = () => {
            fetchBalances().catch(console.error);
        };

        try {
            contract.on('MemberDeposited', refreshBalances);
            contract.on('MemberBalanceUpdated', refreshBalances);
            contract.on('ExpenseApproved', refreshBalances);
            contract.on('ExpenseExecuted', refreshBalances);
            contract.on('SettlementComplete', refreshBalances);
        } catch (err) {
            console.error('Error setting up event listeners:', err);
        }

        return () => {
            try {
                contract.off('MemberDeposited', refreshBalances);
                contract.off('MemberBalanceUpdated', refreshBalances);
                contract.off('ExpenseApproved', refreshBalances);
                contract.off('ExpenseExecuted', refreshBalances);
                contract.off('SettlementComplete', refreshBalances);
            } catch (err) {
                // Ignore cleanup errors
            }
        };
    }, [contract, fetchBalances]);

    return { 
        loading, 
        members, 
        error,
        refresh: fetchBalances 
    };
}