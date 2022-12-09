export type EtherscanErc20Tx = {
  hash: string;
  from: string;
  to: string;
  confirmations: string;
  tokenSymbol: string;
  blockNumber: string;
  value: string;  // Token amount (i.e.: not a decimal)
  contractAddress: string;  // ERC20 contract address
};