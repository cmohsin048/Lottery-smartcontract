const { network, ethers, deployments } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const assert = require("assert")


developmentChains.includes(network.name)
    ?describe.skip:
    describe("Lottery Unit Tests", function () {
        let lottery, deployer, lotteryEntranceFee

        beforeEach(async function () {
            accounts = await ethers.getSigners()
            deployer = accounts[0]
            await deployments.fixture(["all"])

            lottery = await ethers.getContractAt(
                "Lottery",
                (await deployments.get("Lottery")).address,
                deployer
            )
            lotteryEntranceFee = await lottery.getEntranceFee()
           
        })

        describe("fulfillRandomWords",function(){
            it("works with live chainlink keepers and chainlink VRF, we get a random winner",async function(){
                //enter the raffle
                const startingTimeStamp=await lottery.getLatestTimeStamp()


                await new Promise (async(resolve,reject)=>{
                    lottery.once("WinnerPicked",async()=>{
                        console.log("winnerPicked event fired")
                        try{
                            const recentWinner=await lottery.getRecentWinner()
                            const lotteryState=await lottery.getRaffleState()
                            const winnerEndingBalance=await accounts[0].getBalance()
                            const endingTimeStamp=await lottery.getLatestTimeStamp()

                            await expect(lottery.getPlayer(0)).to.be.reverted
                            assert.equal(recentWinner.toString(),account[0].address)
                            assert.equal(lotteryState,0)
                            assert.equal(winnerEndingBalance.toString(),winnerStartingBalance.add(lotteryEntranceFee).toString())
                            assert(endingTimeStamp>startingTimeStamp)
                            resolve()
                        }catch(error){
                            console.log(error)
                            reject(e)

                        }
                    })
                    await lottery.enterLottery({value:lotteryEntranceFee})
                    const winnerStartingBalance=await accounts[0].getBalance()

                })
                
            })
        })
      
    })