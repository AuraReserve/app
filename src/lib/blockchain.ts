export const BLOCKCHAIN_METADATA = {
  ethereum: {
    chainId: 1,
    rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/demo",
    signerEnvVars: ["ETHEREUM_SIGNER_PRIVATE_KEY", "BLOCKCHAIN_SIGNER_PRIVATE_KEY"],
  },
  avalanche: {
    chainId: 43114,
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    signerEnvVars: ["AVALANCHE_SIGNER_PRIVATE_KEY", "BLOCKCHAIN_SIGNER_PRIVATE_KEY"],
  },
} as const;

export const BLOCKCHAIN_TESTNET_METADATA = {
  avalanche: {
    chainId: 43113,
    rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    name: "Avalanche Fuji Testnet",
  },
} as const;

export type SupportedBlockchain = keyof typeof BLOCKCHAIN_METADATA;

export const DEFAULT_RPC_URLS: Record<SupportedBlockchain, string> = {
  ethereum: BLOCKCHAIN_METADATA.ethereum.rpcUrl,
  avalanche: BLOCKCHAIN_METADATA.avalanche.rpcUrl,
};

export function getDefaultRpcUrl(blockchain: string): string | undefined {
  return BLOCKCHAIN_METADATA[blockchain as SupportedBlockchain]?.rpcUrl;
}

export function getDefaultChainId(blockchain: string): number | undefined {
  return BLOCKCHAIN_METADATA[blockchain as SupportedBlockchain]?.chainId;
}

export function getSignerEnvVars(blockchain: string): string[] {
  return [...(BLOCKCHAIN_METADATA[blockchain as SupportedBlockchain]?.signerEnvVars ?? [])];
}

export function getTestnetRpcUrl(blockchain: string): string | undefined {
  return BLOCKCHAIN_TESTNET_METADATA[blockchain as keyof typeof BLOCKCHAIN_TESTNET_METADATA]?.rpcUrl;
}

export function getTestnetChainId(blockchain: string): number | undefined {
  return BLOCKCHAIN_TESTNET_METADATA[blockchain as keyof typeof BLOCKCHAIN_TESTNET_METADATA]?.chainId;
}
