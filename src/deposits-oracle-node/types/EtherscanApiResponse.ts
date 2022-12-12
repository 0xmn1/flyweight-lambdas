export type EtherscanApiResponse<TResult> = {
  status: number;
  data: {
    status: string; // A number represented as a string
    result: TResult;
  }
};

export type EtherscanTokenTx = {
  hash: string;
  from: string;
  to: string;
  confirmations: string;
  tokenSymbol: string;
  blockNumber: string;
  value: string;  // Token amount (i.e.: not a decimal)
  contractAddress: string;  // token contract address
};
