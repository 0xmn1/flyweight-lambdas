import { TokenWhitelist, TokenWhitelists } from '../types/TokenWhitelists';

import IPriceProxy from '../interfaces/IPriceProxy';
import { PriceMap } from '../types/PriceMap';
import axios from 'axios';
import tokenWhitelist from '../token-whitelist.json';

export default class CoinmarketcapPriceProxy implements IPriceProxy {

  // A proxy to get token prices via coinmarketcap api
  constructor(
    private readonly _apiKey: string,
    private readonly _apiBaseUrl: string,
    private readonly _network: string,
  ) {
  }

  tryGetPrices = async (): Promise<PriceMap> => {
    const whitelists = tokenWhitelist as TokenWhitelists;
    const whitelist: TokenWhitelist = whitelists[this._network];
    const symbols = Object.keys(whitelist);
    const res = await this.getCoinmarketcapResponse(symbols);
    const coinMarketCapData = res?.data?.data;
    if (!coinMarketCapData) {
      throw 'failed to get coin market cap data';
    }

    return symbols.reduce((map, symbol) => this.tryMapPrice(whitelist, coinMarketCapData, map, symbol), {});
  };

  private async getCoinmarketcapResponse(symbols: string[]): Promise<any> {
    try {
      const symbolsUrlParam = symbols.join(',');
      return axios.get(`${this._apiBaseUrl}/v2/cryptocurrency/quotes/latest?symbol=${symbolsUrlParam}`, {
        headers: {
          'X-CMC_PRO_API_KEY': this._apiKey
        }
      });
    } catch (ex) {
      throw ex;
    }
  }

  /*
   * Adds price to the map (if a price is available).
   * When price not available, this method fails gracefully with a warning.
   * @returns symbol=>price map
   * @remarks CoinMarketCap API does not have testnet token contract addresses, so
   * we only verify addresses if oracle is on mainnet.
   */
  private tryMapPrice(whitelist: any, coinMarketCapData: any, priceMap: { [key: string]: number }, symbol: string) {
    const listings = [...coinMarketCapData[symbol]];
    const listing = listings.find((listing: any) => {
      // Token contract address needs to be checked, since 1 symbol can represent multiple token contracts
      const isCorrectChain = listing.platform.name.toLowerCase() === 'ethereum';
      const tokenAddress = listing?.platform?.token_address;
      const isCorrectAddress = tokenAddress && tokenAddress.toLowerCase() === whitelist[symbol].toLowerCase();
      return isCorrectChain && isCorrectAddress;
    });

    if (listing) {
      priceMap[symbol] = listing.quote.USD.price;
    } else {
      console.warn(`no price data found, symbol=${symbol}`);
    }

    return priceMap;
  };
}
