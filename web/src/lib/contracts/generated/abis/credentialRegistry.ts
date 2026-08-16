// GENERATED FILE - DO NOT EDIT.
// Produced by `npm run codegen` from out/CredentialRegistry.sol/CredentialRegistry.json.
// Re-run codegen after any contract change; CI fails on a diff.
export const credentialRegistryAbi = [
  {
    "type": "function",
    "name": "UPGRADE_INTERFACE_VERSION",
    "inputs": [],
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
    "type": "function",
    "name": "addressRegistry",
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
    "name": "credentialCount",
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
    "name": "expireCredential",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getCredential",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ICredentialRegistry.Credential",
        "components": [
          {
            "name": "issuerOrgId",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "subjectOrgId",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "issuedAt",
            "type": "uint40",
            "internalType": "uint40"
          },
          {
            "name": "expiresAt",
            "type": "uint40",
            "internalType": "uint40"
          },
          {
            "name": "credType",
            "type": "uint8",
            "internalType": "enum ICredentialRegistry.CredentialType"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum ICredentialRegistry.CredentialStatus"
          },
          {
            "name": "reserved",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "subject",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "credentialHash",
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
    "name": "hasRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
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
    "name": "hasValidCredentialOfType",
    "inputs": [
      {
        "name": "subjectOrgId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "credType",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialType"
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
    "name": "initialize",
    "inputs": [
      {
        "name": "roleManager_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "addressRegistry_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "isValid",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
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
    "name": "isValidTransition",
    "inputs": [
      {
        "name": "from",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialStatus"
      },
      {
        "name": "to",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialStatus"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "issueCredential",
    "inputs": [
      {
        "name": "issuerOrgId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "subject",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "subjectOrgId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "credType",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialType"
      },
      {
        "name": "expiresAt",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "credentialHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
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
    "name": "proxiableUUID",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "reinstateCredential",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "requireValid",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "revokeCredential",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "roleManager",
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
    "name": "suspendCredential",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "unpause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "upgradeToAndCall",
    "inputs": [
      {
        "name": "newImplementation",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "data",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "validCredentialOfType",
    "inputs": [
      {
        "name": "subjectOrgId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "credType",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialType"
      }
    ],
    "outputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "CredentialIssued",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "issuerOrgId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "subject",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "subjectOrgId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "credType",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum ICredentialRegistry.CredentialType"
      },
      {
        "name": "expiresAt",
        "type": "uint40",
        "indexed": false,
        "internalType": "uint40"
      },
      {
        "name": "credentialHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CredentialStatusChanged",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "oldStatus",
        "type": "uint8",
        "indexed": true,
        "internalType": "enum ICredentialRegistry.CredentialStatus"
      },
      {
        "name": "newStatus",
        "type": "uint8",
        "indexed": true,
        "internalType": "enum ICredentialRegistry.CredentialStatus"
      },
      {
        "name": "by",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Initialized",
    "inputs": [
      {
        "name": "version",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Paused",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Unpaused",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Upgraded",
    "inputs": [
      {
        "name": "implementation",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AddressEmptyCode",
    "inputs": [
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "CredentialExpired",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiresAt",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "CredentialNotExpired",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiresAt",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "CredentialNotFound",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "CredentialNotValid",
    "inputs": [
      {
        "name": "credentialId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "DeadlineInPast",
    "inputs": [
      {
        "name": "deadline",
        "type": "uint40",
        "internalType": "uint40"
      },
      {
        "name": "nowTs",
        "type": "uint40",
        "internalType": "uint40"
      }
    ]
  },
  {
    "type": "error",
    "name": "DuplicateValidCredential",
    "inputs": [
      {
        "name": "subjectOrgId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "credType",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialType"
      },
      {
        "name": "existingCredentialId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1967InvalidImplementation",
    "inputs": [
      {
        "name": "implementation",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1967NonPayable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EnforcedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExpectedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FailedCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidCredentialSubject",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidCredentialTransition",
    "inputs": [
      {
        "name": "from",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialStatus"
      },
      {
        "name": "to",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidCredentialType",
    "inputs": [
      {
        "name": "provided",
        "type": "uint8",
        "internalType": "enum ICredentialRegistry.CredentialType"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidInitialization",
    "inputs": []
  },
  {
    "type": "error",
    "name": "IssuerOrganizationNotFound",
    "inputs": [
      {
        "name": "orgId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "MissingRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotInitializing",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SubjectOrganizationNotVerified",
    "inputs": [
      {
        "name": "orgId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "UUPSUnauthorizedCallContext",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UUPSUnsupportedProxiableUUID",
    "inputs": [
      {
        "name": "slot",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "ValueTooLarge",
    "inputs": [
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "max",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroHash",
    "inputs": []
  }
] as const;
