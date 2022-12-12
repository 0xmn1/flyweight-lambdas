/*
 * networkId to symbol=>address map
 * @remarks
 * key is networkId (e.g. 0x1 for mainnet, 0x5 for goerli)
 */
export type TokenWhitelists = {
  [key: string]: TokenWhitelist
};

// symbol=>address map
export type TokenWhitelist = {
  [key: string]: string
};
