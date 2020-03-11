const Wallet = require("../build/BaseWallet");
const Registry = require("../build/ModuleRegistry");
const TransferStorage = require("../build/TransferStorage");
const GuardianStorage = require("../build/GuardianStorage");
const CommunityTransferManager = require("../build/CommunityTransferManager");
const CommunityMock = require("../build/CommunityMock");
const KyberNetwork = require("../build/KyberNetworkTest");
const TokenPriceProvider = require("../build/TokenPriceProvider");
const ERC20 = require("../build/TestERC20");

const ETH_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const ETH_LIMIT = 1000000;
const SECURITY_PERIOD = 2;
const SECURITY_WINDOW = 2;
const DECIMALS = 12; // number of decimal for TOKN contract
const KYBER_RATE = ethers.utils.bigNumberify(51 * 10 ** 13); // 1 TOKN = 0.00051 ETH
const ZERO_BYTES32 = ethers.constants.HashZero;

const NETWORK_FEE_PERCENTAGE = ethers.utils.bigNumberify('10000000000000000') // 10**16;
const ROLE_TO_CHECK = '0x0000000000000000000000000000000000000000000000000000000000000008';
const ACTION_TRANSFER = 0;
const TestManager = require("../utils/test-manager");

describe("Test TransferCommunityManager", function () {
    this.timeout(10000);

    const manager = new TestManager();

    let infrastructure = accounts[0].signer;
    let owner = accounts[1].signer;
    let nonowner = accounts[2].signer;
    let recipient = accounts[3].signer;
    let spender = accounts[4].signer;
    let networkAdmin = accounts[5].signer;
    let communityAdmin = accounts[6].signer;
    let kyber, registry, priceProvider, transferStorage, guardianStorage, transferModule, communityMock, wallet;

    before(async () => {
        deployer = manager.newDeployer();
        registry = await deployer.deploy(Registry);
        kyber = await deployer.deploy(KyberNetwork);
        priceProvider = await deployer.deploy(TokenPriceProvider, {}, kyber.contractAddress);
        transferStorage = await deployer.deploy(TransferStorage);
        guardianStorage = await deployer.deploy(GuardianStorage);
        transferModule = await deployer.deploy(CommunityTransferManager, {},
            registry.contractAddress,
            transferStorage.contractAddress,
            guardianStorage.contractAddress,
            priceProvider.contractAddress,
            SECURITY_PERIOD,
            SECURITY_WINDOW,
            ETH_LIMIT,
            NETWORK_FEE_PERCENTAGE,
            networkAdmin.address,
            ROLE_TO_CHECK
        );

        communityMock = await deployer.deploy(CommunityMock, {},
          true)
        await registry.registerModule(transferModule.contractAddress, ethers.utils.formatBytes32String("CommunityTransferManager"));
    });

    beforeEach(async () => {
        wallet = await deployer.deploy(Wallet);
        await wallet.init(owner.address, [transferModule.contractAddress]);
        erc20 = await deployer.deploy(ERC20, {}, [infrastructure.address, wallet.contractAddress], 10000000, DECIMALS); // TOKN contract with 10M tokens (5M TOKN for wallet and 5M TOKN for account[0])
        await kyber.addToken(erc20.contractAddress, KYBER_RATE, DECIMALS);
        await priceProvider.syncPrice(erc20.contractAddress);
        await infrastructure.sendTransaction({ to: wallet.contractAddress, value: ethers.utils.bigNumberify('1000000000000000000') });
    });

    describe("Token transfers", () => {

        async function doDirectTransfer({ token, signer = owner, to, amount, relayed = false, cashbackPercentage, adminFeePercentage, toShouldReceive, communityAdminShouldReceive, networkAdminShouldReceive }) {
            let fundsBefore = (token == ETH_TOKEN ? await deployer.provider.getBalance(to.address) : await token.balanceOf(to.address));
            let adminFundsBefore = (token == ETH_TOKEN ? await deployer.provider.getBalance(communityAdmin.address) : await token.balanceOf(communityAdmin.address));
            let networkAdminFundsBefore = (token == ETH_TOKEN ? await deployer.provider.getBalance(networkAdmin.address) : await token.balanceOf(networkAdmin.address));

            const params = [wallet.contractAddress, token == ETH_TOKEN ? ETH_TOKEN : token.contractAddress, to.address, amount, communityMock.contractAddress, communityAdmin.address, cashbackPercentage, adminFeePercentage, ZERO_BYTES32];
            let txReceipt;
            if (relayed) {
                txReceipt = await manager.relay(transferModule, 'transferTokenWithFees', params, wallet, [signer]);
            } else {
                const tx = await transferModule.from(signer).transferTokenWithFees(...params);
                txReceipt = await transferModule.verboseWaitForTransaction(tx);
            }
            assert.isTrue(await utils.hasEvent(txReceipt, transferModule, "Transfer"), "should have generated Transfer event");
            let fundsAfter = (token == ETH_TOKEN ? await deployer.provider.getBalance(to.address) : await token.balanceOf(to.address));
            let adminFundsAfter = (token == ETH_TOKEN ? await deployer.provider.getBalance(communityAdmin.address) : await token.balanceOf(communityAdmin.address));
            let networkAdminFundsAfter = (token == ETH_TOKEN ? await deployer.provider.getBalance(networkAdmin.address) : await token.balanceOf(networkAdmin.address));

            assert.equal(fundsAfter.sub(fundsBefore).toNumber(), toShouldReceive, 'should have transfered amount');
            assert.equal(adminFundsAfter.sub(adminFundsBefore).toNumber(), communityAdminShouldReceive, 'should have transfered community admin fee');
            assert.equal(networkAdminFundsAfter.sub(networkAdminFundsBefore).toNumber(), networkAdminShouldReceive, 'should have transfered network admin fee');

            return txReceipt;
        }

        it('when sending token to business should send correct fees', async () => {
          const cashbackPercentage = ethers.utils.bigNumberify('10000000000000000') // 1%
          const adminFeePercentage = ethers.utils.bigNumberify('10000000000000000') // 1%
          await doDirectTransfer({ token: erc20, to: recipient, amount: 100,
             cashbackPercentage: cashbackPercentage, adminFeePercentage,
             toShouldReceive: 97, communityAdminShouldReceive: 1, networkAdminShouldReceive: 1 });
        });

        it('when sending token to business should send correct fees #2', async () => {
          const cashbackPercentage = ethers.utils.bigNumberify('60000000000000000') // 1%
          const adminFeePercentage = ethers.utils.bigNumberify('30000000000000000') // 1%
          await doDirectTransfer({ token: erc20, to: recipient, amount: 100,
             cashbackPercentage: cashbackPercentage, adminFeePercentage,
             toShouldReceive: 90, communityAdminShouldReceive: 3, networkAdminShouldReceive: 1 });
        });

        it('when sending to user should not take fees', async () => {
          await communityMock.from(owner).setHasRoles(false)
          const cashbackPercentage = ethers.utils.bigNumberify('60000000000000000') // 1%
          const adminFeePercentage = ethers.utils.bigNumberify('30000000000000000') // 1%
          await doDirectTransfer({ token: erc20, to: recipient, amount: 100,
             cashbackPercentage: cashbackPercentage, adminFeePercentage,
             toShouldReceive: 100, communityAdminShouldReceive: 0, networkAdminShouldReceive: 0 });
        });
        
    });

});