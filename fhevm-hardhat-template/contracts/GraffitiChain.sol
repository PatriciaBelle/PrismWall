// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, euint64, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title GraffitiChain - FHE-enabled on-chain graffiti NFT with encrypted reactions
contract GraffitiChain is ERC721, SepoliaConfig {
    using Strings for uint256;

    enum ReactionKind { Heart, Fire, Thumbs, Party }

    struct GraffitiMeta {
        string uri;          // IPFS metadata uri (ipfs://...)
        address author;      // creator address
        // encrypted reaction counters
        euint32 heart;
        euint32 fire;
        euint32 thumbs;
        euint32 party;
    }

    struct Comment {
        address author;
        string uri;      // IPFS uri of the comment content (plaintext or encrypted blob)
        bool encrypted;  // true if the content is encrypted off-chain
        uint256 timestamp;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => GraffitiMeta) private _graffiti;
    mapping(uint256 => mapping(address => bool)) private _reactedHeart; // retain single-like semantics for Heart
    mapping(uint256 => Comment[]) private _comments;

    event GraffitiMinted(uint256 indexed tokenId, address indexed author, string uri);
    event Reacted(uint256 indexed tokenId, address indexed user, ReactionKind kind);
    event CommentAdded(uint256 indexed tokenId, address indexed author, string uri, bool encrypted);
    event Tipped(uint256 indexed tokenId, address indexed from, uint256 amount);

    constructor() ERC721("GraffitiChain", "GRAFFITI") {}

    function mintGraffitiNFT(string calldata uri, string calldata /*title*/ ) external returns (uint256) {
        uint256 tokenId = ++_nextTokenId;
        _safeMint(msg.sender, tokenId);

        euint32 zero = FHE.asEuint32(0);

        _graffiti[tokenId] = GraffitiMeta({
            uri: uri,
            author: msg.sender,
            heart: zero,
            fire: zero,
            thumbs: zero,
            party: zero
        });

        // Allow contract and minter to access encrypted counters in future
        _allowAll(_graffiti[tokenId]);

        emit GraffitiMinted(tokenId, msg.sender, uri);
        return tokenId;
    }

    function _allowAll(GraffitiMeta storage m) internal {
        FHE.allowThis(m.heart); FHE.allow(m.heart, msg.sender);
        FHE.allowThis(m.fire);  FHE.allow(m.fire, msg.sender);
        FHE.allowThis(m.thumbs);FHE.allow(m.thumbs, msg.sender);
        FHE.allowThis(m.party); FHE.allow(m.party, msg.sender);
    }

    /// @notice Legacy like (Heart) kept for compatibility
    function likeGraffiti(externalEuint32 encryptedOne, bytes calldata inputProof, uint256 tokenId) external {
        react(encryptedOne, inputProof, tokenId, uint8(ReactionKind.Heart));
    }

    /// @notice Add an encrypted +1 to a reaction kind
    function react(
        externalEuint32 encryptedOne,
        bytes calldata inputProof,
        uint256 tokenId,
        uint8 kind
    ) public {
        require(_exists(tokenId), "Invalid tokenId");
        ReactionKind k = ReactionKind(kind);

        // For Heart, restrict to one per address
        if (k == ReactionKind.Heart) {
            require(!_reactedHeart[tokenId][msg.sender], "Already hearted");
            _reactedHeart[tokenId][msg.sender] = true;
        }

        euint32 one = FHE.fromExternal(encryptedOne, inputProof);
        GraffitiMeta storage m = _graffiti[tokenId];

        if (k == ReactionKind.Heart)      { m.heart  = FHE.add(m.heart, one); }
        else if (k == ReactionKind.Fire)  { m.fire   = FHE.add(m.fire, one); }
        else if (k == ReactionKind.Thumbs){ m.thumbs = FHE.add(m.thumbs, one); }
        else if (k == ReactionKind.Party) { m.party  = FHE.add(m.party, one); }
        else { revert("Invalid reaction kind"); }

        _allowAll(m);
        emit Reacted(tokenId, msg.sender, k);
    }

    /// @notice Return encrypted reaction handles in fixed order [heart, fire, thumbs, party]
    function getEncryptedReactions(uint256 tokenId) external view returns (euint32[4] memory out) {
        require(_exists(tokenId), "Invalid tokenId");
        GraffitiMeta storage m = _graffiti[tokenId];
        out[0] = m.heart; out[1] = m.fire; out[2] = m.thumbs; out[3] = m.party;
    }

    /// @notice Add a comment (content stored on IPFS)
    function addComment(uint256 tokenId, string calldata uri, bool encrypted) external {
        require(_exists(tokenId), "Invalid tokenId");
        _comments[tokenId].push(Comment({
            author: msg.sender,
            uri: uri,
            encrypted: encrypted,
            timestamp: block.timestamp
        }));
        emit CommentAdded(tokenId, msg.sender, uri, encrypted);
    }

    function getCommentsCount(uint256 tokenId) external view returns (uint256) {
        require(_exists(tokenId), "Invalid tokenId");
        return _comments[tokenId].length;
    }

    function getComment(uint256 tokenId, uint256 index) external view returns (address, string memory, bool, uint256) {
        require(_exists(tokenId), "Invalid tokenId");
        require(index < _comments[tokenId].length, "Index out of bounds");
        Comment storage c = _comments[tokenId][index];
        return (c.author, c.uri, c.encrypted, c.timestamp);
    }

    /// @notice Tip the author/owner of a token
    function tip(uint256 tokenId) external payable {
        require(_exists(tokenId), "Invalid tokenId");
        require(msg.value > 0, "No value");
        address payable receiver = payable(ownerOf(tokenId));
        (bool ok, ) = receiver.call{ value: msg.value }("");
        require(ok, "Transfer failed");
        emit Tipped(tokenId, msg.sender, msg.value);
    }

    /// @notice Return encrypted Heart counter for legacy UI
    function getEncryptedLikes(uint256 tokenId) external view returns (euint32) {
        require(_exists(tokenId), "Invalid tokenId");
        return _graffiti[tokenId].heart;
    }

    // Public decryption is handled off-chain via Relayer SDK / Mock userDecrypt.

    /// @notice Return public metadata (uri, owner, author)
    function graffitiInfo(uint256 tokenId) external view returns (string memory, address, address) {
        require(_exists(tokenId), "Invalid tokenId");
        return (_graffiti[tokenId].uri, ownerOf(tokenId), _graffiti[tokenId].author);
    }

    /// @notice Return all graffiti info with encrypted Heart handles for UI sync
    function getAllGraffiti()
        external
        view
        returns (
            string[] memory uris,
            address[] memory authors,
            address[] memory owners,
            euint32[] memory likes
        )
    {
        uint256 n = _nextTokenId;
        uris = new string[](n);
        authors = new address[](n);
        owners = new address[](n);
        likes = new euint32[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 tokenId = i + 1;
            if (_ownerOf(tokenId) == address(0)) {
                continue;
            }
            GraffitiMeta storage m = _graffiti[tokenId];
            uris[i] = m.uri;
            authors[i] = m.author;
            owners[i] = ownerOf(tokenId);
            likes[i] = m.heart;
        }
    }

    /// @notice Total minted supply
    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Invalid tokenId");
        return _graffiti[tokenId].uri;
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return tokenId > 0 && tokenId <= _nextTokenId && _ownerOf(tokenId) != address(0);
    }
}


