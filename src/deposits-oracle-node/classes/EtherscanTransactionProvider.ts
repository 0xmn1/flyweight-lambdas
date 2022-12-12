import { EtherscanApiResponse, EtherscanTokenTx } from '../types/EtherscanApiResponse';

import ITransactionProvider from '../interfaces/ITransactionProvider';
import axios from 'axios';

/*
 * Etherscan proxy to provide token transactions.
 * @remarks
 * The Etherscan API indexes blocks w/ 1 confirmation, & thereby exhibits a brief time lag between on-chain confirmations
 * & transactions being returned by their API (0xmn1 has confirmed this undocumented quirky behaviour with the Etherscan support team).
 * This Etherscan quirk remains undocumented & was only discovered during later stages of testing - so ideally, in the future, this provider is switched for another one that supports real-time chain analytics (hence the {@link ITransactionProvider} interface)
 */
export default class EtherscanTransactionProvider implements ITransactionProvider {
  private static readonly STATUS_CODE_OK = '1';

  constructor(
    private readonly _apiKey: string,
    private readonly _apiBaseUrl: string,
  ) {
  }

  // @param startblock - inclusive range
  async getTokenTransactions(address: string, startblock: number): Promise<EtherscanTokenTx[]> {
    const params = {
      module: 'account',
      action: 'tokentx',
      sort: 'desc',
      page: 1,
      offset: 1000,
      apikey: this._apiKey,
      address: address,
      startblock: startblock,
    };

    const res: EtherscanApiResponse<EtherscanTokenTx[]> = await axios.get(this._apiBaseUrl, {
      params
    });

    if (res?.status !== 200 || res?.data?.status !== EtherscanTransactionProvider.STATUS_CODE_OK) {
      console.error(res);
      throw `Etherscan api call failed, status, res: ${res?.status}`;
    }

    return res.data.result;
  }
}
