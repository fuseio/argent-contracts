pragma solidity ^0.5.4;

interface ICommunity {
  function hasRoles(address _account, bytes32 _entityRoles) external view returns (bool);
}