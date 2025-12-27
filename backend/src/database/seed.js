require('dotenv').config();
const pool = require('./connection');

async function seed() {
  try {
    // Seed sample products
    const products = [
      { name: 'Bridal Lehanga', code: 'BL-001', rent_per_day: 1000, category: 'Bridal', availability: true },
      { name: 'Blue Three Piece Suit', code: 'BTS-001', rent_per_day: 1000, category: 'Formals', availability: true },
      { name: 'Groom Sherwani', code: 'GS-001', rent_per_day: 1500, category: 'Bridal', availability: true },
      { name: 'Formal Suit', code: 'FS-001', rent_per_day: 800, category: 'Formals', availability: true },
    ];

    for (const product of products) {
      await pool.query(
        'INSERT INTO products (name, code, rent_per_day, category, availability) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (code) DO NOTHING',
        [product.name, product.code, product.rent_per_day, product.category, product.availability]
      );
    }

    // Seed sample users
    const users = [
      { name: 'Admin User', phone: '9876543210', role: 'admin' },
      { name: 'Salesman User', phone: '9876543211', role: 'salesman' },
      { name: 'John Doe', phone: '9876543212', role: 'customer' },
    ];

    for (const user of users) {
      await pool.query(
        'INSERT INTO users (name, phone, role) VALUES ($1, $2, $3) ON CONFLICT (phone) DO NOTHING',
        [user.name, user.phone, user.role]
      );
    }

    console.log('Database seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seed();

