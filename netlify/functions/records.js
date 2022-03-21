const { Pool } = require('pg');

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

exports.handler = async (req) => {
  const pgClient = await pgPool.connect();
  const { rows } = await pgClient.query(
    'SELECT * FROM records ORDER BY id desc LIMIT 3', 
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      data: rows,
      total: rows.length
    })
  }
};