const { readFileSync } = require('fs');
const { join } = require('path');

const recordsFile = join(__dirname, '_files', 'records.json');
const recordsData = readFileSync(recordsFile, 'utf8') || '{}';

const records = JSON.parse(recordsData);

module.exports = (req, res) => {
  const keys = Object.keys(records);

  res.json({
    data: keys.length ? keys.slice(-5).map(key => records[key]) : [],
    total: records.length
  });
};