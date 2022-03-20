
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
  max: 20
});

const getGuestToken = async () => {
  console.log("debug checkpoint 8");
  console.log("twitterAuth ===>", twitterAuth);

  return axios({
    url: `https://api.twitter.com/1.1/guest/activate.json`,
    method: 'post',
    headers: {
      'authorization': twitterAuth
    }
  }).then(({ data }) => {
    console.log("debug checkpoint 9");
    return data.guest_token
  });
}

const getTweet = async (id) => {
  console.log("debug checkpoint 7");

  const guestToken = await getGuestToken();
  console.log("debug checkpoint 10");

  return axios({
    url: `https://api.twitter.com/1.1/statuses/show.json?id=${id}`,
    method: 'get',
    headers: {
      'authorization': twitterAuth,
      'x-guest-token': guestToken
    }
  }).then(({ data }) => {
    console.log("debug checkpoint 11");
    return data.text
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
  console.log("debug checkpoint 17");

  try {
    const sendToAccount = new Account(near.connection, sendTo);
    await sendToAccount.state();
  } catch(err) {
    throw new Error('Account not found');
  }

  console.log("debug checkpoint 18");

  
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
    console.log("debug checkpoint 19");
    await account.functionCall({
      contractId: tokenContract,
      methodName: 'storage_deposit',
      args: { account_id: sendTo },
      gas: DEFAULT_GAS,
      attachedDeposit: new BN('1250000000000000000000')
    });
  }

  console.log("debug checkpoint 20");

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

  console.log("debug checkpoint 21");

  return transferReceipt.transaction.hash;
}

exports.handler = async (req) => {
  console.log("debug checkpoint 1");
  if (!req.body) {
    console.log("debug checkpoint 2");
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: false, 
        message: 'Missing parameter(s)' 
      })
    }
  }
  const { url } = JSON.parse(req.body);
  console.log("debug checkpoint 3");
  const idMatch = /status\/(\d+)/ig.exec(url || '');
  if (!idMatch) {
    console.log("debug checkpoint 4");
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: false,
        message: 'Twitter url invalid',
      })
    };
  }
  const id = idMatch[1];
  console.log("debug checkpoint 5");

  try {
    console.log("debug checkpoint 6");
    const tweet = await getTweet(id);
    console.log("debug checkpoint 12");

    const match = /([^\s:]*)\.testnet/i.exec(tweet);
    if (!match) {
      throw new Error('Not found near account');
    }
    const sendTo = match[1] + '.testnet';
    console.log("debug checkpoint 13");

    const pgClient = await pgPool.connect();

    const { rows } = await pgClient.query(
      'SELECT * FROM records WHERE account = $1 ORDER BY time desc LIMIT 1', 
      [sendTo]
    );
    console.log("debug checkpoint 14");

    if (rows.length) {
      console.log("debug checkpoint 15");

      const record = rows[0];
      const time = dayjs(record.time * 1000);
      if (dayjs().diff(time, 'h') < 24) {
        const d = dayjs.duration(time.add(1, 'days').diff(dayjs()))['$d'];
        throw new Error(`${d.hours}h ${d.minutes}m ${d.seconds}s until next allowance`);
      }
    }
    console.log("debug checkpoint 16");

    const [hash1] = await Promise.all([
      sendToken(
        'deipn.testnet', 
        sendTo, 
        new BN(10).mul(new BN(10).pow(new BN(18))).toString()
      )
    ]);
    console.log("debug checkpoint 22");

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
    console.log("debug checkpoint 23");
    
    return { 
      statusCode: 200,
      body: JSON.stringify({
        success: true 
      })
    }

  } catch(err) {
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