require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-etherscan")
require("@nomicfoundation/hardhat-ethers")
require("hardhat-deploy")
require("solidity-coverage")
require("hardhat-gas-reporter")
require("hardhat-contract-sizer")
require("dotenv").config()

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL
const PRIVATE_KEY = process.env.PRIVATE_KEY
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY

module.exports = {
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            chainId: 31337,
            blockConfirmations: 1,  // Fixed typo from 'blockConfirmation'
        },
        sepolia: {  // Changed from 'rinkeby' to 'sepolia'
            chainId: 11155111,
            blockConfirmations: 6,  // Fixed typo from 'blockConfirmation'
            url: SEPOLIA_RPC_URL,
            accounts: [PRIVATE_KEY]
        }
    },
    etherscan: {
      apiKey: ETHERSCAN_API_KEY, // Add this section
    },
    gasReporter: {
        enabled: false,
        currency: 'USD',
        outputFile: 'gas-report.txt',
        noColors: true,
    },
    solidity: "0.8.7",
    namedAccounts: {
        deployer: {
            default: 0,
        },
        player: {
            default: 1,
        }
    },
    mocha: {
        timeout: 300000, // 300 seconds max
    }
}