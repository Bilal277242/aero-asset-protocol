// GENERATED FILE - DO NOT EDIT.
// Produced by `npm run codegen` from out/AssetPassport.sol/AssetPassport.json.
// Re-run codegen after any contract change; CI fails on a diff.
export const assetPassportAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "addressRegistry",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ADDRESS_REGISTRY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IProtocolAddressRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "components",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "offset",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "documents",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "offset",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAircraft",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IAircraftRegistry.Aircraft",
        "components": [
          {
            "name": "manufacturerOrgId",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "manufactureYear",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "category",
            "type": "uint8",
            "internalType": "enum IAircraftRegistry.AircraftCategory"
          },
          {
            "name": "model",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "manufacturerName",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "registrationMarkHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getComponent",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IComponentRegistry.Component",
        "components": [
          {
            "name": "parentAssetId",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "installedAt",
            "type": "uint40",
            "internalType": "uint40"
          },
          {
            "name": "removedAt",
            "type": "uint40",
            "internalType": "uint40"
          },
          {
            "name": "position",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "kind",
            "type": "uint8",
            "internalType": "enum IComponentRegistry.ComponentKind"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum IComponentRegistry.ComponentStatus"
          },
          {
            "name": "partNumber",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPassport",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "passport",
        "type": "tuple",
        "internalType": "struct AssetPassport.Passport",
        "components": [
          {
            "name": "assetId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "kind",
            "type": "uint8",
            "internalType": "enum IAssetRegistry.AssetKind"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum IAssetRegistry.AssetStatus"
          },
          {
            "name": "verified",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "registrarOrgId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "verifierOrgId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "registeredAt",
            "type": "uint40",
            "internalType": "uint40"
          },
          {
            "name": "verifiedAt",
            "type": "uint40",
            "internalType": "uint40"
          },
          {
            "name": "serialNumberHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "metadataHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "owner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "ownedSince",
            "type": "uint40",
            "internalType": "uint40"
          },
          {
            "name": "transferFrozen",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "lockedBy",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "componentCount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "documentCount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maintenanceCount",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maintenance",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "offset",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "metadataURI",
    "inputs": [
      {
        "name": "assetId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const;
