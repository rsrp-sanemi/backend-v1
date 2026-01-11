import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Load JSON data
let products = [];
let feed = [];
let countries = [];
let states = [];
let cities = [];
let cart = {}; // In-memory cart storage: { sessionId: { items: [], timestamp } }

// Load all data files
async function loadData() {
  try {
    products = JSON.parse(await fs.readFile(path.join(__dirname, 'products.json'), 'utf-8'));
    feed = JSON.parse(await fs.readFile(path.join(__dirname, 'feed.json'), 'utf-8'));
    countries = JSON.parse(await fs.readFile(path.join(__dirname, 'countries.json'), 'utf-8'));
    states = JSON.parse(await fs.readFile(path.join(__dirname, 'states.json'), 'utf-8'));
    cities = JSON.parse(await fs.readFile(path.join(__dirname, 'cities.json'), 'utf-8'));
    console.log('✅ Data loaded successfully');
    console.log(`   Products: ${products.length}`);
    console.log(`   Feed items: ${feed.length}`);
    console.log(`   Countries: ${countries.length}`);
    console.log(`   States: ${states.length}`);
    console.log(`   Cities: ${cities.length}`);
  } catch (error) {
    console.error('Error loading data:', error);
    process.exit(1);
  }
}

// ==========================================
// 1. PRODUCT SEARCH & FILTER API
// ==========================================

