pragma solidity ^0.5.4;
import "./TransferManager.sol";
import "../utils/CommunityUtils.sol";
import "../base/Managed.sol";

contract CommunityTransferManager is TransferManager, Managed {
  bytes32 constant NAME = "CommunityTransferManager";

  uint256 public constant DECIMALS = 10 ** 18;
  uint256 private networkFeePercentage;
  address private networkAdmin;
  bytes32 private roleToCheck;

    // *************** Constructor ********************** //

    constructor(
      ModuleRegistry _registry,
      TransferStorage _transferStorage,
      GuardianStorage _guardianStorage,
      address _priceProvider,
      uint256 _securityPeriod,
      uint256 _securityWindow,
      uint256 _defaultLimit,
      uint256 _networkFeePercentage,
      address _networkAdmin,
      bytes32 _roleToCheck
    ) TransferManager(
      _registry, _transferStorage, _guardianStorage, _priceProvider, _securityPeriod, _securityWindow, _defaultLimit, LimitManager(address(0)))
      public
    {
      networkFeePercentage = _networkFeePercentage;
      networkAdmin = _networkAdmin;
      roleToCheck = _roleToCheck;
    }
    // *************** External/Public Functions ********************* //

    /**
    * @dev lets the owner transfer tokens (ETH or ERC20) from a wallet.
    * @param _wallet The target wallet.
    * @param _token The address of the token to transfer.
    * @param _to The destination address
    * @param _amount The amoutn of token to transfer
    * @param _data The data for the transaction
    */
    function transferTokenWithFees(
        BaseWallet _wallet,
        address _token,
        address _to,
        uint256 _amount,
        address _community,
        address _communityAdmin,
        uint256 _cashbackPercentage,
        uint256 _adminFeePercentage,
        bytes calldata _data
    )
        external
        onlyWalletOwner(_wallet)
        onlyWhenUnlocked(_wallet)
    {
      if (CommunityUtils.hasRoles(_community, _to, roleToCheck)) {
        doTransfer(_wallet, _token, _communityAdmin, calculateFee(_amount, _adminFeePercentage), _data);
        doTransfer(_wallet, _token, networkAdmin, calculateFee(_amount, networkFeePercentage), _data);
        doTransfer(_wallet, _token, _to, _amount - calculateFee(_amount, _cashbackPercentage) - calculateFee(_amount, _adminFeePercentage) - calculateFee(_amount, networkFeePercentage), _data);
      } else {
        doTransfer(_wallet, _token, _to, _amount, _data);
      }
    }

    function calculateFee(uint256 _amount, uint256 _percentage) internal pure returns (uint256) {
      return _amount.sub(_amount.mul(DECIMALS - _percentage).div(DECIMALS));
    }

    function setNetworkFeePercentage(uint256 _networkFeePercentage) public onlyManager {
      networkFeePercentage = _networkFeePercentage;
    }

    function setRoleToCheck(bytes32 _roleToCheck) public onlyManager {
      roleToCheck = _roleToCheck;
    }

    function setNetworkAdmin(address _networkAdmin) public onlyManager {
      networkAdmin = _networkAdmin;
    }
}