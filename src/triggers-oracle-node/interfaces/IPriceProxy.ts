import { PriceMap } from '../types/PriceMap';

export default interface IPriceProxy {
  getPrices(symbol: string): Promise<PriceMap>;
}
