const { network, ethers, deployments } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const assert = require("assert")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery Unit Tests", function () {
          let lottery, vrfCoordinatorV2Mock, deployer, lotteryEntranceFee, interval
          let accounts
          const chainId = network.config.chainId

          beforeEach(async function () {
              accounts = await ethers.getSigners()
              deployer = accounts[0]
              await deployments.fixture(["all"])

              lottery = await ethers.getContractAt(
                  "Lottery",
                  (await deployments.get("Lottery")).address,
                  deployer
              )
              vrfCoordinatorV2Mock = await ethers.getContractAt(
                  "VRFCoordinatorV2Mock",
                  (await deployments.get("VRFCoordinatorV2Mock")).address,
                  deployer
              )
              lotteryEntranceFee = await lottery.getEntranceFee()
              interval = await lottery.getInterval()
          })

          describe("constructor", function () {
              it("initializes the lottery correctly", async function () {
                  const lotteryState = (await lottery.getLotteryState()).toString()
                  const intervalFromContract = (await lottery.getInterval()).toString()

                  assert.strictEqual(lotteryState, "0", "Lottery state not initialized to OPEN")
                  assert.strictEqual(
                      intervalFromContract,
                      networkConfig[chainId]["interval"].toString(),
                      "Interval not set correctly"
                  )
              })
          })

          describe("enterLottery", function () {
              it("reverts when you don't pay enough", async function () {
                  await assert.rejects(
                      lottery.enterLottery({ value: 0 }),
                      (error) => {
                          assert(error.message.includes("Lottery__NotEnoughETHEntered"))
                          return true
                      }
                  )
              })

              it("records players when they enter", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  const playerFromContract = await lottery.getPlayer(0)
                  assert.strictEqual(
                      playerFromContract.toLowerCase(),
                      deployer.address.toLowerCase(),
                      "Player not recorded correctly"
                  )
              })

              it("emits event on enter", async function () {
                  const tx = await lottery.enterLottery({ value: lotteryEntranceFee })
                  const receipt = await tx.wait()

                  const eventLog = receipt.logs[0]
                  const decodedLog = lottery.interface.parseLog(eventLog)

                  assert.strictEqual(decodedLog.name, "LotteryEnter", "Event name doesn't match")
                  assert.strictEqual(
                      decodedLog.args[0].toLowerCase(),
                      deployer.address.toLowerCase(),
                      "Event args don't match expected values"
                  )
              })

              it("doesn't allow entrance when lottery is calculating", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [(Number(interval) + 1).toString()])
                  await network.provider.send("evm_mine", [])
                  await lottery.performUpkeep("0x")

                  await assert.rejects(
                      lottery.enterLottery({ value: lotteryEntranceFee }),
                      (error) => {
                          assert(error.message.includes("Lottery__NotOpen"))
                          return true
                      }
                  )
              })
          })

          describe("checkUpkeep", function () {
              it("returns false if people haven't sent any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [(Number(interval) + 1).toString()])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await lottery.checkUpkeep("0x")
                  assert(!upkeepNeeded, "Upkeep should be false when no ETH sent")
              })

              it("returns false if lottery isn't open", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [(Number(interval) + 1).toString()])
                  await network.provider.send("evm_mine", [])
                  await lottery.performUpkeep("0x")
                  const lotteryState = await lottery.getLotteryState()
                  const { upkeepNeeded } = await lottery.checkUpkeep("0x")
                  assert.strictEqual(lotteryState.toString(), "1", "Lottery should be calculating")
                  assert(!upkeepNeeded, "Upkeep should be false when lottery is calculating")
              })

              it("returns false if enough time hasn't passed", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  const { upkeepNeeded } = await lottery.checkUpkeep("0x")
                  assert(!upkeepNeeded, "Upkeep should be false when not enough time has passed")
              })

              it("returns true if all conditions are met", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [(Number(interval) + 1).toString()])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await lottery.checkUpkeep("0x")
                  assert(upkeepNeeded, "Upkeep should be true when all conditions are met")
              })
          })

          describe("performUpkeep", function () {
              it("can only run if checkUpkeep is true", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [(Number(interval) + 1).toString()])
                  await network.provider.send("evm_mine", [])
                  const tx = await lottery.performUpkeep("0x")
                  assert(tx, "Transaction failed when checkUpkeep is true")
              })

              it("reverts when checkUpkeep is false", async function () {
                  await assert.rejects(
                      lottery.performUpkeep("0x"),
                      (error) => {
                          assert(error.message.includes("Lottery__UpkeepNotNeeded"))
                          return true
                      }
                  )
              })

              it("updates the lottery state and emits a requestId", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [(Number(interval) + 1).toString()])
                  await network.provider.send("evm_mine", [])

                  const txResponse = await lottery.performUpkeep("0x")
                  const txReceipt = await txResponse.wait()

                  const events = txReceipt.logs
                      .map((log) => {
                          try {
                              return lottery.interface.parseLog(log)
                          } catch (e) {
                              return null
                          }
                      })
                      .filter((event) => event !== null)

                  const requestEvent = events.find((event) => event.name === "RequestedLotteryWinner")
                  assert(requestEvent, "RequestedLotteryWinner event not found")
                  const requestId = requestEvent.args.requestId

                  assert(requestId.toString() > "0", "RequestId should be greater than 0")
                  assert.strictEqual(
                      (await lottery.getLotteryState()).toString(),
                      "1",
                      "Lottery state should be calculating"
                  )
              })
          })

          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [(Number(interval) + 1).toString()])
                  await network.provider.send("evm_mine", [])
              })

              it("can only be called after performUpkeep", async function () {
                  await assert.rejects(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address),
                      (error) => {
                          assert(error, "Expected error when fulfilling random words without performUpkeep")
                          return true
                      }
                  )
              })

              it("picks a winner, resets the lottery, and sends money", async function () {
                  const additionalEntrances = 3
                  const startingAccountIndex = 1
                  let startingBalance

                  // Add additional players
                  for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrances; i++) {
                      const accountConnectedLottery = lottery.connect(accounts[i])
                      await accountConnectedLottery.enterLottery({ value: lotteryEntranceFee })
                  }

                  const startingTimeStamp = await lottery.getLatestTimeStamp()

                  // Set up the listener before we fire the event
                  await new Promise(async (resolve, reject) => {
                      lottery.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              const recentWinner = await lottery.getRecentWinner()
                              const lotteryState = await lottery.getLotteryState()
                              const endingTimeStamp = await lottery.getLatestTimeStamp()
                              const numPlayers = await lottery.getNumberOfPlayers()
                              const winnerEndingBalance = await ethers.provider.getBalance(accounts[1].address)

                              assert(endingTimeStamp > startingTimeStamp, "Ending timestamp should be greater")
                              assert.strictEqual(numPlayers.toString(), "0", "Players array should be reset")
                              assert.strictEqual(lotteryState.toString(), "0", "Lottery should be open")

                              // Check winner's balance increase
                              const expectedPrize = lotteryEntranceFee.mul(additionalEntrances + 1)
                              const balanceDifference = winnerEndingBalance.sub(startingBalance)

                              // Allow for gas costs by checking if the balance increased by at least 95% of the prize
                              assert(
                                  balanceDifference.gt(expectedPrize.mul(95).div(100)),
                                  "Winner's balance should have increased by approximately the prize amount"
                              )

                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })

                      try {
                          const tx = await lottery.performUpkeep("0x")
                          const receipt = await tx.wait()
                          startingBalance = await ethers.provider.getBalance(accounts[1].address)

                          const requestId = receipt.logs
                              .map((log) => {
                                  try {
                                      return lottery.interface.parseLog(log)
                                  } catch (e) {
                                      return null
                                  }
                              })
                              .filter((event) => event !== null && event.name === "RequestedLotteryWinner")[0]
                              .args.requestId

                          await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, lottery.address)
                      } catch (e) {
                          reject(e)
                      }
                  })
              })
          })

          describe("getter functions", function () {
              it("gets entrance fee correctly", async function () {
                  const entranceFee = await lottery.getEntranceFee()
                  assert.strictEqual(
                      entranceFee.toString(),
                      lotteryEntranceFee.toString(),
                      "Entrance fee not retrieved correctly"
                  )
              })

              it("gets lottery state correctly", async function () {
                  const lotteryState = await lottery.getLotteryState()
                  assert.strictEqual(lotteryState.toString(), "0", "Initial lottery state should be OPEN")
              })

              it("gets number of players correctly", async function () {
                  await lottery.enterLottery({ value: lotteryEntranceFee })
                  const numPlayers = await lottery.getNumberOfPlayers()
                  assert.strictEqual(numPlayers.toString(), "1", "Number of players not correct")
              })
          })
      })