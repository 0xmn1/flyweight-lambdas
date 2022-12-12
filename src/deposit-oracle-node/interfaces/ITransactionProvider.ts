import { EtherscanTokenTx } from '../types/EtherscanApiResponse';

// Represents a proxy to get token transactions
export default interface ITransactionProvider {
  getTokenTransactions(address: string, startblock: number): Promise<EtherscanTokenTx[]>;
}
