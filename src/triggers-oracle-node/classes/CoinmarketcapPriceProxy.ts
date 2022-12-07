import IPriceProxy from '../interfaces/IPriceProxy';
import { PriceMap } from '../types/PriceMap';
import axios from 'axios';
import tokenWhitelist from '../token-whitelist.json';

export default class CoinmarketcapPriceProxy implements IPriceProxy {
  private readonly _apiKey: string;
  private readonly _network: string;

  constructor(apiKey: string, network: string) {
    this._apiKey = apiKey;
    this._network = network;
  }

  getPrices = async (): Promise<PriceMap> => {
    const whitelist: { [key: string]: string } = tokenWhitelist[this._network];
    const symbols = Object.keys(whitelist);
    const res = await this.getCoinmarketcapResponse(symbols);
    const coinMarketCapData = res?.data;
    if (!coinMarketCapData) {
      throw 'Failed to get coin market cap data';
    }

    return symbols.reduce((map, symbol) => this.mapPrice(whitelist, coinMarketCapData, map, symbol), {});
  };

  private async getCoinmarketcapResponse(symbols: Array<string>): Promise<any> {
    try {
      const symbolsUrlParam = symbols.join(',');
      return axios.get(`https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=${symbolsUrlParam}`, {
        headers: {
          'X-CMC_PRO_API_KEY': this._apiKey
        }
      });
    } catch (ex) {
      throw ex;
    }
  }

  private mapPrice(whitelist: any, coinMarketCapData: any, priceMap: { [key: string]: number }, symbol: string) {
    const listing = coinMarketCapData[symbol]?.find((listing: any) => {
      const address = listing.platform.token_address;
      return listing.platform.name.toLowerCase() === 'ethereum' && address.toLowerCase() === whitelist[symbol].toLowerCase();
    });

    priceMap[symbol] = listing.quote.USD.price;
    return priceMap;
  };
}
