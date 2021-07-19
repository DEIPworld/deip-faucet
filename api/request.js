
const { connect, keyStores, Contract, utils, Account, WalletConnection, Connection } = require('near-api-js');
const { readFileSync, writeFileSync } = require('fs');
const axios = require('axios');

const BN = require('bn.js');
const { join } = require('path');
const duration = require('dayjs/plugin/duration');
const relativeTime = require('dayjs/plugin/relativeTime');

const dayjs = require('dayjs');

dayjs.extend(duration);
dayjs.extend(relativeTime);

const recordsFile = join(__dirname, '_files', 'records.json');
const recordsData = readFileSync(recordsFile, 'utf8') || '{}';

const TOKEN_CONTRACT_NAME = 'oct-token.testnet';
const DEFAULT_GAS = new BN('300000000000000');

const records = JSON.parse(recordsData);

const faucetPrivKey = process.env.FAUCET_PRIV_KEY;
const twitterAuth = process.env.TWITTER_AUTH;

const getGuestToken = async () => {
  return axios({
    url: `https://api.twitter.com/1.1/guest/activate.json`,
    method: 'post',
    headers: {
      'authorization': twitterAuth
    }
  }).then(({ data }) => data.guest_token);
}

const getTweet = async (id) => {
  const guestToken = await getGuestToken();
  return axios({
    url: `https://api.twitter.com/1.1/statuses/show.json?id=${id}`,
    method: 'get',
    headers: {
      'authorization': twitterAuth,
      'x-guest-token': guestToken
    }
  }).then(({ data }) => data.text);
}

const getFaucetAccount = async () => {
  const keyPair = utils.KeyPair.fromString(faucetPrivKey);
  const keyStore = new keyStores.InMemoryKeyStore();
  keyStore.setKey('testnet', 'oct-faucet.testnet', keyPair);

  const near = await connect({
    networkId: 'testnet',
    keyStore,
    nodeUrl: 'https://rpc.testnet.near.org',
    walletUrl: 'https://wallet.testnet.near.org',
    helperUrl: 'https://helper.testnet.near.org',
  });

  return {
    account: await near.account('oct-faucet.testnet'),
    near
  };
}

module.exports = async (req, res) => {
  if (!req.body) {
    return res.json({ success: false, message: 'Missing parameter(s)' });
  }
  const { url } = req.body;
  const idMatch = /status\/(\d+)/ig.exec(url);
  if (!idMatch) {
    return toast({
      position: 'top-right',
      title: 'Error',
      description: 'Twitter url invalid',
      status: 'error'
    });
  }
  const id = idMatch[1];
  try {
    const tweet = await getTweet(id);
    const match = /\[(.*).testnet/i.exec(tweet);
    if (!match) {
      throw new Error('Not found near account');
    }
    const sendTo = match[1] + '.testnet';
    
    const record = records[sendTo];
    if (record) {
      const time = dayjs(record.time * 1000);
      if (dayjs().diff(time, 'h') < 24) {
        const d = dayjs.duration(time.add(1, 'days').diff(dayjs()))['$d'];
        throw new Error(`${d.hours}h ${d.minutes}m ${d.seconds}s until next allowance`);
      } else if (record.tid === id) {
        throw new Error('Tweet id was used last time');
      }
    }

    const { account, near } = await getFaucetAccount();
   
    try {
      const sendToAccount = new Account(near.connection, sendTo);
      await sendToAccount.state();
    } catch(err) {
      throw new Error('Account not found');
    }
   
    const tokenContract = await new Contract(
      account,
      TOKEN_CONTRACT_NAME,
      {
        viewMethods: ['ft_balance_of', 'storage_balance_of'],
        changeMethods: ['ft_transfer', 'storage_deposit'],
      }
    );

    const storaged = await tokenContract.storage_balance_of({ account_id: sendTo });
    
    if (!storaged) {
      await account.functionCall({
        contractId: TOKEN_CONTRACT_NAME,
        methodName: 'storage_deposit',
        args: { account_id: sendTo },
        gas: DEFAULT_GAS,
        attachedDeposit: new BN('1250000000000000000000')
      });
    }

    const transferReceipt = await account.functionCall({
      contractId: TOKEN_CONTRACT_NAME,
      methodName: 'ft_transfer',
      args: { 
        receiver_id: sendTo,
        amount: new BN(10).mul(new BN(10).pow(new BN(24))).toString()
      },
      gas: DEFAULT_GAS,
      attachedDeposit: 1
    });
    
    records[sendTo] = {
      account: sendTo,
      link: url,
      receipt: transferReceipt.transaction.hash,
      time: Math.ceil(new Date().getTime()/1000)
    }

    writeFileSync(recordsFile, JSON.stringify(records));

    res.json({ success: true });

  } catch(err) {
    console.log(err);
    res.json({
      success: false,
      message: err.toString()
    })
  }
  
};