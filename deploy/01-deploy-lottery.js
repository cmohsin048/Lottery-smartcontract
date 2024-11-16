const { network, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../helper-hardhat-config")
const { verify } = require('../utils/verify')
const VRF_SUB_FUND_AMOUNT = ethers.parseEther("5") // 5 ETH

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    let vrfCoordinatorV2Address, subscriptionId

    if (chainId == 31337) {
        // Deploy VRFV2 Mock
        const vrfCoordinatorV2Mock = await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: [
                "250000000000000000", // 0.25 LINK per request
                1e9, // 1 LINK per 1B gas
            ],
        })
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address

        // Create VRFv2 Subscription
        const vrfContract = await ethers.getContractAt(
            "VRFCoordinatorV2Mock",
            vrfCoordinatorV2Address
        )
        
        const transactionResponse = await vrfContract.createSubscription()
        const transactionReceipt = await transactionResponse.wait(1)
        subscriptionId = 1

        // Fund the subscription
        await vrfContract.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
        log(`Created and funded subscription: ${subscriptionId}`)
        
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }

    log("----------------------------------------------------")
    log("Deploying Lottery and waiting for confirmations...")
    log(`VRF Coordinator Address: ${vrfCoordinatorV2Address}`)
    log(`Using subscription ID: ${subscriptionId}`)

    const args = [
        vrfCoordinatorV2Address,
        networkConfig[chainId]["entranceFee"],
        networkConfig[chainId]["gasLane"],
        subscriptionId,
        networkConfig[chainId]["callbackGasLimit"],
        networkConfig[chainId]["interval"]
    ]

    const lottery = await deploy("Lottery", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // Ensure the Lottery contract is a valid consumer
    if (chainId == 31337) {
        const vrfCoordinatorV2Mock = await ethers.getContractAt(
            "VRFCoordinatorV2Mock",
            vrfCoordinatorV2Address
        )
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId, lottery.address)
        log("Added consumer to VRF subscription!")
    }

    // Verify the deployment
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(lottery.address, args)
    }

    log("Lottery deployed!")
    log("----------------------------------------------------")
}

module.exports.tags = ['all', 'lottery']