
const { connect, keyStores, Contract, utils, Account } = require('near-api-js');

const axios = require('axios');
const { Pool } = require('pg');
const BN = require('bn.js');
const duration = require('dayjs/plugin/duration');
const relativeTime = require('dayjs/plugin/relativeTime');

const dayjs = require('dayjs');

dayjs.extend(duration);
dayjs.extend(relativeTime);

const DEFAULT_GAS = new BN('300000000000000');

const faucetPrivKey = process.env.FAUCET_PRIV_KEY;
const twitterAuth = process.env.TWITTER_AUTH;
const pgUrl = process.env.PG_URL;

const match = /(.*):(.*)@(.*)\/(.*)/.exec(pgUrl);

const pgPool = new Pool({
  host: match[3],
  user: match[1],
  password: match[2],
  database: match[4],
  port: 5432,
  max: 20,
  connectionTimeoutMillis: 10000
});

const getTweet = async (id) => {
  return axios({
    url: `https://api.twitter.com/2/tweets?ids=${id}`,
    method: 'get',
    headers: {
      'authorization': twitterAuth
    }
  }).then((response) => {
    const data = response;
    const { data: twitterResponse } = data;
    if (!twitterResponse.data || !twitterResponse.data.length) 
      throw new Error(`Tweet ${id} is not found`);
    const [tweet] = twitterResponse.data;
    return tweet.text
  });
}

const getFaucetAccount = async () => {
  const keyPair = utils.KeyPair.fromString(faucetPrivKey);
  const keyStore = new keyStores.InMemoryKeyStore();
  keyStore.setKey('testnet', 'deip-faucet.testnet', keyPair);

  const near = await connect({
    networkId: 'testnet',
    keyStore,
    nodeUrl: 'https://rpc.testnet.near.org',
    walletUrl: 'https://wallet.testnet.near.org',
    helperUrl: 'https://helper.testnet.near.org',
  });

  return {
    account: await near.account('deip-faucet.testnet'),
    near
  };
}

async function sendToken(tokenContract, sendTo, amount) {
  const { account, near } = await getFaucetAccount();

  try {
    const sendToAccount = new Account(near.connection, sendTo);
    await sendToAccount.state();
  } catch(err) {
    console.log(err);
    throw new Error('Account not found');
  }
  
  const contract = await new Contract(
    account,
    tokenContract,
    {
      viewMethods: ['ft_balance_of', 'storage_balance_of'],
      changeMethods: ['ft_transfer', 'storage_deposit'],
    }
  );

  const storaged = await contract.storage_balance_of({ account_id: sendTo });
  
  if (!storaged) {
    await account.functionCall({
      contractId: tokenContract,
      methodName: 'storage_deposit',
      args: { account_id: sendTo },
      gas: DEFAULT_GAS,
      attachedDeposit: new BN('1250000000000000000000')
    });
  }

  const transferReceipt = await account.functionCall({
    contractId: tokenContract,
    methodName: 'ft_transfer',
    args: { 
      receiver_id: sendTo,
      amount
    },
    gas: DEFAULT_GAS,
    attachedDeposit: 1
  });

  return transferReceipt.transaction.hash;
}

exports.handler = async (req) => {
  if (!req.body) {
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: false, 
        message: 'Missing parameter(s)' 
      })
    }
  }
  const { url } = JSON.parse(req.body);
  const idMatch = /status\/(\d+)/ig.exec(url || '');
  if (!idMatch) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        message: 'Twitter url invalid',
      })
    };
  }
  const id = idMatch[1];

  try {
    const tweet = await getTweet(id);
    const match = /\[(.*?)\]/i.exec(tweet);
    const username = match[1];

    if (!username || username.indexOf('.testnet') == -1) {
      throw new Error('Not found near account');
    }

    const sendTo = username;
    const pgClient = await pgPool.connect();

    const { rows } = await pgClient.query(
      'SELECT * FROM records WHERE account = $1 ORDER BY time desc LIMIT 1', 
      [sendTo]
    );

    if (rows.length) {
      const record = rows[0];
      const time = dayjs(record.time * 1000);
      if (dayjs().diff(time, 'h') < 24) {
        const d = dayjs.duration(time.add(1, 'days').diff(dayjs()))['$d'];
        throw new Error(`${d.hours}h ${d.minutes}m ${d.seconds}s until next allowance`);
      }
    }

    const [hash1] = await Promise.all([
      sendToken(
        'deipn.testnet', 
        sendTo, 
        new BN(10).mul(new BN(10).pow(new BN(18))).toString()
      )
    ]);

    await pgClient.query(`
      INSERT INTO records(account, link, receipt, time, tid, ip)
      VALUES ($1::varchar, $2::varchar, $3::varchar, $4::int, $5::varchar, $6::varchar)
    `, [
      sendTo, 
      url,
      hash1,
      Math.ceil(new Date().getTime()/1000),
      id,
      req.headers['x-nf-client-connection-ip']
    ]);

    pgClient.release();
    
    return { 
      statusCode: 200,
      body: JSON.stringify({
        success: true 
      })
    }

  } catch(err) {
    pgClient.release();

    console.log(err);
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        message: err.toString()
      })
    }
  }
  
};