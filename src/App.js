import { Routes, Route } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';

import './App.css';
import './global.css';
import Login from "./components/login/Login";
import Splitters from "./components/splitters/Splitters";
import Dashboard from "./components/dashboard/Dashboard";
import Deposit from "./components/deposit/Deposit";
import Expenses from "./components/expenses/Expenses";
import History from "./components/history/History";
import { FACTORY_ABI, FACTORY_ADDRESS, SPLITTER_ABI, EXPECTED_NETWORK } from "./contracts/config";

export default function App() {
    // MetaMask connection states
    const [haveMetamask, setHaveMetamask] = useState(true);
    const [address, setAddress] = useState(null);
    const [network, setNetwork] = useState(null);
    const [balance, setBalance] = useState(0);
    const [isConnected, setIsConnected] = useState(false);

    // Factory contract state
    const [factoryContract, setFactoryContract] = useState(null);
    
    // Active splitter contract states
    const [activeSplitterAddress, setActiveSplitterAddress] = useState(null);
    const [splitterContract, setSplitterContract] = useState(null);
    const [memberDeposit, setMemberDeposit] = useState(0);
    const [reservedDeposit, setReservedDeposit] = useState(0);
    const [totalPooledFunds, setTotalPooledFunds] = useState(0);
    const [isMember, setIsMember] = useState(false);
    const [allMembers, setAllMembers] = useState([]);

    // Expense states
    const [expenses, setExpenses] = useState([]);
    const [nextExpenseId, setNextExpenseId] = useState(0);

    // UI states
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const navigate = useNavigate();
    const { ethereum } = window;

// Load splitter contract data
    const loadSplitterData = useCallback(async (contractInstance) => {
        if (!contractInstance || !address) return;

        try {
            setLoading(true);

            // Check if user is a member (ethers.js syntax)
            const memberStatus = await contractInstance.isMember(address);
            setIsMember(memberStatus);

            if (memberStatus) {
                // Get member's deposit
                const deposit = await contractInstance.getMemberBalance(address);
                setMemberDeposit(ethers.utils.formatEther(deposit));

                // Get reserved deposit
                const reserved = await contractInstance.getReservedDeposits(address);
                setReservedDeposit(ethers.utils.formatEther(reserved));

                // Get total pooled funds
                const total = await contractInstance.totalPooledFunds();
                setTotalPooledFunds(ethers.utils.formatEther(total));

                // Get all members
                const members = await contractInstance.getAllMembers();
                setAllMembers(members);

                // Get next expense ID
                const nextId = await contractInstance.getNextExpenseId();
                setNextExpenseId(parseInt(nextId.toString()));
            }
        } catch (err) {
            console.error("Error loading splitter data:", err);
            setError("Failed to load splitter data");
        } finally {
            setLoading(false);
        }
    }, [address]);

    //  Disconnect Wallet
    const disconnectWallet = useCallback(() => {
        setAddress(null);
        setIsConnected(false);
        setIsMember(false);
        setFactoryContract(null);
        setSplitterContract(null);
        setActiveSplitterAddress(null);
        localStorage.removeItem('activeSplitterAddress');
        navigate("/");
    }, [navigate]);

    const initializeSplitterContract = useCallback(
        async (splitterAddress) => {
            try {
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();
            const splitterInstance = new ethers.Contract(
                splitterAddress,
                SPLITTER_ABI,
                signer
            );
            setSplitterContract(splitterInstance);

            await loadSplitterData(splitterInstance);
            } catch (err) {
            console.error("Error initializing splitter contract:", err);
            setError("Failed to initialize splitter contract");
            }
        },
        [loadSplitterData]
    );

    // Handle splitter selection
    const handleSelectSplitter = (splitterAddress) => {
        setActiveSplitterAddress(splitterAddress);
        // Store in localStorage for persistence
        localStorage.setItem('activeSplitterAddress', splitterAddress);
    };

    // Refresh contract data
    const refreshData = () => {
        if (splitterContract) {
            loadSplitterData(splitterContract);
        }
    };

    // Listen for account changes
    useEffect(() => {
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length > 0) {
                    setAddress(accounts[0]);
                    setIsConnected(true);
                } else {
                    disconnectWallet();
                }
            });

            window.ethereum.on('chainChanged', () => {
                window.location.reload();
            });
        }

        return () => {
            if (window.ethereum) {
                window.ethereum.removeAllListeners('accountsChanged');
                window.ethereum.removeAllListeners('chainChanged');
            }
        };
    }, [disconnectWallet]);

    // Initialize Web3 and contract
    useEffect(() => {
        checkMetaMaskAvailable();
    }, []);

    useEffect(() => {
        if (isConnected && address) {
            initializeFactoryContract();
        }
    }, [isConnected, address]);

    useEffect(() => {
        if (activeSplitterAddress) {
            initializeSplitterContract(activeSplitterAddress);
        }
    }, [activeSplitterAddress, initializeSplitterContract]);

    // Check if MetaMask is installed
    const checkMetaMaskAvailable = () => {
        if (!window.ethereum) {
            setHaveMetamask(false);
            setError("Please install MetaMask to use this DApp");
        }
    };

    // Connect to MetaMask
    const connectWallet = async () => {
        try {
            setLoading(true);
            setError(null);

            if (!window.ethereum) {
                setHaveMetamask(false);
                setError("MetaMask is not installed");
                return;
            }

            const provider = new ethers.providers.Web3Provider(window.ethereum);

            // Check network BEFORE requesting accounts
            const networkInfo = await provider.getNetwork();
            const expectedChainId = parseInt(EXPECTED_NETWORK.chainId, 16);
            
            if (networkInfo.chainId !== expectedChainId) {
                // Try to switch to Sepolia
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: EXPECTED_NETWORK.chainId }],
                    });
                } catch (switchError) {
                    // If network not added, prompt to add it
                    if (switchError.code === 4902) {
                        try {
                            await window.ethereum.request({
                                method: 'wallet_addEthereumChain',
                                params: [{
                                    chainId: EXPECTED_NETWORK.chainId,
                                    chainName: EXPECTED_NETWORK.chainName,
                                    rpcUrls: ['https://sepolia.infura.io/v3/'],
                                    blockExplorerUrls: ['https://sepolia.etherscan.io/'],
                                }],
                            });
                        } catch (addError) {
                            setError(`Please add ${EXPECTED_NETWORK.chainName} to MetaMask`);
                            setLoading(false);
                            return;
                        }
                    } else {
                        setError(`Please switch to ${EXPECTED_NETWORK.chainName} in MetaMask`);
                        setLoading(false);
                        return;
                    }
                }
            }

            const accounts = await provider.send("eth_requestAccounts", []);
            
            if (accounts.length > 0) {
                const signer = provider.getSigner();
                const userAddress = await signer.getAddress();
                const networkInfo = await provider.getNetwork();
                const userBalance = await provider.getBalance(userAddress);

                setAddress(userAddress);
                setNetwork(networkInfo.name);
                setBalance(ethers.utils.formatEther(userBalance));
                setIsConnected(true);

                // Check if on correct network
                if (networkInfo.chainId.toString() !== parseInt(EXPECTED_NETWORK.chainId, 16).toString()) {
                    setError(`Please switch to ${EXPECTED_NETWORK.chainName}`);
                }

                navigate("/splitters");
            }
        } catch (err) {
            console.error("Error connecting wallet:", err);
            setError(err.message || "Failed to connect wallet");
        } finally {
            setLoading(false);
        }
    };

    // Initialize factory contract instance
    const initializeFactoryContract = async () => {
        try {
            if (FACTORY_ADDRESS === "0x0000000000000000000000000000000000000000") {
                setError("Factory contract not deployed yet. Please update FACTORY_ADDRESS in config.js");
                return;
            }

            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();
            const factoryInstance = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
            setFactoryContract(factoryInstance);
        } catch (err) {
            console.error("Error initializing factory contract:", err);
            setError("Failed to initialize factory contract");
        }
    };

    

    return (
        <div className="App">
            <Routes>
                <Route 
                    path="/" 
                    element={
                        <Login 
                            connectWallet={connectWallet}
                            haveMetamask={haveMetamask}
                            isConnected={isConnected}
                            address={address}
                            loading={loading}
                            error={error}
                        />
                    } 
                />
                <Route 
                    path="/login" 
                    element={
                        <Login 
                            connectWallet={connectWallet}
                            haveMetamask={haveMetamask}
                            isConnected={isConnected}
                            address={address}
                            loading={loading}
                            error={error}
                        />
                    } 
                />
                <Route 
                    path="/splitters" 
                    element={
                        <Splitters 
                            factoryContract={factoryContract}
                            address={address}
                            isConnected={isConnected}
                            onSelectSplitter={handleSelectSplitter}
                        />
                    } 
                />
                <Route 
                    path="/dashboard" 
                    element={
                        <Dashboard 
                            address={address}
                            balance={balance}
                            memberDeposit={memberDeposit}
                            reservedDeposit={reservedDeposit}
                            totalPooledFunds={totalPooledFunds}
                            isMember={isMember}
                            allMembers={allMembers}
                            isConnected={isConnected}
                            activeSplitterAddress={activeSplitterAddress}
                            refreshData={refreshData}
                            disconnectWallet={disconnectWallet}
                        />
                    } 
                />
                <Route 
                    path="/deposit" 
                    element={
                        <Deposit 
                            contract={splitterContract}
                            address={address}
                            memberDeposit={memberDeposit}
                            reservedDeposit={reservedDeposit}
                            isConnected={isConnected}
                            isMember={isMember}
                            refreshData={refreshData}
                        />
                    } 
                />
                <Route 
                    path="/expenses" 
                    element={
                        <Expenses 
                            contract={splitterContract}
                            address={address}
                            allMembers={allMembers}
                            nextExpenseId={nextExpenseId}
                            isConnected={isConnected}
                            isMember={isMember}
                            refreshData={refreshData}
                        />
                    } 
                />
                <Route 
                    path="/history" 
                    element={
                        <History 
                            contract={splitterContract}
                            address={address}
                            isConnected={isConnected}
                            isMember={isMember}
                        />
                    } 
                />
            </Routes>
        </div>
    );
}

