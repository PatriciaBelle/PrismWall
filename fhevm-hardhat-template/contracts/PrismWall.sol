// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, euint64, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title PrismWall - FHE-enabled art NFT with encrypted reactions (renamed interface)
contract PrismWall is ERC721, SepoliaConfig {
    using Strings for uint256;

    enum PulseKind { Heart, Fire, Thumbs, Party }

    struct ArtworkMeta {
        string uri;          // IPFS metadata uri (ipfs://... or data URI)
        address author;      // creator address
        euint32 heart;
        euint32 fire;
        euint32 thumbs;
        euint32 party;
    }

    struct Note {
        address author;
        string uri;      // IPFS uri or data URI
        bool encrypted;  // true if encrypted content stored off-chain
        uint256 timestamp;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => ArtworkMeta) private _artworks;
    mapping(uint256 => mapping(address => bool)) private _applaudedOnce; // single heart per address
    mapping(uint256 => Note[]) private _notes;

    event ArtworkForged(uint256 indexed tokenId, address indexed author, string uri);
    event ReactionCast(uint256 indexed tokenId, address indexed user, PulseKind kind);
    event NoteAdded(uint256 indexed tokenId, address indexed author, string uri, bool encrypted);
    event ArtistTipped(uint256 indexed tokenId, address indexed from, uint256 amount);

    constructor() ERC721("PrismWall", "PRISM") {}

    function forgeArtworkNFT(string calldata uri, string calldata /*title*/ ) external returns (uint256) {
        uint256 tokenId = ++_nextTokenId;
        _safeMint(msg.sender, tokenId);

        euint32 zero = FHE.asEuint32(0);

        _artworks[tokenId] = ArtworkMeta({
            uri: uri,
            author: msg.sender,
            heart: zero,
            fire: zero,
            thumbs: zero,
            party: zero
        });

        _allowAll(_artworks[tokenId]);

        emit ArtworkForged(tokenId, msg.sender, uri);
        return tokenId;
    }

    function _allowAll(ArtworkMeta storage m) internal {
        FHE.allowThis(m.heart); FHE.allow(m.heart, msg.sender);
        FHE.allowThis(m.fire);  FHE.allow(m.fire, msg.sender);
        FHE.allowThis(m.thumbs);FHE.allow(m.thumbs, msg.sender);
        FHE.allowThis(m.party); FHE.allow(m.party, msg.sender);
    }

    /// @notice Backward-like action: single Heart per address
    function sendApplause(externalEuint32 encryptedOne, bytes calldata inputProof, uint256 tokenId) external {
        castReaction(encryptedOne, inputProof, tokenId, uint8(PulseKind.Heart));
    }

    /// @notice Add an encrypted +1 to a reaction kind
    function castReaction(
        externalEuint32 encryptedOne,
        bytes calldata inputProof,
        uint256 tokenId,
        uint8 kind
    ) public {
        require(_exists(tokenId), "Invalid tokenId");
        PulseKind k = PulseKind(kind);

        if (k == PulseKind.Heart) {
            require(!_applaudedOnce[tokenId][msg.sender], "Already hearted");
            _applaudedOnce[tokenId][msg.sender] = true;
        }

        euint32 one = FHE.fromExternal(encryptedOne, inputProof);
        ArtworkMeta storage m = _artworks[tokenId];

        if (k == PulseKind.Heart)      { m.heart  = FHE.add(m.heart, one); }
        else if (k == PulseKind.Fire)  { m.fire   = FHE.add(m.fire, one); }
        else if (k == PulseKind.Thumbs){ m.thumbs = FHE.add(m.thumbs, one); }
        else if (k == PulseKind.Party) { m.party  = FHE.add(m.party, one); }
        else { revert("Invalid reaction kind"); }

        _allowAll(m);
        emit ReactionCast(tokenId, msg.sender, k);
    }

    /// @notice Return encrypted reaction handles [heart, fire, thumbs, party]
    function fetchCipherReactions(uint256 tokenId) external view returns (euint32[4] memory out) {
        require(_exists(tokenId), "Invalid tokenId");
        ArtworkMeta storage m = _artworks[tokenId];
        out[0] = m.heart; out[1] = m.fire; out[2] = m.thumbs; out[3] = m.party;
    }

    /// @notice Add a note (IPFS or data URI)
    function postNote(uint256 tokenId, string calldata uri, bool encrypted) external {
        require(_exists(tokenId), "Invalid tokenId");
        _notes[tokenId].push(Note({
            author: msg.sender,
            uri: uri,
            encrypted: encrypted,
            timestamp: block.timestamp
        }));
        emit NoteAdded(tokenId, msg.sender, uri, encrypted);
    }

    function notesCount(uint256 tokenId) external view returns (uint256) {
        require(_exists(tokenId), "Invalid tokenId");
        return _notes[tokenId].length;
    }

    function fetchNote(uint256 tokenId, uint256 index) external view returns (address, string memory, bool, uint256) {
        require(_exists(tokenId), "Invalid tokenId");
        require(index < _notes[tokenId].length, "Index out of bounds");
        Note storage n = _notes[tokenId][index];
        return (n.author, n.uri, n.encrypted, n.timestamp);
    }

    /// @notice Tip the author/owner of a token
    function tipArtist(uint256 tokenId) external payable {
        require(_exists(tokenId), "Invalid tokenId");
        require(msg.value > 0, "No value");
        address payable receiver = payable(ownerOf(tokenId));
        (bool ok, ) = receiver.call{ value: msg.value }("");
        require(ok, "Transfer failed");
        emit ArtistTipped(tokenId, msg.sender, msg.value);
    }

    /// @notice Return encrypted Heart counter
    function getEncryptedApplause(uint256 tokenId) external view returns (euint32) {
        require(_exists(tokenId), "Invalid tokenId");
        return _artworks[tokenId].heart;
    }

    /// @notice Return public metadata (uri, owner, author)
    function artworkInfo(uint256 tokenId) external view returns (string memory, address, address) {
        require(_exists(tokenId), "Invalid tokenId");
        return (_artworks[tokenId].uri, ownerOf(tokenId), _artworks[tokenId].author);
    }

    /// @notice Return all artworks info and encrypted heart handles
    function getAllArtworks()
        external
        view
        returns (
            string[] memory uris,
            address[] memory authors,
            address[] memory owners,
            euint32[] memory applause
        )
    {
        uint256 n = _nextTokenId;
        uris = new string[](n);
        authors = new address[](n);
        owners = new address[](n);
        applause = new euint32[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 tokenId = i + 1;
            if (_ownerOf(tokenId) == address(0)) {
                continue;
            }
            ArtworkMeta storage m = _artworks[tokenId];
            uris[i] = m.uri;
            authors[i] = m.author;
            owners[i] = ownerOf(tokenId);
            applause[i] = m.heart;
        }
    }

    /// @notice Total minted supply
    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Invalid tokenId");
        return _artworks[tokenId].uri;
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return tokenId > 0 && tokenId <= _nextTokenId && _ownerOf(tokenId) != address(0);
    }
}


