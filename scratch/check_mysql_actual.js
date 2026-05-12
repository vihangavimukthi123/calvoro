const db = require('../backend/db');

async function check() {
    try {
        console.log('Checking MySQL content...');
        const products = await db.getAllProducts();
        console.log('Total products fetched from MySQL:', products.length);
        
        const unisexProducts = products.filter(p => {
            console.log(`Product ID: ${p.id}, Name: ${p.name}, category_id: ${p.category_id} (type: ${typeof p.category_id})`);
            return Number(p.category_id) === 4;
        });
        
        console.log('Unisex products found:', unisexProducts.length);
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit();
    }
}

check();
