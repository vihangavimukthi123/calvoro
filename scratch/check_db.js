const db = require('../backend/db');

async function check() {
    try {
        console.log('Database type:', db.constructor.name);
        
        const products = await db.getAllProducts();
        console.log('Total Products:', products.length);
        
        const categories = await db.getAllCategories();
        console.log('Categories:', JSON.stringify(categories, null, 2));
        
        const unisexProducts = products.filter(p => p.category_id == 4);
        console.log('Unisex Products:', unisexProducts.length);
        if (unisexProducts.length > 0) {
            console.log('Sample Unisex Product:', JSON.stringify(unisexProducts[0], null, 2));
        }
    } catch (e) {
        console.error('Check Error:', e);
    } finally {
        process.exit();
    }
}

check();
