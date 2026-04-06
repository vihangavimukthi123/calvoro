require('dotenv').config();

const useMysql = process.env.USE_MYSQL === 'true' || process.env.USE_MYSQL === '1';
const db = useMysql ? require('./database_mysql') : require('./database');

if (useMysql) {
    console.log('Database: MySQL');
} else {
    console.log('Database: JSON files');
}

module.exports = db;