app.get('/api/products', (req, res) => {
  try {
    const {
      search = '',
      category = '',
      subcategory = '',
      brand = '',
      minPrice = 0,
      maxPrice = Infinity,
      minRating = 0,
      sort = 'name',
      order = 'asc',
      page = 1,
      limit = 6,
      inStock = ''
    } = req.query;

    let filtered = [...products];

    // Search filter (name or description)
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower) ||
        p.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    // Category filter
    if (category) {
      filtered = filtered.filter(p => p.category.toLowerCase() === category.toLowerCase());
    }

    // Subcategory filter
    if (subcategory) {
      filtered = filtered.filter(p => p.subcategory.toLowerCase() === subcategory.toLowerCase());
    }

    // Brand filter
    if (brand) {
      filtered = filtered.filter(p => p.brand.toLowerCase() === brand.toLowerCase());
    }

    // Price range filter
    filtered = filtered.filter(p => p.price >= parseFloat(minPrice) && p.price <= parseFloat(maxPrice));

    // Rating filter
    filtered = filtered.filter(p => p.rating >= parseFloat(minRating));

    // Stock filter
    if (inStock === 'true') {
      filtered = filtered.filter(p => p.inStock === true && p.stock > 0);
    } else if (inStock === 'false') {
      filtered = filtered.filter(p => p.inStock === false || p.stock === 0);
    }

    // Sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sort) {
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'rating':
          comparison = a.rating - b.rating;
          break;
        case 'name':
        default:
          comparison = a.name.localeCompare(b.name);
      }
      return order === 'desc' ? -comparison : comparison;
    });

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedProducts = filtered.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedProducts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(filtered.length / limitNum),
        totalItems: filtered.length,
        itemsPerPage: limitNum,
        hasNextPage: endIndex < filtered.length,
        hasPrevPage: pageNum > 1
      },
      filters: {
        search,
        category,
        subcategory,
        brand,
        minPrice,
        maxPrice,
        minRating,
        inStock
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get unique filter options
app.get('/api/products/filters', (req, res) => {
  try {
    const categories = [...new Set(products.map(p => p.category))].sort();
    const subcategories = [...new Set(products.map(p => p.subcategory))].sort();
    const brands = [...new Set(products.map(p => p.brand))].sort();
    const priceRange = {
      min: Math.min(...products.map(p => p.price)),
      max: Math.max(...products.map(p => p.price))
    };

    res.json({
      success: true,
      data: {
        categories,
        subcategories,
        brands,
        priceRange
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single product
app.get('/api/products/:id', (req, res) => {
  try {
    const product = products.find(p => p.id === parseInt(req.params.id));
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 2. INFINITE SCROLL FEED API
// ==========================================

app.get('/api/feed', (req, res) => {
  try {
    const {
      cursor = 0,
      limit = 6,
      category = ''
    } = req.query;

    const cursorNum = parseInt(cursor);
    const limitNum = parseInt(limit);

    let filtered = [...feed];

    // Category filter
    if (category) {
      filtered = filtered.filter(f => f.category.toLowerCase() === category.toLowerCase());
    }

    // Get items after cursor
    const startIndex = cursorNum;
    const endIndex = startIndex + limitNum;
    const items = filtered.slice(startIndex, endIndex);

    // Calculate next cursor
    const nextCursor = endIndex < filtered.length ? endIndex : null;
    const hasMore = nextCursor !== null;

    res.json({
      success: true,
      data: items,
      pagination: {
        nextCursor,
        hasMore,
        total: filtered.length,
        returned: items.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get feed categories
app.get('/api/feed/categories', (req, res) => {
  try {
    const categories = [...new Set(feed.map(f => f.category))].sort();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3. DEPENDENCY DROPDOWN API
// ==========================================

// Get all countries
app.get('/api/countries', (req, res) => {
  try {
    res.json({ success: true, data: countries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get states by country
app.get('/api/states', (req, res) => {
  try {
    const { countryId } = req.query;
    
    if (!countryId) {
      return res.status(400).json({ success: false, error: 'countryId is required' });
    }

    const filteredStates = states.filter(s => s.countryId === parseInt(countryId));
    
    // Simulate API delay for realism
    setTimeout(() => {
      res.json({ success: true, data: filteredStates });
    }, 300);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get cities by state
app.get('/api/cities', (req, res) => {
  try {
    const { stateId } = req.query;
    
    if (!stateId) {
      return res.status(400).json({ success: false, error: 'stateId is required' });
    }

    const filteredCities = cities.filter(c => c.stateId === parseInt(stateId));
    
    // Simulate API delay for realism
    setTimeout(() => {
      res.json({ success: true, data: filteredCities });
    }, 300);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 4. SHOPPING CART API
// ==========================================

// Helper function to generate session ID from headers or create new
function getSessionId(req) {
  return req.headers['x-session-id'] || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get cart
app.get('/api/cart', (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const userCart = cart[sessionId] || { items: [], createdAt: new Date().toISOString() };
    
    // Calculate totals
    const subtotal = userCart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = userCart.items.reduce((sum, item) => sum + item.quantity, 0);

    res.json({
      success: true,
      sessionId,
      data: {
        items: userCart.items,
        summary: {
          subtotal: parseFloat(subtotal.toFixed(2)),
          itemCount,
          createdAt: userCart.createdAt
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add item to cart
app.post('/api/cart/add', (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, error: 'productId is required' });
    }

    const product = products.find(p => p.id === parseInt(productId));
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // Check stock
    if (!product.inStock || product.stock < quantity) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient stock',
        availableStock: product.stock
      });
    }

    // Initialize cart if needed
    if (!cart[sessionId]) {
      cart[sessionId] = { items: [], createdAt: new Date().toISOString() };
    }

    // Check if item already in cart
    const existingItem = cart[sessionId].items.find(item => item.productId === product.id);
    
    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      
      // Check stock for updated quantity
      if (product.stock < newQuantity) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient stock for requested quantity',
          availableStock: product.stock,
          currentInCart: existingItem.quantity
        });
      }
      
      existingItem.quantity = newQuantity;
    } else {
      cart[sessionId].items.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: quantity
      });
    }

    const subtotal = cart[sessionId].items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart[sessionId].items.reduce((sum, item) => sum + item.quantity, 0);

    res.json({
      success: true,
      message: 'Item added to cart',
      sessionId,
      data: {
        items: cart[sessionId].items,
        summary: {
          subtotal: parseFloat(subtotal.toFixed(2)),
          itemCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update cart item quantity
app.put('/api/cart/update', (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { productId, quantity } = req.body;

    if (!productId || quantity === undefined) {
      return res.status(400).json({ success: false, error: 'productId and quantity are required' });
    }

    if (!cart[sessionId]) {
      return res.status(404).json({ success: false, error: 'Cart not found' });
    }

    const cartItem = cart[sessionId].items.find(item => item.productId === parseInt(productId));
    
    if (!cartItem) {
      return res.status(404).json({ success: false, error: 'Item not in cart' });
    }

    const product = products.find(p => p.id === parseInt(productId));
    
    // Check stock
    if (quantity > product.stock) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient stock',
        availableStock: product.stock
      });
    }

    // Remove item if quantity is 0
    if (quantity === 0) {
      cart[sessionId].items = cart[sessionId].items.filter(item => item.productId !== parseInt(productId));
    } else {
      cartItem.quantity = quantity;
    }

    const subtotal = cart[sessionId].items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart[sessionId].items.reduce((sum, item) => sum + item.quantity, 0);

    res.json({
      success: true,
      message: 'Cart updated',
      data: {
        items: cart[sessionId].items,
        summary: {
          subtotal: parseFloat(subtotal.toFixed(2)),
          itemCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove item from cart
app.delete('/api/cart/remove/:productId', (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const { productId } = req.params;

    if (!cart[sessionId]) {
      return res.status(404).json({ success: false, error: 'Cart not found' });
    }

    cart[sessionId].items = cart[sessionId].items.filter(item => item.productId !== parseInt(productId));

    const subtotal = cart[sessionId].items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart[sessionId].items.reduce((sum, item) => sum + item.quantity, 0);

    res.json({
      success: true,
      message: 'Item removed from cart',
      data: {
        items: cart[sessionId].items,
        summary: {
          subtotal: parseFloat(subtotal.toFixed(2)),
          itemCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear cart
app.delete('/api/cart/clear', (req, res) => {
  try {
    const sessionId = getSessionId(req);
    
    if (cart[sessionId]) {
      delete cart[sessionId];
    }

    res.json({
      success: true,
      message: 'Cart cleared'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Validate cart (check all items before checkout)
app.post('/api/cart/validate', (req, res) => {
  try {
    const sessionId = getSessionId(req);
    
    if (!cart[sessionId] || cart[sessionId].items.length === 0) {
      return res.status(400).json({ success: false, error: 'Cart is empty' });
    }

    const issues = [];
    const validItems = [];

    cart[sessionId].items.forEach(cartItem => {
      const product = products.find(p => p.id === cartItem.productId);
      
      if (!product) {
        issues.push({
          productId: cartItem.productId,
          issue: 'Product no longer exists'
        });
      } else if (!product.inStock || product.stock === 0) {
        issues.push({
          productId: cartItem.productId,
          name: cartItem.name,
          issue: 'Out of stock'
        });
      } else if (product.stock < cartItem.quantity) {
        issues.push({
          productId: cartItem.productId,
          name: cartItem.name,
          issue: 'Insufficient stock',
          requested: cartItem.quantity,
          available: product.stock
        });
      } else if (product.price !== cartItem.price) {
        issues.push({
          productId: cartItem.productId,
          name: cartItem.name,
          issue: 'Price changed',
          oldPrice: cartItem.price,
          newPrice: product.price
        });
        validItems.push({ ...cartItem, price: product.price });
      } else {
        validItems.push(cartItem);
      }
    });

    if (issues.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart validation failed',
        issues,
        validItems
      });
    }

    const subtotal = validItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    res.json({
      success: true,
      message: 'Cart is valid',
      data: {
        items: validItems,
        summary: {
          subtotal: parseFloat(subtotal.toFixed(2)),
          itemCount: validItems.reduce((sum, item) => sum + item.quantity, 0)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// SERVER START
// ==========================================

app.get('/', (req, res) => {
  res.json({
    message: 'Frontend Interview API Server',
    endpoints: {
      products: {
        'GET /api/products': 'Search & filter products (supports: search, category, subcategory, brand, minPrice, maxPrice, minRating, sort, order, page, limit, inStock)',
        'GET /api/products/filters': 'Get available filter options',
        'GET /api/products/:id': 'Get single product'
      },
      feed: {
        'GET /api/feed': 'Get feed items with cursor-based pagination (supports: cursor, limit, category)',
        'GET /api/feed/categories': 'Get feed categories'
      },
      location: {
        'GET /api/countries': 'Get all countries',
        'GET /api/states?countryId=X': 'Get states by country',
        'GET /api/cities?stateId=X': 'Get cities by state'
      },
      cart: {
        'GET /api/cart': 'Get cart items (requires x-session-id header)',
        'POST /api/cart/add': 'Add item to cart { productId, quantity }',
        'PUT /api/cart/update': 'Update item quantity { productId, quantity }',
        'DELETE /api/cart/remove/:productId': 'Remove item from cart',
        'DELETE /api/cart/clear': 'Clear entire cart',
        'POST /api/cart/validate': 'Validate cart before checkout'
      }
    }
  });
});

loadData().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}\n`);
  });
});