const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');

async function setupDatabase() {
    console.log('🔧 Setting up Calvoro MySQL database...\n');

    const host = process.env.DB_HOST || 'localhost';
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';

    console.log(`Connecting to MySQL as ${user}@${host}${password ? ' (with password)' : ' (no password)'}...`);

    let connection;
    try {
        connection = await mysql.createConnection({
            host,
            user,
            password: password || undefined
        });
    } catch (err) {
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('\n❌ MySQL access denied. Your MySQL user requires a password.');
            console.error('   Edit backend\\.env and set your MySQL password:');
            console.error('   DB_PASSWORD=your_mysql_password');
            console.error('\n   If you use a different user than root, set DB_USER as well.');
        }
        throw err;
    }

    try {
        // Create database
        await connection.query('CREATE DATABASE IF NOT EXISTS calvoro_db');
        console.log('✓ Database created');

        await connection.query('USE calvoro_db');

        // Read and execute schema
        const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
        const statements = schema.split(';').filter(stmt => stmt.trim());

        for (const statement of statements) {
            if (statement.trim()) {
                await connection.query(statement);
            }
        }

        console.log('✓ Tables created');
        console.log('\n✅ Database setup complete!');
        console.log('\nYou can now start the server with: npm start');

    } catch (error) {
        console.error('❌ Error setting up database:', error.message);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

setupDatabase().catch(console.error);
