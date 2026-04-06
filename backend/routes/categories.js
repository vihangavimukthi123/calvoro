const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware to check admin auth
function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// Get all categories
router.get('/', async (req, res) => {
    try {
        const categories = await db.getAllCategories();
        res.json(categories);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get single category
router.get('/:id', async (req, res) => {
    try {
        const category = await db.getCategoryById(req.params.id);

        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json(category);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Create category (admin only)
router.post('/', requireAdmin, async (req, res) => {
    const { name, parent_id, description, image } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const category = {
        name,
        slug,
        parent_id: parent_id || null,
        description: description || '',
        image: image || ''
    };

    try {
        const result = await db.createCategory(category);
        res.json({
            success: true,
            id: result.lastInsertRowid,
            message: 'Category created successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create category' });
    }
});

// Update category (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
    const { name, parent_id, description, image } = req.body;

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const category = {
        name,
        slug,
        parent_id: parent_id || null,
        description: description || '',
        image: image || ''
    };

    try {
        await db.updateCategory(req.params.id, category);
        res.json({ success: true, message: 'Category updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

// Delete category (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        await db.deleteCategory(req.params.id);
        res.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

module.exports = router;
