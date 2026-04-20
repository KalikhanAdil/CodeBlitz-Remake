import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const poolConfig = process.env.DATABASE_URL 
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      user: 'postgres',
      host: 'localhost',
      database: '1v1_platform',
      password: process.env.DB_PASSWORD || 'VideoConnorBlitz81234',
      port: 5432,
    };

export const pool = new Pool(poolConfig);
