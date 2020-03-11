pragma solidity ^0.5.4;

contract CommunityMock {
    bool public isHasRoles;

    constructor (bool _isHasRoles) public {
      isHasRoles = _isHasRoles;
    }

    function hasRoles(address _account, bytes32 _entityRoles) public view returns (bool) {
        return isHasRoles;
    }

    function setHasRoles(bool _isHasRoles) public {
      isHasRoles = _isHasRoles;
    }
}