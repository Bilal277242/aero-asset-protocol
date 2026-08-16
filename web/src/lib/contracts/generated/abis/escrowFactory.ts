// GENERATED FILE - DO NOT EDIT.
// Produced by `npm run codegen` from out/EscrowFactory.sol/EscrowFactory.json.
// Re-run codegen after any contract change; CI fails on a diff.
export const escrowFactoryAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "roleManager",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "addressRegistry",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "escrowImplementation",
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
    "name": "ESCROW_IMPLEMENTATION",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ROLE_MANAGER",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IRoleManager"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "escrowCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "escrowOf",
    "inputs": [
      {
        "name": "escrowId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isEscrow",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "openEscrow",
    "inputs": [
      {
        "name": "terms",
        "type": "tuple",
        "internalType": "struct IEscrowFactory.EscrowTerms",
        "components": [
          {
            "name": "listingId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "assetId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "buyer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "seller",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "paymentToken",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "treasury",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "price",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "feeAmount",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "fundingDeadline",
            "type": "uint40",
            "internalType": "uint40"
          },
          {
            "name": "settlementDeadline",
            "type": "uint40",
            "internalType": "uint40"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "escrowId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "escrow",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "predictEscrowAddress",
    "inputs": [
      {
        "name": "escrowId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "EscrowOpened",
    "inputs": [
      {
        "name": "escrowId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "escrow",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "listingId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "buyer",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "seller",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "price",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "feeAmount",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "CloneAddressMismatch",
    "inputs": [
      {
        "name": "predicted",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "deployed",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "EscrowNotFound",
    "inputs": [
      {
        "name": "escrowId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "FailedDeployment",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientBalance",
    "inputs": [
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnexpectedCaller",
    "inputs": [
      {
        "name": "expected",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "actual",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const;
