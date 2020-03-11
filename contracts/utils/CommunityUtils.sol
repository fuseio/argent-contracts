pragma solidity ^0.5.4;
import "../interfaces/ICommunity.sol";

library CommunityUtils {
  function hasRoles(address _communityAddress, address _account, bytes32 _entityRoles) internal view returns (bool) {
    return ICommunity(_communityAddress).hasRoles(_account, _entityRoles);
  }
}