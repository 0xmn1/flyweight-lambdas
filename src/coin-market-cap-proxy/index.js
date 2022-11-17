const axios = require('axios');
const fs = require('fs');
const path = require('path');

const allCoinsCachePath = path.resolve('/tmp', 'all-coins-cache.json');

const now = () => Math.floor(Date.now() / 1000);

const writeCache = (cachePath, data, ttl) => {
    const cacheText = JSON.stringify({ ttl, data });
    return fs.promises.writeFile(cachePath, cacheText, {
        encoding: 'utf8'
    });
};

const tryReadCache = async cachePath => {
    if (!fs.existsSync(cachePath)) {
        return null;
    }
    
    const cacheText = await fs.promises.readFile(cachePath, 'utf8');
    let cacheJson = null;
    try {
        cacheJson = JSON.parse(cacheText);
    } catch (err) {
        console.warn(`Cache hit failed for: ${cachePath}`);
        console.warn(err);
        return null;
    }
    
    if (now() <= cacheJson.ttl) {
        return cacheJson.data;
    }
    return null;
};

const getAllCoins = async () => {
    const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest';
    const res = await axios.get(url, {
        headers: {
            'X-CMC_PRO_API_KEY': '9399e138-67f2-4cce-a68d-dcac48b4d57b',
            'Accept': '*/*'
        }
    });

    return res.data.data.map(coin => ({
        symbol: coin.symbol,
        name: coin.name
    }));
};

const getAllCoinsHandler = async () => {
    console.log('Getting "all coins" data');
    let cache = await tryReadCache(allCoinsCachePath);
    if (cache) {
        console.log('Cache hit');
        return cache;
    }
    
    console.log('Cache miss');
    const allCoins = await getAllCoins();
    console.log(`Caching...`);
    await writeCache(allCoinsCachePath, allCoins, now() + 1800);
    console.log('Cached.');
    return allCoins;
};

exports.handler = async (event) => {
    const endpointId = event.headers['X-Public-Endpoint-Id'] || event.headers['x-public-endpoint-id'];
    switch (endpointId) {
        case '8fd82540-f56c-41d7-ada2-5d44d2e4a789':
            return {
                statusCode: 200,
                body: await getAllCoinsHandler()
            };
        default:
            return {
                statusCode: 400,
                body: `Unrecognized endpoint id: ${endpointId}`
            };
    }
};
